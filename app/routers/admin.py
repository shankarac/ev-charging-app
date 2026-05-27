from fastapi import APIRouter, HTTPException, Request

from app.core.authz import require_admin
from app.repositories import managed_stations, reports, users
from app.schemas.admin import (
    AdminRoleUpdate,
    AdminUserCreate,
    ManagedStationCreate,
    StationConfigUpdate,
)
from app.services import app_config
from app.services.location_lookup import resolve_location_query

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/session")
def admin_session(request: Request):
    admin = require_admin(request)
    return {
        "authenticated": True,
        "username": admin["username"],
        "email": admin.get("email", ""),
        "role": admin.get("role", "admin"),
    }


@router.get("/stations/config")
def get_station_config(request: Request):
    require_admin(request)
    return app_config.admin_config()


def _resolve_station_coords(payload: ManagedStationCreate) -> tuple[float, float]:
    if payload.latitude is not None and payload.longitude is not None:
        return float(payload.latitude), float(payload.longitude)

    lookup = (payload.city or payload.station_address or "").strip()
    if not lookup:
        raise HTTPException(
            status_code=400,
            detail="Provide latitude/longitude or a city/address to locate the station.",
        )

    location = resolve_location_query(lookup)
    if not location:
        raise HTTPException(
            status_code=400,
            detail="Could not find coordinates for that city or address.",
        )
    return float(location["lat"]), float(location["lon"])


@router.get("/managed-stations")
def list_managed_stations(request: Request):
    require_admin(request)
    return {"stations": managed_stations.list_all()}


@router.post("/managed-stations")
def add_managed_station(payload: ManagedStationCreate, request: Request):
    admin = require_admin(request)
    lat, lon = _resolve_station_coords(payload)
    try:
        station = managed_stations.create_station(
            payload.station_name,
            payload.station_address,
            lat,
            lon,
            created_by=admin["username"],
        )
    except Exception as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return {"message": "Station added", "station": station}


@router.delete("/managed-stations/{station_id}")
def remove_managed_station(station_id: int, request: Request):
    require_admin(request)
    if not managed_stations.delete_station(station_id):
        raise HTTPException(status_code=404, detail="Station not found")
    return {"message": "Station removed"}


@router.put("/stations/config")
def update_station_config(payload: StationConfigUpdate, request: Request):
    admin = require_admin(request)
    values = payload.model_dump(exclude_none=True)
    if not values:
        raise HTTPException(status_code=400, detail="No settings provided")
    try:
        updated = app_config.update_config(values, updated_by=admin["username"])
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {"message": "Station settings updated", "config": updated}


@router.get("/reports/summary")
def get_reports_summary(request: Request):
    require_admin(request)
    return reports.report_summary()


@router.get("/reports/bookings")
def get_reports_bookings(request: Request, limit: int = 200, status: str | None = None):
    require_admin(request)
    return {
        "bookings": reports.list_bookings(limit=limit, status=status or None),
    }


@router.get("/users")
def list_admin_users(request: Request, limit: int = 100):
    require_admin(request)
    return {"users": users.list_users(limit=limit)}


@router.post("/users")
def create_admin_user(payload: AdminUserCreate, request: Request):
    require_admin(request)
    existing = users.find_user_by_email(payload.email)
    if existing:
        users.set_user_role(existing["username"], users.ADMIN_ROLE)
        return {
            "message": "Existing user promoted to admin",
            "username": existing["username"],
            "email": payload.email,
            "role": users.ADMIN_ROLE,
        }

    base_username = payload.email.split("@")[0]
    username = base_username
    suffix = 1
    while users.find_user(username):
        suffix += 1
        username = f"{base_username}{suffix}"

    users.create_user(username, payload.email, payload.password, role=users.ADMIN_ROLE)
    return {
        "message": "Admin user created",
        "username": username,
        "email": payload.email,
        "role": users.ADMIN_ROLE,
    }


@router.patch("/users/{username}/role")
def update_user_role(username: str, payload: AdminRoleUpdate, request: Request):
    require_admin(request)
    target = users.find_user(username)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.get("role") == users.ADMIN_ROLE and payload.role == users.USER_ROLE:
        if users.count_admins() <= 1:
            raise HTTPException(status_code=400, detail="At least one admin is required")

    users.set_user_role(username, payload.role)
    return {"message": "User role updated", "username": username, "role": payload.role}
