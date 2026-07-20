import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

router.post("/", async (req: Request, res: Response) => {
  try {
    const { userId, rating, category, message } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    const { data, error } = await supabase
      .from("feedback")
      .insert({
        user_id: userId || null,
        rating,
        category: category || "other",
        message: message || null,
      })
      .select()
      .single();

    if (error) throw error;

    return res.json({ success: true, id: data.id });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/feedback/email — beta feedback modal (mood + description + device info)
router.post("/email", async (req: Request, res: Response) => {
  const { mood, moodEmoji, description, screen, deviceInfo, screenshotUri } = req.body;

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    const deviceSummary = deviceInfo
      ? `${deviceInfo.modelName} · iOS ${deviceInfo.osVersion}`
      : "Unknown device";

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #E04E4E;">🏋️ GymLens Beta Feedback</h2>

        <table style="width:100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px; background: #f5f5f5; font-weight: bold; width: 140px;">Mood</td>
            <td style="padding: 8px;">${moodEmoji} ${mood}</td>
          </tr>
          <tr>
            <td style="padding: 8px; background: #f5f5f5; font-weight: bold;">Screen</td>
            <td style="padding: 8px; color: #E04E4E;">${screen}</td>
          </tr>
          <tr>
            <td style="padding: 8px; background: #f5f5f5; font-weight: bold;">Device</td>
            <td style="padding: 8px;">${deviceSummary}</td>
          </tr>
        </table>

        <h3 style="color: #333;">Description</h3>
        <p style="background: #FAF7F0; padding: 16px; border-radius: 8px; border-left: 4px solid #6AAA00;">
          ${description}
        </p>

        ${screenshotUri ? `
        <h3 style="color: #333;">Screenshot</h3>
        <img src="${screenshotUri}" style="max-width: 100%; border-radius: 8px;" />
        ` : ""}

        <p style="color: #aaa; font-size: 12px; margin-top: 30px;">
          Sent from GymLens Beta · ${new Date().toLocaleString()}
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: `"GymLens Beta" <${process.env.GMAIL_USER}>`,
      to: "affilm426@gmail.com",
      subject: `[GymLens Beta] ${moodEmoji} ${mood} on ${screen}`,
      html,
    });

    return res.json({ success: true });
  } catch (err: any) {
    console.error("Feedback email error:", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
