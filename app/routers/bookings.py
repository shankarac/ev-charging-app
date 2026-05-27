from fastapi import APIRouter, HTTPException, Request
from types import SimpleNamespace

from app.core.auth_session import get_session_user
from app.core.config import settings
from app.repositories import bookings
from app.services.slot_schedule import (
    normalize_booking_slot_time,
    validate_booking_datetime,
    validate_booking_slot_range,
)
from app.repositories import notifications as station_notifications
from app.schemas.bookings import BookingCreate, PaymentConfirmRequest
from app.services.pricing import resolve_booking_display
from app.services.station_dispatch import (
    dispatch_booking_to_station,
    dispatch_payment_to_station,
)


router = APIRouter(tags=["bookings"])


def _enrich_booking_with_pricing(row) -> dict:
    return resolve_booking_display(dict(row))


@router.post("/book")
def book_station(booking: BookingCreate):
    slot_time, validation_error = validate_booking_slot_range(
        booking.booking_time,
        booking.slot_count,
    )
    if validation_error:
        return {"message": validation_error}

    booking.booking_time = slot_time
    if bookings.is_slot_booked(booking.station_name, slot_time, booking.slot_count):
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

    if bookings.find_user_booking_for_station(
        booking.username,
        booking.station_name,
    ):
        return {
            "message": "You already have an active booking at this station. Cancel it before booking again.",
        }

    booking_id = bookings.create_booking(booking)
    if not booking_id:
        return {
            "message": "That time is already booked at this station. Pick another date or time.",
            "booking_time": slot_time,
        }

    sent, dispatch_message = dispatch_booking_to_station(booking)

    return {
        "message": "Booking successful",
        "booking_id": booking_id,
        "sent_to_station": sent,
        "station_dispatch_message": dispatch_message,
    }


def _list_bookings_with_canonical_pricing(rows):
    enriched = []
    for row in rows:
        row_dict = dict(row)
        bookings.repair_booking_pricing_if_needed(row_dict)
        enriched.append(_enrich_booking_with_pricing(row_dict))
    return enriched


@router.get("/bookings/{username}")
def show_bookings(username: str):
    active_rows = bookings.list_active_bookings_for_user(username)
    past_rows = bookings.list_past_bookings_for_user(username)
    return {
        "active": _list_bookings_with_canonical_pricing(active_rows),
        "past": _list_bookings_with_canonical_pricing(past_rows),
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
def confirm_payment(payload: PaymentConfirmRequest, request: Request):
    session_user = get_session_user(request)
    if session_user:
        payload.username = session_user["username"]

    booking_time = payload.booking_time
    if payload.booking_id is None:
        normalized_time, validation_error = validate_booking_datetime(payload.booking_time)
        if validation_error:
            raise HTTPException(status_code=400, detail=validation_error)
        booking_time = normalized_time
    else:
        normalized_time = normalize_booking_slot_time(payload.booking_time)
        if normalized_time:
            booking_time = normalized_time

    booking_stub = SimpleNamespace(
        username=payload.username,
        station_name=payload.station_name,
        station_address=payload.station_address,
        booking_time=booking_time,
        charger_type=payload.charger_type,
        units=payload.units,
        price=payload.price,
        slot_count=payload.slot_count,
        distance="",
    )
    updated = bookings.mark_booking_paid(
        booking_stub,
        payment_method=payload.payment_method,
        booking_id=payload.booking_id,
    )
    if not updated:
        raise HTTPException(
            status_code=404,
            detail="Booking not found or already paid. Return to the dashboard and try again.",
        )
    try:
        sent, dispatch_message = dispatch_payment_to_station(
            booking_stub,
            payload.payment_reference or "",
        )
    except Exception:
        sent, dispatch_message = False, "Payment recorded; station notification could not be sent."
    payment_messages = {
        "cash": "Cash payment selected. Pay at the station when you arrive.",
        "credit_card": "Credit card payment successful.",
        "debit_card": "Debit card payment successful.",
        "gpay": "GPay payment successful.",
    }
    return {
        "message": payment_messages.get(payload.payment_method, "Payment successful"),
        "payment_method": payload.payment_method,
        "sent_to_station": sent,
        "station_dispatch_message": dispatch_message,
    }
