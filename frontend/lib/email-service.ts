import nodemailer from 'nodemailer';

// Email addresses based on purpose
export const EMAIL_ADDRESSES = {
    HELLO: 'hello@pansgpt.site',
    SUPPORT: 'support@pansgpt.site',
    UPDATES: 'updates@pansgpt.site',
    NO_REPLY: 'no-reply@pansgpt.site',
};

// Zoho SMTP transporter cache
let updatesTransporter: nodemailer.Transporter | null = null;

async function getUpdatesTransporter(): Promise<nodemailer.Transporter> {
    if (!updatesTransporter) {
        const email = process.env.ZOHO_UPDATES_EMAIL || process.env.ZOHO_EMAIL;
        const password = process.env.ZOHO_UPDATES_PASSWORD || process.env.ZOHO_PASSWORD;

        if (!email || !password) {
            throw new Error('ZOHO email credentials not configured');
        }

        const port = parseInt(process.env.ZOHO_SMTP_PORT || '465', 10);

        updatesTransporter = nodemailer.createTransport({
            host: 'smtp.zoho.com',
            port,
            secure: port === 465,
            auth: {
                user: email.trim(),
                pass: password.trim(),
            },
            tls: { rejectUnauthorized: false },
        });
    }
    return updatesTransporter;
}

/**
 * Send a personalized welcome email from the founders
 * Called after successful signup
 */
export async function sendWelcomeEmail(
    studentName: string,
    studentEmail: string,
    loginUrl: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const transporter = await getUpdatesTransporter();

        const plainText = `Hi ${studentName},

We just saw you signed up and wanted to personally welcome you to the Pharmily.

We built PansGPT together because we know exactly how crazy pharmacy school can get between the pharmacology notes, the bulky PDFs, and the endless reading, we knew there had to be a smarter way to study.

We have one quick question for you:
What is the one topic or course giving you the biggest headache right now?

Hit reply and let us know. We read every email that comes in, and your answer actually helps us decide what features or study guides to build next.

Happy studying,

Co-founders, PansGPT

---

Ready to get started? Log in here: ${loginUrl}`;

        const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to PansGPT</title>
</head>
<body style="margin: 0; padding: 0; width: 100%; -webkit-font-smoothing: antialiased; background-color: #f5f5f5;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #10b981; font-size: 28px; font-weight: 600; line-height: 1.2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">Welcome to the Pharmily!</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <p style="margin: 0 0 16px 0; color: #333; font-size: 16px; line-height: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">Hi ${studentName},</p>
              <p style="margin: 0 0 24px 0; color: #333; font-size: 16px; line-height: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">We just saw you signed up and wanted to personally welcome you to the Pharmily.</p>
              <p style="margin: 0 0 24px 0; color: #333; font-size: 16px; line-height: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">We built PansGPT together because we know exactly how crazy pharmacy school can get between the pharmacology notes, the bulky PDFs, and the endless reading, we knew there had to be a smarter way to study.</p>
              <p style="margin: 0 0 16px 0; color: #333; font-size: 16px; line-height: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">We have one quick question for you:</p>
              <p style="margin: 0 0 24px 0; color: #333; font-size: 16px; line-height: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: 600;">What is the one topic or course giving you the biggest headache right now?</p>
              <p style="margin: 0 0 24px 0; color: #333; font-size: 16px; line-height: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">Hit reply and let us know. We read every email that comes in, and your answer actually helps us decide what features or study guides to build next.</p>
            </td>
          </tr>
          <!-- CTA -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f0fdf4; border-top: 1px solid #dcfce7;">
              <p style="margin: 0 0 12px 0; color: #166534; font-size: 14px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">Ready to Get Started?</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                <tr>
                  <td align="center" style="background-color: #10b981; border-radius: 6px;">
                    <a href="${loginUrl}" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">Log In to PansGPT</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; border-top: 1px solid #eee; background-color: #fafafa; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 8px 0; color: #333; font-size: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">Happy studying,</p>
              <p style="margin: 0; color: #333; font-size: 16px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">Co-founders, PansGPT</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

        const fromEmail = process.env.ZOHO_UPDATES_EMAIL || EMAIL_ADDRESSES.UPDATES;

        await transporter.sendMail({
            from: `The Founders <${fromEmail}>`,
            to: studentEmail,
            replyTo: EMAIL_ADDRESSES.HELLO,
            subject: 'Welcome to PansGPT! 🎓',
            text: plainText,
            html: htmlContent,
        });

        console.log('Welcome email sent to:', studentEmail);
        return { success: true };
    } catch (error: any) {
        console.error('Error sending welcome email:', error.message);
        return { success: false, error: error.message };
    }
}
