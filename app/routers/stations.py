import logging
import requests
from datetime import date
from fastapi import APIRouter, HTTPException

logger = logging.getLogger(__name__)

from app.repositories import bookings
from app.services import app_config
from app.services.location_lookup import (
    format_realtime_display_address,
    initial_station_address,
    resolve_location_query,
    reverse_geocode_location,
)
from app.services.open_charge_map import compact_address, fetch_nearby_stations, google_maps_url
from app.services.managed_stations import merge_station_sources, nearby_items
from app.services.station_fallback import fallback_nearby_stations
from app.services.slot_schedule import (
    build_daily_slots,
    count_available_slots,
    normalize_booking_slot_time,
    parse_booking_date,
    validate_booking_date,
)


router = APIRouter(tags=["stations"])


@router.get("/stations/config")
def stations_config():
    return app_config.public_config()


@router.get("/stations/availability")
def station_availability(station_name: str, date: str, slot_count: int = 1):
    station = (station_name or "").strip()
    if not station:
        raise HTTPException(status_code=400, detail="station_name is required")

    slot_date = validate_booking_date(date) or parse_booking_date(date)
    if not slot_date:
        raise HTTPException(status_code=400, detail="Invalid date. Use YYYY-MM-DD.")

    safe_count = max(1, min(int(slot_count or 1), 2))
    booked_times = bookings.list_station_blocked_times(station, slot_date.isoformat())
    slots = build_daily_slots(slot_date, booked_times, safe_count)
    return {
        "station_name": station,
        "date": slot_date.isoformat(),
        "slot_count": safe_count,
        "total_slots": len(slots),
        "available_slots": count_available_slots(slots),
        "slots": slots,
    }


def _station_slot_stats(station_name: str, today: date, bookings_by_station: dict) -> tuple[int, int]:
    booked_times = set(bookings_by_station.get(station_name, []))
    today_slots = build_daily_slots(today, booked_times)
    booked_slots = sum(1 for slot in today_slots if slot.get("booked"))
    available_slots = count_available_slots(today_slots)
    return booked_slots, available_slots


def _build_station_payload(item, slot_limit: int, today: date, bookings_by_station: dict) -> dict | None:
    address_info = item.get("AddressInfo", {})
    status_type = item.get("StatusType") or {}
    station_name = address_info.get("Title", "EV Station")
    station_latitude = address_info.get("Latitude")
    station_longitude = address_info.get("Longitude")
    station_address = compact_address(
        [
            address_info.get("AddressLine1"),
            address_info.get("AddressLine2"),
            address_info.get("Town"),
            address_info.get("County"),
            address_info.get("StateOrProvince"),
            address_info.get("Postcode"),
            address_info.get("Country"),
        ]
    )
    station_address = initial_station_address(
        station_address,
        station_name,
        address_info,
    )
    station_distance = f"{round(address_info.get('Distance', 0), 2)} KM"
    try:
        booked_slots, available_slots = _station_slot_stats(
            station_name,
            today,
            bookings_by_station,
        )
    except Exception:
        logger.exception("Failed to build slot stats for station %s", station_name)
        booked_slots = 0
        available_slots = slot_limit

    is_operational = status_type.get("IsOperational")
    service_charge = app_config.service_charge_for_station(station_name)
    return {
        "station_name": station_name,
        "station_address": station_address,
        "distance": station_distance,
        "total_slots": slot_limit,
        "booked_slots": booked_slots,
        "available_slots": available_slots,
        "status": status_type.get("Title", "Status unavailable"),
        "is_operational": is_operational,
        "service_charge": service_charge,
        "latitude": station_latitude,
        "longitude": station_longitude,
        "google_maps_url": google_maps_url(station_latitude, station_longitude)
        if station_latitude is not None and station_longitude is not None
        else f"https://www.google.com/maps/search/?api=1&query={station_name}",
    }


@router.get("/stations")
def get_stations(
    lat: float | None = None,
    lon: float | None = None,
    city: str | None = None,
    distance: float = 25,
    max_results: int = 25,
):
    try:
        if (lat is None or lon is None) and city:
            location = resolve_location_query(city)
            if not location:
                return []
            lat = location["lat"]
            lon = location["lon"]

        if lat is None or lon is None:
            return []

        search_distance = min(max(distance, 1), 100)
        result_limit = min(max(max_results, 1), 75)

        managed_data = nearby_items(lat, lon, result_limit, search_distance)

        data = []
        for radius in sorted({search_distance, 50, 100}):
            try:
                data = fetch_nearby_stations(lat, lon, radius, result_limit)
            except requests.RequestException:
                logger.warning("Station lookup failed at radius %s", radius, exc_info=True)
                data = []
            if data:
                break

        if not data:
            data = fallback_nearby_stations(lat, lon, result_limit)
            if data:
                logger.info("Serving %s fallback stations near %s,%s", len(data), lat, lon)

        data = merge_station_sources(managed_data, data, result_limit)

        slot_limit = app_config.station_slot_limit()
        today = date.today()
        today_prefix = today.isoformat()
        bookings_by_station = bookings.list_booking_times_grouped_for_date(today_prefix)
        stations = []

        for item in data:
            try:
                payload = _build_station_payload(item, slot_limit, today, bookings_by_station)
            except Exception:
                logger.exception("Failed to build station payload")
                continue
            if payload:
                stations.append(payload)

        return [
            station
            for station in stations
            if station["is_operational"] is not False
        ]
    except Exception:
        logger.exception("Failed to load stations")
        return []


@router.get("/geocode")
def geocode_location(city: str = "", pincode: str = ""):
    pincode_query = pincode.strip()
    city_query = city.strip()

    if pincode_query:
        location = resolve_location_query(pincode_query, search_type="pincode")
    elif city_query:
        location = resolve_location_query(city_query, search_type="city")
    else:
        return {}

    if not location:
        return {}

    return location


@router.get("/reverse-geocode")
def reverse_geocode(lat: float, lon: float, name: str = ""):
    address = reverse_geocode_location(lat, lon)
    if not address:
        return {"address": ""}

    return {
        "address": format_realtime_display_address(name, address),
    }
