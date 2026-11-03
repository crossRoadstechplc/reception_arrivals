import nodemailer from "nodemailer";

function fromAddress() {
  return process.env.SMTP_FROM || "Arrival Desk <desk@localhost>";
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

export async function sendPasswordResetEmail(email: string, url: string) {
  const text = `Reset your Arrival Desk password:\n${url}\n\nThis link expires in 1 hour. If you did not ask for it, you can ignore this email.`;
  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#101614;color:#f3f0e8;font-family:Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#101614;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#1a2420;border-radius:20px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 8px;letter-spacing:0.16em;text-transform:uppercase;font-size:12px;color:#d85a2a;">Arrival Desk</p>
                <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;">Reset your password</h1>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#b7c0b8;">This link expires in 1 hour.</p>
                <a href="${url}" style="display:inline-block;background:#d85a2a;color:#fff7f2;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px;">Choose a new password</a>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#b7c0b8;">If the button does not open, paste this link into the browser:<br/>${url}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  await sendMail({
    to: email,
    subject: "Reset your Arrival Desk password",
    html,
    text,
  });
}
