from app.services import app_config

# Rate per charging unit at base (30-minute / 1-slot) occupancy.
CHARGER_UNIT_RATES = {
    "AC Charger": 12.0,
    "Fast DC": 18.0,
    "Ultra Fast": 22.0,
}

CHARGER_SLOT_RATES = CHARGER_UNIT_RATES

DEFAULT_CHARGER_TYPE = "Fast DC"
MAX_SLOT_COUNT = 2
MIN_UNITS = 1
MAX_UNITS = 200
DEFAULT_UNITS = 10

# Per-unit rate multiplier when booking a 1-hour (2-slot) window.
HOUR_SLOT_UNIT_RATE_MULTIPLIER = 1.5


def unit_rate_for_charger(charger_type: str, slot_count: int = 1) -> float:
    base = CHARGER_UNIT_RATES.get(
        charger_type, CHARGER_UNIT_RATES[DEFAULT_CHARGER_TYPE]
    )
    slots = max(1, min(int(slot_count or 1), MAX_SLOT_COUNT))
    if slots >= 2:
        return round(base * HOUR_SLOT_UNIT_RATE_MULTIPLIER, 2)
    return base


def slot_rate_for_charger(charger_type: str) -> float:
    return unit_rate_for_charger(charger_type, 1)


def booking_duration_minutes(slot_count: int) -> int:
    count = max(1, min(int(slot_count or 1), MAX_SLOT_COUNT))
    return count * app_config.booking_slot_interval_minutes()


def normalize_units(units: int | None) -> int:
    return max(MIN_UNITS, min(int(units or DEFAULT_UNITS), MAX_UNITS))


def charging_subtotal_units(
    units: int,
    charger_type: str,
    slot_count: int = 1,
) -> float:
    count = normalize_units(units)
    rate = unit_rate_for_charger(charger_type, slot_count)
    return round(count * rate, 2)


def charging_subtotal(slot_count: int, charger_type: str) -> float:
    return charging_subtotal_units(slot_count, charger_type, slot_count)


def calculate_booking_breakdown(
    charger_type: str,
    station_name: str = "",
    slot_count: int = 1,
    units: int | None = None,
) -> dict[str, float]:
    effective_units = normalize_units(units)
    effective_slots = max(1, min(int(slot_count or 1), MAX_SLOT_COUNT))
    rate = unit_rate_for_charger(charger_type, effective_slots)
    subtotal = charging_subtotal_units(
        effective_units, charger_type, effective_slots
    )
    service_charge = app_config.service_charge_for_station(station_name)
    total = round(subtotal + service_charge, 2)
    return {
        "subtotal": subtotal,
        "service_charge": service_charge,
        "total": total,
        "units": effective_units,
        "slot_count": effective_slots,
        "duration_minutes": booking_duration_minutes(effective_slots),
        "rate_per_unit": rate,
        "rate_per_slot": rate,
        "base_rate_per_unit": unit_rate_for_charger(charger_type, 1),
        "hour_slot_multiplier": HOUR_SLOT_UNIT_RATE_MULTIPLIER
        if effective_slots >= 2
        else 1.0,
    }


def calculate_booking_price(
    charger_type: str,
    station_name: str = "",
    slot_count: int = 1,
    units: int | None = None,
) -> float:
    return calculate_booking_breakdown(
        charger_type, station_name, slot_count, units
    )["total"]


def units_may_be_slot_count_mistake(units: int, slot_count: int) -> bool:
    """True when stored units likely came from slot count (1–2) not charging units."""
    u = int(units or 0)
    s = max(1, min(int(slot_count or 1), MAX_SLOT_COUNT))
    return u in (1, 2) and s in (1, 2) and u == s


def normalize_charging_units(units: int | None, slot_count: int = 1) -> int:
    """Canonical charging units; never treat 1-hour slot count (2) as units."""
    count = normalize_units(units)
    slots = max(1, min(int(slot_count or 1), MAX_SLOT_COUNT))
    if units_may_be_slot_count_mistake(count, slots):
        return DEFAULT_UNITS
    if slots >= 2 and count <= 2:
        return DEFAULT_UNITS
    return count


def canonical_booking_pricing(
    charger_type: str,
    station_name: str = "",
    slot_count: int = 1,
    units: int | None = None,
) -> tuple[dict[str, float], int]:
    """Return pricing breakdown and normalized units for persistence/display."""
    effective_slots = max(1, min(int(slot_count or 1), MAX_SLOT_COUNT))
    effective_units = normalize_charging_units(units, effective_slots)
    breakdown = calculate_booking_breakdown(
        charger_type,
        station_name,
        effective_slots,
        effective_units,
    )
    return breakdown, effective_units


def booking_needs_pricing_repair(
    row: dict,
    canonical_units: int,
    canonical_price: float,
) -> bool:
    stored_units = int(row.get("units") or 0)
    stored_price = float(row.get("price") or 0)
    if stored_units != canonical_units:
        return True
    return abs(stored_price - canonical_price) >= 0.01


def infer_units_from_paid_price(
    paid_price: float,
    charger_type: str,
    station_name: str = "",
    slot_count: int = 1,
) -> int | None:
    """Estimate charging units from amount paid (subtotal + service charge)."""
    amount = float(paid_price or 0)
    if amount <= 0:
        return None
    slots = max(1, min(int(slot_count or 1), MAX_SLOT_COUNT))
    rate = unit_rate_for_charger(charger_type, slots)
    if rate <= 0:
        return None
    service_charge = app_config.service_charge_for_station(station_name)
    subtotal = max(0.0, round(amount - service_charge, 2))
    inferred = int(round(subtotal / rate))
    if MIN_UNITS <= inferred <= MAX_UNITS:
        return inferred
    return None


def resolve_booking_display(booking: dict) -> dict:
    """Attach canonical pricing; aligns display and stored row when possible."""
    row = dict(booking)
    slot_count = int(row.get("slot_count") or 1)
    charger_type = row.get("charger_type") or DEFAULT_CHARGER_TYPE
    station_name = row.get("station_name") or ""

    breakdown, canonical_units = canonical_booking_pricing(
        charger_type,
        station_name,
        slot_count,
        row.get("units"),
    )
    canonical_price = breakdown["total"]

    row["display_units"] = canonical_units
    row["display_price"] = canonical_price
    row["subtotal"] = breakdown["subtotal"]
    row["service_charge"] = breakdown["service_charge"]
    row["rate_per_unit"] = breakdown["rate_per_unit"]
    row["duration_minutes"] = breakdown["duration_minutes"]
    row["units"] = canonical_units
    row["price"] = canonical_price
    return row
