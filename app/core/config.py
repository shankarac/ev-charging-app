from pathlib import Path
import os


BASE_DIR = Path(__file__).resolve().parents[2]


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_env_file(BASE_DIR / ".env")


class Settings:
    app_name = "EV Charging API"
    cors_origins = os.getenv("CORS_ORIGINS", "*").split(",")
    database_engine = os.getenv("DATABASE_ENGINE", "sqlite").strip().lower()
    sqlite_path = Path(
        os.getenv("SQLITE_PATH", BASE_DIR / "data" / "sqlite" / "ev_app.db")
    )
    sqlite_migrations_dir = BASE_DIR / "migrations" / "sqlite"
    postgres_migrations_dir = BASE_DIR / "migrations" / "postgres"
    postgres_dsn = os.getenv("POSTGRES_DSN", os.getenv("DATABASE_URL", ""))
    public_app_url = os.getenv(
        "PUBLIC_APP_URL",
        os.getenv("RENDER_EXTERNAL_URL", "http://127.0.0.1:8000"),
    )
    session_secret = os.getenv("SESSION_SECRET", "ev-app-session-secret")
    open_charge_map_url = "https://api.openchargemap.io/v3/poi/"
    open_charge_map_api_key = os.getenv("OPENCHARGEMAP_API_KEY", "")
    overpass_url = os.getenv(
        "OVERPASS_URL",
        "https://overpass-api.de/api/interpreter",
    )
    station_slot_limit = int(os.getenv("STATION_SLOT_LIMIT", "5"))
    booking_open_hour = int(os.getenv("BOOKING_OPEN_HOUR", "6"))
    booking_close_hour = int(os.getenv("BOOKING_CLOSE_HOUR", "22"))
    booking_slot_interval_minutes = int(os.getenv("BOOKING_SLOT_INTERVAL_MINUTES", "30"))
    max_booking_days_ahead = int(os.getenv("MAX_BOOKING_DAYS_AHEAD", "30"))
    station_booking_url = os.getenv("STATION_BOOKING_URL", "")
    station_booking_api_key = os.getenv("STATION_BOOKING_API_KEY", "")
    station_notification_email = os.getenv("STATION_NOTIFICATION_EMAIL", "")
    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_username = os.getenv("SMTP_USERNAME", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    smtp_use_tls = os.getenv("SMTP_USE_TLS", "true").lower() != "false"
    smtp_use_ssl = os.getenv("SMTP_USE_SSL", "false").lower() == "true"
    smtp_from_email = os.getenv("SMTP_FROM_EMAIL", "")
    email_dev_outbox_enabled = os.getenv("EMAIL_DEV_OUTBOX", "true").lower() != "false"
    email_dev_outbox_dir = Path(
        os.getenv("EMAIL_DEV_OUTBOX_DIR", BASE_DIR / "data" / "email_outbox")
    )
    google_client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    google_client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")
    google_redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "")
    allowed_email_domains = [
        part.strip().lower()
        for part in os.getenv("ALLOWED_EMAIL_DOMAINS", "").split(",")
        if part.strip()
    ]


settings = Settings()
