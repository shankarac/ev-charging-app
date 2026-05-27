from datetime import datetime

from app.db import db
from app.services.slot_schedule import expand_slot_times, normalize_booking_slot_time

_PAYMENT_STATUS_COLUMN_READY = False


def ensure_booking_schema():
    global _PAYMENT_STATUS_COLUMN_READY
    if _PAYMENT_STATUS_COLUMN_READY:
        return

    try:
        db.fetch_one("SELECT payment_status FROM bookings LIMIT 1")
    except Exception:
        try:
            db.execute(
                "ALTER TABLE bookings ADD COLUMN payment_status TEXT DEFAULT 'Pending'"
            )
            db.execute(
                """
                UPDATE bookings
                SET payment_status='Pending'
                WHERE payment_status IS NULL OR payment_status=''
                """
            )
        except Exception:
            pass

    try:
        db.fetch_one("SELECT payment_method FROM bookings LIMIT 1")
    except Exception:
        try:
            db.execute(
                "ALTER TABLE bookings ADD COLUMN payment_method TEXT DEFAULT ''"
            )
        except Exception:
            pass

    try:
        db.fetch_one("SELECT slot_count FROM bookings LIMIT 1")
    except Exception:
        try:
            db.execute(
                "ALTER TABLE bookings ADD COLUMN slot_count INTEGER NOT NULL DEFAULT 1"
            )
        except Exception:
            pass

    _PAYMENT_STATUS_COLUMN_READY = True


def current_booking_timestamp():
    return datetime.now().replace(second=0, microsecond=0).isoformat(timespec="minutes")


def refresh_expired_bookings():
    db.execute(
        """
        UPDATE bookings
        SET status='Expired'
        WHERE status='Booked' AND booking_time <= :current_time
        """,
        {"current_time": current_booking_timestamp()},
    )


def count_user_active_bookings(username):
    refresh_expired_bookings()
    row = db.fetch_one(
        """
        SELECT COUNT(*) AS total
        FROM bookings
        WHERE username=:username AND status='Booked'
        """,
        {"username": username},
    )
    return row["total"]


def find_user_booking_for_station(username, station_name):
    refresh_expired_bookings()
    return db.fetch_one(
        """
        SELECT id, station_name
        FROM bookings
        WHERE username=:username AND station_name=:station_name AND status='Booked'
        LIMIT 1
        """,
        {"username": username, "station_name": station_name},
    )


def find_user_booking_for_station_time(username, station_name, booking_time):
    refresh_expired_bookings()
    return db.fetch_one(
        """
        SELECT id, station_name
        FROM bookings
        WHERE username=:username
          AND station_name=:station_name
          AND booking_time=:booking_time
          AND status='Booked'
        LIMIT 1
        """,
        {
            "username": username,
            "station_name": station_name,
            "booking_time": booking_time,
        },
    )


def count_station_bookings(station_name):
    refresh_expired_bookings()
    row = db.fetch_one(
        """
        SELECT COUNT(*) AS total
        FROM bookings
        WHERE station_name=:station_name AND status='Booked'
        """,
        {"station_name": station_name},
    )
    return row["total"]


def count_active_bookings_by_station():
    refresh_expired_bookings()
    rows = db.fetch_all(
        """
        SELECT station_name, COUNT(*) AS total
        FROM bookings
        WHERE status='Booked'
        GROUP BY station_name
        """
    )
    return {row["station_name"]: row["total"] for row in rows}


def _booking_slot_count(row) -> int:
    raw = row["slot_count"] if "slot_count" in row.keys() else 1
    try:
        count = int(raw or 1)
    except (TypeError, ValueError):
        count = 1
    return max(1, min(count, 2))


def list_station_blocked_times(station_name, date_prefix):
    refresh_expired_bookings()
    rows = db.fetch_all(
        """
        SELECT booking_time, slot_count
        FROM bookings
        WHERE station_name=:station_name
          AND status='Booked'
          AND booking_time LIKE :date_prefix
        """,
        {
            "station_name": station_name,
            "date_prefix": f"{date_prefix}%",
        },
    )
    blocked: set[str] = set()
    for row in rows:
        for slot_time in expand_slot_times(row["booking_time"], _booking_slot_count(row)):
            if slot_time.startswith(date_prefix):
                blocked.add(slot_time)
    return blocked


def list_station_booking_times(station_name, date_prefix):
    return sorted(list_station_blocked_times(station_name, date_prefix))


def list_booking_times_grouped_for_date(date_prefix: str) -> dict[str, list[str]]:
    refresh_expired_bookings()
    rows = db.fetch_all(
        """
        SELECT station_name, booking_time, slot_count
        FROM bookings
        WHERE status='Booked'
          AND booking_time LIKE :date_prefix
        """,
        {"date_prefix": f"{date_prefix}%"},
    )
    grouped: dict[str, set[str]] = {}
    for row in rows:
        station = row["station_name"]
        grouped.setdefault(station, set())
        for slot_time in expand_slot_times(row["booking_time"], _booking_slot_count(row)):
            if slot_time.startswith(date_prefix):
                grouped[station].add(slot_time)
    return {station: sorted(times) for station, times in grouped.items()}


def is_slot_booked(station_name, booking_time, slot_count: int = 1):
    normalized = normalize_booking_slot_time(booking_time)
    if not normalized:
        return True

    needed = set(expand_slot_times(normalized, max(1, min(int(slot_count or 1), 2))))
    if not needed:
        return True

    refresh_expired_bookings()
    rows = db.fetch_all(
        """
        SELECT booking_time, slot_count
        FROM bookings
        WHERE station_name=:station_name
          AND status='Booked'
        """,
        {"station_name": station_name},
    )
    for row in rows:
        occupied = set(
            expand_slot_times(row["booking_time"], _booking_slot_count(row))
        )
        if needed & occupied:
            return True
    return False


def update_booking_pricing(
    booking_id: int,
    units: int,
    price: float,
    slot_count: int,
    charger_type: str,
) -> None:
    ensure_booking_schema()
    db.execute(
        """
        UPDATE bookings
        SET units=:units,
            price=:price,
            slot_count=:slot_count,
            charger_type=:charger_type
        WHERE id=:booking_id
        """,
        {
            "booking_id": booking_id,
            "units": int(units),
            "price": float(price),
            "slot_count": max(1, min(int(slot_count or 1), 2)),
            "charger_type": charger_type or "",
        },
    )


def repair_booking_pricing_if_needed(row: dict) -> bool:
    from app.services.pricing import (
        booking_needs_pricing_repair,
        canonical_booking_pricing,
    )

    booking_id = row.get("id")
    if not booking_id:
        return False

    slot_count = int(row.get("slot_count") or 1)
    charger_type = row.get("charger_type") or ""
    station_name = row.get("station_name") or ""
    breakdown, canonical_units = canonical_booking_pricing(
        charger_type,
        station_name,
        slot_count,
        row.get("units"),
    )
    canonical_price = breakdown["total"]
    if not booking_needs_pricing_repair(row, canonical_units, canonical_price):
        return False

    update_booking_pricing(
        booking_id,
        canonical_units,
        canonical_price,
        slot_count,
        charger_type,
    )
    row["units"] = canonical_units
    row["price"] = canonical_price
    return True


def create_booking(booking):
    ensure_booking_schema()
    normalized_time = normalize_booking_slot_time(booking.booking_time)
    if not normalized_time:
        return None

    booking.booking_time = normalized_time
    slot_count = max(1, min(int(getattr(booking, "slot_count", 1) or 1), 2))
    from app.services.pricing import canonical_booking_pricing

    breakdown, canonical_units = canonical_booking_pricing(
        booking.charger_type,
        booking.station_name,
        slot_count,
        booking.units,
    )
    booking.units = canonical_units
    booking.price = breakdown["total"]
    params = {
        "username": booking.username,
        "station_name": booking.station_name,
        "station_address": booking.station_address,
        "distance": booking.distance,
        "booking_time": normalized_time,
        "charger_type": booking.charger_type,
        "units": booking.units,
        "price": booking.price,
        "status": "Booked",
        "payment_status": "Pending",
        "slot_count": slot_count,
    }

    if is_slot_booked(booking.station_name, normalized_time, slot_count):
        return None

    if find_user_booking_for_station(booking.username, booking.station_name):
        return None

    try:
        return db.execute(
            """
            INSERT INTO bookings(
                username,
                station_name,
                station_address,
                distance,
                booking_time,
                charger_type,
                units,
                price,
                status,
                payment_status,
                slot_count
            )
            VALUES(
                :username,
                :station_name,
                :station_address,
                :distance,
                :booking_time,
                :charger_type,
                :units,
                :price,
                :status,
                :payment_status,
                :slot_count
            )
            """,
            params,
        )
    except Exception as exc:
        if type(exc).__name__ == "IntegrityError":
            return None
        raise


def list_active_bookings_for_user(username):
    ensure_booking_schema()
    refresh_expired_bookings()
    return db.fetch_all(
        """
        SELECT
            id,
            station_name,
            station_address,
            distance,
            booking_time,
            charger_type,
            units,
            price,
            status,
            payment_status,
            payment_method,
            slot_count
        FROM bookings
        WHERE username=:username AND status='Booked'
        ORDER BY id DESC
        """,
        {"username": username},
    )


def list_past_bookings_for_user(username):
    ensure_booking_schema()
    refresh_expired_bookings()
    return db.fetch_all(
        """
        SELECT
            id,
            station_name,
            station_address,
            distance,
            booking_time,
            charger_type,
            units,
            price,
            status,
            payment_status,
            payment_method,
            slot_count
        FROM bookings
        WHERE username=:username AND status <> 'Booked'
        ORDER BY id DESC
        """,
        {"username": username},
    )


def mark_booking_paid(booking, payment_method: str = "", booking_id: int | None = None) -> bool:
    ensure_booking_schema()
    params = {
        "username": booking.username,
        "payment_method": payment_method or "",
    }

    slot_count = max(1, min(int(getattr(booking, "slot_count", 1) or 1), 2))
    from app.services.pricing import canonical_booking_pricing

    breakdown, canonical_units = canonical_booking_pricing(
        getattr(booking, "charger_type", "") or "",
        getattr(booking, "station_name", "") or "",
        slot_count,
        getattr(booking, "units", None),
    )
    pricing_params = {
        **params,
        "units": canonical_units,
        "price": breakdown["total"],
        "slot_count": slot_count,
        "charger_type": getattr(booking, "charger_type", "") or "",
    }

    if booking_id:
        db.execute(
            """
            UPDATE bookings
            SET payment_status='Paid',
                payment_method=:payment_method,
                units=:units,
                price=:price,
                slot_count=:slot_count,
                charger_type=:charger_type
            WHERE id=:booking_id
              AND username=:username
              AND status='Booked'
            """,
            {**pricing_params, "booking_id": booking_id},
        )
        row = db.fetch_one(
            """
            SELECT id
            FROM bookings
            WHERE id=:booking_id
              AND username=:username
              AND payment_status='Paid'
            """,
            {"booking_id": booking_id, "username": booking.username},
        )
        return row is not None

    normalized_time = normalize_booking_slot_time(booking.booking_time)
    if not normalized_time:
        return False

    match_params = {
        **pricing_params,
        "station_name": booking.station_name,
        "booking_time": normalized_time,
    }
    db.execute(
        """
        UPDATE bookings
        SET payment_status='Paid',
            payment_method=:payment_method,
            units=:units,
            price=:price,
            slot_count=:slot_count,
            charger_type=:charger_type
        WHERE username=:username
          AND station_name=:station_name
          AND booking_time=:booking_time
          AND status='Booked'
        """,
        match_params,
    )
    row = db.fetch_one(
        """
        SELECT id
        FROM bookings
        WHERE username=:username
          AND station_name=:station_name
          AND booking_time=:booking_time
          AND payment_status='Paid'
          AND status='Booked'
        LIMIT 1
        """,
        match_params,
    )
    return row is not None


def mark_booking_cancelled(booking_id):
    db.execute(
        """
        UPDATE bookings
        SET status='Cancelled'
        WHERE id=:booking_id
        """,
        {"booking_id": booking_id},
    )


def delete_booking(booking_id):
    mark_booking_cancelled(booking_id)


def delete_all_bookings():
    db.execute("UPDATE bookings SET status='Cancelled' WHERE status='Booked'")
