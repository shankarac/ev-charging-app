from datetime import datetime

from app.db import db

_PAYMENT_STATUS_COLUMN_READY = False


def ensure_booking_schema():
    global _PAYMENT_STATUS_COLUMN_READY
    if _PAYMENT_STATUS_COLUMN_READY:
        return

    try:
        db.fetch_one("SELECT payment_status FROM bookings LIMIT 1")
        _PAYMENT_STATUS_COLUMN_READY = True
        return
    except Exception:
        pass

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


def list_station_booking_times(station_name, date_prefix):
    refresh_expired_bookings()
    rows = db.fetch_all(
        """
        SELECT booking_time
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
    return [row["booking_time"] for row in rows]


def list_booking_times_grouped_for_date(date_prefix: str) -> dict[str, list[str]]:
    refresh_expired_bookings()
    rows = db.fetch_all(
        """
        SELECT station_name, booking_time
        FROM bookings
        WHERE status='Booked'
          AND booking_time LIKE :date_prefix
        """,
        {"date_prefix": f"{date_prefix}%"},
    )
    grouped: dict[str, list[str]] = {}
    for row in rows:
        grouped.setdefault(row["station_name"], []).append(row["booking_time"])
    return grouped


def is_slot_booked(station_name, booking_time):
    refresh_expired_bookings()
    row = db.fetch_one(
        """
        SELECT id
        FROM bookings
        WHERE station_name=:station_name
          AND booking_time=:booking_time
          AND status='Booked'
        LIMIT 1
        """,
        {"station_name": station_name, "booking_time": booking_time},
    )
    return row is not None


def create_booking(booking):
    ensure_booking_schema()
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
            payment_status
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
            :payment_status
        )
        """,
        {
            "username": booking.username,
            "station_name": booking.station_name,
            "station_address": booking.station_address,
            "distance": booking.distance,
            "booking_time": booking.booking_time,
            "charger_type": booking.charger_type,
            "units": booking.units,
            "price": booking.price,
            "status": "Booked",
            "payment_status": "Pending",
        },
    )


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
            payment_status
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
            payment_status
        FROM bookings
        WHERE username=:username AND status <> 'Booked'
        ORDER BY id DESC
        """,
        {"username": username},
    )


def mark_booking_paid(booking):
    ensure_booking_schema()
    db.execute(
        """
        UPDATE bookings
        SET payment_status='Paid'
        WHERE username=:username
          AND station_name=:station_name
          AND station_address=:station_address
          AND booking_time=:booking_time
          AND charger_type=:charger_type
          AND units=:units
          AND price=:price
          AND status='Booked'
        """,
        {
            "username": booking.username,
            "station_name": booking.station_name,
            "station_address": booking.station_address,
            "booking_time": booking.booking_time,
            "charger_type": booking.charger_type,
            "units": booking.units,
            "price": booking.price,
        },
    )


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
