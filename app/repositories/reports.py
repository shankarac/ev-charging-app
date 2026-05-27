from app.db import db
from app.repositories.bookings import refresh_expired_bookings


def report_summary() -> dict:
    refresh_expired_bookings()

    totals = db.fetch_one(
        """
        SELECT
            COUNT(*) AS total_bookings,
            COALESCE(SUM(CASE WHEN status='Booked' THEN 1 ELSE 0 END), 0) AS active_bookings,
            COALESCE(SUM(CASE WHEN payment_status='Paid' THEN price ELSE 0 END), 0) AS paid_revenue,
            COALESCE(SUM(CASE WHEN payment_status='Pending' AND status='Booked' THEN price ELSE 0 END), 0) AS pending_revenue
        FROM bookings
        """
    )

    by_status = db.fetch_all(
        """
        SELECT status, COUNT(*) AS total
        FROM bookings
        GROUP BY status
        ORDER BY total DESC
        """
    )

    by_payment = db.fetch_all(
        """
        SELECT payment_status, COUNT(*) AS total, COALESCE(SUM(price), 0) AS revenue
        FROM bookings
        GROUP BY payment_status
        ORDER BY total DESC
        """
    )

    by_station = db.fetch_all(
        """
        SELECT
            station_name,
            COUNT(*) AS total_bookings,
            COALESCE(SUM(CASE WHEN status='Booked' THEN 1 ELSE 0 END), 0) AS active_bookings,
            COALESCE(SUM(price), 0) AS total_revenue,
            COALESCE(SUM(CASE WHEN payment_status='Paid' THEN price ELSE 0 END), 0) AS paid_revenue
        FROM bookings
        GROUP BY station_name
        ORDER BY total_bookings DESC
        LIMIT 25
        """
    )

    recent = db.fetch_all(
        """
        SELECT
            id,
            username,
            station_name,
            booking_time,
            charger_type,
            units,
            price,
            status,
            payment_status,
            created_at
        FROM bookings
        ORDER BY id DESC
        LIMIT 10
        """
    )

    return {
        "totals": dict(totals) if totals else {},
        "by_status": [dict(row) for row in by_status],
        "by_payment": [dict(row) for row in by_payment],
        "by_station": [dict(row) for row in by_station],
        "recent_bookings": [dict(row) for row in recent],
    }


def list_bookings(limit: int = 200, status: str | None = None) -> list[dict]:
    refresh_expired_bookings()
    safe_limit = max(1, min(limit, 500))
    params: dict = {"limit": safe_limit}

    status_filter = ""
    if status:
        status_filter = "WHERE status=:status"
        params["status"] = status

    rows = db.fetch_all(
        f"""
        SELECT
            id,
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
            created_at
        FROM bookings
        {status_filter}
        ORDER BY id DESC
        LIMIT :limit
        """,
        params,
    )
    return [dict(row) for row in rows]
