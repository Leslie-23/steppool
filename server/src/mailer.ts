import nodemailer, { type Transporter } from 'nodemailer';

import { config } from './config.js';

let transport: Transporter | null = null;

function mailer() {
  // Gmail SMTP with an app password (Google account → Security → App passwords).
  transport ??= nodemailer.createTransport({ service: 'gmail', auth: { user: config.mailUser, pass: config.mailPass } });
  return transport;
}

export const mailEnabled = () => !!(config.mailUser && config.mailPass);

/** Sends the sign-in code as a dark, on-brand email with a plain-text fallback. */
export async function sendOtpEmail(to: string, code: string) {
  const spaced = code.split('').join(' ');
  await mailer().sendMail({
    from: `"StepPool" <${config.mailUser}>`,
    to,
    subject: `${code} is your StepPool code`,
    text: `Your StepPool sign-in code is ${code}. It expires in 5 minutes. If you didn't ask for it, ignore this email.`,
    html: `<!doctype html><html><body style="margin:0;background:#07080A;padding:40px 16px;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
<table role="presentation" width="100%" style="max-width:440px;margin:0 auto;background:#0E1013;border:1px solid #1d2025;border-radius:24px">
<tr><td style="padding:36px 32px">
<div style="color:#D7FF3A;font-size:12px;font-weight:700;letter-spacing:3px">STEPPOOL</div>
<div style="color:#F4F1EA;font-size:26px;font-weight:700;letter-spacing:-0.5px;margin:18px 0 8px">Your sign-in code</div>
<div style="color:#8A8F98;font-size:14px;line-height:21px">Enter it in the app. It expires in 5 minutes.</div>
<div style="margin:28px 0;padding:20px;background:#15181D;border-radius:16px;text-align:center;color:#F4F1EA;font-size:34px;font-weight:700;letter-spacing:6px;font-family:Menlo,monospace">${spaced}</div>
<div style="color:#4A4F57;font-size:12px;line-height:18px">Didn't ask for this? You can safely ignore it.</div>
</td></tr></table></body></html>`,
  });
}
