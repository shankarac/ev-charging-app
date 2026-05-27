from datetime import date, datetime, timedelta

from app.services import app_config


def booking_open_hour() -> int:
    return app_config.booking_open_hour()


def booking_close_hour() -> int:
    return app_config.booking_close_hour()


def booking_slot_interval_minutes() -> int:
    return app_config.booking_slot_interval_minutes()


def max_booking_date() -> date:
    return app_config.max_booking_date()


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
    if close_hour >= 24:
        if parsed.hour < open_hour:
            return None, f"Choose a time between {open_hour}:00 and 24:00."
    elif parsed.hour < open_hour or parsed.hour >= close_hour:
        return None, f"Choose a time between {open_hour}:00 and {close_hour}:00."

    return normalized, None


def validate_booking_slot_range(
    booking_time: str,
    slot_count: int = 1,
) -> tuple[str | None, str | None]:
    normalized, error = validate_booking_datetime(booking_time)
    if error:
        return None, error
    safe_count = max(1, min(int(slot_count or 1), 2))
    slot_times = expand_slot_times(normalized, safe_count)
    if len(slot_times) != safe_count:
        return None, "That time range is not available."
    try:
        slot_date = datetime.fromisoformat(slot_times[0]).date()
    except ValueError:
        return None, "Choose a valid date and time."
    if not can_reserve_consecutive_slots(slot_date, normalized, safe_count, set()):
        return None, "That time range is outside booking hours."
    return normalized, None


def iter_day_slot_datetimes(slot_date: date):
    interval = timedelta(minutes=booking_slot_interval_minutes())
    start = datetime(slot_date.year, slot_date.month, slot_date.day, booking_open_hour(), 0, 0)
    close_hour = booking_close_hour()
    if close_hour >= 24:
        end = datetime(slot_date.year, slot_date.month, slot_date.day) + timedelta(days=1)
    else:
        end = datetime(slot_date.year, slot_date.month, slot_date.day, close_hour, 0, 0)
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


def count_available_slots(slots: list[dict]) -> int:
    return sum(1 for slot in slots if slot.get("available"))


def expand_slot_times(booking_time: str, slot_count: int = 1) -> list[str]:
    normalized = normalize_booking_slot_time(booking_time)
    if not normalized or slot_count < 1:
        return []
    try:
        start = datetime.fromisoformat(normalized)
    except ValueError:
        return []
    interval = timedelta(minutes=booking_slot_interval_minutes())
    return [
        (start + interval * index).isoformat(timespec="minutes")
        for index in range(slot_count)
    ]


def format_slot_range_label(start_time: str, slot_count: int = 1) -> str:
    times = expand_slot_times(start_time, slot_count)
    if not times:
        return ""
    if slot_count <= 1:
        try:
            return format_slot_label(datetime.fromisoformat(times[0]))
        except ValueError:
            return times[0]
    try:
        start_label = format_slot_label(datetime.fromisoformat(times[0]))
        end_dt = datetime.fromisoformat(times[-1]) + timedelta(
            minutes=booking_slot_interval_minutes()
        )
        end_label = format_slot_label(end_dt)
        return f"{start_label} – {end_label}"
    except ValueError:
        return f"{times[0]} – {times[-1]}"


def can_reserve_consecutive_slots(
    slot_date: date,
    start_time: str,
    slot_count: int,
    booked_times: set[str],
) -> bool:
    if slot_count < 1:
        return False
    slot_times = expand_slot_times(start_time, slot_count)
    if len(slot_times) != slot_count:
        return False

    now = datetime.now().replace(second=0, microsecond=0)
    close_hour = booking_close_hour()
    interval = timedelta(minutes=booking_slot_interval_minutes())

    for slot_time in slot_times:
        if slot_time in booked_times:
            return False
        try:
            slot_dt = datetime.fromisoformat(slot_time)
        except ValueError:
            return False
        if slot_dt.date() != slot_date or slot_dt < now:
            return False
        if close_hour < 24 and slot_dt.hour >= close_hour:
            return False

    last_start = datetime.fromisoformat(slot_times[-1])
    if close_hour < 24 and last_start + interval > datetime(
        slot_date.year, slot_date.month, slot_date.day, close_hour, 0, 0
    ):
        return False

    return True


def build_daily_slots(
    slot_date: date,
    booked_times: set[str],
    slot_count: int = 1,
) -> list[dict]:
    now = datetime.now().replace(second=0, microsecond=0)
    safe_count = max(1, min(int(slot_count or 1), 2))
    slots = []
    for slot_dt in iter_day_slot_datetimes(slot_date):
        slot_time = slot_dt.isoformat(timespec="minutes")
        is_past = slot_dt < now
        is_booked = slot_time in booked_times
        can_book = can_reserve_consecutive_slots(
            slot_date,
            slot_time,
            safe_count,
            booked_times,
        )
        slots.append(
            {
                "time": slot_time,
                "label": format_slot_range_label(slot_time, safe_count),
                "available": can_book,
                "booked": is_booked,
                "past": is_past,
                "slot_count": safe_count,
            }
        )
    return slots
