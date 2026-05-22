from app.core.config import settings
from app.repositories import notifications


def _booking_message(event_type, booking, extra_payload=None):
    base_url = settings.public_app_url.rstrip("/")
    payment_reference = (extra_payload or {}).get("payment_reference", "")
    payment_status = (extra_payload or {}).get("payment_status", "")
    lines = [
        f"Event: {event_type.title()}",
        f"User: {booking.username}",
        f"Station: {booking.station_name}",
        f"Address: {booking.station_address}",
        f"Booking Time: {booking.booking_time}",
        f"Charger Type: {booking.charger_type}",
        f"Units: {booking.units}",
        f"Price: {booking.price}",
        f"Booking History: {base_url}/bookings/{booking.username}",
        f"Dashboard: {base_url}/dashboard.html",
        f"Payment Page: {base_url}/payment.html",
        f"Station Map: https://www.google.com/maps/search/?api=1&query={booking.station_name} {booking.station_address}",
    ]
    if payment_reference:
        lines.append(f"Payment Reference: {payment_reference}")
    if payment_status:
        lines.append(f"Payment Status: {payment_status}")
    return "\n".join(lines)


def _dispatch_station_event(event_type, booking, extra_payload=None):
    """
    Stores booking/payment details in the app's station inbox.
    Returns (sent: bool, message: str).
    """
    base_url = settings.public_app_url.rstrip("/")
    notification_payload = {
        "event_type": event_type,
        "username": booking.username,
        "station_name": booking.station_name,
        "station_address": booking.station_address,
        "distance": booking.distance,
        "booking_time": booking.booking_time,
        "charger_type": booking.charger_type,
        "units": booking.units,
        "price": booking.price,
        "booking_history_url": f"{base_url}/bookings/{booking.username}",
        "app_dashboard_url": f"{base_url}/dashboard.html",
        "payment_page_url": f"{base_url}/payment.html",
        "station_map_url": (
            "https://www.google.com/maps/search/?api=1&query="
            f"{booking.station_name} {booking.station_address}"
        ),
        "payment_reference": "",
        "payment_status": "",
    }
    if extra_payload:
        notification_payload.update(extra_payload)

    notifications.create_station_notification(notification_payload)

    return True, "Station notified in app"


def dispatch_booking_to_station(booking):
    return _dispatch_station_event("booking", booking)


def dispatch_payment_to_station(booking, payment_reference=""):
    return _dispatch_station_event(
        "payment",
        booking,
        {
            "payment_reference": payment_reference,
            "payment_status": "PAID",
        },
    )
