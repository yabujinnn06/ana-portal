from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


class ProductCategory(TimestampMixin, Base):
    __tablename__ = "product_categories"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("product_categories.id"))
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Unit(TimestampMixin, Base):
    __tablename__ = "units"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80))
    decimal_allowed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class Product(TimestampMixin, Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(240))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("product_categories.id"))
    unit_id: Mapped[int | None] = mapped_column(ForeignKey("units.id"))
    barcode: Mapped[str | None] = mapped_column(String(120), unique=True, index=True)
    track_serial: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    track_lot: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Warehouse(TimestampMixin, Base):
    __tablename__ = "warehouses"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Location(TimestampMixin, Base):
    __tablename__ = "warehouse_locations"
    id: Mapped[int] = mapped_column(primary_key=True)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id"), index=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("warehouse_locations.id"))
    code: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(160))
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    __table_args__ = (UniqueConstraint("warehouse_id", "code", name="uq_location_code_per_warehouse"),)


class StockBalance(Base):
    __tablename__ = "stock_balances"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("warehouse_locations.id"), index=True)
    lot_no: Mapped[str | None] = mapped_column(String(100))
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), default=0, nullable=False)
    __table_args__ = (UniqueConstraint("product_id", "location_id", "lot_no", name="uq_balance_product_location_lot"),)


class AssetInstance(Base):
    __tablename__ = "asset_instances"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    serial_no: Mapped[str] = mapped_column(String(160), index=True)
    lot_no: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(30), default="IN_STOCK")
    location_id: Mapped[int | None] = mapped_column(ForeignKey("warehouse_locations.id"), index=True)
    customer_name: Mapped[str | None] = mapped_column(String(240))
    __table_args__ = (UniqueConstraint("product_id", "serial_no", name="uq_asset_product_serial"),)


class StockMovement(TimestampMixin, Base):
    __tablename__ = "stock_movements"
    id: Mapped[int] = mapped_column(primary_key=True)
    movement_no: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    movement_type: Mapped[str] = mapped_column(String(40), index=True)
    status: Mapped[str] = mapped_column(String(20), default="POSTED", index=True)
    source_location_id: Mapped[int | None] = mapped_column(ForeignKey("warehouse_locations.id"))
    destination_location_id: Mapped[int | None] = mapped_column(ForeignKey("warehouse_locations.id"))
    reference_type: Mapped[str | None] = mapped_column(String(40))
    reference_id: Mapped[int | None] = mapped_column(Integer)
    reason: Mapped[str | None] = mapped_column(String(240))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    created_by: Mapped[int | None] = mapped_column(Integer)
    lines: Mapped[list[StockMovementLine]] = relationship(back_populates="movement", cascade="all, delete-orphan")


class StockMovementLine(Base):
    __tablename__ = "stock_movement_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    movement_id: Mapped[int] = mapped_column(ForeignKey("stock_movements.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    lot_no: Mapped[str | None] = mapped_column(String(100))
    serial_no: Mapped[str | None] = mapped_column(String(160), index=True)
    movement: Mapped[StockMovement] = relationship(back_populates="lines")


class TransferOrder(TimestampMixin, Base):
    __tablename__ = "transfer_orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    transfer_no: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    source_warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id"))
    destination_warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id"))
    status: Mapped[str] = mapped_column(String(30), default="DRAFT", index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lines: Mapped[list[TransferLine]] = relationship(back_populates="transfer", cascade="all, delete-orphan")


class TransferLine(Base):
    __tablename__ = "transfer_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    transfer_id: Mapped[int] = mapped_column(ForeignKey("transfer_orders.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    source_location_id: Mapped[int] = mapped_column(ForeignKey("warehouse_locations.id"))
    destination_location_id: Mapped[int] = mapped_column(ForeignKey("warehouse_locations.id"))
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    lot_no: Mapped[str | None] = mapped_column(String(100))
    serial_no: Mapped[str | None] = mapped_column(String(160))
    transfer: Mapped[TransferOrder] = relationship(back_populates="lines")


class DispatchOrder(TimestampMixin, Base):
    __tablename__ = "dispatch_orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    dispatch_no: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    source_location_id: Mapped[int] = mapped_column(ForeignKey("warehouse_locations.id"))
    customer_name: Mapped[str] = mapped_column(String(240), index=True)
    customer_site: Mapped[str | None] = mapped_column(String(240))
    status: Mapped[str] = mapped_column(String(30), default="DRAFT", index=True)
    document_no: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lines: Mapped[list[DispatchLine]] = relationship(back_populates="dispatch", cascade="all, delete-orphan")


class DispatchLine(Base):
    __tablename__ = "dispatch_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    dispatch_id: Mapped[int] = mapped_column(ForeignKey("dispatch_orders.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    lot_no: Mapped[str | None] = mapped_column(String(100))
    serial_no: Mapped[str | None] = mapped_column(String(160))
    dispatch: Mapped[DispatchOrder] = relationship(back_populates="lines")


class CountSession(TimestampMixin, Base):
    __tablename__ = "count_sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    count_no: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id"))
    status: Mapped[str] = mapped_column(String(20), default="OPEN", index=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lines: Mapped[list[CountLine]] = relationship(back_populates="session", cascade="all, delete-orphan")


class CountLine(Base):
    __tablename__ = "count_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("count_sessions.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    location_id: Mapped[int] = mapped_column(ForeignKey("warehouse_locations.id"))
    lot_no: Mapped[str | None] = mapped_column(String(100))
    expected_quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), default=0)
    counted_quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3), default=0)
    difference: Mapped[Decimal] = mapped_column(Numeric(14, 3), default=0)
    session: Mapped[CountSession] = relationship(back_populates="lines")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    action: Mapped[str] = mapped_column(String(80), index=True)
    entity_type: Mapped[str] = mapped_column(String(80), index=True)
    entity_id: Mapped[int | None] = mapped_column(Integer)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    actor_id: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)


Index("ix_movement_line_product_lot", StockMovementLine.product_id, StockMovementLine.lot_no)
Index("ix_count_line_session_product", CountLine.session_id, CountLine.product_id)
