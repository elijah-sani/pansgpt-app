"""
Email service – ported from PAnsGPT's TypeScript nodemailer to Python smtplib.
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
        password = os.getenv("ZOHO_UPDATES_APP_PASSWORD", "")
    else:
        user = os.getenv("ZOHO_EMAIL", EMAIL_ADDRESSES["HELLO"])
        password = os.getenv("ZOHO_APP_PASSWORD", "")

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
    """Send personalized welcome email after signup."""
    subject = f"Welcome to PansGPT, {student_name}! 🎓"

    text = f"""Hi {student_name},

Welcome to PansGPT — your AI-powered pharmacy study assistant!

We built PansGPT to help pharmacy students like you study smarter. Here's what you can do:

• Ask questions about any pharmacy course
• Generate quizzes to test your knowledge
• Access study materials and lecture notes
• Track your progress with personalized analytics

Get started now: {login_url}

If you have questions, just reply to this email!

Best,
The PansGPT Team
"""

    html = f"""
    <div style="font-family: 'Montserrat', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #00A400; font-size: 28px; margin: 0;">Welcome to PansGPT! 🎓</h1>
        </div>

        <p style="color: #333; font-size: 16px; line-height: 1.6;">
            Hi <strong>{student_name}</strong>,
        </p>

        <p style="color: #555; font-size: 15px; line-height: 1.6;">
            We're excited to have you! PansGPT is your AI-powered pharmacy study assistant.
            Here's what you can do:
        </p>

        <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <ul style="color: #333; font-size: 14px; line-height: 2; padding-left: 20px;">
                <li>📚 Ask questions about any pharmacy course</li>
                <li>📝 Generate quizzes to test your knowledge</li>
                <li>📄 Access study materials and lecture notes</li>
                <li>📊 Track your progress with personalized analytics</li>
            </ul>
        </div>

        <div style="text-align: center; margin: 30px 0;">
            <a href="{login_url}"
               style="display: inline-block; background: #00A400; color: white; text-decoration: none;
                      padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                Start Studying →
            </a>
        </div>

        <p style="color: #888; font-size: 13px; text-align: center; margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">
            Questions? Reply to this email or reach us at support@pansgpt.site
        </p>
    </div>
    """

    return send_email(
        to=student_email,
        subject=subject,
        text=text,
        html=html,
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
