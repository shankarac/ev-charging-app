from app.db import db

SETTING_KEYS = (
    "station_slot_limit",
    "booking_open_hour",
    "booking_close_hour",
    "booking_slot_interval_minutes",
    "max_booking_days_ahead",
)


def get_setting(key: str) -> str | None:
    row = db.fetch_one(
        """
        SELECT value
        FROM app_settings
        WHERE key=:key
        """,
        {"key": key},
    )
    if not row:
        return None
    return row["value"]


def get_all_settings() -> dict[str, str]:
    rows = db.fetch_all(
        """
        SELECT key, value
        FROM app_settings
        ORDER BY key
        """
    )
    return {row["key"]: row["value"] for row in rows}


def upsert_setting(key: str, value: str, updated_by: str = "") -> None:
    db.execute(
        """
        INSERT INTO app_settings(key, value, updated_by)
        VALUES(:key, :value, :updated_by)
        ON CONFLICT(key) DO UPDATE SET
            value=excluded.value,
            updated_at=CURRENT_TIMESTAMP,
            updated_by=excluded.updated_by
        """,
        {"key": key, "value": value, "updated_by": updated_by},
    )


def upsert_settings(values: dict[str, str | int], updated_by: str = "") -> None:
    for key in SETTING_KEYS:
        if key not in values:
            continue
        upsert_setting(key, str(values[key]), updated_by=updated_by)
