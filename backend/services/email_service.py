"""
Email service â€“ ported from PAnsGPT's TypeScript nodemailer to Python smtplib.
Uses Zoho Mail SMTP for transactional emails.
"""
import smtplib
import os
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, List, Union

logger = logging.getLogger("PansGPT")

# Email addresses
EMAIL_ADDRESSES = {
    "HELLO": "hello@pansgpt.site",
    "SUPPORT": "support@pansgpt.site",
    "UPDATES": "updates@pansgpt.site",
    "NO_REPLY": "no-reply@pansgpt.site",
}


def _get_smtp_connection(use_updates: bool = False) -> smtplib.SMTP_SSL:
    """Create an SMTP connection to Zoho Mail."""
    host = os.getenv("ZOHO_SMTP_HOST", "smtp.zoho.com")
    port = int(os.getenv("ZOHO_SMTP_PORT", "465"))

    if use_updates:
        user = os.getenv("ZOHO_UPDATES_EMAIL", EMAIL_ADDRESSES["UPDATES"])
        password = os.getenv("ZOHO_UPDATES_PASSWORD", "")
    else:
        user = os.getenv("ZOHO_EMAIL", EMAIL_ADDRESSES["HELLO"])
        password = os.getenv("ZOHO_PASSWORD", "")

    if not password:
        raise ValueError("SMTP password not configured")

    server = smtplib.SMTP_SSL(host, port)
    server.login(user, password)
    return server


def send_email(
    to: Union[str, List[str]],
    subject: str,
    text: str,
    html: Optional[str] = None,
    from_addr: Optional[str] = None,
    reply_to: Optional[str] = None,
    use_updates_account: bool = False,
) -> dict:
    """Send an email via Zoho Mail SMTP."""
    try:
        if from_addr is None:
            from_addr = EMAIL_ADDRESSES["UPDATES"] if use_updates_account else EMAIL_ADDRESSES["HELLO"]

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = from_addr
        msg["To"] = to if isinstance(to, str) else ", ".join(to)
        if reply_to:
            msg["Reply-To"] = reply_to

        msg.attach(MIMEText(text, "plain"))
        if html:
            msg.attach(MIMEText(html, "html"))

        server = _get_smtp_connection(use_updates_account)
        recipients = [to] if isinstance(to, str) else to
        server.sendmail(from_addr, recipients, msg.as_string())
        server.quit()

        logger.info(f"Email sent to {to}: {subject}")
        return {"success": True}

    except Exception as e:
        logger.error(f"Email send error: {e}")
        return {"success": False, "error": str(e)}


def send_welcome_email(student_name: str, student_email: str, login_url: str) -> dict:
    """Send personalized founder-style welcome email after signup."""

    subject = "Welcome to PansGPT! 🎓"

    text = f"""Hi {student_name},

We just saw you signed up and wanted to personally welcome you to the Pharmily.

We built PansGPT together because we know exactly how crazy pharmacy school can get  between the pharmacology notes, the bulky PDFs, and the endless reading, we knew there had to be a smarter way to study.

We have one quick question for you:
What is the one topic or course giving you the biggest headache right now?

Hit reply and let us know. We read every email that comes in, and your answer actually helps us decide what features or study guides to build next.

Happy studying,

Co-founders, PansGPT

---

Ready to get started? Log in here: {login_url}"""

    html = f"""
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
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #10b981; font-size: 28px; font-weight: 600; line-height: 1.2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">Welcome to the Pharmily!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <p style="margin: 0 0 16px 0; color: #333; font-size: 16px; line-height: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">Hi {student_name},</p>
              <p style="margin: 0 0 24px 0; color: #333; font-size: 16px; line-height: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">We just saw you signed up and wanted to personally welcome you to the Pharmily.</p>
              <p style="margin: 0 0 24px 0; color: #333; font-size: 16px; line-height: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">We built PansGPT together because we know exactly how crazy pharmacy school can get  between the pharmacology notes, the bulky PDFs, and the endless reading, we knew there had to be a smarter way to study.</p>
              <p style="margin: 0 0 16px 0; color: #333; font-size: 16px; line-height: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">We have one quick question for you:</p>
              <p style="margin: 0 0 24px 0; color: #333; font-size: 16px; line-height: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-weight: 600;">What is the one topic or course giving you the biggest headache right now?</p>
              <p style="margin: 0 0 24px 0; color: #333; font-size: 16px; line-height: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">Hit reply and let us know. We read every email that comes in, and your answer actually helps us decide what features or study guides to build next.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #f0fdf4; border-top: 1px solid #dcfce7;">
              <p style="margin: 0 0 12px 0; color: #166534; font-size: 14px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">Ready to Get Started?</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                <tr>
                  <td align="center" style="background-color: #10b981; border-radius: 6px;">
                    <a href="{login_url}" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">Log In to PansGPT</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
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
</html>"""

    from_addr = f"The Founders <{os.getenv('ZOHO_UPDATES_EMAIL', EMAIL_ADDRESSES['UPDATES'])}>"

    return send_email(
        to=student_email,
        subject=subject,
        text=text,
        html=html,
        from_addr=from_addr,
        reply_to=EMAIL_ADDRESSES["HELLO"],
        use_updates_account=True,
    )


def verify_email_config() -> bool:
    """Verify SMTP configuration by testing connection."""
    try:
        server = _get_smtp_connection()
        server.quit()
        logger.info("Email configuration verified successfully")
        return True
    except Exception as e:
        logger.error(f"Email config verification failed: {e}")
        return False


async def send_welcome_email_delayed(
    student_name: str, student_email: str, login_url: str
) -> None:
    """
    Background task: waits 10 minutes then sends the welcome email.
    Failure is non-fatal â€” logged but never raises.
    """
    import asyncio
    try:
        await asyncio.sleep(600)  # 10 minutes
        result = send_welcome_email(student_name, student_email, login_url)
        if result.get("success"):
            logger.info(f"Welcome email sent to {student_email}")
        else:
            logger.warning(f"Welcome email failed for {student_email}: {result.get('error')}")
    except Exception as e:
        logger.error(f"Welcome email background task error for {student_email}: {e}")


