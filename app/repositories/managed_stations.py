from app.db import db


def list_active() -> list[dict]:
    rows = db.fetch_all(
        """
        SELECT id, station_name, station_address, latitude, longitude,
               is_active, created_at, updated_at, created_by
        FROM managed_stations
        WHERE is_active=1
        ORDER BY station_name ASC
        """
    )
    return [dict(row) for row in rows]


def list_all(limit: int = 200) -> list[dict]:
    safe_limit = max(1, min(limit, 500))
    rows = db.fetch_all(
        """
        SELECT id, station_name, station_address, latitude, longitude,
               is_active, created_at, updated_at, created_by
        FROM managed_stations
        ORDER BY id DESC
        LIMIT :limit
        """,
        {"limit": safe_limit},
    )
    return [dict(row) for row in rows]


def find_by_id(station_id: int) -> dict | None:
    row = db.fetch_one(
        """
        SELECT id, station_name, station_address, latitude, longitude,
               is_active, created_at, updated_at, created_by
        FROM managed_stations
        WHERE id=:id
        """,
        {"id": station_id},
    )
    return dict(row) if row else None


def find_by_name(station_name: str) -> dict | None:
    cleaned = str(station_name or "").strip()
    if not cleaned:
        return None
    row = db.fetch_one(
        """
        SELECT id, station_name, station_address, latitude, longitude,
               is_active, created_at, updated_at, created_by
        FROM managed_stations
        WHERE lower(station_name)=lower(:station_name)
        """,
        {"station_name": cleaned},
    )
    return dict(row) if row else None


def create_station(
    station_name: str,
    station_address: str,
    latitude: float,
    longitude: float,
    created_by: str = "",
) -> dict:
    cleaned_name = station_name.strip()
    existing = find_by_name(cleaned_name)
    if existing:
        if existing.get("is_active"):
            raise ValueError("A station with this name already exists.")
        db.execute(
            """
            UPDATE managed_stations
            SET station_address=:station_address,
                latitude=:latitude,
                longitude=:longitude,
                is_active=1,
                updated_at=CURRENT_TIMESTAMP,
                created_by=:created_by
            WHERE id=:id
            """,
            {
                "id": existing["id"],
                "station_address": station_address.strip(),
                "latitude": float(latitude),
                "longitude": float(longitude),
                "created_by": created_by or None,
            },
        )
        return find_by_id(existing["id"]) or existing

    db.execute(
        """
        INSERT INTO managed_stations(
            station_name, station_address, latitude, longitude, created_by
        )
        VALUES(:station_name, :station_address, :latitude, :longitude, :created_by)
        """,
        {
            "station_name": cleaned_name,
            "station_address": station_address.strip(),
            "latitude": float(latitude),
            "longitude": float(longitude),
            "created_by": created_by or None,
        },
    )
    created = find_by_name(cleaned_name)
    if not created:
        raise RuntimeError("Failed to create managed station")
    return created


def delete_station(station_id: int) -> bool:
    row = find_by_id(station_id)
    if not row:
        return False
    db.execute(
        """
        UPDATE managed_stations
        SET is_active=0, updated_at=CURRENT_TIMESTAMP
        WHERE id=:id
        """,
        {"id": station_id},
    )
    return True
