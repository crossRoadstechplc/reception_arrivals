import nodemailer from "nodemailer";

function fromAddress() {
  return process.env.SMTP_FROM || "Arrival Desk <desk@localhost>";
}

export function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

export function appUrl(path = "") {
  const base = (process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

export async function sendMail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) {
    throw new Error("SMTP_HOST, SMTP_USER, and SMTP_PASSWORD must be set");
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: { user, pass },
  });

  await transport.sendMail({
    from: fromAddress(),
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Simple, email-client-safe layout shared by every message. */
function layout(input: { heading: string; body: string; button?: { label: string; url: string }; footer?: string }) {
  const button = input.button
    ? `<a href="${input.button.url}" style="display:inline-block;background:#d85a2a;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:12px;">${escapeHtml(input.button.label)}</a>`
    : "";
  const fallback = input.button
    ? `<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#646d67;">If the button does not open, paste this link into your browser:<br/>${input.button.url}</p>`
    : "";
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f4f2ee;color:#14201b;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f2ee;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#ffffff;border:1px solid #e4dfd6;border-radius:16px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 8px;letter-spacing:0.14em;text-transform:uppercase;font-size:12px;font-weight:700;color:#d85a2a;">Arrival Desk</p>
                <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;">${input.heading}</h1>
                <div style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#24312b;">${input.body}</div>
                ${button}
                ${fallback}
                ${input.footer ? `<p style="margin:20px 0 0;font-size:13px;color:#646d67;">${input.footer}</p>` : ""}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendPasswordResetEmail(email: string, url: string) {
  await sendMail({
    to: email,
    subject: "Reset your Arrival Desk password",
    text: `Reset your Arrival Desk password:\n${url}\n\nThis link expires in 1 hour. If you did not ask for it, you can ignore this email.`,
    html: layout({
      heading: "Reset your password",
      body: "This link expires in 1 hour. If you did not ask for it, you can ignore this email.",
      button: { label: "Choose a new password", url },
    }),
  });
}

export async function sendInviteEmail(input: { email: string; name: string | null; invitedBy: string; floorName?: string; url: string }) {
  const where = input.floorName ? ` for ${input.floorName}` : "";
  await sendMail({
    to: input.email,
    subject: `You're invited to Arrival Desk${where}`,
    text: `${input.invitedBy} added you to Arrival Desk${where}. Set your password to sign in:\n${input.url}\n\nThis link expires in 7 days.`,
    html: layout({
      heading: `Welcome${input.name ? `, ${escapeHtml(input.name)}` : ""}`,
      body: `${escapeHtml(input.invitedBy)} added you to Arrival Desk${escapeHtml(where)}. You can list the guests you expect, and you'll be told when they arrive at reception.`,
      button: { label: "Set your password", url: input.url },
      footer: "This link expires in 7 days.",
    }),
  });
}

/** The one-line arrival message, shared by the email and the push notification. */
export function guestArrivedMessage(guestName: string) {
  return `Your guest ${guestName} has arrived at reception and is on their way up.`;
}

export async function sendGuestArrivedEmail(input: { email: string; guestName: string }) {
  const message = guestArrivedMessage(input.guestName);
  await sendMail({
    to: input.email,
    subject: `Your guest ${input.guestName} has arrived`,
    text: message,
    html: `<!doctype html>
<html>
  <body style="margin:0;padding:24px 16px;background:#ffffff;color:#14201b;font-family:Arial,Helvetica,sans-serif;">
    <p style="margin:0;font-size:16px;line-height:1.5;">${escapeHtml(message)}</p>
  </body>
</html>`,
  });
}
