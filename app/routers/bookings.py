from fastapi import APIRouter
from types import SimpleNamespace

from app.core.config import settings
from app.repositories import bookings
from app.services.slot_schedule import validate_booking_datetime
from app.repositories import notifications as station_notifications
from app.schemas.bookings import BookingCreate, PaymentConfirmRequest
from app.services.station_dispatch import (
    dispatch_booking_to_station,
    dispatch_payment_to_station,
)


router = APIRouter(tags=["bookings"])


@router.post("/book")
def book_station(booking: BookingCreate):
    slot_time, validation_error = validate_booking_datetime(booking.booking_time)
    if validation_error:
        return {"message": validation_error}

    booking.booking_time = slot_time
    if bookings.is_slot_booked(booking.station_name, slot_time):
        return {
            "message": "That time is already booked at this station. Pick another date or time.",
            "booking_time": slot_time,
        }

    if bookings.find_user_booking_for_station_time(
        booking.username,
        booking.station_name,
        slot_time,
    ):
        return {"message": "You already have a booking at this station for that time."}

    booking_id = bookings.create_booking(booking)
    sent, dispatch_message = dispatch_booking_to_station(booking)

    return {
        "message": "Booking successful",
        "booking_id": booking_id,
        "sent_to_station": sent,
        "station_dispatch_message": dispatch_message,
    }


@router.get("/bookings/{username}")
def show_bookings(username: str):
    active_rows = bookings.list_active_bookings_for_user(username)
    past_rows = bookings.list_past_bookings_for_user(username)
    return {
        "active": [dict(row) for row in active_rows],
        "past": [dict(row) for row in past_rows],
    }


@router.delete("/cancel/{booking_id}")
def cancel_booking(booking_id: int):
    bookings.mark_booking_cancelled(booking_id)
    return {"message": "Booking cancelled"}


@router.delete("/clear-bookings")
def clear_bookings():
    bookings.delete_all_bookings()
    return {"message": "All bookings cleared"}


@router.get("/station-notifications")
def list_station_notifications(station_name: str = "", limit: int = 50):
    rows = station_notifications.list_station_notifications(
        station_name=station_name.strip() or None,
        limit=min(max(limit, 1), 100),
    )
    return [dict(row) for row in rows]


@router.post("/station-notifications/{notification_id}/read")
def mark_station_notification_read(notification_id: int):
    station_notifications.mark_station_notification_read(notification_id)
    return {"message": "Notification marked as read"}


@router.post("/payments/confirm")
def confirm_payment(payload: PaymentConfirmRequest):
    booking_stub = SimpleNamespace(
        username=payload.username,
        station_name=payload.station_name,
        station_address=payload.station_address,
        booking_time=payload.booking_time,
        charger_type=payload.charger_type,
        units=payload.units,
        price=payload.price,
        distance="",
    )
    bookings.mark_booking_paid(booking_stub)
    sent, dispatch_message = dispatch_payment_to_station(
        booking_stub,
        payload.payment_reference or "",
    )
    return {
        "message": "Payment successful",
        "sent_to_station": sent,
        "station_dispatch_message": dispatch_message,
    }
