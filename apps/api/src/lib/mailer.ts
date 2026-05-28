import nodemailer from 'nodemailer';

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? 'noreply@retailos.local';

  if (!host) {
    // No SMTP configured — log to console (dev/test mode)
    return null;
  }

  return { transport: nodemailer.createTransport({ host, port, secure: port === 465, auth: user ? { user, pass } : undefined }), from };
}

export async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const config = createTransport();
  if (!config) {
    console.log(`[MAIL] To: ${to}\nSubject: ${subject}\n${html.replace(/<[^>]+>/g, '')}`);
    return;
  }
  await config.transport.sendMail({ from: config.from, to, subject, html });
}

export function passwordResetEmail(name: string, resetUrl: string): string {
  return `
    <p>Hi ${name},</p>
    <p>Someone requested a password reset for your RetailOS account. Click the link below to set a new password:</p>
    <p><a href="${resetUrl}">${resetUrl}</a></p>
    <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    <p>— RetailOS</p>
  `;
}
