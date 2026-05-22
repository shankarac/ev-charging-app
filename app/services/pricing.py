CHARGER_UNIT_RATES = {
    "AC Charger": 12.0,
    "Fast DC": 18.0,
    "Ultra Fast": 22.0,
}

DEFAULT_CHARGER_TYPE = "Fast DC"


def unit_rate_for_charger(charger_type: str) -> float:
    return CHARGER_UNIT_RATES.get(charger_type, CHARGER_UNIT_RATES[DEFAULT_CHARGER_TYPE])


def calculate_booking_price(units: int, charger_type: str) -> float:
    safe_units = max(0, int(units))
    return round(safe_units * unit_rate_for_charger(charger_type), 2)
