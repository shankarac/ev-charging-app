from pydantic import BaseModel, field_validator

from app.core.email_policy import normalize_email


class StationConfigUpdate(BaseModel):
    station_slot_limit: int | None = None
    booking_open_hour: int | None = None
    booking_close_hour: int | None = None
    booking_slot_interval_minutes: int | None = None
    max_booking_days_ahead: int | None = None
    default_service_charge: float | None = None
    station_service_charges: str | None = None


class AdminUserCreate(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def email_must_be_valid(cls, value: str) -> str:
        return normalize_email(value, enforce_allowed_domains=False)


class ManagedStationCreate(BaseModel):
    station_name: str
    station_address: str
    latitude: float | None = None
    longitude: float | None = None
    city: str | None = None

    @field_validator("station_name", "station_address")
    @classmethod
    def must_not_be_empty(cls, value: str) -> str:
        cleaned = str(value or "").strip()
        if not cleaned:
            raise ValueError("This field is required")
        return cleaned


class AdminRoleUpdate(BaseModel):
    role: str

    @field_validator("role")
    @classmethod
    def role_must_be_valid(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if cleaned not in {"admin", "user"}:
            raise ValueError("Role must be admin or user")
        return cleaned
