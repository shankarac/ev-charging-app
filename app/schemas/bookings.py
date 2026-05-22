from pydantic import BaseModel, model_validator

from app.services.pricing import calculate_booking_price


class BookingCreate(BaseModel):
    username: str
    station_name: str
    station_address: str
    distance: str
    booking_time: str
    charger_type: str
    units: int
    price: float

    @model_validator(mode="after")
    def set_price_from_charger_and_units(self):
        self.price = calculate_booking_price(self.units, self.charger_type)
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
    username: str
    station_name: str
    station_address: str
    booking_time: str
    charger_type: str
    units: int
    price: float
    payment_reference: str | None = None

    @model_validator(mode="after")
    def set_price_from_charger_and_units(self):
        self.price = calculate_booking_price(self.units, self.charger_type)
        return self
