from pydantic import BaseModel, field_validator, model_validator

from app.services.pricing import canonical_booking_pricing

ALLOWED_PAYMENT_METHODS = {"cash", "credit_card", "debit_card", "gpay"}


class BookingCreate(BaseModel):
    username: str
    station_name: str
    station_address: str
    distance: str
    booking_time: str
    charger_type: str
    units: int
    price: float
    slot_count: int = 1

    @field_validator("slot_count")
    @classmethod
    def slot_count_must_be_valid(cls, value: int) -> int:
        count = int(value or 1)
        if count not in {1, 2}:
            raise ValueError("slot_count must be 1 or 2.")
        return count

    @field_validator("units")
    @classmethod
    def units_must_be_valid(cls, value: int) -> int:
        count = int(value or 1)
        if count < 1 or count > 200:
            raise ValueError("units must be between 1 and 200.")
        return count

    @model_validator(mode="after")
    def normalize_units_and_price(self):
        breakdown, units = canonical_booking_pricing(
            self.charger_type,
            self.station_name,
            self.slot_count,
            self.units,
        )
        self.units = units
        self.price = breakdown["total"]
        return self


class BookingRead(BaseModel):
    id: int
    station_name: str
    station_address: str
    distance: str
    booking_time: str
    charger_type: str
    units: int
    price: float
    status: str


class PaymentConfirmRequest(BaseModel):
    booking_id: int | None = None
    username: str
    station_name: str
    station_address: str
    booking_time: str
    charger_type: str
    units: int
    price: float
    slot_count: int = 1
    payment_method: str = "credit_card"
    payment_reference: str | None = None

    @field_validator("slot_count")
    @classmethod
    def slot_count_must_be_valid(cls, value: int) -> int:
        count = int(value or 1)
        if count not in {1, 2}:
            raise ValueError("slot_count must be 1 or 2.")
        return count

    @field_validator("payment_method")
    @classmethod
    def payment_method_must_be_valid(cls, value: str) -> str:
        cleaned = (value or "").strip().lower()
        if cleaned not in ALLOWED_PAYMENT_METHODS:
            raise ValueError("Invalid payment method.")
        return cleaned

    @field_validator("units")
    @classmethod
    def units_must_be_valid(cls, value: int) -> int:
        count = int(value or 1)
        if count < 1 or count > 200:
            raise ValueError("units must be between 1 and 200.")
        return count

    @model_validator(mode="after")
    def normalize_units_and_price(self):
        breakdown, units = canonical_booking_pricing(
            self.charger_type,
            self.station_name,
            self.slot_count,
            self.units,
        )
        self.units = units
        self.price = breakdown["total"]
        return self
