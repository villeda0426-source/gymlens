import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

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
    console.warn("[installations] Email notification is not configured.");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
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
      .select("id")
      .eq("installation_id", installationId)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (existing) {
      const update = userId ? record : { ...record, user_id: undefined };
      const { error } = await supabase
        .from("app_installations")
        .update(update)
        .eq("id", existing.id);
      if (error) throw error;
      return res.json({ success: true, isNew: false });
    }

    const { data: created, error: insertError } = await supabase
      .from("app_installations")
      .insert(record)
      .select("platform, app_version, build_number, locale, created_at")
      .single();
    if (insertError) {
      // Concurrent duplicate requests are harmless; the unique index is authoritative.
      if (insertError.code === "23505") return res.json({ success: true, isNew: false });
      throw insertError;
    }

    sendNewInstallEmail(created).catch((error) =>
      console.error("[installations] Notification email failed:", error)
    );
    return res.status(201).json({ success: true, isNew: true });
  } catch (error: any) {
    console.error("[installations] Tracking failed:", error?.message || error);
    return res.status(500).json({ error: "Unable to record installation." });
  }
});

export default router;
