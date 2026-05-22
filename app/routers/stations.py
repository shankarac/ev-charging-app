import requests
from datetime import date
from fastapi import APIRouter, HTTPException

from app.core.config import settings
from app.repositories import bookings
from app.services.slot_schedule import (
    build_daily_slots,
    count_available_slots,
    max_booking_date,
    normalize_booking_slot_time,
    parse_booking_date,
    validate_booking_date,
)
from app.services.location_lookup import (
    format_realtime_display_address,
    initial_station_address,
    resolve_city_location,
    resolve_location_query,
    reverse_geocode_location,
)
from app.services.open_charge_map import compact_address, fetch_nearby_stations, google_maps_url


router = APIRouter(tags=["stations"])


@router.get("/stations/config")
def stations_config():
    return {
        "station_slot_limit": settings.station_slot_limit,
        "max_booking_date": max_booking_date().isoformat(),
        "booking_open_hour": settings.booking_open_hour,
        "booking_close_hour": settings.booking_close_hour,
        "booking_slot_interval_minutes": settings.booking_slot_interval_minutes,
    }


@router.get("/stations/availability")
def station_availability(station_name: str, date: str):
    station = (station_name or "").strip()
    if not station:
        raise HTTPException(status_code=400, detail="station_name is required")

    slot_date = validate_booking_date(date) or parse_booking_date(date)
    if not slot_date:
        raise HTTPException(status_code=400, detail="Invalid date. Use YYYY-MM-DD.")

    booked_times = set()
    for booking_time in bookings.list_station_booking_times(station, slot_date.isoformat()):
        normalized = normalize_booking_slot_time(booking_time)
        if normalized:
            booked_times.add(normalized)

    slots = build_daily_slots(slot_date, booked_times)
    return {
        "station_name": station,
        "date": slot_date.isoformat(),
        "total_slots": len(slots),
        "available_slots": count_available_slots(slots),
        "slots": slots,
    }


@router.get("/stations")
def get_stations(
    lat: float | None = None,
    lon: float | None = None,
    city: str | None = None,
    distance: float = 25,
    max_results: int = 25,
):
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

    data = []
    for radius in sorted({search_distance, 50, 100}):
        try:
            data = fetch_nearby_stations(lat, lon, radius, result_limit)
        except requests.RequestException:
            data = []
        if data:
            break

    slot_limit = settings.station_slot_limit
    today = date.today()
    today_prefix = today.isoformat()
    bookings_by_station = bookings.list_booking_times_grouped_for_date(today_prefix)
    stations = []

    for item in data:
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
        distance = f"{round(address_info.get('Distance', 0), 2)} KM"
        booked_times = {
            normalize_booking_slot_time(booking_time)
            for booking_time in bookings_by_station.get(station_name, [])
            if normalize_booking_slot_time(booking_time)
        }
        today_slots = build_daily_slots(today, booked_times)
        booked_slots = sum(1 for slot in today_slots if slot.get("booked"))
        available_slots = count_available_slots(today_slots)
        is_operational = status_type.get("IsOperational")

        stations.append(
            {
                "station_name": station_name,
                "station_address": station_address,
                "distance": distance,
                "total_slots": slot_limit,
                "booked_slots": booked_slots,
                "available_slots": available_slots,
                "status": status_type.get("Title", "Status unavailable"),
                "is_operational": is_operational,
                "latitude": station_latitude,
                "longitude": station_longitude,
                "google_maps_url": google_maps_url(station_latitude, station_longitude)
                if station_latitude is not None and station_longitude is not None
                else f"https://www.google.com/maps/search/?api=1&query={station_name}",
            }
        )

    return [
        station
        for station in stations
        if station["is_operational"] is not False
    ]


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
