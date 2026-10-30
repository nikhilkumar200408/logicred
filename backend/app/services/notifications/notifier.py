"""
Real notification channels for High-risk student records.

Both channels are genuine outbound integrations (no simulation / no
hardcoded "sent" responses) — if credentials aren't configured, the
function logs a clear warning and returns False rather than pretending to
have sent anything. Both are best-effort: a notification failure never
breaks the OCR/validation pipeline that triggered it.

Enable via .env:
  NOTIFICATIONS_ENABLED=true
  # email (SMTP — Gmail App Password works: https://myaccount.google.com/apppasswords)
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=587
  SMTP_USER=you@gmail.com
  SMTP_PASSWORD=<16-char app password>
  NOTIFY_EMAIL_TO=you@gmail.com
  # sms (pick ONE provider)
  SMS_PROVIDER=fast2sms
  FAST2SMS_API_KEY=<from fast2sms.com/dashboard>
  NOTIFY_PHONE_NUMBER=6263151518
"""
import asyncio
import logging
import smtplib
from email.mime.text import MIMEText
from typing import Optional

import httpx

from ...config import settings

logger = logging.getLogger(__name__)


def _send_email_sync(subject: str, body: str) -> bool:
    if not (settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD and settings.NOTIFY_EMAIL_TO):
        logger.warning(
            "Email notification skipped: SMTP_HOST/SMTP_USER/SMTP_PASSWORD/NOTIFY_EMAIL_TO not fully configured in .env"
        )
        return False
    try:
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_USER
        msg["To"] = settings.NOTIFY_EMAIL_TO
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_USER, [settings.NOTIFY_EMAIL_TO], msg.as_string())
        logger.info("Email notification sent to %s", settings.NOTIFY_EMAIL_TO)
        return True
    except Exception as e:  # noqa: BLE001
        logger.error("Email notification failed: %s", e)
        return False


async def send_email(subject: str, body: str) -> bool:
    # smtplib is blocking — run it off the event loop so it never stalls
    # the async pipeline/request handlers.
    return await asyncio.to_thread(_send_email_sync, subject, body)


async def _send_sms_fast2sms(message: str) -> bool:
    if not (settings.FAST2SMS_API_KEY and settings.NOTIFY_PHONE_NUMBER):
        logger.warning("SMS skipped: FAST2SMS_API_KEY / NOTIFY_PHONE_NUMBER not configured in .env")
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://www.fast2sms.com/dev/bulkV2",
                headers={"authorization": settings.FAST2SMS_API_KEY, "Content-Type": "application/json"},
                json={
                    "route": "q",  # Quick SMS — works for personal/test numbers without DLT template registration
                    "message": message[:600],
                    "language": "english",
                    "flash": 0,
                    "numbers": settings.NOTIFY_PHONE_NUMBER,
                },
            )
        data = resp.json()
        if resp.status_code == 200 and data.get("return") is True:
            logger.info("SMS sent via Fast2SMS to %s", settings.NOTIFY_PHONE_NUMBER)
            return True
        logger.error("Fast2SMS API rejected the request: %s", data)
        return False
    except Exception as e:  # noqa: BLE001
        logger.error("Fast2SMS request failed: %s", e)
        return False


async def _send_sms_twilio(message: str) -> bool:
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER and settings.NOTIFY_PHONE_NUMBER):
        logger.warning("SMS skipped: TWILIO_* / NOTIFY_PHONE_NUMBER not fully configured in .env")
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{settings.TWILIO_ACCOUNT_SID}/Messages.json",
                auth=(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN),
                data={
                    "From": settings.TWILIO_FROM_NUMBER,
                    "To": settings.NOTIFY_PHONE_NUMBER,
                    "Body": message[:1500],
                },
            )
        if resp.status_code in (200, 201):
            logger.info("SMS sent via Twilio to %s", settings.NOTIFY_PHONE_NUMBER)
            return True
        logger.error("Twilio API rejected the request (%s): %s", resp.status_code, resp.text)
        return False
    except Exception as e:  # noqa: BLE001
        logger.error("Twilio request failed: %s", e)
        return False


async def send_sms(message: str) -> bool:
    if settings.SMS_PROVIDER == "fast2sms":
        return await _send_sms_fast2sms(message)
    if settings.SMS_PROVIDER == "twilio":
        return await _send_sms_twilio(message)
    logger.info("SMS notification skipped: SMS_PROVIDER=%s (set to 'fast2sms' or 'twilio' to enable)", settings.SMS_PROVIDER)
    return False


async def notify_high_risk_record(record: dict, student_name: Optional[str] = None, apaar_id: Optional[str] = None) -> None:
    """Fires both channels (best-effort, never raises) when a record is
    scored HIGH anomaly. Called from the pipeline right after scoring."""
    if not settings.NOTIFICATIONS_ENABLED:
        return

    subject = "LogicRed: HIGH-risk student record needs verification"
    body = (
        f"A newly submitted student record was flagged HIGH anomaly and needs AICTE Officer review.\n\n"
        f"Record ID: {record['_id']}\n"
        f"Student: {student_name or 'Unknown'}\n"
        f"APAAR ID: {apaar_id or 'Unknown'}\n"
        f"Overall confidence: {record['overall_confidence']}%\n"
        f"Anomaly reasons: {', '.join(record.get('anomaly_reasons', [])) or 'See dashboard'}\n"
    )
    sms_text = (
        f"LogicRed: HIGH-risk record flagged (Student: {student_name or 'Unknown'}, "
        f"APAAR: {apaar_id or 'N/A'}). Please review in the AICTE Officer queue."
    )

    try:
        await send_email(subject, body)
    except Exception as e:  # noqa: BLE001
        logger.error("Unexpected error sending notification email: %s", e)
    try:
        await send_sms(sms_text)
    except Exception as e:  # noqa: BLE001
        logger.error("Unexpected error sending notification SMS: %s", e)
