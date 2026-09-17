// Password-reset email sending. Fully wired up — the only thing missing
// until someone sets SMTP_HOST/SMTP_USER/SMTP_PASS in server/.env is an
// actual mailbox to send from. Until then, it falls back to logging the
// reset link to the server console, so the whole flow (token, expiry,
// reset screen) is real and testable today; adding real credentials later
// is a one-line env change, not a code change.

import nodemailer from "nodemailer";

let transporter = null;
let attemptedInit = false;

export function isEmailConfigured() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function getTransporter() {
  if (transporter || attemptedInit) return transporter;
  attemptedInit = true;
  if (!isEmailConfigured()) return null;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  const port = Number(SMTP_PORT) || 587;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const t = getTransporter();
  if (!t) {
    console.warn("\n⚠️  SMTP is not configured (see server/.env.example) — no email was sent.");
    console.warn(`   Password reset link for ${to}:\n   ${resetUrl}\n`);
    return { sent: false };
  }

  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  await t.sendMail({
    from,
    to,
    subject: "Reset your Ocho AI password",
    text:
      `Hi ${name || "there"},\n\n` +
      "Someone requested a password reset for your Ocho AI account. If this was you, use the link below to set a new password — it expires in 1 hour:\n\n" +
      `${resetUrl}\n\n` +
      "If you didn't request this, you can safely ignore this email — your password hasn't been changed.\n\n" +
      "— Ocho The Agency",
  });
  return { sent: true };
}
