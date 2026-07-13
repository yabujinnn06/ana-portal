from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class ProductCreate(BaseModel):
    sku: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=240)
    barcode: str | None = Field(default=None, max_length=120)
    category_id: int | None = None
    unit_id: int | None = None
    track_serial: bool = False
    track_lot: bool = False


class ProductOut(ORMModel):
    id: int
    sku: str
    name: str
    barcode: str | None
    category_id: int | None
    unit_id: int | None
    track_serial: bool
    track_lot: bool
    active: bool


class WarehouseCreate(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=160)


class WarehouseOut(ORMModel):
    id: int
    code: str
    name: str
    active: bool


class LocationCreate(BaseModel):
    warehouse_id: int
    code: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=160)
    parent_id: int | None = None


class LocationOut(ORMModel):
    id: int
    warehouse_id: int
    parent_id: int | None
    code: str
    name: str
    active: bool


class MovementLineIn(BaseModel):
    product_id: int
    quantity: Decimal = Field(gt=0, max_digits=14, decimal_places=3)
    lot_no: str | None = Field(default=None, max_length=100)
    serial_no: str | None = Field(default=None, max_length=160)


class MovementCreate(BaseModel):
    movement_type: Literal["RECEIPT", "ISSUE", "TRANSFER", "TRANSFER_OUT", "TRANSFER_IN", "CUSTOMER_DISPATCH", "RETURN", "ADJUSTMENT", "DAMAGE", "SCRAP"]
    source_location_id: int | None = None
    destination_location_id: int | None = None
    reason: str | None = Field(default=None, max_length=240)
    reference_type: str | None = Field(default=None, max_length=40)
    reference_id: int | None = None
    lines: list[MovementLineIn] = Field(min_length=1, max_length=500)


class MovementOut(ORMModel):
    id: int
    movement_no: str
    movement_type: str
    status: str
    source_location_id: int | None
    destination_location_id: int | None
    reason: str | None
    occurred_at: datetime


class TransferLineIn(MovementLineIn):
    source_location_id: int
    destination_location_id: int


class TransferCreate(BaseModel):
    source_warehouse_id: int
    destination_warehouse_id: int
    notes: str | None = Field(default=None, max_length=1000)
    lines: list[TransferLineIn] = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def warehouses_differ(self):
        if self.source_warehouse_id == self.destination_warehouse_id:
            raise ValueError("Kaynak ve hedef depo aynı olamaz")
        return self


class TransferOut(ORMModel):
    id: int
    transfer_no: str
    source_warehouse_id: int
    destination_warehouse_id: int
    status: str
    notes: str | None
    dispatched_at: datetime | None
    received_at: datetime | None


class DispatchLineIn(MovementLineIn):
    pass


class DispatchCreate(BaseModel):
    source_location_id: int
    customer_name: str = Field(min_length=1, max_length=240)
    customer_site: str | None = Field(default=None, max_length=240)
    document_no: str | None = Field(default=None, max_length=100)
    notes: str | None = Field(default=None, max_length=1000)
    lines: list[DispatchLineIn] = Field(min_length=1, max_length=500)


class DispatchOut(ORMModel):
    id: int
    dispatch_no: str
    source_location_id: int
    customer_name: str
    customer_site: str | None
    status: str
    document_no: str | None
    shipped_at: datetime | None
    delivered_at: datetime | None


class CountLineIn(BaseModel):
    product_id: int
    location_id: int
    lot_no: str | None = Field(default=None, max_length=100)
    counted_quantity: Decimal = Field(ge=0, max_digits=14, decimal_places=3)


class CountCreate(BaseModel):
    warehouse_id: int
    lines: list[CountLineIn] = Field(min_length=1, max_length=5000)


class CountLineOut(ORMModel):
    id: int
    product_id: int
    location_id: int
    lot_no: str | None
    expected_quantity: Decimal
    counted_quantity: Decimal
    difference: Decimal


class CountOut(ORMModel):
    id: int
    count_no: str
    warehouse_id: int
    status: str
    closed_at: datetime | None


class StockRow(BaseModel):
    product_id: int
    sku: str
    product_name: str
    location_id: int
    location_code: str
    warehouse_id: int
    warehouse_code: str
    lot_no: str | None
    quantity: Decimal
