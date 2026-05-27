import requests

from app.core.config import settings


def google_maps_url(lat, lon):
    return f"https://www.google.com/maps/search/?api=1&query={lat},{lon}"


def compact_address(parts):
    seen = set()
    cleaned = []
    for part in parts:
        text = str(part or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        cleaned.append(text)
    return ", ".join(cleaned)


def fetch_nearby_stations(lat, lon, distance=25, max_results=25):
    if not settings.open_charge_map_api_key:
        return fetch_osm_charging_stations(lat, lon, distance, max_results)

    headers = {"User-Agent": "EV-App"}
    if settings.open_charge_map_api_key:
        headers["x-api-key"] = settings.open_charge_map_api_key

    response = requests.get(
        settings.open_charge_map_url,
        headers=headers,
        params={
            "output": "json",
            "latitude": lat,
            "longitude": lon,
            "distance": distance,
            "distanceunit": "KM",
            "maxresults": max_results,
        },
        timeout=25,
    )

    if response.status_code != 200:
        return []

    try:
        return response.json()[:max_results]
    except ValueError:
        return []


def fetch_osm_charging_stations(lat, lon, distance=25, max_results=25):
    radius_meters = int(distance * 1000)
    result_limit = int(max_results)
    query = f"""
    [out:json][timeout:25];
    (
      node["amenity"="charging_station"](around:{radius_meters},{lat},{lon});
      way["amenity"="charging_station"](around:{radius_meters},{lat},{lon});
      relation["amenity"="charging_station"](around:{radius_meters},{lat},{lon});
    );
    out center tags;
    """

    response = requests.post(
        settings.overpass_url,
        data={"data": query},
        headers={"User-Agent": "EV-App"},
        timeout=30,
    )

    if response.status_code != 200:
        return []

    try:
        data = response.json()
    except ValueError:
        return []

    stations = []
    for element in data.get("elements", []):
        tags = element.get("tags", {})
        station_lat = element.get("lat") or element.get("center", {}).get("lat")
        station_lon = element.get("lon") or element.get("center", {}).get("lon")

        if station_lat is None or station_lon is None:
            continue

        distance = haversine_km(lat, lon, station_lat, station_lon)
        address_line_1 = compact_address(
            [
                tags.get("addr:housenumber"),
                tags.get("addr:street"),
            ]
        )
        address_line_2 = compact_address(
            [
                tags.get("addr:suburb"),
                tags.get("addr:neighbourhood"),
                tags.get("addr:locality"),
            ]
        )
        town = tags.get("addr:city") or tags.get("addr:town") or tags.get("addr:village") or ""
        state_or_province = tags.get("addr:state") or ""
        postcode = tags.get("addr:postcode") or ""
        country = tags.get("addr:country") or ""
        full_address = compact_address(
            [
                address_line_1,
                address_line_2,
                town,
                state_or_province,
                postcode,
                country,
            ]
        )

        stations.append(
            {
                "AddressInfo": {
                    "Title": tags.get("name") or tags.get("operator") or "EV Charging Station",
                    "AddressLine1": full_address
                    or compact_address(
                        [
                            tags.get("name") or tags.get("operator"),
                            town,
                            state_or_province,
                            postcode,
                            country,
                        ]
                    )
                    or "EV Charging Station",
                    "AddressLine2": address_line_2,
                    "Town": town,
                    "County": tags.get("addr:county") or "",
                    "StateOrProvince": state_or_province,
                    "Postcode": postcode,
                    "Country": country,
                    "Latitude": station_lat,
                    "Longitude": station_lon,
                    "Distance": distance,
                },
                "StatusType": {
                    "Title": "Realtime OSM station",
                    "IsOperational": True,
                },
            }
        )

    stations.sort(key=lambda station: station["AddressInfo"]["Distance"])
    return stations[:result_limit]


def haversine_km(lat1, lon1, lat2, lon2):
    from math import atan2, cos, radians, sin, sqrt

    radius = 6371
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = (
        sin(dlat / 2) ** 2
        + cos(radians(lat1))
        * cos(radians(lat2))
        * sin(dlon / 2) ** 2
    )
    return radius * 2 * atan2(sqrt(a), sqrt(1 - a))
