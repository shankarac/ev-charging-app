from datetime import date, datetime, timedelta

from app.core.config import settings


def booking_open_hour() -> int:
    return max(0, min(settings.booking_open_hour, 23))


def booking_close_hour() -> int:
    return max(booking_open_hour() + 1, min(settings.booking_close_hour, 24))


def booking_slot_interval_minutes() -> int:
    return max(15, min(settings.booking_slot_interval_minutes, 120))


def max_booking_date() -> date:
    return date.today() + timedelta(days=max(1, settings.max_booking_days_ahead))


def parse_booking_date(value: str) -> date | None:
    cleaned = (value or "").strip()
    if not cleaned:
        return None
    if len(cleaned) >= 10 and cleaned[4] == "-":
        try:
            return date.fromisoformat(cleaned[:10])
        except ValueError:
            pass
    for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M", "%d/%m/%Y"):
        try:
            parsed = datetime.strptime(cleaned[:16] if "T" in fmt else cleaned[:10], fmt)
            return parsed.date()
        except ValueError:
            continue
    return None


def normalize_booking_slot_time(booking_time: str) -> str | None:
    cleaned = (booking_time or "").strip()
    if not cleaned:
        return None
    try:
        if "T" in cleaned:
            parsed = datetime.fromisoformat(cleaned[:16])
        else:
            parsed = datetime.strptime(cleaned[:16], "%Y-%m-%d %H:%M")
    except ValueError:
        return None
    parsed = parsed.replace(second=0, microsecond=0)
    return parsed.isoformat(timespec="minutes")


def validate_booking_date(value: str) -> date | None:
    slot_date = parse_booking_date(value)
    if not slot_date:
        return None
    if slot_date < date.today():
        return None
    if slot_date > max_booking_date():
        return None
    return slot_date


def validate_booking_datetime(booking_time: str) -> tuple[str | None, str | None]:
    normalized = normalize_booking_slot_time(booking_time)
    if not normalized:
        return None, "Choose a valid date and time."

    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None, "Choose a valid date and time."

    now = datetime.now().replace(second=0, microsecond=0)
    if parsed < now:
        return None, "Booking time must be in the future."

    if parsed.date() > max_booking_date():
        return None, f"Bookings are only available up to {max_booking_date().isoformat()}."

    open_hour = booking_open_hour()
    close_hour = booking_close_hour()
    if parsed.hour < open_hour or parsed.hour >= close_hour:
        return None, f"Choose a time between {open_hour}:00 and {close_hour}:00."

    return normalized, None


def iter_day_slot_datetimes(slot_date: date):
    interval = timedelta(minutes=booking_slot_interval_minutes())
    start = datetime(slot_date.year, slot_date.month, slot_date.day, booking_open_hour(), 0, 0)
    end = datetime(slot_date.year, slot_date.month, slot_date.day, booking_close_hour(), 0, 0)
    current = start
    while current < end:
        yield current
        current += interval


def format_slot_label(slot_dt: datetime) -> str:
    hour = slot_dt.hour
    minute = slot_dt.minute
    hour_12 = hour % 12 or 12
    period = "AM" if hour < 12 else "PM"
    if minute:
        return f"{hour_12}:{minute:02d} {period}"
    return f"{hour_12}:00 {period}"


def build_daily_slots(slot_date: date, booked_times: set[str]) -> list[dict]:
    now = datetime.now().replace(second=0, microsecond=0)
    slots = []
    for slot_dt in iter_day_slot_datetimes(slot_date):
        slot_time = slot_dt.isoformat(timespec="minutes")
        is_past = slot_dt < now
        is_booked = slot_time in booked_times
        slots.append(
            {
                "time": slot_time,
                "label": format_slot_label(slot_dt),
                "available": not is_past and not is_booked,
                "booked": is_booked,
                "past": is_past,
            }
        )
    return slots


def count_available_slots(slots: list[dict]) -> int:
    return sum(1 for slot in slots if slot.get("available"))
