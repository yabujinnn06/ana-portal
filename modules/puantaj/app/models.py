from __future__ import annotations

import enum
from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class AttendanceType(str, enum.Enum):
    IN = "IN"
    OUT = "OUT"


class LocationStatus(str, enum.Enum):
    VERIFIED_HOME = "VERIFIED_HOME"
    UNVERIFIED_LOCATION = "UNVERIFIED_LOCATION"
    NO_LOCATION = "NO_LOCATION"
    LOW_ACCURACY = "LOW_ACCURACY"
    STALE_LOCATION = "STALE_LOCATION"
    OUTSIDE_GEOFENCE = "OUTSIDE_GEOFENCE"
    INSIDE_GEOFENCE = "INSIDE_GEOFENCE"
    SUSPICIOUS_JUMP = "SUSPICIOUS_JUMP"
    MOCK_GPS_SUSPECTED = "MOCK_GPS_SUSPECTED"
    VERIFIED = "VERIFIED"


class LocationEventSource(str, enum.Enum):
    CHECKIN = "CHECKIN"
    CHECKOUT = "CHECKOUT"
    APP_OPEN = "APP_OPEN"
    APP_CLOSE = "APP_CLOSE"
    DEMO_START = "DEMO_START"
    DEMO_END = "DEMO_END"
    LOCATION_PING = "LOCATION_PING"


class GeofenceStatus(str, enum.Enum):
    NOT_CONFIGURED = "NOT_CONFIGURED"
    INSIDE = "INSIDE"
    OUTSIDE = "OUTSIDE"
    UNKNOWN = "UNKNOWN"


class LocationTrustStatus(str, enum.Enum):
    NO_DATA = "NO_DATA"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    SUSPICIOUS = "SUSPICIOUS"


class LeaveType(str, enum.Enum):
    ANNUAL = "ANNUAL"
    SICK = "SICK"
    UNPAID = "UNPAID"
    EXCUSE = "EXCUSE"
    PUBLIC_HOLIDAY = "PUBLIC_HOLIDAY"


class LeaveStatus(str, enum.Enum):
    APPROVED = "APPROVED"
    PENDING = "PENDING"
    REJECTED = "REJECTED"


class EmployeeConversationCategory(str, enum.Enum):
    ATTENDANCE = "ATTENDANCE"
    SHIFT = "SHIFT"
    DEVICE = "DEVICE"
    DOCUMENT = "DOCUMENT"
    OTHER = "OTHER"


class EmployeeConversationStatus(str, enum.Enum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class AuditActorType(str, enum.Enum):
    ADMIN = "ADMIN"
    SYSTEM = "SYSTEM"


class OvertimeRoundingMode(str, enum.Enum):
    OFF = "OFF"
    REG_HALF_HOUR = "REG_HALF_HOUR"


class OvertimeCode(str, enum.Enum):
    NONE = "NONE"
    FM1 = "FM1"
    FM2 = "FM2"
    FM3 = "FM3"


class ManualDayStatus(str, enum.Enum):
    NORMAL = "NORMAL"
    IZINLI = "IZINLI"
    RESMI_TATIL = "RESMI_TATIL"
    CALISMADI = "CALISMADI"


class AttendanceEventSource(str, enum.Enum):
    DEVICE = "DEVICE"
    MANUAL = "MANUAL"


class SchedulePlanTargetType(str, enum.Enum):
    DEPARTMENT = "DEPARTMENT"
    DEPARTMENT_EXCEPT_EMPLOYEE = "DEPARTMENT_EXCEPT_EMPLOYEE"
    ONLY_EMPLOYEE = "ONLY_EMPLOYEE"


class QRCodeType(str, enum.Enum):
    CHECKIN = "CHECKIN"
    CHECKOUT = "CHECKOUT"
    BOTH = "BOTH"


class SpecialDayType(str, enum.Enum):
    PUBLIC_HOLIDAY = "PUBLIC_HOLIDAY"
    COMPANY_HOLIDAY = "COMPANY_HOLIDAY"
    ADMINISTRATIVE_LEAVE = "ADMINISTRATIVE_LEAVE"
    HALF_DAY = "HALF_DAY"
    OTHER = "OTHER"


class SpecialDayWorkPolicy(str, enum.Enum):
    OFF = "OFF"
    HALF_DAY = "HALF_DAY"
    WORKDAY = "WORKDAY"


class Region(Base):
    __tablename__ = "regions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    departments: Mapped[list[Department]] = relationship(back_populates="region")
    employees: Mapped[list[Employee]] = relationship(back_populates="region")
    qr_points: Mapped[list[QRPoint]] = relationship(back_populates="region")


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    region_id: Mapped[int | None] = mapped_column(
        ForeignKey("regions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    region: Mapped[Region | None] = relationship(back_populates="departments")
    employees: Mapped[list[Employee]] = relationship(back_populates="department")
    work_rule: Mapped[WorkRule | None] = relationship(back_populates="department", uselist=False)
    weekly_rules: Mapped[list[DepartmentWeeklyRule]] = relationship(back_populates="department")
    weekday_shift_assignments: Mapped[list[DepartmentWeekdayShiftAssignment]] = relationship(
        back_populates="department"
    )
    shifts: Mapped[list[DepartmentShift]] = relationship(back_populates="department")
    schedule_plans: Mapped[list[DepartmentSchedulePlan]] = relationship(back_populates="department")
    saturday_rotations: Mapped[list[SaturdayRotation]] = relationship(back_populates="department")
    qr_points: Mapped[list[QRPoint]] = relationship(back_populates="department")


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    region_id: Mapped[int | None] = mapped_column(
        ForeignKey("regions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
    )
    shift_id: Mapped[int | None] = mapped_column(
        ForeignKey("department_shifts.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    contract_weekly_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    depo_stok_izni: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))

    region: Mapped[Region | None] = relationship(back_populates="employees")
    department: Mapped[Department | None] = relationship(back_populates="employees")
    shift: Mapped[DepartmentShift | None] = relationship(back_populates="employees")
    devices: Mapped[list[Device]] = relationship(back_populates="employee")
    device_invites: Mapped[list[DeviceInvite]] = relationship(back_populates="employee")
    leaves: Mapped[list[Leave]] = relationship(back_populates="employee")
    location: Mapped[EmployeeLocation | None] = relationship(back_populates="employee", uselist=False)
    attendance_events: Mapped[list[AttendanceEvent]] = relationship(back_populates="employee")
    location_events: Mapped[list[EmployeeLocationEvent]] = relationship(back_populates="employee")
    manual_day_overrides: Mapped[list[ManualDayOverride]] = relationship(back_populates="employee")
    weekly_rest_days: Mapped[list[EmployeeWeeklyRestDay]] = relationship(back_populates="employee")
    special_day_overrides: Mapped[list[SpecialDayEmployeeOverride]] = relationship(back_populates="employee")
    schedule_plan_targets: Mapped[list[DepartmentSchedulePlan]] = relationship(back_populates="target_employee")
    schedule_plan_scopes: Mapped[list[DepartmentSchedulePlanEmployee]] = relationship(
        back_populates="employee"
    )
    saturday_rotation_assignments: Mapped[list[SaturdayRotationDayEmployee]] = relationship(
        back_populates="employee"
    )


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    device_fingerprint: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    recovery_pin_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    recovery_pin_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recovery_admin_vault: Mapped[str | None] = mapped_column(Text, nullable=True)
    recovery_admin_vault_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    employee: Mapped[Employee] = relationship(back_populates="devices")
    attendance_events: Mapped[list[AttendanceEvent]] = relationship(back_populates="device")
    location_events: Mapped[list[EmployeeLocationEvent]] = relationship(back_populates="device")
    passkeys: Mapped[list[DevicePasskey]] = relationship(
        back_populates="device",
        cascade="all, delete-orphan",
    )
    recovery_codes: Mapped[list[DeviceRecoveryCode]] = relationship(
        back_populates="device",
        cascade="all, delete-orphan",
    )
    push_subscriptions: Mapped[list[DevicePushSubscription]] = relationship(
        back_populates="device",
        cascade="all, delete-orphan",
    )


class DevicePasskey(Base):
    __tablename__ = "device_passkeys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    credential_id: Mapped[str] = mapped_column(String(512), nullable=False, unique=True, index=True)
    public_key: Mapped[str] = mapped_column(Text, nullable=False)
    sign_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    transports: Mapped[list[str]] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=False,
        default=list,
        server_default=text("'[]'"),
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    device: Mapped[Device] = relationship(back_populates="passkeys")


class DeviceRecoveryCode(Base):
    __tablename__ = "device_recovery_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    device: Mapped[Device] = relationship(back_populates="recovery_codes")


class DevicePushSubscription(Base):
    __tablename__ = "device_push_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    endpoint: Mapped[str] = mapped_column(String(1024), nullable=False, unique=True, index=True)
    p256dh: Mapped[str] = mapped_column(String(512), nullable=False)
    auth: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    user_agent: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    device: Mapped[Device] = relationship(back_populates="push_subscriptions")


class WebAuthnChallenge(Base):
    __tablename__ = "webauthn_challenges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    purpose: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    challenge: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    device_id: Mapped[int | None] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(128), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    device: Mapped[Device | None] = relationship()


class DeviceInvite(Base):
    __tablename__ = "device_invites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    token: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=5, server_default=text("5"))
    bound_ip: Mapped[str | None] = mapped_column(String(128), nullable=True)
    bound_user_agent_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    employee: Mapped[Employee] = relationship(back_populates="device_invites")


class EmployeeLocation(Base):
    __tablename__ = "employee_locations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    home_lat: Mapped[float] = mapped_column(Float, nullable=False)
    home_lon: Mapped[float] = mapped_column(Float, nullable=False)
    radius_m: Mapped[int] = mapped_column(Integer, nullable=False, default=120, server_default=text("120"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    employee: Mapped[Employee] = relationship(back_populates="location")


class EmployeeLocationEvent(Base):
    __tablename__ = "employee_location_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_id: Mapped[int | None] = mapped_column(
        ForeignKey("devices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    attendance_event_id: Mapped[int | None] = mapped_column(
        ForeignKey("attendance_events.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        unique=True,
    )
    audit_log_id: Mapped[int | None] = mapped_column(
        ForeignKey("audit_logs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        unique=True,
    )
    source: Mapped[LocationEventSource] = mapped_column(
        Enum(LocationEventSource, name="location_event_source"),
        nullable=False,
        index=True,
    )
    ts_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    accuracy_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    speed_mps: Mapped[float | None] = mapped_column(Float, nullable=True)
    heading_deg: Mapped[float | None] = mapped_column(Float, nullable=True)
    altitude_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    provider: Mapped[str | None] = mapped_column(String(40), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(128), nullable=True)
    network_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    battery_level: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_mocked: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    geofence_status: Mapped[GeofenceStatus] = mapped_column(
        Enum(GeofenceStatus, name="location_geofence_status"),
        nullable=False,
        default=GeofenceStatus.UNKNOWN,
        server_default=text("'UNKNOWN'"),
    )
    trust_status: Mapped[LocationTrustStatus] = mapped_column(
        Enum(LocationTrustStatus, name="location_trust_status"),
        nullable=False,
        default=LocationTrustStatus.NO_DATA,
        server_default=text("'NO_DATA'"),
        index=True,
    )
    trust_score: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    distance_to_geofence_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_status: Mapped[LocationStatus] = mapped_column(
        Enum(LocationStatus, name="attendance_location_status"),
        nullable=False,
        default=LocationStatus.NO_LOCATION,
        server_default=text("'NO_LOCATION'"),
        index=True,
    )
    details: Mapped[dict[str, Any]] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=False,
        default=dict,
        server_default=text("'{}'"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    employee: Mapped[Employee] = relationship(back_populates="location_events")
    device: Mapped[Device | None] = relationship(back_populates="location_events")
    attendance_event: Mapped[AttendanceEvent | None] = relationship()
    audit_log: Mapped[AuditLog | None] = relationship()


class WorkRule(Base):
    __tablename__ = "work_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    daily_minutes_planned: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=540,
        server_default=text("540"),
    )
    break_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60, server_default=text("60"))
    grace_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=5, server_default=text("5"))
    early_arrival_tolerance_minutes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    overtime_grace_minutes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    off_shift_tolerance_minutes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    # Opsiyonel gunluk NET mesai hedefi (dk). Doluysa fazla mesai bu sabit esige gore
    # hesaplanir (net is = brut - mola, erken gelis haric); mola FM'yi dusurur. Bos ise
    # mevcut davranis: FM = vardiya bitisinden sonraki ham sure.
    overtime_threshold_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    department: Mapped[Department] = relationship(back_populates="work_rule")


class DepartmentWeeklyRule(Base):
    __tablename__ = "department_weekly_rules"
    __table_args__ = (
        UniqueConstraint("department_id", "weekday", name="uq_department_weekly_rules_department_weekday"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)
    is_workday: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    planned_minutes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=540,
        server_default=text("540"),
    )
    break_minutes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=60,
        server_default=text("60"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    department: Mapped[Department] = relationship(back_populates="weekly_rules")


class EmployeeWeeklyRestDay(Base):
    __tablename__ = "employee_weekly_rest_days"
    __table_args__ = (
        UniqueConstraint("employee_id", "weekday", name="uq_employee_weekly_rest_days_employee_weekday"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    employee: Mapped[Employee] = relationship(back_populates="weekly_rest_days")


class DepartmentShift(Base):
    __tablename__ = "department_shifts"
    __table_args__ = (
        UniqueConstraint("department_id", "name", name="uq_department_shifts_department_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    start_time_local: Mapped[time] = mapped_column(Time(timezone=False), nullable=False)
    end_time_local: Mapped[time] = mapped_column(Time(timezone=False), nullable=False)
    break_minutes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=60,
        server_default=text("60"),
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    department: Mapped[Department] = relationship(back_populates="shifts")
    employees: Mapped[list[Employee]] = relationship(back_populates="shift")
    weekday_assignments: Mapped[list[DepartmentWeekdayShiftAssignment]] = relationship(
        back_populates="shift"
    )
    schedule_plans: Mapped[list[DepartmentSchedulePlan]] = relationship(back_populates="shift")


class DepartmentWeekdayShiftAssignment(Base):
    __tablename__ = "department_weekday_shift_assignments"
    __table_args__ = (
        UniqueConstraint(
            "department_id",
            "weekday",
            "shift_id",
            name="uq_department_weekday_shift_assignments_dep_weekday_shift",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    weekday: Mapped[int] = mapped_column(Integer, nullable=False)
    shift_id: Mapped[int] = mapped_column(
        ForeignKey("department_shifts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sort_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default=text("0"),
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    department: Mapped[Department] = relationship(back_populates="weekday_shift_assignments")
    shift: Mapped[DepartmentShift] = relationship(back_populates="weekday_assignments")


class DepartmentSchedulePlan(Base):
    __tablename__ = "department_schedule_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_type: Mapped[SchedulePlanTargetType] = mapped_column(
        Enum(SchedulePlanTargetType, name="schedule_plan_target_type"),
        nullable=False,
    )
    target_employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    shift_id: Mapped[int | None] = mapped_column(
        ForeignKey("department_shifts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    daily_minutes_planned: Mapped[int | None] = mapped_column(Integer, nullable=True)
    break_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    grace_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    early_arrival_tolerance_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    overtime_grace_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    off_shift_tolerance_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    overtime_threshold_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    end_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    is_locked: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    department: Mapped[Department] = relationship(back_populates="schedule_plans")
    target_employee: Mapped[Employee | None] = relationship(back_populates="schedule_plan_targets")
    shift: Mapped[DepartmentShift | None] = relationship(back_populates="schedule_plans")
    target_employees: Mapped[list[DepartmentSchedulePlanEmployee]] = relationship(
        back_populates="schedule_plan",
        cascade="all, delete-orphan",
    )
    saturday_rotation_days: Mapped[list[SaturdayRotationDay]] = relationship(
        back_populates="schedule_plan"
    )


class DepartmentSchedulePlanEmployee(Base):
    __tablename__ = "department_schedule_plan_employees"
    __table_args__ = (
        UniqueConstraint(
            "schedule_plan_id",
            "employee_id",
            name="uq_department_schedule_plan_employees_plan_employee",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    schedule_plan_id: Mapped[int] = mapped_column(
        ForeignKey("department_schedule_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    schedule_plan: Mapped[DepartmentSchedulePlan] = relationship(back_populates="target_employees")
    employee: Mapped[Employee] = relationship(back_populates="schedule_plan_scopes")


class SaturdayRotation(Base):
    __tablename__ = "saturday_rotations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    department_id: Mapped[int] = mapped_column(
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    shift_id: Mapped[int] = mapped_column(
        ForeignKey("department_shifts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    end_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    team_size: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default=text("1"))
    repeat_interval_weeks: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default=text("1"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    department: Mapped[Department] = relationship(back_populates="saturday_rotations")
    shift: Mapped[DepartmentShift] = relationship()
    days: Mapped[list[SaturdayRotationDay]] = relationship(
        back_populates="rotation",
        cascade="all, delete-orphan",
    )


class SaturdayRotationDay(Base):
    __tablename__ = "saturday_rotation_days"
    __table_args__ = (
        UniqueConstraint("rotation_id", "day_date", name="uq_saturday_rotation_days_rotation_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rotation_id: Mapped[int] = mapped_column(
        ForeignKey("saturday_rotations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    day_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    schedule_plan_id: Mapped[int | None] = mapped_column(
        ForeignKey("department_schedule_plans.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    rotation: Mapped[SaturdayRotation] = relationship(back_populates="days")
    schedule_plan: Mapped[DepartmentSchedulePlan | None] = relationship(
        back_populates="saturday_rotation_days"
    )
    employees: Mapped[list[SaturdayRotationDayEmployee]] = relationship(
        back_populates="rotation_day",
        cascade="all, delete-orphan",
    )


class SaturdayRotationDayEmployee(Base):
    __tablename__ = "saturday_rotation_day_employees"
    __table_args__ = (
        UniqueConstraint(
            "rotation_day_id",
            "employee_id",
            name="uq_saturday_rotation_day_employees_day_employee",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rotation_day_id: Mapped[int] = mapped_column(
        ForeignKey("saturday_rotation_days.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    rotation_day: Mapped[SaturdayRotationDay] = relationship(back_populates="employees")
    employee: Mapped[Employee] = relationship(back_populates="saturday_rotation_assignments")


class SpecialDay(Base):
    __tablename__ = "special_days"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    day_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    day_type: Mapped[SpecialDayType] = mapped_column(
        Enum(SpecialDayType, name="special_day_type"),
        nullable=False,
        default=SpecialDayType.PUBLIC_HOLIDAY,
        server_default=text("'PUBLIC_HOLIDAY'"),
    )
    work_policy: Mapped[SpecialDayWorkPolicy] = mapped_column(
        Enum(SpecialDayWorkPolicy, name="special_day_work_policy"),
        nullable=False,
        default=SpecialDayWorkPolicy.OFF,
        server_default=text("'OFF'"),
    )
    planned_minutes_override: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # HALF_DAY politikasinda fazla mesainin basladigi yerel saat; NULL -> 13:00
    half_day_overtime_start: Mapped[time | None] = mapped_column(Time, nullable=True)
    counts_as_paid_leave: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    overtime_code: Mapped[OvertimeCode] = mapped_column(
        Enum(OvertimeCode, name="overtime_code"),
        nullable=False,
        default=OvertimeCode.FM2,
        server_default=text("'FM2'"),
    )
    overtime_multiplier: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=1.0,
        server_default=text("1.0"),
    )
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    region_id: Mapped[int | None] = mapped_column(
        ForeignKey("regions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
        index=True,
    )
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    department: Mapped[Department | None] = relationship()
    region: Mapped[Region | None] = relationship()
    employee_overrides: Mapped[list[SpecialDayEmployeeOverride]] = relationship(back_populates="special_day")


class SpecialDayEmployeeOverride(Base):
    __tablename__ = "special_day_employee_overrides"
    __table_args__ = (
        UniqueConstraint(
            "special_day_id",
            "employee_id",
            name="uq_special_day_employee_overrides_day_employee",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    special_day_id: Mapped[int] = mapped_column(
        ForeignKey("special_days.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    work_policy: Mapped[SpecialDayWorkPolicy] = mapped_column(
        Enum(SpecialDayWorkPolicy, name="special_day_work_policy"),
        nullable=False,
        default=SpecialDayWorkPolicy.OFF,
        server_default=text("'OFF'"),
    )
    planned_minutes_override: Mapped[int | None] = mapped_column(Integer, nullable=True)
    counts_as_paid_leave: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    overtime_code: Mapped[OvertimeCode] = mapped_column(
        Enum(OvertimeCode, name="overtime_code"),
        nullable=False,
        default=OvertimeCode.FM2,
        server_default=text("'FM2'"),
    )
    overtime_multiplier: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=1.0,
        server_default=text("1.0"),
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
        index=True,
    )
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    special_day: Mapped[SpecialDay] = relationship(back_populates="employee_overrides")
    employee: Mapped[Employee] = relationship(back_populates="special_day_overrides")


class QRCode(Base):
    __tablename__ = "qr_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    code_value: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    code_type: Mapped[QRCodeType] = mapped_column(
        Enum(QRCodeType, name="qr_code_type"),
        nullable=False,
        default=QRCodeType.BOTH,
        server_default=text("'BOTH'"),
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    qr_code_points: Mapped[list[QRCodePoint]] = relationship(
        back_populates="qr_code",
        cascade="all, delete-orphan",
    )
    qr_points: Mapped[list[QRPoint]] = relationship(
        secondary="qr_code_points",
        back_populates="qr_codes",
        viewonly=True,
    )


class QRPoint(Base):
    __tablename__ = "qr_points"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    radius_m: Mapped[int] = mapped_column(Integer, nullable=False, default=75, server_default=text("75"))
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    region_id: Mapped[int | None] = mapped_column(
        ForeignKey("regions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    department: Mapped[Department | None] = relationship(back_populates="qr_points")
    region: Mapped[Region | None] = relationship(back_populates="qr_points")
    qr_code_points: Mapped[list[QRCodePoint]] = relationship(
        back_populates="qr_point",
        cascade="all, delete-orphan",
    )
    qr_codes: Mapped[list[QRCode]] = relationship(
        secondary="qr_code_points",
        back_populates="qr_points",
        viewonly=True,
    )


class QRCodePoint(Base):
    __tablename__ = "qr_code_points"
    __table_args__ = (
        UniqueConstraint("qr_code_id", "qr_point_id", name="uq_qr_code_points_qr_code_qr_point"),
    )

    qr_code_id: Mapped[int] = mapped_column(
        ForeignKey("qr_codes.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
        index=True,
    )
    qr_point_id: Mapped[int] = mapped_column(
        ForeignKey("qr_points.id", ondelete="CASCADE"),
        primary_key=True,
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    qr_code: Mapped[QRCode] = relationship(back_populates="qr_code_points")
    qr_point: Mapped[QRPoint] = relationship(back_populates="qr_code_points")


class LaborProfile(Base):
    __tablename__ = "labor_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, default="TR_DEFAULT")
    weekly_normal_minutes_default: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=2700,
        server_default=text("2700"),
    )
    daily_max_minutes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=660,
        server_default=text("660"),
    )
    enforce_min_break_rules: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    night_work_max_minutes_default: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=450,
        server_default=text("450"),
    )
    night_work_exceptions_note_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    overtime_annual_cap_minutes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=16200,
        server_default=text("16200"),
    )
    overtime_premium: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=1.5,
        server_default=text("1.5"),
    )
    extra_work_premium: Mapped[float] = mapped_column(
        Float,
        nullable=False,
        default=1.25,
        server_default=text("1.25"),
    )
    overtime_rounding_mode: Mapped[OvertimeRoundingMode] = mapped_column(
        Enum(OvertimeRoundingMode, name="overtime_rounding_mode"),
        nullable=False,
        default=OvertimeRoundingMode.OFF,
        server_default=text("'OFF'"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class Leave(Base):
    __tablename__ = "leaves"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    type: Mapped[LeaveType] = mapped_column(
        Enum(LeaveType, name="leave_type"),
        nullable=False,
    )
    status: Mapped[LeaveStatus] = mapped_column(
        Enum(LeaveStatus, name="leave_status"),
        nullable=False,
        default=LeaveStatus.APPROVED,
        server_default=text("'APPROVED'"),
    )
    half_day: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    requested_by_employee: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    decision_note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    employee: Mapped[Employee] = relationship(back_populates="leaves")
    leave_attachments: Mapped[list["LeaveAttachment"]] = relationship(
        back_populates="leave",
        cascade="all, delete-orphan",
        order_by="LeaveAttachment.created_at.asc()",
    )
    leave_messages: Mapped[list["LeaveMessage"]] = relationship(
        back_populates="leave",
        cascade="all, delete-orphan",
        order_by="LeaveMessage.created_at.asc()",
    )

    @property
    def attachment_count(self) -> int:
        return len(self.leave_attachments or [])

    @property
    def message_count(self) -> int:
        return len(self.leave_messages or [])

    @property
    def last_message_at(self) -> datetime | None:
        if not self.leave_messages:
            return None
        return self.leave_messages[-1].created_at

    @property
    def latest_message_preview(self) -> str | None:
        if not self.leave_messages:
            return None
        message = (self.leave_messages[-1].message or "").strip()
        if len(message) <= 140:
            return message or None
        return f"{message[:137].rstrip()}..."


class LeaveAttachment(Base):
    __tablename__ = "leave_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    leave_id: Mapped[int] = mapped_column(
        ForeignKey("leaves.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    uploaded_by_actor: Mapped[str] = mapped_column(String(20), nullable=False, default="EMPLOYEE")
    uploaded_by_admin_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    file_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    leave: Mapped[Leave] = relationship(back_populates="leave_attachments")
    employee: Mapped[Employee] = relationship()
    uploaded_by_admin_user: Mapped["AdminUser | None"] = relationship()

    @property
    def uploaded_by_label(self) -> str:
        if self.uploaded_by_actor == "ADMIN":
            admin_name = (
                self.uploaded_by_admin_user.full_name
                if self.uploaded_by_admin_user is not None and self.uploaded_by_admin_user.full_name
                else (
                    self.uploaded_by_admin_user.username
                    if self.uploaded_by_admin_user is not None
                    else "Admin"
                )
            )
            return admin_name
        return "Çalışan"


class LeaveMessage(Base):
    __tablename__ = "leave_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    leave_id: Mapped[int] = mapped_column(
        ForeignKey("leaves.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_actor: Mapped[str] = mapped_column(String(20), nullable=False, default="EMPLOYEE")
    sender_admin_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    leave: Mapped[Leave] = relationship(back_populates="leave_messages")
    employee: Mapped[Employee] = relationship()
    sender_admin_user: Mapped["AdminUser | None"] = relationship()

    @property
    def sender_label(self) -> str:
        if self.sender_actor == "ADMIN":
            admin_name = (
                self.sender_admin_user.full_name
                if self.sender_admin_user is not None and self.sender_admin_user.full_name
                else (
                    self.sender_admin_user.username
                    if self.sender_admin_user is not None
                    else "Admin"
                )
            )
            return admin_name
        return self.employee.full_name if self.employee is not None and self.employee.full_name else "Çalışan"


class EmployeeConversation(Base):
    __tablename__ = "employee_conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category: Mapped[EmployeeConversationCategory] = mapped_column(
        Enum(EmployeeConversationCategory, name="employee_conversation_category"),
        nullable=False,
    )
    subject: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[EmployeeConversationStatus] = mapped_column(
        Enum(EmployeeConversationStatus, name="employee_conversation_status"),
        nullable=False,
        default=EmployeeConversationStatus.OPEN,
        server_default=text("'OPEN'"),
    )
    last_message_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    employee: Mapped[Employee] = relationship()
    messages: Mapped[list["EmployeeConversationMessage"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="EmployeeConversationMessage.created_at.asc()",
    )

    @property
    def employee_name(self) -> str:
        if self.employee is not None and (self.employee.full_name or "").strip():
            return str(self.employee.full_name).strip()
        return f"Çalışan #{self.employee_id}"

    @property
    def message_count(self) -> int:
        return len(self.messages or [])

    @property
    def latest_message_preview(self) -> str | None:
        if not self.messages:
            return None
        message = (self.messages[-1].message or "").strip()
        if len(message) <= 140:
            return message or None
        return f"{message[:137].rstrip()}..."


class EmployeeConversationMessage(Base):
    __tablename__ = "employee_conversation_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("employee_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_actor: Mapped[str] = mapped_column(String(20), nullable=False, default="EMPLOYEE")
    sender_admin_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    conversation: Mapped[EmployeeConversation] = relationship(back_populates="messages")
    employee: Mapped[Employee] = relationship()
    sender_admin_user: Mapped["AdminUser | None"] = relationship()

    @property
    def sender_label(self) -> str:
        if self.sender_actor == "ADMIN":
            admin_name = (
                self.sender_admin_user.full_name
                if self.sender_admin_user is not None and self.sender_admin_user.full_name
                else (
                    self.sender_admin_user.username
                    if self.sender_admin_user is not None
                    else "Admin"
                )
            )
            return admin_name
        return self.employee.full_name if self.employee is not None and self.employee.full_name else "Çalışan"


class ManualDayOverride(Base):
    __tablename__ = "manual_day_overrides"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    day_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    in_ts: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    out_ts: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_absent: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    status: Mapped[ManualDayStatus] = mapped_column(
        Enum(ManualDayStatus, name="manual_day_status"),
        nullable=False,
        default=ManualDayStatus.NORMAL,
        server_default=text("'NORMAL'"),
    )
    rule_source_override: Mapped[str | None] = mapped_column(String(20), nullable=True)
    rule_shift_id_override: Mapped[int | None] = mapped_column(
        ForeignKey("department_shifts.id", ondelete="SET NULL"),
        nullable=True,
    )
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_by: Mapped[str] = mapped_column(String(255), nullable=False, default="admin")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    employee: Mapped[Employee] = relationship(back_populates="manual_day_overrides")


class AdminUser(Base):
    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    is_super_admin: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    permissions: Mapped[dict[str, Any]] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=False,
        default=dict,
        server_default=text("'{}'"),
    )
    mfa_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    mfa_secret_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    mfa_secret_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    refresh_tokens: Mapped[list[AdminRefreshToken]] = relationship(back_populates="admin_user")
    push_subscriptions: Mapped[list[AdminPushSubscription]] = relationship(back_populates="admin_user")
    mfa_recovery_codes: Mapped[list[AdminMfaRecoveryCode]] = relationship(
        back_populates="admin_user",
        cascade="all, delete-orphan",
    )
    created_device_invites: Mapped[list[AdminDeviceInvite]] = relationship(
        back_populates="created_by_admin_user",
        foreign_keys="AdminDeviceInvite.created_by_admin_user_id",
    )
    used_device_invites: Mapped[list[AdminDeviceInvite]] = relationship(
        back_populates="used_by_admin_user",
        foreign_keys="AdminDeviceInvite.used_by_admin_user_id",
    )


class AdminMfaRecoveryCode(Base):
    __tablename__ = "admin_mfa_recovery_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    admin_user_id: Mapped[int] = mapped_column(
        ForeignKey("admin_users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    admin_user: Mapped[AdminUser] = relationship(back_populates="mfa_recovery_codes")


class AdminRefreshToken(Base):
    __tablename__ = "admin_refresh_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    jti: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    admin_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    subject: Mapped[str] = mapped_column(String(255), nullable=False, default="admin", server_default=text("'admin'"))
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_ip: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_user_agent: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    admin_user: Mapped[AdminUser | None] = relationship(back_populates="refresh_tokens")


class AdminPushSubscription(Base):
    __tablename__ = "admin_push_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    admin_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    admin_username: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    endpoint: Mapped[str] = mapped_column(String(1024), nullable=False, unique=True, index=True)
    p256dh: Mapped[str] = mapped_column(String(512), nullable=False)
    auth: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    user_agent: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    admin_user: Mapped[AdminUser | None] = relationship(back_populates="push_subscriptions")


class AdminNotificationEmailTarget(Base):
    __tablename__ = "admin_notification_email_targets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    created_by_username: Mapped[str | None] = mapped_column(String(100), nullable=True)
    updated_by_username: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class AdminDeviceInvite(Base):
    __tablename__ = "admin_device_invites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    is_used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=5, server_default=text("5"))
    bound_ip: Mapped[str | None] = mapped_column(String(128), nullable=True)
    bound_user_agent_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_admin_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by_username: Mapped[str] = mapped_column(String(100), nullable=False, default="admin")
    used_by_admin_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    used_by_username: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_by_admin_user: Mapped[AdminUser | None] = relationship(
        back_populates="created_device_invites",
        foreign_keys=[created_by_admin_user_id],
    )
    used_by_admin_user: Mapped[AdminUser | None] = relationship(
        back_populates="used_device_invites",
        foreign_keys=[used_by_admin_user_id],
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ts_utc: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        index=True,
    )
    actor_type: Mapped[AuditActorType] = mapped_column(
        Enum(AuditActorType, name="audit_actor_type"),
        nullable=False,
    )
    actor_id: Mapped[str] = mapped_column(String(255), nullable=False)
    module: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        default="CORE",
        server_default=text("'CORE'"),
        index=True,
    )
    event_type: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    device_id: Mapped[int | None] = mapped_column(
        ForeignKey("devices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(255), nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(128), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    details: Mapped[dict[str, Any]] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=False,
        default=dict,
        server_default=text("'{}'"),
    )

    employee: Mapped[Employee | None] = relationship()
    device: Mapped[Device | None] = relationship()


class NotificationJob(Base):
    __tablename__ = "notification_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    admin_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    job_type: Mapped[str] = mapped_column(String(100), nullable=False)
    notification_type: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    audience: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    risk_level: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    event_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    event_hash: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True, index=True)
    local_day: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    event_ts_utc: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    shift_summary: Mapped[str | None] = mapped_column(String(255), nullable=True)
    actual_time_summary: Mapped[str | None] = mapped_column(String(255), nullable=True)
    suggested_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=False,
        default=dict,
        server_default=text("'{}'"),
    )
    scheduled_at_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="PENDING",
        server_default=text("'PENDING'"),
        index=True,
    )
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    employee: Mapped[Employee | None] = relationship()
    admin_user: Mapped[AdminUser | None] = relationship()
    delivery_logs: Mapped[list[NotificationDeliveryLog]] = relationship(
        back_populates="notification_job",
        cascade="all, delete-orphan",
    )


class NotificationDeliveryLog(Base):
    __tablename__ = "notification_delivery_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    notification_job_id: Mapped[int | None] = mapped_column(
        ForeignKey("notification_jobs.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    event_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    notification_type: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    audience: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    channel: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    recipient_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    admin_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    recipient_address: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    endpoint: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    notification_job: Mapped[NotificationJob | None] = relationship(back_populates="delivery_logs")
    employee: Mapped[Employee | None] = relationship()
    admin_user: Mapped[AdminUser | None] = relationship()


class ScheduledNotificationTask(Base):
    __tablename__ = "scheduled_notification_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    target: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    employee_scope: Mapped[str | None] = mapped_column(String(20), nullable=True)
    admin_scope: Mapped[str | None] = mapped_column(String(20), nullable=True)
    employee_ids: Mapped[list[int]] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=False,
        default=list,
        server_default=text("'[]'"),
    )
    admin_user_ids: Mapped[list[int]] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=False,
        default=list,
        server_default=text("'[]'"),
    )
    schedule_kind: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    run_date_local: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    run_time_local: Mapped[time] = mapped_column(Time, nullable=False)
    timezone_name: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="Europe/Istanbul",
        server_default=text("'Europe/Istanbul'"),
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
        index=True,
    )
    last_enqueued_local_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    last_enqueued_at_utc: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_username: Mapped[str | None] = mapped_column(String(100), nullable=True)
    updated_by_username: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class AttendanceExtraCheckinApproval(Base):
    __tablename__ = "attendance_extra_checkin_approvals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_id: Mapped[int | None] = mapped_column(
        ForeignKey("devices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    local_day: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    approval_token: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="PENDING",
        server_default=text("'PENDING'"),
        index=True,
    )
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by_admin_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("admin_users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    approved_by_username: Mapped[str | None] = mapped_column(String(100), nullable=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consumed_by_event_id: Mapped[int | None] = mapped_column(
        ForeignKey("attendance_events.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    push_total_targets: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    push_sent: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    push_failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    last_push_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    employee: Mapped[Employee] = relationship("Employee")
    device: Mapped[Device | None] = relationship("Device")
    approved_by_admin_user: Mapped[AdminUser | None] = relationship("AdminUser")
    consumed_by_event: Mapped[AttendanceEvent | None] = relationship("AttendanceEvent")


class AdminDailyReportArchive(Base):
    __tablename__ = "admin_daily_report_archives"
    __table_args__ = (
        UniqueConstraint(
            "report_date",
            "department_id",
            "region_id",
            name="uq_admin_daily_report_archives_scope",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    report_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    region_id: Mapped[int | None] = mapped_column(
        ForeignKey("regions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    employee_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    employee_ids_index: Mapped[str | None] = mapped_column(Text, nullable=True)
    employee_names_index: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    department: Mapped[Department | None] = relationship()
    region: Mapped[Region | None] = relationship()


class AttendanceEvent(Base):
    __tablename__ = "attendance_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[AttendanceType] = mapped_column(
        Enum(AttendanceType, name="attendance_event_type"),
        nullable=False,
    )
    ts_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lon: Mapped[float | None] = mapped_column(Float, nullable=True)
    accuracy_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_status: Mapped[LocationStatus] = mapped_column(
        Enum(LocationStatus, name="attendance_location_status"),
        nullable=False,
    )
    flags: Mapped[dict[str, Any]] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=False,
        default=dict,
        server_default=text("'{}'"),
    )
    source: Mapped[AttendanceEventSource] = mapped_column(
        Enum(AttendanceEventSource, name="attendance_event_source"),
        nullable=False,
        default=AttendanceEventSource.DEVICE,
        server_default=text("'DEVICE'"),
    )
    created_by_admin: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by_admin: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )

    employee: Mapped[Employee] = relationship(back_populates="attendance_events")
    device: Mapped[Device] = relationship(back_populates="attendance_events")


class BreakEvent(Base):
    """Calisanin mola olayi (basla/bitir). Aylik puantaj planlanan molayi asan
    kismi plan ustu/FM1'den duser; ended_at NULL ise mola devam ediyor."""

    __tablename__ = "break_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    device_id: Mapped[int | None] = mapped_column(
        ForeignKey("devices.id", ondelete="SET NULL"), nullable=True
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Bu mola yuzunden gunluk limit asim uyarisi gonderildi mi (cift uyari engeli).
    over_limit_alerted: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )

    employee: Mapped[Employee] = relationship()

    __table_args__ = (
        Index("ix_break_event_employee_started", "employee_id", "started_at"),
    )


class PayrollRunStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    APPROVED = "APPROVED"


class CompensationBasis(str, enum.Enum):
    """Maas anlasma tabani: brut belli (GROSS) veya net garantili (NET)."""

    GROSS = "GROSS"
    NET = "NET"


class SgkStatus(str, enum.Enum):
    """Calisanin SGK statusu: NORMAL (4a) veya EMEKLI (SGDP'ye tabi)."""

    NORMAL = "NORMAL"
    EMEKLI = "EMEKLI"


class PayrollComponentKind(str, enum.Enum):
    """Manuel bordro kalemi turu: ek odeme (EARNING) veya ek kesinti (DEDUCTION)."""

    EARNING = "EARNING"
    DEDUCTION = "DEDUCTION"


class EmployeeCompensation(Base):
    """Calisanin aylik maasi; effective_from ile tarihsel (zam takibi).

    basis=GROSS ise anlasilan tutar gross_monthly'dedir. basis=NET ise calisanin
    eline gecmesi istenen net net_monthly'dedir ve brut her ay geri hesaplanir.
    """

    __tablename__ = "employee_compensations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    gross_monthly: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    basis: Mapped[CompensationBasis] = mapped_column(
        Enum(CompensationBasis, name="compensation_basis"),
        nullable=False,
        default=CompensationBasis.GROSS,
        server_default=text("'GROSS'"),
    )
    # basis=NET oldugunda anlasilan net; basis=GROSS'ta NULL.
    net_monthly: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    employee: Mapped[Employee] = relationship()

    __table_args__ = (
        UniqueConstraint("employee_id", "effective_from", name="uq_employee_comp_effective"),
    )


class EmployeePayrollProfile(Base):
    """Calisanin bordroya ozel kisisel/SGK bilgileri (Employee'den ayri tutulur)."""

    __tablename__ = "employee_payroll_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    sgk_status: Mapped[SgkStatus] = mapped_column(
        Enum(SgkStatus, name="sgk_status"),
        nullable=False,
        default=SgkStatus.NORMAL,
        server_default=text("'NORMAL'"),
    )
    # Kismi sureli (part-time): SGK gunu calisilan saat/7,5'tan hesaplanir.
    is_part_time: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    # Engellilik derecesi: 0 yok, 1/2/3 (1 en agir). GV matrah indirimi icin.
    disability_degree: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    tc_kimlik_no: Mapped[str | None] = mapped_column(String(11), nullable=True)
    sgk_sicil_no: Mapped[str | None] = mapped_column(String(40), nullable=True)
    ise_giris_tarihi: Mapped[date | None] = mapped_column(Date, nullable=True)
    cinsiyet: Mapped[str | None] = mapped_column(String(10), nullable=True)
    meslek_grubu: Mapped[str | None] = mapped_column(String(100), nullable=True)
    kanun_no: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Ozluk: sozlesme tipi (BELIRSIZ/BELIRLI), pozisyon/unvan, dogum, medeni hal, acil kisi.
    sozlesme_tipi: Mapped[str | None] = mapped_column(String(20), nullable=True)
    pozisyon: Mapped[str | None] = mapped_column(String(120), nullable=True)
    dogum_tarihi: Mapped[date | None] = mapped_column(Date, nullable=True)
    medeni_hal: Mapped[str | None] = mapped_column(String(20), nullable=True)
    acil_kisi_adi: Mapped[str | None] = mapped_column(String(120), nullable=True)
    acil_kisi_tel: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # Iletisim: sirket telefonu (dahili/is hatti) ve cep telefonu.
    sirket_telefonu: Mapped[str | None] = mapped_column(String(40), nullable=True)
    cep_telefonu: Mapped[str | None] = mapped_column(String(40), nullable=True)
    adres: Mapped[str | None] = mapped_column(String(500), nullable=True)
    banka_adi: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sube: Mapped[str | None] = mapped_column(String(100), nullable=True)
    hesap_no: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    employee: Mapped[Employee] = relationship()


class PayrollComponent(Base):
    """Calisan + ay bazli manuel bordro kalemi (prim, yol, yemek, avans, icra...).

    Run disinda tutulur; her kosumda ilgili (employee, year, month) kalemleri
    okunup hakedise katilir ve PayrollItem'a snapshot'lanir. EARNING tutari brute,
    DEDUCTION tutari netten dusulur. Istisna bayraklari hangi matrahlara girecegini
    belirler (orn. yol/yemek: SGK + gelir vergisi istisnali).
    """

    __tablename__ = "payroll_components"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[PayrollComponentKind] = mapped_column(
        Enum(PayrollComponentKind, name="payroll_component_kind"),
        nullable=False,
    )
    # Kategori kodu (PRIM, IKRAMIYE, YOL, YEMEK, AVANS, ICRA, BES, DIGER); serbest.
    code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # Aylik istisna tavani (yol/yemek): NULL ise tum tutar bayraklara gore. Tavan ustu vergiye tabi.
    exempt_limit: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    # EARNING istisna bayraklari: True ise ilgili matraha GIRMEZ. DEDUCTION'da netten duser.
    sgk_exempt: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    income_tax_exempt: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    stamp_tax_exempt: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    note: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    employee: Mapped[Employee] = relationship()

    __table_args__ = (
        Index("ix_payroll_component_period", "employee_id", "year", "month"),
    )


class CompanySettings(Base):
    """Firma bilgileri (bordro basligi icin); tek satir tutulur."""

    __tablename__ = "company_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    firma_unvan: Mapped[str | None] = mapped_column(String(255), nullable=True)
    merkez_adres: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sube_adres: Mapped[str | None] = mapped_column(String(500), nullable=True)
    vergi_dairesi: Mapped[str | None] = mapped_column(String(150), nullable=True)
    vergi_no: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ticaret_sicil_no: Mapped[str | None] = mapped_column(String(40), nullable=True)
    mersis_no: Mapped[str | None] = mapped_column(String(40), nullable=True)
    sgk_isyeri_no: Mapped[str | None] = mapped_column(String(40), nullable=True)
    internet_adresi: Mapped[str | None] = mapped_column(String(150), nullable=True)
    # --- Logo muhasebe mahsup fisi hesap kodlari (None ise export'ta TR varsayilan kullanilir) ---
    logo_hesap_ucret: Mapped[str | None] = mapped_column(String(40), nullable=True)
    logo_hesap_sgk_isveren: Mapped[str | None] = mapped_column(String(40), nullable=True)
    logo_hesap_net_odenecek: Mapped[str | None] = mapped_column(String(40), nullable=True)
    logo_hesap_odenecek_vergi: Mapped[str | None] = mapped_column(String(40), nullable=True)
    logo_hesap_odenecek_sgk: Mapped[str | None] = mapped_column(String(40), nullable=True)
    logo_hesap_personel_kesinti: Mapped[str | None] = mapped_column(String(40), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class PayrollParameter(Base):
    """Yil bazli bordro parametreleri; admin duzenler."""

    __tablename__ = "payroll_parameters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False, unique=True, index=True)
    # Aylik saat boleni: saat ucreti = brut aylik / bu deger (TR yaygin: 225 = 30 * 7.5).
    monthly_hours_divisor: Mapped[Decimal] = mapped_column(
        Numeric(7, 2),
        nullable=False,
        default=Decimal("225"),
        server_default=text("225"),
    )
    # FM carpanlari: FM1 normal gun fazla mesai, FM2 resmi/bayram, FM3 hafta tatili/pazar.
    overtime_multiplier_fm1: Mapped[Decimal] = mapped_column(
        Numeric(4, 2),
        nullable=False,
        default=Decimal("1.5"),
        server_default=text("1.5"),
    )
    overtime_multiplier_fm2: Mapped[Decimal] = mapped_column(
        Numeric(4, 2),
        nullable=False,
        default=Decimal("2"),
        server_default=text("2"),
    )
    overtime_multiplier_fm3: Mapped[Decimal] = mapped_column(
        Numeric(4, 2),
        nullable=False,
        default=Decimal("2"),
        server_default=text("2"),
    )
    # Eksik calisma dakikalari hakedisten dusulsun mu.
    deduct_missing_minutes: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    # --- Yasal kesinti parametreleri (TR) ---
    sgk_employee_rate: Mapped[Decimal] = mapped_column(
        Numeric(6, 4), nullable=False, default=Decimal("0.14"), server_default=text("0.14")
    )
    unemployment_employee_rate: Mapped[Decimal] = mapped_column(
        Numeric(6, 4), nullable=False, default=Decimal("0.01"), server_default=text("0.01")
    )
    sgk_employer_rate: Mapped[Decimal] = mapped_column(
        Numeric(6, 4), nullable=False, default=Decimal("0.2075"), server_default=text("0.2075")
    )
    unemployment_employer_rate: Mapped[Decimal] = mapped_column(
        Numeric(6, 4), nullable=False, default=Decimal("0.02"), server_default=text("0.02")
    )
    sgk_employer_incentive_rate: Mapped[Decimal] = mapped_column(
        Numeric(6, 4), nullable=False, default=Decimal("0.05"), server_default=text("0.05")
    )
    # Emekli (SGDP) oranlari: isci %7,5, isveren %22,5 (issizlik yok).
    sgdp_employee_rate: Mapped[Decimal] = mapped_column(
        Numeric(6, 4), nullable=False, default=Decimal("0.075"), server_default=text("0.075")
    )
    sgdp_employer_rate: Mapped[Decimal] = mapped_column(
        Numeric(6, 4), nullable=False, default=Decimal("0.225"), server_default=text("0.225")
    )
    apply_employer_incentive: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    sgk_base_monthly: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("33030"), server_default=text("33030")
    )
    sgk_ceiling_monthly: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("297270"), server_default=text("297270")
    )
    stamp_tax_rate: Mapped[Decimal] = mapped_column(
        Numeric(7, 5), nullable=False, default=Decimal("0.00759"), server_default=text("0.00759")
    )
    minimum_wage_gross: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("33030"), server_default=text("33030")
    )
    # Yil ortasi (Temmuz) asgari ucret zammi: NULL ise tum yil minimum_wage_gross gecerli.
    minimum_wage_gross_h2: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    # H2 asgari ucretin yururluge girdigi ay (1..12, varsayilan Temmuz).
    minimum_wage_h2_month: Mapped[int] = mapped_column(
        Integer, nullable=False, default=7, server_default=text("7")
    )
    # Engellilik (sakatlik) indirimi: derece bazli aylik GV matrah indirimi (TL).
    disability_degree1_monthly: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    disability_degree2_monthly: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    disability_degree3_monthly: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    # Kidem tazminati tavani (giydirilmis brut bu tutari asamaz). 0 = tavan yok.
    severance_ceiling_gross: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    # Kumulatif gelir vergisi dilimleri: [{"upTo": int|null, "rate": "0.15"}, ...]
    # upTo = kumulatif matrah ust esigi (TL); son dilim upTo=null.
    income_tax_brackets: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=False,
        default=list,
        server_default=text(
            "'[{\"upTo\": 190000, \"rate\": \"0.15\"}, "
            "{\"upTo\": 400000, \"rate\": \"0.20\"}, "
            "{\"upTo\": 1500000, \"rate\": \"0.27\"}, "
            "{\"upTo\": 5300000, \"rate\": \"0.35\"}, "
            "{\"upTo\": null, \"rate\": \"0.40\"}]'"
        ),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class PayrollRun(Base):
    """Bir ay icin uretilen bordro kosumu; APPROVED olunca degerleri donar."""

    __tablename__ = "payroll_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[PayrollRunStatus] = mapped_column(
        Enum(PayrollRunStatus, name="payroll_run_status"),
        nullable=False,
        default=PayrollRunStatus.DRAFT,
        server_default=text("'DRAFT'"),
    )
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    items: Mapped[list[PayrollItem]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint("year", "month", name="uq_payroll_run_period"),
    )


class PayrollItem(Base):
    """Tek calisanin tek aydaki hakedis kalemi; kosum aninda snapshot alinir."""

    __tablename__ = "payroll_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    payroll_run_id: Mapped[int] = mapped_column(
        ForeignKey("payroll_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    employee_name: Mapped[str] = mapped_column(String(255), nullable=False)
    department_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Snapshot girdileri
    gross_monthly: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    hourly_rate: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    worked_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fm1_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fm2_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    fm3_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    missing_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unpaid_leave_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Eksik IN/OUT olan gun sayisi; onay oncesi veri kalitesi uyarisi icin.
    incomplete_days: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Hesaplanan tutarlar
    base_earning: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    overtime_fm1_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    overtime_fm2_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    overtime_fm3_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    missing_deduction: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    unpaid_leave_deduction: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    gross_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    # --- Manuel kalemler (prim, yol, yemek, avans, icra...) snapshot ---
    additional_earnings: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    additional_deductions: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0")
    )
    # [{kind, code, label, amount, sgk_exempt, income_tax_exempt, stamp_tax_exempt}]
    components: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"),
        nullable=False,
        default=list,
        server_default=text("'[]'"),
    )
    # --- Yasal kesinti snapshot (brutten nete) ---
    compensation_basis: Mapped[CompensationBasis] = mapped_column(
        Enum(CompensationBasis, name="compensation_basis"),
        nullable=False,
        default=CompensationBasis.GROSS,
        server_default=text("'GROSS'"),
    )
    sgk_status: Mapped[SgkStatus] = mapped_column(
        Enum(SgkStatus, name="sgk_status"),
        nullable=False,
        default=SgkStatus.NORMAL,
        server_default=text("'NORMAL'"),
    )
    kanun_no: Mapped[str | None] = mapped_column(String(10), nullable=True)
    sgk_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30, server_default=text("30"))
    sgk_base: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    sgk_employee: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    unemployment_employee: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    income_tax_base: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    disability_reduction: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    cumulative_income_tax_base: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    income_tax_calculated: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    income_tax_exemption: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    income_tax_payable: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    stamp_tax_calculated: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    stamp_tax_exemption: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    stamp_tax_payable: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    net_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    # --- Isveren maliyeti ---
    sgk_employer: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    unemployment_employer: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    employer_incentive: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    employer_cost_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    run: Mapped[PayrollRun] = relationship(back_populates="items")


class AssistantConfig(Base):
    """Tek satirlik (id=1) AI asistan ayari. Anahtar UI'dan degistirilir; env fallback'tir."""

    __tablename__ = "assistant_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    api_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    base_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    enabled: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    updated_by: Mapped[str | None] = mapped_column(String(150), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )


class AssistantDailyUsage(Base):
    """Gunluk (yerel tarih) + model bazinda token kullanimi. Servis yeniden
    baslasa da kalan limit dogru gosterilsin diye kalici tutulur."""

    __tablename__ = "assistant_daily_usage"

    usage_date: Mapped[str] = mapped_column(String(10), primary_key=True)
    model: Mapped[str] = mapped_column(String(120), primary_key=True)
    total_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )


# --- Depojin (warehouse / stock-counting) entegrasyonu -----------------------------------
# Ported from the standalone "depojin" FastAPI app (backend/app/models.py). Depo identity is
# deliberately separate from both puantaj admin JWT auth and employee device-fingerprint auth
# (see CLAUDE.md). Table names are kept exactly as in depojin so the data-migration script
# (scripts/depo_veri_tasi.py) can map old rows onto these tables 1:1; class names are prefixed
# with Depo to avoid collisions with existing puantaj model classes (e.g. AuditLog already
# exists above).


class DepoUser(Base):
    __tablename__ = "depo_users"
    __table_args__ = (Index("ix_depo_user_aktif", "aktif"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    ad: Mapped[str] = mapped_column(String(80))
    pin_hash: Mapped[str] = mapped_column(String(200))
    rol: Mapped[str] = mapped_column(String(20), default="sayan")
    aktif: Mapped[bool] = mapped_column(Boolean, default=True)
    olusturma: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))
    employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL"), nullable=True
    )

    employee: Mapped["Employee | None"] = relationship()


class DepoDepo(Base):
    __tablename__ = "depolar"
    __table_args__ = (Index("ix_depo_depolar_aktif", "aktif"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    ad: Mapped[str] = mapped_column(String(120))
    lokasyon: Mapped[str | None] = mapped_column(String(80), nullable=True)
    aktif: Mapped[bool] = mapped_column(Boolean, default=True)
    olusturma: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))
    olusturan_id: Mapped[int | None] = mapped_column(ForeignKey("depo_users.id"), nullable=True)

    stoklar: Mapped[list["DepoStok"]] = relationship(back_populates="depo", cascade="all, delete-orphan")


class DepoStok(Base):
    __tablename__ = "depo_stoklari"
    __table_args__ = (
        UniqueConstraint("depo_id", "stok_kodu", name="uq_depostok_depo_kod"),
        Index("ix_depostok_depo", "depo_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    depo_id: Mapped[int] = mapped_column(ForeignKey("depolar.id"))
    stok_kodu: Mapped[str] = mapped_column(String(80))
    urun_adi: Mapped[str] = mapped_column(String(200))
    miktar: Mapped[int] = mapped_column(Integer, default=0)
    guncelleme: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"), onupdate=lambda: datetime.now(timezone.utc)
    )

    depo: Mapped[DepoDepo] = relationship(back_populates="stoklar")


class SayimOturumu(Base):
    __tablename__ = "sayim_oturumlari"

    id: Mapped[int] = mapped_column(primary_key=True)
    ad: Mapped[str] = mapped_column(String(120))
    lokasyon: Mapped[str | None] = mapped_column(String(80), nullable=True)
    durum: Mapped[str] = mapped_column(String(20), default="aktif")
    mod: Mapped[str] = mapped_column(String(20), default="seri")
    baslangic: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))
    bitis: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    olusturan_id: Mapped[int | None] = mapped_column(ForeignKey("depo_users.id"), nullable=True)
    depo_id: Mapped[int | None] = mapped_column(ForeignKey("depolar.id"), nullable=True)

    stoklar: Mapped[list["DepoSayimStok"]] = relationship(back_populates="oturum", cascade="all, delete-orphan")
    taramalar: Mapped[list["DepoTaramaLog"]] = relationship(back_populates="oturum", cascade="all, delete-orphan")
    depo: Mapped[DepoDepo | None] = relationship()

    @property
    def depo_ad(self) -> str | None:
        return self.depo.ad if self.depo else None


class DepoSayimStok(Base):
    __tablename__ = "stoklar"
    __table_args__ = (
        UniqueConstraint("oturum_id", "stok_kodu", name="uq_stok_oturum_kod"),
        Index("ix_stok_oturum", "oturum_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    oturum_id: Mapped[int] = mapped_column(ForeignKey("sayim_oturumlari.id"))
    stok_kodu: Mapped[str] = mapped_column(String(80))
    urun_adi: Mapped[str] = mapped_column(String(200))
    portal_sayim: Mapped[int] = mapped_column(Integer, default=0)
    sonradan_eklendi: Mapped[bool] = mapped_column(Boolean, default=False)
    olusturma: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))

    oturum: Mapped[SayimOturumu] = relationship(back_populates="stoklar")
    seriler: Mapped[list["DepoSeri"]] = relationship(back_populates="stok", cascade="all, delete-orphan")


class DepoSeri(Base):
    __tablename__ = "seriler"
    __table_args__ = (
        UniqueConstraint("oturum_id", "stok_id", "seri_no", name="uq_seri_oturum_stok_no"),
        UniqueConstraint("depo_id", "seri_no_norm", name="uq_seri_depo_norm"),
        Index("ix_seri_oturum_norm", "oturum_id", "seri_no_norm"),
        Index("ix_seri_depo_norm", "depo_id", "seri_no_norm"),
        Index("ix_seri_sayan", "sayan_id"),
        Index("ix_seri_zimmet_kullanici", "zimmet_kullanici_id"),
        Index("ix_seri_zimmet_employee", "zimmet_employee_id"),
        Index("ix_seri_stok", "stok_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    oturum_id: Mapped[int] = mapped_column(ForeignKey("sayim_oturumlari.id"))
    stok_id: Mapped[int] = mapped_column(ForeignKey("stoklar.id"))
    depo_id: Mapped[int | None] = mapped_column(ForeignKey("depolar.id"), nullable=True)
    seri_no: Mapped[str] = mapped_column(String(120))
    seri_no_norm: Mapped[str] = mapped_column(String(120))
    sayildi: Mapped[bool] = mapped_column(Boolean, default=False)
    sayim_tarihi: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sayan_id: Mapped[int | None] = mapped_column(ForeignKey("depo_users.id"), nullable=True)
    notlar: Mapped[str | None] = mapped_column(Text, nullable=True)
    sonradan_eklendi: Mapped[bool] = mapped_column(Boolean, default=False)

    cikis_zaman: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cikis_kullanici_id: Mapped[int | None] = mapped_column(ForeignKey("depo_users.id"), nullable=True)
    cikis_notu: Mapped[str | None] = mapped_column(Text, nullable=True)

    zimmet_kullanici_id: Mapped[int | None] = mapped_column(ForeignKey("depo_users.id"), nullable=True)
    zimmet_employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL"), nullable=True
    )
    zimmet_zaman: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    zimmet_notu: Mapped[str | None] = mapped_column(Text, nullable=True)

    stok: Mapped[DepoSayimStok] = relationship(back_populates="seriler")
    sayan: Mapped[DepoUser | None] = relationship(foreign_keys=[sayan_id])


class DepoZimmetHareketi(Base):
    __tablename__ = "depo_zimmet_hareketleri"
    __table_args__ = (
        Index("ix_depo_zimmet_hareket_seri_zaman", "seri_id", "zaman"),
        Index("ix_depo_zimmet_hareket_employee_zaman", "employee_id", "zaman"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    seri_id: Mapped[int] = mapped_column(ForeignKey("seriler.id", ondelete="CASCADE"), nullable=False)
    islem: Mapped[str] = mapped_column(String(20), nullable=False)
    onceki_employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL"), nullable=True
    )
    employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id", ondelete="SET NULL"), nullable=True
    )
    employee_ad: Mapped[str | None] = mapped_column(String(255), nullable=True)
    yapan_depo_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("depo_users.id", ondelete="SET NULL"), nullable=True
    )
    zaman: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    notu: Mapped[str | None] = mapped_column(Text, nullable=True)


class DepoTaramaLog(Base):
    __tablename__ = "tarama_loglari"
    __table_args__ = (
        UniqueConstraint(
            "oturum_id",
            "kullanici_id",
            "client_scan_id",
            name="uq_log_oturum_user_client_scan",
        ),
        Index("ix_log_oturum_zaman", "oturum_id", "zaman"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    oturum_id: Mapped[int] = mapped_column(ForeignKey("sayim_oturumlari.id"))
    zaman: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))
    kullanici_id: Mapped[int | None] = mapped_column(ForeignKey("depo_users.id"), nullable=True)
    seri_giris: Mapped[str] = mapped_column(String(160))
    durum: Mapped[str] = mapped_column(String(20))
    stok_kodu: Mapped[str | None] = mapped_column(String(80), nullable=True)
    urun_adi: Mapped[str | None] = mapped_column(String(200), nullable=True)
    aciklama: Mapped[str | None] = mapped_column(Text, nullable=True)
    client_scan_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    istek_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    sonuc_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    oturum: Mapped[SayimOturumu] = relationship(back_populates="taramalar")
    kullanici: Mapped[DepoUser | None] = relationship()


class DepoAuditLog(Base):
    __tablename__ = "depo_audit_loglari"
    __table_args__ = (
        Index("ix_depo_audit_zaman", "zaman"),
        Index("ix_depo_audit_kullanici", "kullanici_id"),
        Index("ix_depo_audit_kaynak", "kaynak_tip", "kaynak_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    zaman: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))
    kullanici_id: Mapped[int | None] = mapped_column(ForeignKey("depo_users.id"), nullable=True)
    kullanici_ad: Mapped[str | None] = mapped_column(String(80), nullable=True)
    eylem: Mapped[str] = mapped_column(String(60))
    kaynak_tip: Mapped[str | None] = mapped_column(String(40), nullable=True)
    kaynak_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    detay: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class DepoLoginDeneme(Base):
    __tablename__ = "depo_login_denemeleri"
    __table_args__ = (Index("ix_depo_login_ad_zaman", "ad", "zaman"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    ad: Mapped[str] = mapped_column(String(80))
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    basarili: Mapped[bool] = mapped_column(Boolean, default=False)
    zaman: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("CURRENT_TIMESTAMP"))


