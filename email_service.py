"""
email_service.py - Email Dispatch & OTP Verification Service

Handles OTP generation, secure verification codes, SMTP email dispatch,
and developer simulation fallback when SMTP is not configured.
"""

import smtplib
import secrets
import json
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
from typing import Dict, Any, Tuple

SETTINGS_FILE = Path(__file__).parent / ".settings.json"


def _load_settings() -> dict:
    """Load settings for SMTP configuration."""
    if SETTINGS_FILE.exists():
        try:
            return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def generate_otp(length: int = 6) -> str:
    """Generate a cryptographically secure numeric OTP."""
    digits = "0123456789"
    return "".join(secrets.choice(digits) for _ in range(length))


def send_otp_email(to_email: str, otp: str, purpose: str = "verification") -> Dict[str, Any]:
    """
    Send OTP code via SMTP.
    If SMTP is not configured, provides simulated local fallback
    so the user is not blocked while testing or running locally.
    """
    settings = _load_settings()
    smtp_host = settings.get("smtp_host", "").strip()
    smtp_port = int(settings.get("smtp_port", 587))
    smtp_user = settings.get("smtp_user", "").strip()
    smtp_pass = settings.get("smtp_pass", "").strip()
    smtp_from = settings.get("smtp_from", "").strip() or smtp_user

    action_text = "verify your email address" if purpose == "verification" else "reset your password"
    title_text = "Email Verification" if purpose == "verification" else "Password Reset Request"

    # HTML Email Template
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f1f5f9; padding: 20px; margin: 0; }}
            .container {{ max-width: 500px; margin: 0 auto; background: #131b2e; border: 1px solid #1e293b; border-radius: 12px; padding: 32px; box-shadow: 0 8px 30px rgba(0,0,0,0.5); }}
            .brand {{ color: #00f59b; font-size: 20px; font-weight: 700; text-align: center; margin-bottom: 24px; letter-spacing: 0.5px; }}
            h2 {{ color: #ffffff; font-size: 22px; margin-top: 0; text-align: center; }}
            p {{ color: #94a3b8; font-size: 15px; line-height: 1.6; text-align: center; }}
            .otp-box {{ background: #0b0f19; border: 1px solid #00f59b; border-radius: 8px; padding: 18px; margin: 28px 0; text-align: center; }}
            .otp-code {{ font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #00f59b; font-family: monospace; }}
            .expiry {{ font-size: 13px; color: #64748b; margin-top: 8px; }}
            .footer {{ text-align: center; font-size: 12px; color: #475569; margin-top: 32px; border-top: 1px solid #1e293b; padding-top: 16px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="brand">Antigravity Trading Screener</div>
            <h2>{title_text}</h2>
            <p>Use the 6-digit verification code below to {action_text}:</p>
            <div class="otp-box">
                <div class="otp-code">{otp}</div>
                <div class="expiry">Valid for 10 minutes</div>
            </div>
            <p>If you did not request this code, please safely ignore this email.</p>
            <div class="footer">
                Trading Strategy Screener &bull; Secure Authentication System
            </div>
        </div>
    </body>
    </html>
    """

    # If SMTP is configured, attempt real email delivery
    if smtp_host and smtp_user and smtp_pass:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"Your Verification Code: {otp} - Trading Screener"
            msg["From"] = smtp_from
            msg["To"] = to_email

            text_fallback = f"Your verification code is: {otp}. It is valid for 10 minutes."
            msg.attach(MIMEText(text_fallback, "plain"))
            msg.attach(MIMEText(html_content, "html"))

            with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.sendmail(smtp_from, [to_email], msg.as_string())

            print(f"[EmailService] Real email successfully sent to {to_email}")
            return {
                "success": True,
                "mode": "smtp_live",
                "message": f"Verification code sent to {to_email}"
            }
        except Exception as e:
            print(f"[EmailService] SMTP error ({e}), falling back to dev preview")

    # Developer / Free Simulation Mode
    print("\n" + "=" * 50)
    print(f"  [OTP DISPATCH SIMULATION]")
    print(f"  Recipient: {to_email}")
    print(f"  Purpose:   {purpose}")
    print(f"  OTP Code:  {otp}")
    print("=" * 50 + "\n")

    return {
        "success": True,
        "mode": "dev_preview",
        "otp": otp,  # Included in dev mode so testing works immediately without SMTP setup
        "message": f"Verification code generated: {otp} (Simulated mode. Configure SMTP in settings for live inbox delivery)"
    }


def test_smtp_connection(host: str, port: int, user: str, password: str) -> Tuple[bool, str]:
    """Test SMTP credentials to ensure outgoing mail works."""
    try:
        with smtplib.SMTP(host, port, timeout=8) as server:
            server.starttls()
            server.login(user, password)
        return True, "SMTP connection and authentication successful!"
    except Exception as e:
        return False, f"SMTP Connection Failed: {str(e)}"
