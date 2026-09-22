import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import dns from "node:dns";

const router = Router();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const cleanText = (value: unknown, maxLength: number) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : null;

async function authenticatedUserId(req: Request): Promise<string | null> {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data.user?.id ?? null;
}

async function sendNewInstallEmail(installation: {
  platform: string | null;
  app_version: string | null;
  build_number: number | null;
  locale: string | null;
  created_at: string;
}) {
  const recipient = process.env.INSTALL_NOTIFICATION_EMAIL || process.env.GMAIL_USER;
  if (!recipient || !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error("Email notification is not configured.");
  }

  // Railway containers may resolve Gmail's IPv6 address even when their
  // outbound IPv6 route is unavailable.
  const [smtpAddress] = await dns.promises.resolve4("smtp.gmail.com");
  const transportOptions: SMTPTransport.Options = {
    host: smtpAddress || "smtp.gmail.com",
    port: 465,
    secure: true,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { servername: "smtp.gmail.com" },
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  };
  const transporter = nodemailer.createTransport(transportOptions);
  const platform = installation.platform || "unknown platform";
  const version = installation.app_version || "unknown";
  const build = installation.build_number ?? "unknown";
  const locale = installation.locale || "unknown";
  const time = new Date(installation.created_at).toLocaleString("en-US", {
    timeZone: process.env.NOTIFICATION_TIME_ZONE || "America/Chicago",
    dateStyle: "medium",
    timeStyle: "short",
  });

  await transporter.sendMail({
    from: `"SpotLift" <${process.env.GMAIL_USER}>`,
    to: recipient,
    subject: `🎉 New SpotLift install opened on ${platform}`,
    text: `A newly installed copy of SpotLift was opened.\n\nPlatform: ${platform}\nApp version: ${version}\nBuild: ${build}\nLocale: ${locale}\nTime: ${time}`,
  });
}

async function deliverAndRecordNotification(
  installationRecordId: string,
  installation: Parameters<typeof sendNewInstallEmail>[0]
): Promise<boolean> {
  try {
    await sendNewInstallEmail(installation);
    const { error } = await supabase
      .from("app_installations")
      .update({
        notification_sent_at: new Date().toISOString(),
        notification_attempted_at: new Date().toISOString(),
        notification_error: null,
      })
      .eq("id", installationRecordId);
    if (error) throw error;
    return true;
  } catch (error: any) {
    const message = String(error?.message || "Notification delivery failed").slice(0, 500);
    console.error("[installations] Notification email failed:", message);
    await supabase
      .from("app_installations")
      .update({
        notification_attempted_at: new Date().toISOString(),
        notification_error: message,
      })
      .eq("id", installationRecordId);
    return false;
  }
}

router.post("/", async (req: Request, res: Response) => {
  try {
    const installationId = cleanText(req.body?.installationId, 100);
    if (!installationId || !/^install-[a-z0-9-]+$/i.test(installationId)) {
      return res.status(400).json({ error: "A valid installationId is required." });
    }

    const userId = await authenticatedUserId(req);
    const record = {
      installation_id: installationId,
      user_id: userId,
      platform: cleanText(req.body?.platform, 20),
      app_version: cleanText(req.body?.appVersion, 30),
      build_number: Number.isFinite(Number(req.body?.buildNumber))
        ? Number(req.body.buildNumber)
        : null,
      locale: cleanText(req.body?.locale, 30),
      last_seen_at: new Date().toISOString(),
    };

    const { data: existing, error: lookupError } = await supabase
      .from("app_installations")
      .select("id, user_id, platform, app_version, build_number, locale, created_at, notification_sent_at")
      .eq("installation_id", installationId)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (existing) {
      // An installation ID may be anonymously created, then claimed after
      // sign-in. Once it is bound to an account, only that exact account can
      // update it; a guessed ID must not overwrite another user's linkage.
      if (existing.user_id && existing.user_id !== userId) {
        return res.status(403).json({ error: "This installation belongs to a different account." });
      }

      const { user_id: _userId, ...anonymousRecord } = record;
      const update = userId ? record : anonymousRecord;
      let updateQuery = supabase
        .from("app_installations")
        .update(update)
        .eq("id", existing.id);

      updateQuery = existing.user_id
        ? updateQuery.eq("user_id", userId!)
        : updateQuery.is("user_id", null);

      const { data: updated, error } = await updateQuery.select("id").maybeSingle();
      if (error) throw error;
      if (!updated) {
        return res.status(409).json({ error: "Installation ownership changed. Please try again." });
      }

      const notificationSent = existing.notification_sent_at
        ? true
        : await deliverAndRecordNotification(existing.id, existing);
      return res.json({ success: true, isNew: false, notificationSent });
    }

    const { data: created, error: insertError } = await supabase
      .from("app_installations")
      .insert(record)
      .select("id, platform, app_version, build_number, locale, created_at")
      .single();
    if (insertError) {
      if (insertError.code === "23505") {
        // Do not report a duplicate as successful before confirming that it is
        // still unclaimed or owned by this authenticated account.
        const { data: raced, error: raceLookupError } = await supabase
          .from("app_installations")
          .select("user_id")
          .eq("installation_id", installationId)
          .maybeSingle();
        if (raceLookupError) throw raceLookupError;
        if (raced?.user_id && raced.user_id !== userId) {
          return res.status(403).json({ error: "This installation belongs to a different account." });
        }
        return res.json({ success: true, isNew: false });
      }
      throw insertError;
    }

    const notificationSent = await deliverAndRecordNotification(created.id, created);
    return res.status(201).json({ success: true, isNew: true, notificationSent });
  } catch (error: any) {
    console.error("[installations] Tracking failed:", error?.message || error);
    return res.status(500).json({ error: "Unable to record installation." });
  }
});

export default router;
