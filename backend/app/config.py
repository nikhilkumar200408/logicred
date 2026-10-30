"""
Central application configuration.
Reads from environment variables / .env file. See .env.example for all options.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "logicred_db"

    JWT_SECRET: str = "change-this-secret-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # "bcrypt" or "argon2"
    PASSWORD_HASH_SCHEME: str = "bcrypt"

    LLM_PROVIDER: str = "demo"
    LLM_API_KEY: str = ""
    OCR_PROVIDER: str = "tesseract"       # demo | tesseract | paddleocr
    EXTRACTION_PROVIDER: str = "regex"    # demo | regex | llm
    TRANSLATE_ENABLED: bool = True        # deep-translator; requires outbound internet

    DEMO_MODE: bool = True
    CORS_ORIGINS: str = "http://localhost:3000"

    # Confidence thresholds (configurable per section 9 of spec)
    CONFIDENCE_HIGH_THRESHOLD: int = 85
    CONFIDENCE_REVIEW_THRESHOLD: int = 70

    # Upload limits
    MAX_UPLOAD_SIZE_MB: int = 20
    ALLOWED_EXTENSIONS: tuple = (".pdf", ".jpg", ".jpeg", ".png")

    UPLOAD_DIR: str = "/tmp/logicred_uploads"

    # --- Notifications: fired when a record lands with anomaly_level=HIGH ---
    NOTIFICATIONS_ENABLED: bool = False

    # Email (SMTP) — works with Gmail (use an App Password, not your normal
    # password: https://myaccount.google.com/apppasswords) or any SMTP host.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    NOTIFY_EMAIL_TO: str = ""

    # SMS — pluggable, like the OCR/extraction providers.
    # "fast2sms" (India-focused, simplest signup: https://www.fast2sms.com)
    # "twilio" (international, needs a Twilio phone number)
    # "none" disables SMS entirely.
    SMS_PROVIDER: str = "none"          # none | fast2sms | twilio
    NOTIFY_PHONE_NUMBER: str = ""       # 10-digit for fast2sms, E.164 (+91...) for twilio

    FAST2SMS_API_KEY: str = ""

    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_FROM_NUMBER: str = ""


settings = Settings()
