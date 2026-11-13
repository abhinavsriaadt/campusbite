"""OTP email delivery: Gmail-compatible SMTP (STARTTLS) or the console (docker logs).

deliver_otp() is always scheduled through FastAPI BackgroundTasks and never raises, so a mail
outage can't break the request that triggered it. Passwords are never logged; codes are
logged only in console mode.
"""

import html
import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path
from string import Template

from app.core.config import get_settings

logger = logging.getLogger("campusbite.mailer")

_TEMPLATES = Path(__file__).resolve().parent.parent / "templates" / "emails"

# Copy is fixed by the product brief; {name}/{code}/{minutes} are filled in below.
COPY = {
    "signup": {
        "subject": "Verify your CampusBite account",
        "intro": "Welcome to CampusBite! Use this code to verify your email:",
        "outro": "It expires in {minutes} minutes. If you didn't create an account, you can safely ignore this email.",
        "extra": "",
    },
    "login": {
        "subject": "Your CampusBite login code",
        "intro": "Your one-time login code is:",
        "outro": "It expires in {minutes} minutes. Never share this code. CampusBite will never ask you for it.",
        "extra": "If this wasn't you, change your password right away.",
    },
}


def render_otp_email(name: str, purpose: str, code: str) -> tuple[str, str, str]:
    """Return (subject, html, text) for an OTP email."""
    s = get_settings()
    c = COPY[purpose]
    outro = c["outro"].format(minutes=s.OTP_EXPIRY_MINUTES)
    text = Template((_TEMPLATES / "otp.txt").read_text(encoding="utf-8")).substitute(
        name=name, intro=c["intro"], code=code, outro=outro, extra_text=c["extra"],
    )
    text = "\n".join(line for line in text.splitlines() if line.strip()) + "\n"
    esc = html.escape
    extra_html = (
        f'<p style="margin:0;font-size:14px;line-height:1.5;color:#3A3A42;">{esc(c["extra"])}</p>' if c["extra"] else ""
    )
    body = Template((_TEMPLATES / "otp.html").read_text(encoding="utf-8")).substitute(
        name=esc(name), intro=esc(c["intro"]), code=esc(code), outro=esc(outro), extra_html=extra_html,
        frontend_url=esc(s.FRONTEND_URL),
    )
    return c["subject"], body, text


def send_email(to: str, subject: str, html_body: str, text_body: str) -> None:
    s = get_settings()
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((s.MAIL_FROM_NAME, s.SMTP_USER))
    msg["To"] = to
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")
    with smtplib.SMTP(s.SMTP_HOST, s.SMTP_PORT, timeout=10) as smtp:
        smtp.starttls()
        smtp.login(s.SMTP_USER, s.SMTP_PASSWORD)
        smtp.send_message(msg)


def _log_to_console(email: str, purpose: str, code: str) -> None:
    bar = "=" * 60
    logger.info("\n%s\n[OTP][%s] to=%s code=%s\n%s", bar, purpose, email, code, bar)


def deliver_otp(email: str, name: str, purpose: str, code: str) -> None:
    """Background task: send (or print) an OTP. Never raises."""
    try:
        if get_settings().otp_delivery_mode == "console":
            _log_to_console(email, purpose, code)
            return
        subject, html_body, text_body = render_otp_email(name, purpose, code)
        send_email(email, subject, html_body, text_body)
        logger.info("OTP email (%s) sent to %s", purpose, email)
    except Exception:
        logger.exception("Failed to deliver %s OTP to %s", purpose, email)
