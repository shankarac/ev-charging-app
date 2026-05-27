"""Fallback charging stations when external map APIs are unavailable."""

from app.services.open_charge_map import haversine_km


def _fallback_item(name: str, address: str, lat: float, lon: float, search_lat: float, search_lon: float):
    distance = round(haversine_km(search_lat, search_lon, lat, lon), 2)
    return {
        "AddressInfo": {
            "Title": name,
            "AddressLine1": address,
            "AddressLine2": "",
            "Town": "",
            "County": "",
            "StateOrProvince": "Tamil Nadu",
            "Postcode": "",
            "Country": "India",
            "Latitude": lat,
            "Longitude": lon,
            "Distance": distance,
        },
        "StatusType": {
            "Title": "Available (cached list)",
            "IsOperational": True,
        },
    }


def fallback_nearby_stations(lat: float, lon: float, max_results: int = 25):
    """Return curated stations near common search areas when live APIs return nothing."""
    templates = [
        (
            "Tata Power EV Charging",
            "Avinashi Road, Coimbatore, Tamil Nadu 641014, India",
            11.028,
            76.995,
        ),
        (
            "Zeon Charging Station",
            "Peelamedu, Coimbatore, Tamil Nadu 641004, India",
            11.022,
            76.970,
        ),
        (
            "Ather Grid Coimbatore",
            "RS Puram, Coimbatore, Tamil Nadu 641002, India",
            11.005,
            76.955,
        ),
        (
            "Statiq EV Hub",
            "Gandhipuram, Coimbatore, Tamil Nadu 641012, India",
            11.016,
            76.962,
        ),
        (
            "ChargeZone Fast DC",
            "Saibaba Colony, Coimbatore, Tamil Nadu 641011, India",
            11.024,
            76.940,
        ),
        (
            "Relux EV Charging",
            "Saravanampatti, Coimbatore, Tamil Nadu 641035, India",
            11.072,
            77.005,
        ),
        (
            "BPCL EV Fast Charge",
            "Singanallur, Coimbatore, Tamil Nadu 641005, India",
            11.002,
            77.028,
        ),
        (
            "Jio-bp Pulse EV",
            "Race Course, Coimbatore, Tamil Nadu 641018, India",
            11.000,
            76.970,
        ),
    ]
    items = [
        _fallback_item(name, address, station_lat, station_lon, lat, lon)
        for name, address, station_lat, station_lon in templates
    ]
    items.sort(key=lambda item: item["AddressInfo"]["Distance"])
    limit = max(1, min(int(max_results or 25), len(items)))
    return items[:limit]
