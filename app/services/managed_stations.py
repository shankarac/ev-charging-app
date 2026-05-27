"""Admin-managed charging stations shown in user search results."""

from app.repositories import managed_stations as managed_repo
from app.services.open_charge_map import haversine_km


def to_api_item(row: dict, search_lat: float, search_lon: float) -> dict:
    lat = float(row["latitude"])
    lon = float(row["longitude"])
    distance = round(haversine_km(search_lat, search_lon, lat, lon), 2)
    address = row.get("station_address") or row.get("station_name") or ""
    parts = [part.strip() for part in address.split(",") if part.strip()]
    town = parts[-2] if len(parts) >= 2 else ""
    return {
        "AddressInfo": {
            "Title": row["station_name"],
            "AddressLine1": parts[0] if parts else address,
            "AddressLine2": ", ".join(parts[1:-1]) if len(parts) > 2 else "",
            "Town": town,
            "County": "",
            "StateOrProvince": parts[-1] if parts else "",
            "Postcode": "",
            "Country": "India",
            "Latitude": lat,
            "Longitude": lon,
            "Distance": distance,
        },
        "StatusType": {
            "Title": "Available (managed)",
            "IsOperational": True,
        },
        "managed": True,
        "managed_station_id": row["id"],
    }


def nearby_items(lat: float, lon: float, max_results: int, radius_km: float) -> list[dict]:
    items = []
    for row in managed_repo.list_active():
        dist = haversine_km(lat, lon, float(row["latitude"]), float(row["longitude"]))
        if dist <= radius_km:
            items.append(to_api_item(row, lat, lon))
    items.sort(key=lambda item: item["AddressInfo"]["Distance"])
    limit = max(1, min(int(max_results or 25), len(items) or 1))
    return items[:limit]


def merge_station_sources(
    managed_items: list[dict],
    external_items: list[dict],
    max_results: int,
) -> list[dict]:
    merged = []
    seen = set()

    for item in managed_items + external_items:
        name = (item.get("AddressInfo") or {}).get("Title", "").strip().lower()
        if not name or name in seen:
            continue
        seen.add(name)
        merged.append(item)

    merged.sort(key=lambda item: float((item.get("AddressInfo") or {}).get("Distance", 0)))
    return merged[: max(1, min(int(max_results or 25), 75))]
