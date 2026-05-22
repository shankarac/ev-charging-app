import re
import time
from typing import Optional

from functools import lru_cache

import requests

from app.services.open_charge_map import compact_address


NOMINATIM_HEADERS = {
    "User-Agent": "EV-Charging-App/1.0 (local-dev; geocode)",
    "Accept-Language": "en",
}


def is_pincode_query(query: str) -> bool:
    cleaned = re.sub(r"\s+", "", (query or "").strip())
    if not cleaned:
        return False
    if re.fullmatch(r"\d{6}", cleaned):
        return True
    if re.fullmatch(r"\d{4,10}", cleaned):
        return True
    return False


def _location_result(query: str, first: dict, search_type: str) -> dict:
    address = first.get("address") or {}
    return {
        "city": query,
        "pincode": address.get("postcode") or (query if search_type == "pincode" else ""),
        "display_name": first.get("display_name", query),
        "lat": float(first["lat"]),
        "lon": float(first["lon"]),
        "search_type": search_type,
    }


def _search_nominatim(params: dict) -> Optional[dict]:
    response = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params=params,
        headers=NOMINATIM_HEADERS,
        timeout=10,
    )

    if response.status_code != 200:
        return None

    try:
        results = response.json()
    except ValueError:
        return None

    if not results:
        return None

    return results[0]


def resolve_pincode_location(pincode: str) -> Optional[dict]:
    cleaned = re.sub(r"\s+", "", pincode.strip())
    if not cleaned:
        return None

    search_attempts = []
    if re.fullmatch(r"\d{6}", cleaned):
        search_attempts.append(
            {
                "postalcode": cleaned,
                "countrycodes": "in",
                "format": "jsonv2",
                "limit": 1,
            }
        )
    search_attempts.append(
        {
            "postalcode": cleaned,
            "format": "jsonv2",
            "limit": 1,
        }
    )
    search_attempts.append(
        {
            "q": cleaned,
            "format": "jsonv2",
            "limit": 1,
        }
    )

    for params in search_attempts:
        first = _search_nominatim(params)
        if first:
            return _location_result(cleaned, first, "pincode")

    return None


def resolve_city_location(city: str) -> Optional[dict]:
    query = city.strip()
    if not query:
        return None

    first = _search_nominatim(
        {
            "q": query,
            "format": "jsonv2",
            "limit": 1,
        }
    )
    if not first:
        return None

    return _location_result(query, first, "city")


def resolve_location_query(query: str, search_type: str = "auto") -> Optional[dict]:
    cleaned = (query or "").strip()
    if not cleaned:
        return None

    if search_type == "pincode" or (search_type == "auto" and is_pincode_query(cleaned)):
        return resolve_pincode_location(cleaned)

    return resolve_city_location(cleaned)


def format_realtime_display_address(station_name: str, display_name: str) -> str:
    name = (station_name or "").strip()
    address = (display_name or "").strip()
    if not address:
        return name or "Address unavailable"
    if not name:
        return address
    if name.lower() in address.lower():
        return address
    return f"{name}, {address}"


def address_from_nominatim_result(result: dict) -> str:
    display_name = (result.get("display_name") or "").strip()
    if display_name:
        return display_name

    address = result.get("address") or {}
    return compact_address(
        [
            address.get("amenity") or address.get("shop") or address.get("building"),
            compact_address(
                [
                    address.get("house_number"),
                    address.get("road"),
                ]
            ),
            address.get("suburb")
            or address.get("neighbourhood")
            or address.get("quarter"),
            address.get("city")
            or address.get("town")
            or address.get("village")
            or address.get("county"),
            address.get("state"),
            address.get("postcode"),
            address.get("country"),
        ]
    )


@lru_cache(maxsize=512)
def reverse_geocode_location(lat: float, lon: float) -> Optional[str]:
    rounded_lat = round(float(lat), 5)
    rounded_lon = round(float(lon), 5)

    for attempt in range(3):
        response = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={
                "lat": rounded_lat,
                "lon": rounded_lon,
                "format": "jsonv2",
                "addressdetails": 1,
                "zoom": 18,
            },
            headers={
                "User-Agent": "EV-Charging-App/1.0 (local-dev; reverse-geocode)",
                "Accept-Language": "en",
            },
            timeout=15,
        )

        if response.status_code == 429:
            time.sleep(1.5 * (attempt + 1))
            continue

        if response.status_code != 200:
            return None

        try:
            result = response.json()
        except ValueError:
            return None

        address = address_from_nominatim_result(result)
        return address or None

    return None


def initial_station_address(station_address: str, station_name: str, address_info: dict) -> str:
    cleaned = (station_address or "").strip()
    if cleaned and cleaned.lower() != "address unavailable":
        return cleaned

    return compact_address(
        [
            station_name,
            address_info.get("Town"),
            address_info.get("County"),
            address_info.get("StateOrProvince"),
            address_info.get("Postcode"),
            address_info.get("Country"),
        ]
    ) or (station_name or "EV Charging Station")


def needs_realtime_address(
    station_address: str,
    station_name: str,
    operator: str = "",
) -> bool:
    normalized = (station_address or "").strip()
    if not normalized or normalized.lower() == "address unavailable":
        return True

    lowered = normalized.lower()
    station_label = (station_name or "").strip().lower()
    if station_label and lowered == station_label:
        return True

    operator_label = (operator or "").strip().lower()
    if operator_label and lowered == operator_label:
        return True

    parts = [part.strip() for part in normalized.split(",") if part.strip()]
    if len(parts) < 5:
        return True

    if len(normalized) < 60:
        return True

    if not re.search(r"\b\d{4,6}\b", normalized):
        return True

    return False


def resolve_station_address(
    station_address: str,
    station_name: str,
    latitude: float | None,
    longitude: float | None,
    operator: str = "",
    address_info: dict | None = None,
) -> str:
    address_info = address_info or {}
    fallback = initial_station_address(station_address, station_name, address_info)

    if latitude is None or longitude is None:
        return fallback

    if not needs_realtime_address(station_address, station_name, operator):
        return fallback

    reverse_address = reverse_geocode_location(float(latitude), float(longitude))
    if not reverse_address:
        return fallback

    return format_realtime_display_address(station_name, reverse_address)
