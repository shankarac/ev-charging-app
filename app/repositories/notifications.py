from app.db import db


def create_station_notification(notification):
    return db.execute(
        """
        INSERT INTO station_notifications(
            event_type,
            username,
            station_name,
            station_address,
            distance,
            booking_time,
            charger_type,
            units,
            price,
            booking_history_url,
            app_dashboard_url,
            payment_page_url,
            station_map_url,
            payment_reference,
            payment_status
        )
        VALUES(
            :event_type,
            :username,
            :station_name,
            :station_address,
            :distance,
            :booking_time,
            :charger_type,
            :units,
            :price,
            :booking_history_url,
            :app_dashboard_url,
            :payment_page_url,
            :station_map_url,
            :payment_reference,
            :payment_status
        )
        """,
        {
            "event_type": notification["event_type"],
            "username": notification["username"],
            "station_name": notification["station_name"],
            "station_address": notification["station_address"],
            "distance": notification.get("distance", ""),
            "booking_time": notification["booking_time"],
            "charger_type": notification["charger_type"],
            "units": notification["units"],
            "price": notification["price"],
            "booking_history_url": notification["booking_history_url"],
            "app_dashboard_url": notification["app_dashboard_url"],
            "payment_page_url": notification["payment_page_url"],
            "station_map_url": notification["station_map_url"],
            "payment_reference": notification.get("payment_reference", ""),
            "payment_status": notification.get("payment_status", ""),
        },
    )


def list_station_notifications(station_name=None, limit=50):
    query = """
        SELECT
            id,
            event_type,
            username,
            station_name,
            station_address,
            distance,
            booking_time,
            charger_type,
            units,
            price,
            booking_history_url,
            app_dashboard_url,
            payment_page_url,
            station_map_url,
            payment_reference,
            payment_status,
            is_read,
            created_at
        FROM station_notifications
    """
    params = {"limit": limit}
    if station_name:
        query += " WHERE LOWER(station_name) LIKE LOWER(:station_name)"
        params["station_name"] = f"%{station_name}%"
    query += " ORDER BY id DESC LIMIT :limit"
    return db.fetch_all(query, params)


def count_unread_station_notifications(station_name=None):
    query = "SELECT COUNT(*) AS total FROM station_notifications WHERE is_read=0"
    params = {}
    if station_name:
        query += " AND LOWER(station_name) LIKE LOWER(:station_name)"
        params["station_name"] = f"%{station_name}%"
    row = db.fetch_one(query, params)
    return row["total"]


def mark_station_notification_read(notification_id):
    db.execute(
        """
        UPDATE station_notifications
        SET is_read=1
        WHERE id=:notification_id
        """,
        {"notification_id": notification_id},
    )
