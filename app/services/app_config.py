import json
from datetime import date, timedelta

from app.core.config import settings
from app.repositories import app_settings as settings_repo

DEFAULTS = {
    "station_slot_limit": settings.station_slot_limit,
    "booking_open_hour": settings.booking_open_hour,
    "booking_close_hour": settings.booking_close_hour,
    "booking_slot_interval_minutes": settings.booking_slot_interval_minutes,
    "max_booking_days_ahead": settings.max_booking_days_ahead,
    "default_service_charge": 0,
}


def _stored_int(key: str) -> int | None:
    stored = settings_repo.get_setting(key)
    if stored is None or stored == "":
        return None
    try:
        return int(stored)
    except ValueError:
        return None


def station_slot_limit() -> int:
    return _stored_int("station_slot_limit") or DEFAULTS["station_slot_limit"]


def booking_open_hour() -> int:
    return max(0, min(_stored_int("booking_open_hour") or DEFAULTS["booking_open_hour"], 23))


def booking_close_hour() -> int:
    default_close = DEFAULTS["booking_close_hour"]
    close_hour = _stored_int("booking_close_hour") or default_close
    return max(booking_open_hour() + 1, min(close_hour, 24))


def booking_slot_interval_minutes() -> int:
    stored = _stored_int("booking_slot_interval_minutes")
    value = stored if stored is not None else DEFAULTS["booking_slot_interval_minutes"]
    return max(15, min(value, 120))


def max_booking_days_ahead() -> int:
    stored = _stored_int("max_booking_days_ahead")
    value = stored if stored is not None else DEFAULTS["max_booking_days_ahead"]
    return max(1, value)


def max_booking_date() -> date:
    return date.today() + timedelta(days=max_booking_days_ahead())


def default_service_charge() -> float:
    stored = settings_repo.get_setting("default_service_charge")
    if stored is None or stored == "":
        return float(DEFAULTS["default_service_charge"])
    try:
        return max(0.0, round(float(stored), 2))
    except ValueError:
        return float(DEFAULTS["default_service_charge"])


def station_service_charge_overrides() -> dict[str, float]:
    stored = settings_repo.get_setting("station_service_charges")
    if not stored:
        return {}
    try:
        parsed = json.loads(stored)
    except json.JSONDecodeError:
        return {}
    if not isinstance(parsed, dict):
        return {}

    cleaned: dict[str, float] = {}
    for key, value in parsed.items():
        station_name = str(key or "").strip()
        if not station_name:
            continue
        try:
            cleaned[station_name] = max(0.0, round(float(value), 2))
        except (TypeError, ValueError):
            continue
    return cleaned


def service_charge_for_station(station_name: str) -> float:
    return 0.0


def public_config() -> dict:
    from app.services.pricing import (
        CHARGER_SLOT_RATES,
        HOUR_SLOT_UNIT_RATE_MULTIPLIER,
    )

    return {
        "station_slot_limit": station_slot_limit(),
        "max_booking_date": max_booking_date().isoformat(),
        "max_booking_days_ahead": max_booking_days_ahead(),
        "booking_open_hour": booking_open_hour(),
        "booking_close_hour": booking_close_hour(),
        "booking_slot_interval_minutes": booking_slot_interval_minutes(),
        "charger_slot_rates": CHARGER_SLOT_RATES,
        "hour_slot_unit_rate_multiplier": HOUR_SLOT_UNIT_RATE_MULTIPLIER,
    }


def admin_config() -> dict:
    stored = settings_repo.get_all_settings()
    config = public_config()
    config["defaults"] = DEFAULTS.copy()
    config["stored"] = stored
    config["default_service_charge"] = default_service_charge()
    config["station_service_charges"] = stored.get("station_service_charges") or "{}"
    return config


def update_config(values: dict, updated_by: str) -> dict:
    cleaned: dict[str, int] = {}

    if "station_slot_limit" in values:
        cleaned["station_slot_limit"] = max(1, min(int(values["station_slot_limit"]), 50))
    if "booking_open_hour" in values:
        cleaned["booking_open_hour"] = max(0, min(int(values["booking_open_hour"]), 23))
    if "booking_close_hour" in values:
        cleaned["booking_close_hour"] = max(1, min(int(values["booking_close_hour"]), 24))
    if "booking_slot_interval_minutes" in values:
        cleaned["booking_slot_interval_minutes"] = max(
            15, min(int(values["booking_slot_interval_minutes"]), 120)
        )
    if "max_booking_days_ahead" in values:
        cleaned["max_booking_days_ahead"] = max(1, min(int(values["max_booking_days_ahead"]), 365))

    string_values: dict[str, str] = {}
    if "default_service_charge" in values:
        string_values["default_service_charge"] = str(
            max(0.0, round(float(values["default_service_charge"]), 2))
        )
    if "station_service_charges" in values:
        raw = values["station_service_charges"]
        if isinstance(raw, str):
            raw = raw.strip()
            if raw:
                parsed = json.loads(raw)
                if not isinstance(parsed, dict):
                    raise ValueError("Station service charges must be a JSON object.")
                normalized = {
                    str(key).strip(): max(0.0, round(float(value), 2))
                    for key, value in parsed.items()
                    if str(key).strip()
                }
                string_values["station_service_charges"] = json.dumps(normalized)
            else:
                string_values["station_service_charges"] = "{}"

    open_hour = cleaned.get("booking_open_hour", booking_open_hour())
    close_hour = cleaned.get("booking_close_hour", booking_close_hour())
    if close_hour <= open_hour:
        raise ValueError("Closing hour must be after opening hour.")

    settings_repo.upsert_settings(cleaned, updated_by=updated_by)
    for key, value in string_values.items():
        settings_repo.upsert_setting(key, value, updated_by=updated_by)
    return public_config()
