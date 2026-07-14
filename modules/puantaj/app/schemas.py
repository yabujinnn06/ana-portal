import re
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import (
    AttendanceEventSource,
    AttendanceType,
    AuditActorType,
    CompensationBasis,
    SgkStatus,
    EmployeeConversationCategory,
    EmployeeConversationStatus,
    GeofenceStatus,
    LeaveStatus,
    LeaveType,
    LocationEventSource,
    LocationStatus,
    LocationTrustStatus,
    OvertimeCode,
    OvertimeRoundingMode,
    PayrollComponentKind,
    PayrollRunStatus,
    QRCodeType,
    SchedulePlanTargetType,
    SpecialDayType,
    SpecialDayWorkPolicy,
)

_CASUAL_MESSAGE_PATTERN = re.compile(r"\b(amk|mk|knk|kanka|abi|lol|slm|mrb|nbr|naber)\b", re.IGNORECASE)
_EMOJI_PATTERN = re.compile(r"[\U0001F300-\U0001FAFF]")


def _normalize_subject(value: str) -> str:
    normalized = " ".join((value or "").strip().split())
    if len(normalized) < 6:
        raise ValueError("subject must contain at least 6 characters")
    return normalized


def _normalize_corporate_message(value: str, *, min_length: int = 12) -> str:
    normalized = (value or "").strip()
    if len(normalized) < min_length:
        raise ValueError(f"message must contain at least {min_length} characters")
    if _CASUAL_MESSAGE_PATTERN.search(normalized) or _EMOJI_PATTERN.search(normalized):
        raise ValueError("message must use a formal work-focused tone")
    if normalized.count("!") > 2:
        raise ValueError("message must use a formal work-focused tone")
    return normalized


class RegionCreate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    is_active: bool = True


class RegionUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    is_active: bool = True


class RegionRead(BaseModel):
    id: int
    name: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DepartmentCreate(BaseModel):
    name: str
    region_id: int | None = Field(default=None, ge=1)


class DepartmentUpdate(BaseModel):
    name: str
    region_id: int | None = Field(default=None, ge=1)


class DepartmentRead(BaseModel):
    id: int
    name: str
    region_id: int | None = None
    region_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class EmployeeCreate(BaseModel):
    full_name: str
    region_id: int | None = Field(default=None, ge=1)
    department_id: int | None = None
    shift_id: int | None = None
    is_active: bool = True
    contract_weekly_minutes: int | None = Field(default=None, ge=1)


class EmployeeRead(BaseModel):
    id: int
    full_name: str
    region_id: int | None
    region_name: str | None = None
    department_id: int | None
    shift_id: int | None
    is_active: bool
    contract_weekly_minutes: int | None
    device_count: int | None = None
    active_device_count: int | None = None

    model_config = ConfigDict(from_attributes=True)


class EmployeeDeviceDetailRead(BaseModel):
    id: int
    device_fingerprint: str
    is_active: bool
    created_at: datetime
    last_attendance_ts_utc: datetime | None = None
    last_seen_ip: str | None = None
    last_seen_action: str | None = None
    last_seen_at_utc: datetime | None = None


class EmployeePortalActivityRead(BaseModel):
    ts_utc: datetime
    action: str
    ip: str | None = None
    user_agent: str | None = None


class EmployeeIpSummaryRead(BaseModel):
    ip: str
    last_seen_at_utc: datetime
    last_action: str
    last_lat: float | None = None
    last_lon: float | None = None
    last_accuracy_m: float | None = None
    last_location_status: LocationStatus | None = None
    last_location_ts_utc: datetime | None = None


class EmployeeLiveLocationRead(BaseModel):
    lat: float
    lon: float
    accuracy_m: float | None = None
    ts_utc: datetime
    location_status: LocationStatus
    event_type: AttendanceType
    device_id: int


LocationMonitorPointSource = Literal[
    "CHECKIN",
    "CHECKOUT",
    "APP_OPEN",
    "APP_CLOSE",
    "DEMO_START",
    "DEMO_END",
    "LOCATION_PING",
    "LAST_LOCATION",
]


class LocationMonitorPrivacyRead(BaseModel):
    exact_coordinates: bool = True
    ip_visible: bool = True
    device_visible: bool = True


class LocationMonitorInsightRead(BaseModel):
    code: str
    severity: Literal["info", "warning", "critical"]
    title: str
    message: str
    value: float | int | None = None


class LocationMonitorGeofenceRead(BaseModel):
    home_lat: float | None = None
    home_lon: float | None = None
    radius_m: int | None = None
    status: GeofenceStatus = GeofenceStatus.UNKNOWN
    distance_m: float | None = None


class LocationMonitorRouteStatsRead(BaseModel):
    total_distance_m: float = 0
    total_duration_minutes: int = 0
    event_count: int = 0
    simplified_point_count: int = 0
    repeated_group_count: int = 0
    suspicious_jump_count: int = 0
    low_accuracy_event_count: int = 0
    dwell_stop_count: int = 0


class LocationMonitorRepeatedPointRead(BaseModel):
    id: str
    lat: float
    lon: float
    point_count: int = 0
    dwell_minutes: int = 0
    label: str


class LocationMonitorMapPointRead(BaseModel):
    id: str
    day: date
    source: LocationMonitorPointSource
    lat: float
    lon: float
    accuracy_m: float | None = None
    ts_utc: datetime
    label: str
    location_status: LocationStatus | None = None
    device_id: int | None = None
    ip: str | None = None
    geofence_status: GeofenceStatus | None = None
    trust_status: LocationTrustStatus | None = None
    trust_score: int | None = None
    provider: str | None = None
    speed_mps: float | None = None
    heading_deg: float | None = None
    altitude_m: float | None = None
    is_mocked: bool | None = None
    battery_level: float | None = None
    network_type: str | None = None
    marker_kind: Literal["START", "END", "EVENT", "LAST", "DWELL", "JUMP"] = "EVENT"


class LocationMonitorTimelineEventRead(BaseModel):
    id: str
    ts_utc: datetime
    day: date
    source: LocationEventSource
    label: str
    lat: float | None = None
    lon: float | None = None
    accuracy_m: float | None = None
    location_status: LocationStatus | None = None
    geofence_status: GeofenceStatus | None = None
    trust_status: LocationTrustStatus | None = None
    trust_score: int | None = None
    device_id: int | None = None
    ip: str | None = None
    provider: str | None = None
    speed_mps: float | None = None
    heading_deg: float | None = None
    altitude_m: float | None = None
    is_mocked: bool | None = None
    battery_level: float | None = None
    network_type: str | None = None
    flags: dict[str, Any] = Field(default_factory=dict)


class LocationMonitorRangeTotalsRead(BaseModel):
    worked_minutes: int = 0
    overtime_minutes: int = 0
    plan_overtime_minutes: int = 0
    legal_overtime_minutes: int = 0
    overtime_day_count: int = 0


class LocationMonitorEmployeeSummaryRead(BaseModel):
    employee: EmployeeRead
    department_name: str | None = None
    region_name: str | None = None
    shift_name: str | None = None
    today_status: Literal["NOT_STARTED", "IN_PROGRESS", "FINISHED"] = "NOT_STARTED"
    worked_today_minutes: int = 0
    weekly_total_minutes: int = 0
    active_devices: int = 0
    total_devices: int = 0
    recent_ip: str | None = None
    last_activity_utc: datetime | None = None
    last_portal_seen_utc: datetime | None = None
    last_checkin_utc: datetime | None = None
    last_checkout_utc: datetime | None = None
    last_app_open_utc: datetime | None = None
    last_app_close_utc: datetime | None = None
    last_demo_start_utc: datetime | None = None
    last_demo_end_utc: datetime | None = None
    location_label: str | None = None
    latest_location: LocationMonitorMapPointRead | None = None
    last_location_status: LocationStatus | None = None
    last_geofence_status: GeofenceStatus | None = None
    last_trust_status: LocationTrustStatus | None = None
    last_trust_score: int | None = None
    last_accuracy_m: float | None = None
    last_device_id: int | None = None
    last_provider: str | None = None


class LocationMonitorDayRecordRead(BaseModel):
    date: date
    status: Literal["OK", "INCOMPLETE", "LEAVE", "OFF"]
    check_in: datetime | None = None
    check_out: datetime | None = None
    worked_minutes: int = 0
    overtime_minutes: int = 0
    plan_overtime_minutes: int = 0
    legal_overtime_minutes: int = 0
    first_app_open_utc: datetime | None = None
    last_app_close_utc: datetime | None = None
    first_demo_start_utc: datetime | None = None
    last_demo_end_utc: datetime | None = None
    check_in_point: LocationMonitorMapPointRead | None = None
    check_out_point: LocationMonitorMapPointRead | None = None
    first_app_open_point: LocationMonitorMapPointRead | None = None
    last_app_close_point: LocationMonitorMapPointRead | None = None
    first_demo_start_point: LocationMonitorMapPointRead | None = None
    last_demo_end_point: LocationMonitorMapPointRead | None = None
    last_location_point: LocationMonitorMapPointRead | None = None
    suspicious_jump_count: int = 0
    low_accuracy_count: int = 0
    outside_geofence_count: int = 0
    event_count: int = 0
    distance_m: float | None = None
    point_count: int = 0


class LocationMonitorSummaryResponse(BaseModel):
    generated_at_utc: datetime
    summary: LocationMonitorEmployeeSummaryRead
    insights: list[LocationMonitorInsightRead] = Field(default_factory=list)
    geofence: LocationMonitorGeofenceRead | None = None
    privacy: LocationMonitorPrivacyRead = Field(default_factory=LocationMonitorPrivacyRead)


class LocationMonitorTimelineResponse(BaseModel):
    generated_at_utc: datetime
    start_date: date
    end_date: date
    days: list[LocationMonitorDayRecordRead] = Field(default_factory=list)
    events: list[LocationMonitorTimelineEventRead] = Field(default_factory=list)
    insights: list[LocationMonitorInsightRead] = Field(default_factory=list)
    totals: LocationMonitorRangeTotalsRead


class LocationMonitorMapResponse(BaseModel):
    generated_at_utc: datetime
    start_date: date
    end_date: date
    points: list[LocationMonitorMapPointRead] = Field(default_factory=list)
    simplified_points: list[LocationMonitorMapPointRead] = Field(default_factory=list)
    repeated_groups: list[LocationMonitorRepeatedPointRead] = Field(default_factory=list)
    route_stats: LocationMonitorRouteStatsRead = Field(default_factory=LocationMonitorRouteStatsRead)
    geofence: LocationMonitorGeofenceRead | None = None
    privacy: LocationMonitorPrivacyRead = Field(default_factory=LocationMonitorPrivacyRead)


class LocationMonitorEmployeeTimelineResponse(BaseModel):
    generated_at_utc: datetime
    start_date: date
    end_date: date
    summary: LocationMonitorEmployeeSummaryRead
    totals: LocationMonitorRangeTotalsRead
    days: list[LocationMonitorDayRecordRead] = Field(default_factory=list)
    map_points: list[LocationMonitorMapPointRead] = Field(default_factory=list)
    simplified_map_points: list[LocationMonitorMapPointRead] = Field(default_factory=list)
    timeline_events: list[LocationMonitorTimelineEventRead] = Field(default_factory=list)
    insights: list[LocationMonitorInsightRead] = Field(default_factory=list)
    route_stats: LocationMonitorRouteStatsRead = Field(default_factory=LocationMonitorRouteStatsRead)
    repeated_groups: list[LocationMonitorRepeatedPointRead] = Field(default_factory=list)
    geofence: LocationMonitorGeofenceRead | None = None
    privacy: LocationMonitorPrivacyRead = Field(default_factory=LocationMonitorPrivacyRead)


class EmployeeDetailResponse(BaseModel):
    employee: EmployeeRead
    last_portal_seen_utc: datetime | None = None
    recent_ips: list[str] = Field(default_factory=list)
    ip_summary: list[EmployeeIpSummaryRead] = Field(default_factory=list)
    devices: list[EmployeeDeviceDetailRead] = Field(default_factory=list)
    latest_location: EmployeeLiveLocationRead | None = None
    first_location: EmployeeLiveLocationRead | None = None
    recent_locations: list[EmployeeLiveLocationRead] = Field(default_factory=list)
    home_location: "EmployeeLocationRead | None" = None
    recent_activity: list[EmployeePortalActivityRead] = Field(default_factory=list)


class DashboardEmployeeMonthMetricsRead(BaseModel):
    year: int
    month: int
    worked_minutes: int
    plan_overtime_minutes: int = 0
    extra_work_minutes: int
    overtime_minutes: int
    incomplete_days: int


class DashboardEmployeeLastEventRead(BaseModel):
    event_id: int
    event_type: AttendanceType
    ts_utc: datetime
    location_status: LocationStatus
    device_id: int
    lat: float | None = None
    lon: float | None = None
    accuracy_m: float | None = None


class DashboardEmployeeSnapshotRead(BaseModel):
    employee: EmployeeRead
    today_status: Literal["NOT_STARTED", "IN_PROGRESS", "FINISHED"] = "NOT_STARTED"
    total_devices: int = 0
    active_devices: int = 0
    devices: list[EmployeeDeviceDetailRead] = Field(default_factory=list)
    current_month: DashboardEmployeeMonthMetricsRead
    previous_month: DashboardEmployeeMonthMetricsRead
    last_event: DashboardEmployeeLastEventRead | None = None
    latest_location: EmployeeLiveLocationRead | None = None
    generated_at_utc: datetime


class ControlRoomEmployeeAlertRead(BaseModel):
    code: str
    label: str
    severity: Literal["info", "warning", "critical"] = "info"


class ControlRoomTooltipRead(BaseModel):
    title: str
    body: str


class ControlRoomRiskFactorRead(BaseModel):
    code: str
    label: str
    value: str
    impact_score: int
    description: str


class ControlRoomMeasureRead(BaseModel):
    action_type: Literal["SUSPEND", "DISABLE_TEMP", "REVIEW", "RISK_OVERRIDE"]
    label: str
    reason: str
    note: str
    duration_days: int | None = None
    expires_at: datetime | None = None
    created_at: datetime
    created_by: str
    ip: str | None = None
    override_score: int | None = None


class ControlRoomNoteRead(BaseModel):
    note: str
    created_at: datetime
    created_by: str
    ip: str | None = None


class ControlRoomAuditEntryRead(BaseModel):
    audit_id: int
    action: str
    label: str
    ts_utc: datetime
    actor_id: str
    ip: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class ControlRoomEmployeeStateRead(BaseModel):
    employee: EmployeeRead
    department_name: str | None = None
    shift_name: str | None = None
    shift_window_label: str | None = None
    today_status: Literal["NOT_STARTED", "IN_PROGRESS", "FINISHED"] = "NOT_STARTED"
    location_state: Literal["LIVE", "STALE", "DORMANT", "NONE"] = "NONE"
    last_event: DashboardEmployeeLastEventRead | None = None
    last_checkin_utc: datetime | None = None
    last_checkout_utc: datetime | None = None
    latest_location: EmployeeLiveLocationRead | None = None
    last_portal_seen_utc: datetime | None = None
    last_activity_utc: datetime | None = None
    recent_ip: str | None = None
    location_label: str | None = None
    active_devices: int = 0
    total_devices: int = 0
    current_month: DashboardEmployeeMonthMetricsRead
    worked_today_minutes: int = 0
    weekly_total_minutes: int = 0
    violation_count_7d: int = 0
    risk_score: int = 0
    risk_status: Literal["NORMAL", "WATCH", "CRITICAL"] = "NORMAL"
    absence_minutes_7d: int = 0
    active_measure: ControlRoomMeasureRead | None = None
    latest_note: ControlRoomNoteRead | None = None
    attention_flags: list[ControlRoomEmployeeAlertRead] = Field(default_factory=list)
    tooltip_items: list[ControlRoomTooltipRead] = Field(default_factory=list)
    risk_factors: list[ControlRoomRiskFactorRead] = Field(default_factory=list)


class ControlRoomMapPointRead(BaseModel):
    employee_id: int
    employee_name: str
    department_name: str | None = None
    lat: float
    lon: float
    ts_utc: datetime
    accuracy_m: float | None = None
    today_status: Literal["NOT_STARTED", "IN_PROGRESS", "FINISHED"] = "NOT_STARTED"
    location_state: Literal["LIVE", "STALE", "DORMANT", "NONE"] = "NONE"
    label: str


class ControlRoomRecentEventRead(BaseModel):
    event_id: int
    employee_id: int
    employee_name: str
    department_name: str | None = None
    event_type: AttendanceType
    ts_utc: datetime
    location_status: LocationStatus
    device_id: int
    lat: float | None = None
    lon: float | None = None
    accuracy_m: float | None = None


class ControlRoomTrendPointRead(BaseModel):
    label: str
    value: int


class ControlRoomHistogramBucketRead(BaseModel):
    label: str
    min_score: int
    max_score: int
    count: int


class ControlRoomDepartmentMetricRead(BaseModel):
    department_name: str
    employee_count: int
    average_checkin_minutes: int | None = None
    late_rate_percent: float = 0
    average_active_minutes: int = 0


class ControlRoomRiskFormulaItemRead(BaseModel):
    code: str
    label: str
    max_score: int
    description: str


class ControlRoomActiveFiltersRead(BaseModel):
    q: str | None = None
    region_id: int | None = None
    department_id: int | None = None
    start_date: date | None = None
    end_date: date | None = None
    map_date: date | None = None
    include_inactive: bool = False
    risk_min: int | None = None
    risk_max: int | None = None
    risk_status: Literal["NORMAL", "WATCH", "CRITICAL"] | None = None
    sort_by: str = "risk_score"
    sort_dir: Literal["asc", "desc"] = "desc"
    limit: int = 24
    offset: int = 0


class ControlRoomSummaryRead(BaseModel):
    total_employees: int = 0
    active_employees: int = 0
    not_started_count: int = 0
    in_progress_count: int = 0
    finished_count: int = 0
    normal_count: int = 0
    watch_count: int = 0
    critical_count: int = 0
    average_risk_score: float = 0
    active_overtime_count: int = 0
    daily_violation_count: int = 0
    system_status: Literal["HEALTHY", "ATTENTION", "CRITICAL"] = "HEALTHY"
    average_checkin_minutes: int | None = None
    late_rate_percent: float = 0
    average_active_minutes: int = 0
    most_common_violation_window: str | None = None
    risk_histogram: list[ControlRoomHistogramBucketRead] = Field(default_factory=list)
    weekly_trend: list[ControlRoomTrendPointRead] = Field(default_factory=list)
    department_metrics: list[ControlRoomDepartmentMetricRead] = Field(default_factory=list)


class ControlRoomOverviewResponse(BaseModel):
    generated_at_utc: datetime
    total: int = 0
    offset: int = 0
    limit: int = 0
    summary: ControlRoomSummaryRead
    active_filters: ControlRoomActiveFiltersRead
    risk_formula: list[ControlRoomRiskFormulaItemRead] = Field(default_factory=list)
    items: list[ControlRoomEmployeeStateRead] = Field(default_factory=list)
    map_points: list[ControlRoomMapPointRead] = Field(default_factory=list)
    recent_events: list[ControlRoomRecentEventRead] = Field(default_factory=list)


class ControlRoomEmployeeDetailResponse(BaseModel):
    generated_at_utc: datetime
    employee_state: ControlRoomEmployeeStateRead
    risk_history: list[ControlRoomTrendPointRead] = Field(default_factory=list)
    risk_formula: list[ControlRoomRiskFormulaItemRead] = Field(default_factory=list)
    recent_measures: list[ControlRoomMeasureRead] = Field(default_factory=list)
    recent_notes: list[ControlRoomNoteRead] = Field(default_factory=list)
    recent_audit_entries: list[ControlRoomAuditEntryRead] = Field(default_factory=list)


CONTROL_ROOM_DEFAULT_REASON_MAP: dict[str, str] = {
    "REVIEW": "Operasyon dosyasi uzerinden manuel inceleme baslatildi.",
    "DISABLE_TEMP": "Calisan kaydi gecici olarak devre disi birakildi.",
    "SUSPEND": "Calisan kaydi operasyonel inceleme nedeniyle askiya alindi.",
    "RISK_OVERRIDE": "Risk skoru manuel olarak override edildi.",
}

CONTROL_ROOM_DEFAULT_NOTE_MAP: dict[str, str] = {
    "REVIEW": "Operasyon dosyasinda inceleme akisi baslatildi.",
    "DISABLE_TEMP": "Gecici devre disi islemi operasyon panelinden kaydedildi.",
    "SUSPEND": "Askiya alma islemi operasyon panelinden kaydedildi.",
    "RISK_OVERRIDE": "Risk override islemi operasyon panelinden kaydedildi.",
    "NOTE": "Operasyon dosyasina admin notu eklendi.",
}


def _normalize_control_room_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


class ControlRoomEmployeeActionRequest(BaseModel):
    employee_id: int = Field(ge=1)
    action_type: Literal["SUSPEND", "DISABLE_TEMP", "REVIEW"]
    reason: str | None = Field(default=None, max_length=255)
    note: str | None = Field(default=None, max_length=1000)
    duration_days: Literal[1, 3, 7] | None = None
    indefinite: bool = False

    @model_validator(mode="after")
    def validate_duration(self) -> "ControlRoomEmployeeActionRequest":
        self.reason = _normalize_control_room_text(self.reason) or CONTROL_ROOM_DEFAULT_REASON_MAP[self.action_type]
        self.note = _normalize_control_room_text(self.note) or CONTROL_ROOM_DEFAULT_NOTE_MAP[self.action_type]
        if self.indefinite and self.duration_days is not None:
            raise ValueError("duration_days must be empty when indefinite is true")
        if not self.indefinite and self.duration_days is None:
            raise ValueError("duration_days is required unless indefinite is true")
        return self


class ControlRoomRiskOverrideRequest(BaseModel):
    employee_id: int = Field(ge=1)
    override_score: int = Field(ge=0, le=100)
    reason: str | None = Field(default=None, max_length=255)
    note: str | None = Field(default=None, max_length=1000)
    duration_days: Literal[1, 3, 7] | None = None
    indefinite: bool = False

    @model_validator(mode="after")
    def validate_duration(self) -> "ControlRoomRiskOverrideRequest":
        self.reason = _normalize_control_room_text(self.reason) or CONTROL_ROOM_DEFAULT_REASON_MAP["RISK_OVERRIDE"]
        self.note = _normalize_control_room_text(self.note) or CONTROL_ROOM_DEFAULT_NOTE_MAP["RISK_OVERRIDE"]
        if self.indefinite and self.duration_days is not None:
            raise ValueError("duration_days must be empty when indefinite is true")
        if not self.indefinite and self.duration_days is None:
            raise ValueError("duration_days is required unless indefinite is true")
        return self


class ControlRoomNoteCreateRequest(BaseModel):
    employee_id: int = Field(ge=1)
    note: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_note(self) -> "ControlRoomNoteCreateRequest":
        self.note = _normalize_control_room_text(self.note) or CONTROL_ROOM_DEFAULT_NOTE_MAP["NOTE"]
        return self


class ControlRoomFilterAuditRequest(BaseModel):
    filters: dict[str, Any] = Field(default_factory=dict)
    total_results: int | None = Field(default=None, ge=0)


class ControlRoomMutationResponse(BaseModel):
    ok: bool
    message: str
    expires_at: datetime | None = None


class EmployeeActiveUpdateRequest(BaseModel):
    is_active: bool


class EmployeeShiftUpdateRequest(BaseModel):
    shift_id: int | None = Field(default=None, ge=1)


class EmployeeDepartmentUpdateRequest(BaseModel):
    department_id: int | None = Field(default=None, ge=1)


class EmployeeRegionUpdateRequest(BaseModel):
    region_id: int | None = Field(default=None, ge=1)


class EmployeeProfileUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    department_id: int | None = Field(default=None, ge=1)


class DeviceActiveUpdateRequest(BaseModel):
    is_active: bool


class DeviceCreate(BaseModel):
    employee_id: int
    device_fingerprint: str
    is_active: bool = True


class DeviceRead(BaseModel):
    id: int
    employee_id: int
    device_fingerprint: str
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RecoveryCodeAdminEntry(BaseModel):
    code: str
    status: Literal["ACTIVE", "USED_OR_EXPIRED"]


class EmployeeDeviceOverviewDevice(BaseModel):
    id: int
    device_fingerprint: str
    is_active: bool
    created_at: datetime
    recovery_ready: bool = False
    recovery_code_active_count: int = 0
    recovery_expires_at: datetime | None = None
    recovery_pin_updated_at: datetime | None = None
    recovery_pin_plain: str | None = None
    recovery_code_entries: list[RecoveryCodeAdminEntry] = Field(default_factory=list)


class EmployeeDeviceOverviewRead(BaseModel):
    employee_id: int
    employee_name: str
    region_id: int | None = None
    region_name: str | None = None
    department_id: int | None
    department_name: str | None
    is_employee_active: bool
    total_devices: int = 0
    active_devices: int = 0
    shown_devices: int = 0
    has_more_devices: bool = False
    token_total: int
    token_used: int
    token_pending: int
    token_expired: int
    devices: list[EmployeeDeviceOverviewDevice] = Field(default_factory=list)


class DeviceInviteCreateRequest(BaseModel):
    employee_id: int | None = Field(default=None, ge=1)
    employee_name: str | None = Field(default=None, min_length=2, max_length=255)
    expires_in_minutes: int = Field(ge=1, le=60 * 24 * 30)

    @model_validator(mode="after")
    def _validate_target(self) -> "DeviceInviteCreateRequest":
        normalized_name = (self.employee_name or "").strip()
        if self.employee_id is None and not normalized_name:
            raise ValueError("Either employee_id or employee_name is required.")
        if self.employee_id is not None and normalized_name:
            raise ValueError("Provide employee_id or employee_name, not both.")
        if self.employee_name is not None:
            self.employee_name = normalized_name
        return self


class DeviceInviteBulkExportRequest(BaseModel):
    employee_ids: list[int] = Field(min_length=1, max_length=500)
    expires_in_minutes: int = Field(default=60 * 24, ge=1, le=60 * 24 * 30)

    @model_validator(mode="after")
    def _normalize_employee_ids(self) -> "DeviceInviteBulkExportRequest":
        normalized_ids: list[int] = []
        seen_ids: set[int] = set()
        for employee_id in self.employee_ids:
            if employee_id < 1:
                raise ValueError("employee_ids must contain positive integers.")
            if employee_id in seen_ids:
                continue
            seen_ids.add(employee_id)
            normalized_ids.append(employee_id)
        self.employee_ids = normalized_ids
        return self


class DeviceInviteCreateResponse(BaseModel):
    token: str
    invite_url: str = Field(
        description="Employee portal claim URL, e.g. https://domain.com/employee/claim?token=...",
    )


class DeviceClaimRequest(BaseModel):
    token: str
    device_fingerprint: str


class DeviceClaimResponse(BaseModel):
    ok: bool
    employee_id: int
    device_id: int


class PasskeyRegisterOptionsRequest(BaseModel):
    device_fingerprint: str


class PasskeyRegisterOptionsResponse(BaseModel):
    challenge_id: int
    expires_at: datetime
    options: dict[str, Any]


class PasskeyRegisterVerifyRequest(BaseModel):
    challenge_id: int
    credential: dict[str, Any]


class PasskeyRegisterVerifyResponse(BaseModel):
    ok: bool
    passkey_id: int


class PasskeyRecoverOptionsResponse(BaseModel):
    challenge_id: int
    expires_at: datetime
    options: dict[str, Any]


class PasskeyRecoverVerifyRequest(BaseModel):
    challenge_id: int
    credential: dict[str, Any]


class PasskeyRecoverVerifyResponse(BaseModel):
    ok: bool
    employee_id: int
    device_id: int
    device_fingerprint: str


class RecoveryCodeIssueRequest(BaseModel):
    device_fingerprint: str
    recovery_pin: str = Field(min_length=6, max_length=12)


class RecoveryCodeIssueResponse(BaseModel):
    ok: bool
    employee_id: int
    device_id: int
    code_count: int
    expires_at: datetime
    recovery_codes: list[str] = Field(default_factory=list)


class RecoveryCodeStatusResponse(BaseModel):
    employee_id: int
    device_id: int
    recovery_ready: bool
    active_code_count: int
    expires_at: datetime | None = None


class RecoveryCodeRevealRequest(BaseModel):
    device_fingerprint: str
    recovery_pin: str = Field(min_length=6, max_length=12)


class RecoveryCodeRevealResponse(BaseModel):
    ok: bool
    employee_id: int
    device_id: int
    active_code_count: int
    expires_at: datetime | None = None
    recovery_codes: list[str] = Field(default_factory=list)


class RecoveryCodeRecoverRequest(BaseModel):
    employee_id: int = Field(ge=1)
    recovery_pin: str = Field(min_length=6, max_length=12)
    recovery_code: str = Field(min_length=4, max_length=32)


class RecoveryCodeRecoverResponse(BaseModel):
    ok: bool
    employee_id: int
    device_id: int
    device_fingerprint: str


class AdminLoginRequest(BaseModel):
    username: str
    password: str
    mfa_code: str | None = Field(default=None, max_length=10)
    mfa_recovery_code: str | None = Field(default=None, max_length=64)


class AdminRefreshRequest(BaseModel):
    refresh_token: str | None = None


class AdminLogoutRequest(BaseModel):
    refresh_token: str | None = None


class AdminLogoutResponse(BaseModel):
    ok: bool


class AdminPermissionValue(BaseModel):
    read: bool = False
    write: bool = False


class AdminUserCreateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)
    is_active: bool = True
    is_super_admin: bool = False
    permissions: dict[str, AdminPermissionValue] = Field(default_factory=dict)


class AdminUserUpdateRequest(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=100)
    full_name: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    is_active: bool | None = None
    is_super_admin: bool | None = None
    permissions: dict[str, AdminPermissionValue] | None = None


class AdminUserRead(BaseModel):
    id: int
    username: str
    full_name: str | None
    is_active: bool
    is_super_admin: bool
    mfa_enabled: bool = False
    mfa_secret_configured: bool = False
    claim_total: int = 0
    claim_active_total: int = 0
    claim_inactive_total: int = 0
    permissions: dict[str, AdminPermissionValue] = Field(default_factory=dict)
    last_seen_at: datetime | None = None
    last_login_at: datetime | None = None
    is_online: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AdminPushClaimDetailRead(BaseModel):
    id: int
    admin_user_id: int | None = None
    admin_username: str
    is_active: bool
    endpoint: str
    endpoint_fingerprint: str
    user_agent: str | None = None
    last_error: str | None = None
    created_at: datetime
    updated_at: datetime
    last_seen_at: datetime


class AdminPushClaimActiveUpdateRequest(BaseModel):
    is_active: bool


class AdminDeviceInviteDetailRead(BaseModel):
    id: int
    status: Literal["PENDING", "USED", "EXPIRED"]
    expires_at: datetime
    is_used: bool
    attempt_count: int
    max_attempts: int
    created_by_admin_user_id: int | None = None
    created_by_username: str
    used_by_admin_user_id: int | None = None
    used_by_username: str | None = None
    created_at: datetime
    used_at: datetime | None = None


class AdminUserClaimDetailResponse(BaseModel):
    admin_user: AdminUserRead
    claim_total: int
    claim_active_total: int
    claim_inactive_total: int
    claims: list[AdminPushClaimDetailRead] = Field(default_factory=list)
    created_invites: list[AdminDeviceInviteDetailRead] = Field(default_factory=list)
    used_invites: list[AdminDeviceInviteDetailRead] = Field(default_factory=list)


class AdminUserMfaStatusResponse(BaseModel):
    admin_user_id: int
    username: str
    mfa_enabled: bool
    has_secret: bool
    recovery_code_active_count: int
    recovery_code_total_count: int
    recovery_code_expires_at: datetime | None = None
    updated_at: datetime | None = None


class AdminUserMfaSetupStartResponse(BaseModel):
    admin_user_id: int
    username: str
    issuer: str
    secret_key: str
    otpauth_uri: str


class AdminUserMfaSetupConfirmRequest(BaseModel):
    code: str = Field(min_length=6, max_length=10)


class AdminUserMfaSetupConfirmResponse(BaseModel):
    ok: bool
    mfa_enabled: bool
    recovery_codes: list[str] = Field(default_factory=list)
    recovery_code_expires_at: datetime


class AdminUserMfaRecoveryRegenerateRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)


class AdminUserMfaRecoveryRegenerateResponse(BaseModel):
    ok: bool
    recovery_codes: list[str] = Field(default_factory=list)
    recovery_code_expires_at: datetime


class AdminMeResponse(BaseModel):
    sub: str
    username: str
    admin_user_id: int | None = None
    full_name: str | None = None
    role: str
    is_super_admin: bool = False
    permissions: dict[str, AdminPermissionValue] = Field(default_factory=dict)
    iat: int
    exp: int


class AdminAuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str | None = None
    user: AdminMeResponse | None = None


class LeaveCreateRequest(BaseModel):
    employee_id: int
    start_date: date
    end_date: date
    type: LeaveType
    status: LeaveStatus = LeaveStatus.APPROVED
    half_day: bool = False
    note: str | None = None

    @model_validator(mode="after")
    def _validate_half_day(self) -> "LeaveCreateRequest":
        if self.half_day and self.start_date != self.end_date:
            raise ValueError("half_day leave must be a single day (start_date == end_date)")
        return self


class EmployeeLeaveRequestCreate(BaseModel):
    device_fingerprint: str = Field(min_length=8, max_length=255)
    start_date: date
    end_date: date
    type: LeaveType
    note: str = Field(min_length=3, max_length=1000)
    question: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def _validate_range(self) -> "EmployeeLeaveRequestCreate":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be greater than or equal to start_date")
        self.note = self.note.strip()
        if len(self.note) < 3:
            raise ValueError("note must contain at least 3 characters")
        normalized_question = (self.question or "").strip()
        self.question = normalized_question or None
        return self


class LeaveDecisionRequest(BaseModel):
    status: LeaveStatus
    decision_note: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _validate_decision(self) -> "LeaveDecisionRequest":
        if self.status == LeaveStatus.PENDING:
            raise ValueError("Leave decision cannot stay pending.")
        normalized_note = (self.decision_note or "").strip()
        if self.status == LeaveStatus.REJECTED and len(normalized_note) < 3:
            raise ValueError("decision_note must contain at least 3 characters when rejecting.")
        self.decision_note = normalized_note or None
        return self


class LeaveRead(BaseModel):
    id: int
    employee_id: int
    start_date: date
    end_date: date
    type: LeaveType
    status: LeaveStatus
    half_day: bool = False
    note: str | None
    requested_by_employee: bool = False
    decision_note: str | None = None
    decided_at: datetime | None = None
    created_at: datetime
    attachment_count: int = 0
    message_count: int = 0
    last_message_at: datetime | None = None
    latest_message_preview: str | None = None

    model_config = ConfigDict(from_attributes=True)


class LeaveLedgerRow(BaseModel):
    employee_id: int
    employee_name: str
    department_name: str | None = None
    hire_date: date | None = None
    has_hire_date: bool = False
    seniority_label: str = "-"
    completed_service_years: int = 0
    annual_rate: int = 0
    entitled_total: Decimal = Decimal("0")
    used_total: Decimal = Decimal("0")
    used_year: Decimal = Decimal("0")
    remaining: Decimal = Decimal("0")


class LeaveLedgerResponse(BaseModel):
    as_of: date
    year: int | None = None
    rows: list[LeaveLedgerRow] = Field(default_factory=list)


class LeaveAttachmentRead(BaseModel):
    id: int
    leave_id: int
    employee_id: int
    uploaded_by_actor: str
    uploaded_by_label: str
    file_name: str
    content_type: str
    file_size_bytes: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LeaveMessageRead(BaseModel):
    id: int
    leave_id: int
    employee_id: int
    sender_actor: str
    sender_label: str
    message: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LeaveThreadRead(BaseModel):
    leave: LeaveRead
    attachments: list[LeaveAttachmentRead] = Field(default_factory=list)
    messages: list[LeaveMessageRead] = Field(default_factory=list)


class EmployeeLeaveMessageCreateRequest(BaseModel):
    device_fingerprint: str = Field(min_length=8, max_length=255)
    message: str = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def _normalize_message(self) -> "EmployeeLeaveMessageCreateRequest":
        self.message = self.message.strip()
        if len(self.message) < 1:
            raise ValueError("message must contain at least 1 character")
        return self


class AdminLeaveMessageCreateRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def _normalize_message(self) -> "AdminLeaveMessageCreateRequest":
        self.message = self.message.strip()
        if len(self.message) < 1:
            raise ValueError("message must contain at least 1 character")
        return self


class EmployeeConversationCreateRequest(BaseModel):
    device_fingerprint: str = Field(min_length=8, max_length=255)
    category: EmployeeConversationCategory
    subject: str = Field(min_length=6, max_length=160)
    message: str = Field(min_length=3, max_length=2000)

    @model_validator(mode="after")
    def _normalize_fields(self) -> "EmployeeConversationCreateRequest":
        self.subject = _normalize_subject(self.subject)
        self.message = _normalize_corporate_message(self.message, min_length=3)
        return self


class EmployeeConversationMessageCreateRequest(BaseModel):
    device_fingerprint: str = Field(min_length=8, max_length=255)
    message: str = Field(min_length=3, max_length=2000)

    @model_validator(mode="after")
    def _normalize_message(self) -> "EmployeeConversationMessageCreateRequest":
        self.message = _normalize_corporate_message(self.message, min_length=3)
        return self


class AdminConversationMessageCreateRequest(BaseModel):
    message: str = Field(min_length=3, max_length=2000)

    @model_validator(mode="after")
    def _normalize_message(self) -> "AdminConversationMessageCreateRequest":
        self.message = self.message.strip()
        if len(self.message) < 3:
            raise ValueError("message must contain at least 3 characters")
        return self


class AdminConversationStatusUpdateRequest(BaseModel):
    status: EmployeeConversationStatus


class AdminConversationCreateRequest(BaseModel):
    employee_id: int = Field(ge=1)
    category: EmployeeConversationCategory
    subject: str = Field(min_length=6, max_length=160)
    message: str = Field(min_length=3, max_length=2000)

    @model_validator(mode="after")
    def _normalize_fields(self) -> "AdminConversationCreateRequest":
        self.subject = self.subject.strip()
        self.message = self.message.strip()
        if len(self.subject) < 6:
            raise ValueError("subject must contain at least 6 characters")
        if len(self.message) < 3:
            raise ValueError("message must contain at least 3 characters")
        return self


class EmployeeConversationRead(BaseModel):
    id: int
    employee_id: int
    employee_name: str
    category: EmployeeConversationCategory
    subject: str
    status: EmployeeConversationStatus
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None = None
    last_message_at: datetime
    message_count: int = 0
    latest_message_preview: str | None = None

    model_config = ConfigDict(from_attributes=True)


class EmployeeConversationMessageRead(BaseModel):
    id: int
    conversation_id: int
    employee_id: int
    sender_actor: str
    sender_label: str
    message: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EmployeeConversationThreadRead(BaseModel):
    conversation: EmployeeConversationRead
    messages: list[EmployeeConversationMessageRead] = Field(default_factory=list)


class EmployeeLocationUpsert(BaseModel):
    home_lat: float
    home_lon: float
    radius_m: int = Field(default=120, ge=1)


class EmployeeLocationRead(BaseModel):
    id: int
    employee_id: int
    home_lat: float
    home_lon: float
    radius_m: int
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WorkRuleUpsert(BaseModel):
    department_id: int
    daily_minutes_planned: int = Field(default=540, ge=0)
    break_minutes: int = Field(default=60, ge=0)
    grace_minutes: int = Field(default=5, ge=0)
    early_arrival_tolerance_minutes: int = Field(default=0, ge=0)
    overtime_grace_minutes: int = Field(default=0, ge=0)
    off_shift_tolerance_minutes: int = Field(default=0, ge=0)
    overtime_threshold_minutes: int | None = Field(default=None, ge=0)


class WorkRuleRead(BaseModel):
    id: int
    department_id: int
    daily_minutes_planned: int
    break_minutes: int
    grace_minutes: int
    early_arrival_tolerance_minutes: int
    overtime_grace_minutes: int
    off_shift_tolerance_minutes: int
    overtime_threshold_minutes: int | None = None

    model_config = ConfigDict(from_attributes=True)


class DepartmentWeeklyRuleUpsert(BaseModel):
    department_id: int
    weekday: int = Field(ge=0, le=6)
    is_workday: bool = True
    planned_minutes: int = Field(default=540, ge=0)
    break_minutes: int = Field(default=60, ge=0)


class DepartmentWeeklyRuleRead(BaseModel):
    id: int
    department_id: int
    weekday: int
    is_workday: bool
    planned_minutes: int
    break_minutes: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EmployeeWeeklyRestDayUpsert(BaseModel):
    employee_id: int = Field(ge=1)
    weekday: int = Field(ge=0, le=6)
    is_active: bool = True
    note: str | None = Field(default=None, max_length=1000)


class EmployeeWeeklyRestDayRead(BaseModel):
    id: int
    employee_id: int
    weekday: int
    is_active: bool
    note: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SpecialDayUpsertRequest(BaseModel):
    id: int | None = Field(default=None, ge=1)
    day_date: date
    name: str = Field(min_length=1, max_length=255)
    day_type: SpecialDayType = SpecialDayType.PUBLIC_HOLIDAY
    work_policy: SpecialDayWorkPolicy = SpecialDayWorkPolicy.OFF
    planned_minutes_override: int | None = Field(default=None, ge=0)
    half_day_overtime_start: time | None = None
    counts_as_paid_leave: bool = True
    overtime_code: OvertimeCode = OvertimeCode.FM2
    overtime_multiplier: float = Field(default=1.0, ge=1.0)
    department_id: int | None = Field(default=None, ge=1)
    region_id: int | None = Field(default=None, ge=1)
    is_active: bool = True
    note: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _normalize_special_day(self) -> "SpecialDayUpsertRequest":
        self.name = " ".join(self.name.strip().split())
        if not self.name:
            raise ValueError("name must not be empty")
        if self.department_id is not None and self.region_id is not None:
            raise ValueError("department_id and region_id cannot both be set")
        if self.note is not None:
            self.note = self.note.strip() or None
        return self


class SpecialDayRead(BaseModel):
    id: int
    day_date: date
    name: str
    day_type: SpecialDayType
    work_policy: SpecialDayWorkPolicy
    planned_minutes_override: int | None = None
    half_day_overtime_start: time | None = None
    counts_as_paid_leave: bool
    overtime_code: OvertimeCode
    overtime_multiplier: float
    department_id: int | None = None
    region_id: int | None = None
    is_active: bool
    note: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SpecialDayEmployeeOverrideUpsertRequest(BaseModel):
    id: int | None = Field(default=None, ge=1)
    special_day_id: int = Field(ge=1)
    employee_id: int = Field(ge=1)
    work_policy: SpecialDayWorkPolicy = SpecialDayWorkPolicy.OFF
    planned_minutes_override: int | None = Field(default=None, ge=0)
    counts_as_paid_leave: bool = True
    overtime_code: OvertimeCode = OvertimeCode.FM2
    overtime_multiplier: float = Field(default=1.0, ge=1.0)
    is_active: bool = True
    note: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _normalize_override(self) -> "SpecialDayEmployeeOverrideUpsertRequest":
        if self.note is not None:
            self.note = self.note.strip() or None
        return self


class SpecialDayEmployeeOverrideRead(BaseModel):
    id: int
    special_day_id: int
    employee_id: int
    work_policy: SpecialDayWorkPolicy
    planned_minutes_override: int | None = None
    counts_as_paid_leave: bool
    overtime_code: OvertimeCode
    overtime_multiplier: float
    is_active: bool
    note: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DepartmentShiftUpsert(BaseModel):
    id: int | None = None
    department_id: int
    name: str = Field(min_length=1, max_length=100)
    start_time_local: str = Field(pattern=r"^\d{2}:\d{2}$")
    end_time_local: str = Field(pattern=r"^\d{2}:\d{2}$")
    break_minutes: int = Field(default=60, ge=0)
    is_active: bool = True


class DepartmentShiftRead(BaseModel):
    id: int
    department_id: int
    name: str
    start_time_local: str
    end_time_local: str
    break_minutes: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class DepartmentWeekdayShiftAssignmentReplaceRequest(BaseModel):
    department_id: int
    weekday: int = Field(ge=0, le=6)
    shift_ids: list[int] = Field(default_factory=list)


class DepartmentWeekdayShiftAssignmentRead(BaseModel):
    id: int
    department_id: int
    weekday: int
    shift_id: int
    shift_name: str
    shift_start_time_local: str
    shift_end_time_local: str
    shift_break_minutes: int
    sort_order: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class QRCodeCreateRequest(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    code_value: str = Field(min_length=1, max_length=255)
    code_type: QRCodeType = QRCodeType.BOTH
    is_active: bool = True


class QRCodeUpdateRequest(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    code_value: str | None = Field(default=None, min_length=1, max_length=255)
    code_type: QRCodeType | None = None
    is_active: bool | None = None


class QRCodeAssignPointsRequest(BaseModel):
    point_ids: list[int] = Field(min_length=1)


class QRCodeRead(BaseModel):
    id: int
    name: str | None
    code_value: str
    code_type: QRCodeType
    is_active: bool
    point_ids: list[int] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class QRPointCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    lat: float
    lon: float
    radius_m: int = Field(default=75, ge=1)
    is_active: bool = True
    department_id: int | None = Field(default=None, ge=1)
    region_id: int | None = Field(default=None, ge=1)


class QRPointUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    lat: float | None = None
    lon: float | None = None
    radius_m: int | None = Field(default=None, ge=1)
    is_active: bool | None = None
    department_id: int | None = Field(default=None, ge=1)
    region_id: int | None = Field(default=None, ge=1)


class QRPointRead(BaseModel):
    id: int
    name: str
    lat: float
    lon: float
    radius_m: int
    is_active: bool
    department_id: int | None = None
    region_id: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SchedulePlanUpsertRequest(BaseModel):
    id: int | None = None
    department_id: int
    target_type: SchedulePlanTargetType
    target_employee_id: int | None = None
    target_employee_ids: list[int] | None = Field(default=None)
    shift_id: int | None = Field(default=None, ge=1)
    daily_minutes_planned: int | None = Field(default=None, ge=0)
    break_minutes: int | None = Field(default=None, ge=0)
    grace_minutes: int | None = Field(default=None, ge=0)
    early_arrival_tolerance_minutes: int | None = Field(default=None, ge=0)
    overtime_grace_minutes: int | None = Field(default=None, ge=0)
    off_shift_tolerance_minutes: int | None = Field(default=None, ge=0)
    overtime_threshold_minutes: int | None = Field(default=None, ge=0)
    start_date: date
    end_date: date
    is_locked: bool = False
    is_active: bool = True
    note: str | None = None


class SchedulePlanRead(BaseModel):
    id: int
    department_id: int
    target_type: SchedulePlanTargetType
    target_employee_id: int | None
    target_employee_ids: list[int] = Field(default_factory=list)
    shift_id: int | None
    daily_minutes_planned: int | None
    break_minutes: int | None
    grace_minutes: int | None
    early_arrival_tolerance_minutes: int | None
    overtime_grace_minutes: int | None
    off_shift_tolerance_minutes: int | None
    overtime_threshold_minutes: int | None
    start_date: date
    end_date: date
    is_locked: bool
    is_active: bool
    note: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SaturdayRotationDayUpsert(BaseModel):
    day_date: date
    employee_ids: list[int] = Field(default_factory=list)
    is_active: bool = True
    note: str | None = None


class SaturdayRotationUpsertRequest(BaseModel):
    id: int | None = None
    department_id: int
    shift_id: int = Field(ge=1)
    name: str = Field(min_length=1, max_length=160)
    start_date: date
    end_date: date
    team_size: int = Field(default=1, ge=1, le=50)
    repeat_interval_weeks: int = Field(default=1, ge=1, le=12)
    is_active: bool = True
    note: str | None = None
    days: list[SaturdayRotationDayUpsert] = Field(default_factory=list)


class SaturdayRotationDayRead(BaseModel):
    id: int
    day_date: date
    employee_ids: list[int] = Field(default_factory=list)
    schedule_plan_id: int | None = None
    is_active: bool
    note: str | None = None
    created_at: datetime
    updated_at: datetime


class SaturdayRotationRead(BaseModel):
    id: int
    department_id: int
    shift_id: int
    name: str
    start_date: date
    end_date: date
    team_size: int
    repeat_interval_weeks: int
    is_active: bool
    note: str | None = None
    days: list[SaturdayRotationDayRead] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class LaborProfileUpsertRequest(BaseModel):
    name: str = "TR_DEFAULT"
    weekly_normal_minutes_default: int = Field(default=2700, ge=1)
    daily_max_minutes: int = Field(default=660, ge=1)
    enforce_min_break_rules: bool = False
    night_work_max_minutes_default: int = Field(default=450, ge=1)
    night_work_exceptions_note_enabled: bool = True
    overtime_annual_cap_minutes: int = Field(default=16200, ge=1)
    overtime_premium: float = Field(default=1.5, ge=1.0)
    extra_work_premium: float = Field(default=1.25, ge=1.0)
    overtime_rounding_mode: OvertimeRoundingMode = OvertimeRoundingMode.OFF


class LaborProfileRead(BaseModel):
    id: int
    name: str
    weekly_normal_minutes_default: int
    daily_max_minutes: int
    enforce_min_break_rules: bool
    night_work_max_minutes_default: int
    night_work_exceptions_note_enabled: bool
    overtime_annual_cap_minutes: int
    overtime_premium: float
    extra_work_premium: float
    overtime_rounding_mode: OvertimeRoundingMode
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AttendanceEventRead(BaseModel):
    id: int
    employee_id: int
    employee_name: str | None = None
    department_name: str | None = None
    device_id: int
    type: AttendanceType
    ts_utc: datetime
    lat: float | None
    lon: float | None
    accuracy_m: float | None
    location_status: LocationStatus
    flags: dict[str, Any] = Field(default_factory=dict)
    source: AttendanceEventSource = AttendanceEventSource.DEVICE
    created_by_admin: bool = False
    note: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    deleted_at: datetime | None = None
    deleted_by_admin: bool = False

    model_config = ConfigDict(from_attributes=True)


class AttendanceEventManualCreateRequest(BaseModel):
    employee_id: int
    type: AttendanceType
    ts_utc: datetime | None = None
    ts_local: datetime | None = None
    lat: float | None = None
    lon: float | None = None
    accuracy_m: float | None = Field(default=None, ge=0)
    note: str | None = None
    shift_id: int | None = Field(default=None, ge=1)
    allow_duplicate: bool = False


class AttendanceEventManualUpdateRequest(BaseModel):
    type: AttendanceType | None = None
    ts_utc: datetime | None = None
    ts_local: datetime | None = None
    note: str | None = None
    shift_id: int | None = Field(default=None, ge=1)
    allow_duplicate: bool = False
    force_edit: bool = False


class SoftDeleteResponse(BaseModel):
    ok: bool
    id: int


class AuditLogRead(BaseModel):
    id: int
    ts_utc: datetime
    actor_type: AuditActorType
    actor_id: str
    module: str
    event_type: str | None = None
    employee_id: int | None = None
    device_id: int | None = None
    action: str
    entity_type: str | None = None
    entity_id: str | None = None
    ip: str | None = None
    user_agent: str | None = None
    success: bool
    details: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(from_attributes=True)


class AuditLogPageResponse(BaseModel):
    items: list[AuditLogRead] = Field(default_factory=list)
    total: int = 0
    offset: int = 0
    limit: int = 0


class NotificationJobRead(BaseModel):
    id: int
    employee_id: int | None
    admin_user_id: int | None
    job_type: str
    notification_type: str | None = None
    audience: str | None = None
    risk_level: str | None = None
    event_id: str | None = None
    event_hash: str | None = None
    local_day: date | None = None
    event_ts_utc: datetime | None = None
    title: str | None = None
    description: str | None = None
    shift_summary: str | None = None
    actual_time_summary: str | None = None
    suggested_action: str | None = None
    admin_note: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    scheduled_at_utc: datetime
    status: Literal["PENDING", "SENDING", "SENT", "CANCELED", "FAILED"]
    attempts: int
    last_error: str | None = None
    idempotency_key: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NotificationJobPageResponse(BaseModel):
    items: list[NotificationJobRead] = Field(default_factory=list)
    total: int = 0
    offset: int = 0
    limit: int = 0


class EmployeePushConfigResponse(BaseModel):
    enabled: bool
    vapid_public_key: str | None = None


class EmployeePushSubscribeRequest(BaseModel):
    device_fingerprint: str
    subscription: dict[str, Any]
    send_test: bool = False


class EmployeePushSubscribeResponse(BaseModel):
    ok: bool
    subscription_id: int
    test_push_ok: bool | None = None
    test_push_error: str | None = None
    test_push_status_code: int | None = None


class EmployeePushUnsubscribeRequest(BaseModel):
    device_fingerprint: str
    endpoint: str


class EmployeePushUnsubscribeResponse(BaseModel):
    ok: bool


class AdminPushSubscriptionRead(BaseModel):
    id: int
    device_id: int
    employee_id: int
    endpoint: str
    is_active: bool
    user_agent: str | None = None
    last_error: str | None = None
    created_at: datetime
    updated_at: datetime
    last_seen_at: datetime


class AdminDevicePushSubscriptionRead(BaseModel):
    id: int
    admin_user_id: int | None = None
    admin_username: str
    endpoint: str
    is_active: bool
    user_agent: str | None = None
    last_error: str | None = None
    created_at: datetime
    updated_at: datetime
    last_seen_at: datetime


class AdminDeviceInviteCreateRequest(BaseModel):
    expires_in_minutes: int = Field(default=15, ge=1, le=60 * 24)


class AdminDeviceInviteCreateResponse(BaseModel):
    token: str
    invite_url: str
    expires_at: datetime


class AdminDeviceClaimRequest(BaseModel):
    token: str = Field(min_length=8, max_length=255)
    subscription: dict[str, Any]


class AdminDeviceClaimPublicRequest(BaseModel):
    token: str = Field(min_length=8, max_length=255)
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=128)
    subscription: dict[str, Any]


class AdminDeviceClaimResponse(BaseModel):
    ok: bool
    admin_username: str
    subscription_id: int


class AdminDeviceHealRequest(BaseModel):
    subscription: dict[str, Any]
    send_test: bool = True


class AdminDeviceHealResponse(BaseModel):
    ok: bool
    admin_username: str
    subscription_id: int
    test_push_ok: bool | None = None
    test_push_error: str | None = None
    test_push_status_code: int | None = None


class AdminPushSelfCheckResponse(BaseModel):
    push_enabled: bool
    actor_username: str
    actor_admin_user_id: int | None = None
    active_total_subscriptions: int
    active_claims_for_actor: int
    active_claims_for_actor_by_id: int
    active_claims_for_actor_by_username: int
    active_claims_healthy: int = 0
    active_claims_with_error: int = 0
    active_claims_stale: int = 0
    latest_claim_seen_at: datetime | None = None
    latest_claim_error: str | None = None
    last_self_test_at: datetime | None = None
    last_self_test_total_targets: int | None = None
    last_self_test_sent: int | None = None
    last_self_test_failed: int | None = None
    last_self_test_success: bool | None = None
    ready_for_receive: bool
    has_other_active_subscriptions: bool
    self_check_ok: bool = True
    self_check_error: str | None = None


class AdminPushSelfTestResponse(BaseModel):
    ok: bool
    total_targets: int
    sent: int
    failed: int
    deactivated: int = 0
    admin_user_ids: list[int] = Field(default_factory=list)
    admin_usernames: list[str] = Field(default_factory=list)


class AdminDailyReportJobHealthResponse(BaseModel):
    report_date: date
    evaluated_at_utc: datetime | None = None
    evaluated_local_time: datetime | None = None
    idempotency_key: str
    job_exists: bool
    job_id: int | None = None
    archive_exists: bool = False
    archive_id: int | None = None
    archive_created_at_utc: datetime | None = None
    archive_employee_count: int = 0
    archive_file_size_bytes: int = 0
    status: str | None = None
    scheduled_at_utc: datetime | None = None
    job_created_at_utc: datetime | None = None
    job_updated_at_utc: datetime | None = None
    attempts: int = 0
    last_error: str | None = None
    push_total_targets: int = 0
    push_sent: int = 0
    push_failed: int = 0
    email_sent: int = 0
    delivery_succeeded: bool = False
    target_zero: bool = False
    alarms: list[str] = Field(default_factory=list)


class AdminNotificationEmailTargetRead(BaseModel):
    id: int
    email: str
    is_active: bool
    created_by_username: str | None = None
    updated_by_username: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AdminNotificationEmailTargetsResponse(BaseModel):
    recipients: list[AdminNotificationEmailTargetRead] = Field(default_factory=list)
    active_recipients: list[str] = Field(default_factory=list)
    active_count: int = 0


class AdminNotificationEmailTargetsUpdateRequest(BaseModel):
    emails: list[str] = Field(default_factory=list)


class AdminNotificationEmailTestRequest(BaseModel):
    recipients: list[str] | None = None
    subject: str | None = Field(default=None, max_length=200)
    message: str | None = Field(default=None, max_length=4000)


class AdminNotificationEmailTestResponse(BaseModel):
    ok: bool
    sent: int
    mode: str
    recipients: list[str] = Field(default_factory=list)
    configured: bool
    error: str | None = None
    channel: dict[str, Any] = Field(default_factory=dict)


class AdminDailyReportArchiveRead(BaseModel):
    id: int
    report_date: date
    department_id: int | None = None
    region_id: int | None = None
    file_name: str
    file_size_bytes: int
    employee_count: int = 0
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AdminDailyReportArchivePageResponse(BaseModel):
    items: list[AdminDailyReportArchiveRead] = Field(default_factory=list)
    total: int = 0
    offset: int = 0
    limit: int = 0


class AdminDailyReportArchiveNotifyRequest(BaseModel):
    admin_user_ids: list[int] | None = None


class AdminDailyReportArchiveNotifyResponse(BaseModel):
    ok: bool
    archive_id: int
    archive_url: str
    total_targets: int
    sent: int
    failed: int
    deactivated: int = 0
    admin_user_ids: list[int] = Field(default_factory=list)
    admin_usernames: list[str] = Field(default_factory=list)


class AdminDailyReportArchivePasswordDownloadRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=128)


class AdminAttendanceExtraCheckinApprovalRead(BaseModel):
    approval_id: int
    employee_id: int
    employee_name: str
    device_id: int | None = None
    local_day: date
    status: Literal["PENDING", "APPROVED", "CONSUMED", "EXPIRED"]
    requested_at: datetime
    expires_at: datetime
    approved_at: datetime | None = None
    approved_by_username: str | None = None
    consumed_at: datetime | None = None
    push_total_targets: int = 0
    push_sent: int = 0
    push_failed: int = 0
    last_push_at: datetime | None = None


class AdminAttendanceExtraCheckinApprovalApproveRequest(BaseModel):
    token: str = Field(min_length=16, max_length=255)
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=128)


class AdminAttendanceExtraCheckinApprovalApproveResponse(BaseModel):
    ok: bool
    approval: AdminAttendanceExtraCheckinApprovalRead
    already_processed: bool = False


class AdminManualNotificationSendRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=2000)
    password: str = Field(min_length=1, max_length=128)
    target: Literal["employees", "admins", "both"] = "employees"
    employee_ids: list[int] | None = None
    admin_user_ids: list[int] | None = None


class AdminManualNotificationSendResponse(BaseModel):
    ok: bool
    total_targets: int
    sent: int
    failed: int
    deactivated: int = 0
    employee_ids: list[int] = Field(default_factory=list)
    admin_user_ids: list[int] = Field(default_factory=list)
    admin_usernames: list[str] = Field(default_factory=list)
    employee_total_targets: int = 0
    employee_sent: int = 0
    employee_failed: int = 0
    employee_deactivated: int = 0
    admin_total_targets: int = 0
    admin_sent: int = 0
    admin_failed: int = 0
    admin_deactivated: int = 0
    admin_target_missing: bool = False


class ScheduledNotificationTaskBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    title: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=2000)
    target: Literal["employees", "admins", "both"]
    employee_scope: Literal["all", "selected"] | None = None
    admin_scope: Literal["all", "selected"] | None = None
    employee_ids: list[int] | None = None
    admin_user_ids: list[int] | None = None
    schedule_kind: Literal["once", "daily"]
    run_date_local: date | None = None
    run_time_local: time
    timezone_name: str | None = Field(default="Europe/Istanbul", max_length=64)
    is_active: bool = True


class ScheduledNotificationTaskCreateRequest(ScheduledNotificationTaskBase):
    pass


class ScheduledNotificationTaskUpdateRequest(ScheduledNotificationTaskBase):
    pass


class ScheduledNotificationTaskRead(BaseModel):
    id: int
    name: str
    title: str
    message: str
    target: Literal["employees", "admins", "both"]
    employee_scope: Literal["all", "selected"] | None = None
    admin_scope: Literal["all", "selected"] | None = None
    employee_ids: list[int] = Field(default_factory=list)
    admin_user_ids: list[int] = Field(default_factory=list)
    schedule_kind: Literal["once", "daily"]
    run_date_local: date | None = None
    run_time_local: time
    timezone_name: str
    is_active: bool
    last_enqueued_local_date: date | None = None
    last_enqueued_at_utc: datetime | None = None
    next_run_at_utc: datetime | None = None
    created_by_username: str | None = None
    updated_by_username: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ScheduledNotificationTaskPageResponse(BaseModel):
    items: list[ScheduledNotificationTaskRead] = Field(default_factory=list)
    total: int = 0


class NotificationDeliveryLogRead(BaseModel):
    id: int
    notification_job_id: int | None = None
    event_id: str
    notification_type: str | None = None
    audience: str | None = None
    sent_at_utc: datetime
    title: str | None = None
    recipient_type: Literal["employee", "admin"]
    recipient_id: int | None = None
    recipient_name: str | None = None
    recipient_address: str | None = None
    device_id: int | None = None
    endpoint: str | None = None
    ip: str | None = None
    channel: Literal["push", "email"]
    status: Literal["PENDING", "SENT", "FAILED"]
    error: str | None = None


class NotificationJobNoteUpdateRequest(BaseModel):
    admin_note: str | None = Field(default=None, max_length=4000)


class NotificationDeliveryLogPageResponse(BaseModel):
    items: list[NotificationDeliveryLogRead] = Field(default_factory=list)
    total: int = 0
    offset: int = 0
    limit: int = 0


class CheckinQrPayload(BaseModel):
    site_id: str
    type: Literal["IN"]
    shift_id: int | None = Field(default=None, ge=1)


class AttendanceCheckinRequest(BaseModel):
    device_fingerprint: str
    qr: CheckinQrPayload
    lat: float | None = None
    lon: float | None = None
    accuracy_m: float | None = Field(default=None, ge=0)


class AttendanceCheckoutRequest(BaseModel):
    device_fingerprint: str
    lat: float | None = None
    lon: float | None = None
    accuracy_m: float | None = Field(default=None, ge=0)
    manual: bool = False


class EmployeeQrScanRequest(BaseModel):
    code_value: str = Field(min_length=1, max_length=255)
    lat: float
    lon: float
    accuracy_m: float | None = Field(default=None, ge=0)
    device_fingerprint: str


class EmployeeQrScanDeniedResponse(BaseModel):
    reason: str
    closest_distance_m: int | None = None


class AttendanceActionResponse(BaseModel):
    ok: bool
    employee_id: int
    event_id: int
    event_type: AttendanceType
    ts_utc: datetime
    location_status: LocationStatus
    flags: dict[str, Any] = Field(default_factory=dict)
    shift_id: int | None = None


class BreakActionRequest(BaseModel):
    device_fingerprint: str


class BreakStatusResponse(BaseModel):
    employee_id: int
    on_break: bool
    current_started_at: datetime | None = None
    current_elapsed_minutes: int = 0
    today_total_minutes: int = 0
    limit_minutes: int
    over_limit: bool = False


class EmployeeStatusResponse(BaseModel):
    employee_id: int
    employee_name: str | None = None
    region_name: str | None = None
    department_name: str | None = None
    shift_name: str | None = None
    shift_start_local: str | None = None
    shift_end_local: str | None = None
    today_status: Literal["NOT_STARTED", "IN_PROGRESS", "FINISHED"]
    last_in_ts: datetime | None = None
    last_out_ts: datetime | None = None
    last_location_status: LocationStatus | None = None
    last_flags: dict[str, Any] = Field(default_factory=dict)
    has_open_shift: bool | None = None
    suggested_action: Literal["CHECKIN", "CHECKOUT", "WAIT_NEXT_DAY"] | None = None
    last_checkin_time_utc: datetime | None = None
    completed_cycles_today: int | None = None
    home_location_required: bool | None = None
    passkey_registered: bool | None = None
    demo_active: bool | None = None
    last_demo_started_at_utc: datetime | None = None
    last_demo_ended_at_utc: datetime | None = None


class EmployeeDemoSessionResponse(BaseModel):
    started_at_utc: datetime
    ended_at_utc: datetime | None = None
    duration_minutes: int = 0
    is_active: bool = False


class EmployeeDemoDayResponse(BaseModel):
    employee_id: int
    day_local: date
    session_count: int = 0
    active_session_count: int = 0
    total_minutes: int = 0
    sessions: list[EmployeeDemoSessionResponse] = Field(default_factory=list)


class EmployeeAppPresencePingRequest(BaseModel):
    device_fingerprint: str
    source: Literal["APP_OPEN", "APP_CLOSE", "LOCATION_PING", "DEMO_START", "DEMO_END", "DEMO_MARK"] = "APP_OPEN"
    lat: float | None = None
    lon: float | None = None
    accuracy_m: float | None = Field(default=None, ge=0)
    provider: str | None = Field(default=None, max_length=40)
    speed_mps: float | None = None
    heading_deg: float | None = None
    altitude_m: float | None = None
    is_mocked: bool | None = None
    battery_level: float | None = Field(default=None, ge=0, le=100)
    network_type: str | None = Field(default=None, max_length=40)


class EmployeeAppPresencePingResponse(BaseModel):
    ok: bool
    employee_id: int
    logged_at: datetime


class EmployeeInstallFunnelEventRequest(BaseModel):
    device_fingerprint: str = Field(min_length=8, max_length=255)
    event: Literal[
        "banner_shown",
        "install_cta_clicked",
        "ios_onboarding_opened",
        "android_onboarding_opened",
        "install_prompt_opened",
        "install_prompt_accepted",
        "install_prompt_dismissed",
        "app_installed",
        "ios_inapp_browser_detected",
        "install_link_copied",
    ]
    occurred_at_ms: int | None = Field(default=None, ge=0)
    context: dict[str, Any] = Field(default_factory=dict)


class EmployeeInstallFunnelEventResponse(BaseModel):
    ok: bool


class EmployeeHomeLocationSetRequest(BaseModel):
    device_fingerprint: str
    home_lat: float
    home_lon: float
    radius_m: int = Field(default=300, ge=1)


class EmployeeHomeLocationSetResponse(BaseModel):
    ok: bool
    employee_id: int
    home_lat: float
    home_lon: float
    radius_m: int


class ManualDayOverrideUpsertRequest(BaseModel):
    day_date: date
    in_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    out_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    is_absent: bool = False
    # None means a legacy client that only knows is_absent; the service derives it.
    status: Literal["NORMAL", "IZINLI", "RESMI_TATIL", "CALISMADI"] | None = None
    rule_source_override: Literal["AUTO", "SHIFT", "WEEKLY", "WORK_RULE"] = "AUTO"
    rule_shift_id_override: int | None = Field(default=None, ge=1)
    note: str | None = None


class ManualDayOverrideRead(BaseModel):
    id: int
    employee_id: int
    day_date: date
    in_ts: datetime | None
    out_ts: datetime | None
    is_absent: bool
    status: Literal["NORMAL", "IZINLI", "RESMI_TATIL", "CALISMADI"]
    rule_source_override: Literal["SHIFT", "WEEKLY", "WORK_RULE"] | None = None
    rule_shift_id_override: int | None = None
    note: str | None
    created_by: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MonthlyEmployeeDay(BaseModel):
    date: date
    status: Literal["OK", "INCOMPLETE", "LEAVE", "OFF"]
    check_in: datetime | None = Field(default=None, serialization_alias="in")
    check_out: datetime | None = Field(default=None, serialization_alias="out")
    check_in_lat: float | None = Field(default=None, serialization_alias="in_lat")
    check_in_lon: float | None = Field(default=None, serialization_alias="in_lon")
    check_out_lat: float | None = Field(default=None, serialization_alias="out_lat")
    check_out_lon: float | None = Field(default=None, serialization_alias="out_lon")
    worked_minutes: int
    early_arrival_minutes: int = 0
    overtime_minutes: int
    plan_overtime_minutes: int = 0
    legal_extra_work_minutes: int = 0
    legal_overtime_minutes: int = 0
    fm1_minutes: int = 0
    fm2_minutes: int = 0
    fm3_minutes: int = 0
    sunday_work_minutes: int = 0
    weekly_rest_work_minutes: int = 0
    special_day_work_minutes: int = 0
    missing_minutes: int = 0
    rule_source: Literal["SHIFT", "WEEKLY", "WORK_RULE"] = "WORK_RULE"
    applied_planned_minutes: int = 0
    applied_break_minutes: int = 0
    # Calisanin o gun BUTON ile aldigi gercek mola; planlanan molayi asan kisim plan ustu/FM1'i azaltir.
    break_taken_minutes: int = 0
    leave_type: LeaveType | None = None
    shift_id: int | None = None
    shift_name: str | None = None
    day_type: Literal["WORKDAY", "SUNDAY", "WEEKLY_REST", "SPECIAL_DAY", "SPECIAL_HALF_DAY"] = "WORKDAY"
    special_day_name: str | None = None
    special_day_type: SpecialDayType | None = None
    special_day_work_policy: SpecialDayWorkPolicy | None = None
    overtime_code: OvertimeCode = OvertimeCode.NONE
    overtime_multiplier: float | None = None
    flags: list[str] = Field(default_factory=list)


class MonthlyEmployeeTotals(BaseModel):
    worked_minutes: int
    early_arrival_minutes: int = 0
    overtime_minutes: int
    plan_overtime_minutes: int = 0
    legal_extra_work_minutes: int = 0
    legal_overtime_minutes: int = 0
    fm1_minutes: int = 0
    fm2_minutes: int = 0
    fm3_minutes: int = 0
    sunday_work_minutes: int = 0
    weekly_rest_work_minutes: int = 0
    special_day_work_minutes: int = 0
    break_taken_minutes: int = 0
    incomplete_days: int


class MonthlyEmployeeWeek(BaseModel):
    week_start: date
    week_end: date
    normal_minutes: int
    extra_work_minutes: int
    overtime_minutes: int
    flags: list[str] = Field(default_factory=list)


class MonthlyEmployeeResponse(BaseModel):
    employee_id: int
    year: int
    month: int
    days: list[MonthlyEmployeeDay]
    totals: MonthlyEmployeeTotals
    worked_minutes_net: int
    weekly_totals: list[MonthlyEmployeeWeek] = Field(default_factory=list)
    annual_overtime_used_minutes: int
    annual_overtime_remaining_minutes: int
    annual_overtime_cap_exceeded: bool
    labor_profile: LaborProfileRead | None = None


class DepartmentMonthlySummaryItem(BaseModel):
    department_id: int
    department_name: str
    region_id: int | None = None
    region_name: str | None = None
    worked_minutes: int
    overtime_minutes: int
    plan_overtime_minutes: int = 0
    legal_extra_work_minutes: int = 0
    legal_overtime_minutes: int = 0
    fm1_minutes: int = 0
    fm2_minutes: int = 0
    fm3_minutes: int = 0
    sunday_work_minutes: int = 0
    weekly_rest_work_minutes: int = 0
    special_day_work_minutes: int = 0
    employee_count: int


DailyBoardStatus = Literal[
    "OFF",
    "NOT_STARTED",
    "ABSENT_RISK",
    "ABSENT",
    "IN_PROGRESS",
    "OPEN_OVERDUE",
    "FINISHED",
]


class DailyBoardEmployeeRow(BaseModel):
    employee_id: int
    full_name: str
    region_id: int | None = None
    region_name: str | None = None
    department_id: int | None = None
    department_name: str | None = None
    is_active: bool
    status: DailyBoardStatus
    is_workday: bool
    shift_window_label: str | None = None
    first_in_utc: datetime | None = None
    last_out_utc: datetime | None = None
    worked_minutes: int = 0
    qr_missing: bool = False
    manual_checkin: bool = False


class DailyBoardSummary(BaseModel):
    total: int = 0
    active: int = 0
    working: int = 0
    finished: int = 0
    absent: int = 0
    absent_risk: int = 0
    not_started: int = 0
    open_overdue: int = 0
    off: int = 0
    qr_missing: int = 0


class DailyBoardResponse(BaseModel):
    generated_at_utc: datetime
    target_date: date
    summary: DailyBoardSummary
    items: list[DailyBoardEmployeeRow] = Field(default_factory=list)


class EmployeeAttendanceHistoryDay(BaseModel):
    day: date
    is_workday: bool
    status: DailyBoardStatus
    first_in_utc: datetime | None = None
    last_out_utc: datetime | None = None
    worked_minutes: int = 0
    qr_missing: bool = False
    manual_checkin: bool = False


class EmployeeAttendanceHistoryAggregate(BaseModel):
    workday_count: int = 0
    worked_days: int = 0
    absent_days: int = 0
    qr_missing_days: int = 0
    incomplete_days: int = 0
    absent_dates: list[date] = Field(default_factory=list)


class EmployeeAttendanceHistoryResponse(BaseModel):
    employee_id: int
    full_name: str
    department_name: str | None = None
    start_date: date
    end_date: date
    aggregate: EmployeeAttendanceHistoryAggregate
    days: list[EmployeeAttendanceHistoryDay] = Field(default_factory=list)


class AdminPresenceEntry(BaseModel):
    key: str
    username: str
    full_name: str | None = None
    role: str | None = None
    last_seen_utc: datetime


class AdminPresenceRosterEntry(BaseModel):
    username: str
    full_name: str | None = None
    role: str | None = None
    is_online: bool = False
    last_seen_utc: datetime | None = None
    last_login_utc: datetime | None = None


class AdminPresenceResponse(BaseModel):
    generated_at_utc: datetime
    online: list[AdminPresenceEntry] = Field(default_factory=list)
    roster: list[AdminPresenceRosterEntry] = Field(default_factory=list)


class EmployeeCompensationCreateRequest(BaseModel):
    employee_id: int = Field(ge=1)
    basis: CompensationBasis = CompensationBasis.GROSS
    gross_monthly: Decimal | None = Field(default=None, gt=0, le=Decimal("9999999999"))
    net_monthly: Decimal | None = Field(default=None, gt=0, le=Decimal("9999999999"))
    effective_from: date
    note: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _check_amount_for_basis(self) -> "EmployeeCompensationCreateRequest":
        if self.basis == CompensationBasis.NET:
            if self.net_monthly is None:
                raise ValueError("NET maas tabaninda net_monthly zorunlu")
        elif self.gross_monthly is None:
            raise ValueError("GROSS maas tabaninda gross_monthly zorunlu")
        return self


class EmployeeCompensationRead(BaseModel):
    id: int
    employee_id: int
    basis: CompensationBasis = CompensationBasis.GROSS
    gross_monthly: Decimal
    net_monthly: Decimal | None = None
    effective_from: date
    note: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class EmployeeCompensationBulkRequest(BaseModel):
    department_id: int = Field(ge=1)
    basis: CompensationBasis = CompensationBasis.GROSS
    gross_monthly: Decimal | None = Field(default=None, gt=0, le=Decimal("9999999999"))
    net_monthly: Decimal | None = Field(default=None, gt=0, le=Decimal("9999999999"))
    effective_from: date
    note: str | None = Field(default=None, max_length=500)
    include_inactive: bool = False

    @model_validator(mode="after")
    def _check_amount_for_basis(self) -> "EmployeeCompensationBulkRequest":
        if self.basis == CompensationBasis.NET:
            if self.net_monthly is None:
                raise ValueError("NET maas tabaninda net_monthly zorunlu")
        elif self.gross_monthly is None:
            raise ValueError("GROSS maas tabaninda gross_monthly zorunlu")
        return self


class EmployeeCompensationBulkResult(BaseModel):
    department_id: int
    created: int = 0
    updated: int = 0
    total: int = 0
    employee_names: list[str] = Field(default_factory=list)


class IncomeTaxBracketSchema(BaseModel):
    upTo: int | None = None
    rate: Decimal = Field(ge=0, le=1)


class PayrollParameterUpsertRequest(BaseModel):
    year: int = Field(ge=2000, le=2100)
    monthly_hours_divisor: Decimal = Field(gt=0, le=Decimal("744"))
    overtime_multiplier_fm1: Decimal = Field(ge=1, le=10)
    overtime_multiplier_fm2: Decimal = Field(ge=1, le=10)
    overtime_multiplier_fm3: Decimal = Field(ge=1, le=10)
    deduct_missing_minutes: bool = True
    sgk_employee_rate: Decimal = Field(default=Decimal("0.14"), ge=0, le=1)
    unemployment_employee_rate: Decimal = Field(default=Decimal("0.01"), ge=0, le=1)
    sgk_employer_rate: Decimal = Field(default=Decimal("0.2075"), ge=0, le=1)
    unemployment_employer_rate: Decimal = Field(default=Decimal("0.02"), ge=0, le=1)
    sgk_employer_incentive_rate: Decimal = Field(default=Decimal("0.05"), ge=0, le=1)
    sgdp_employee_rate: Decimal = Field(default=Decimal("0.075"), ge=0, le=1)
    sgdp_employer_rate: Decimal = Field(default=Decimal("0.225"), ge=0, le=1)
    apply_employer_incentive: bool = True
    sgk_base_monthly: Decimal = Field(default=Decimal("33030"), gt=0)
    sgk_ceiling_monthly: Decimal = Field(default=Decimal("297270"), gt=0)
    stamp_tax_rate: Decimal = Field(default=Decimal("0.00759"), ge=0, le=1)
    minimum_wage_gross: Decimal = Field(default=Decimal("33030"), gt=0)
    minimum_wage_gross_h2: Decimal | None = Field(default=None, gt=0)
    minimum_wage_h2_month: int = Field(default=7, ge=1, le=12)
    disability_degree1_monthly: Decimal = Field(default=Decimal("0"), ge=0)
    disability_degree2_monthly: Decimal = Field(default=Decimal("0"), ge=0)
    disability_degree3_monthly: Decimal = Field(default=Decimal("0"), ge=0)
    severance_ceiling_gross: Decimal = Field(default=Decimal("0"), ge=0)
    income_tax_brackets: list[IncomeTaxBracketSchema] = Field(default_factory=list)


class PayrollParameterRead(BaseModel):
    year: int
    monthly_hours_divisor: Decimal
    overtime_multiplier_fm1: Decimal
    overtime_multiplier_fm2: Decimal
    overtime_multiplier_fm3: Decimal
    deduct_missing_minutes: bool
    sgk_employee_rate: Decimal = Decimal("0.14")
    unemployment_employee_rate: Decimal = Decimal("0.01")
    sgk_employer_rate: Decimal = Decimal("0.2075")
    unemployment_employer_rate: Decimal = Decimal("0.02")
    sgk_employer_incentive_rate: Decimal = Decimal("0.05")
    sgdp_employee_rate: Decimal = Decimal("0.075")
    sgdp_employer_rate: Decimal = Decimal("0.225")
    apply_employer_incentive: bool = True
    sgk_base_monthly: Decimal = Decimal("33030")
    sgk_ceiling_monthly: Decimal = Decimal("297270")
    stamp_tax_rate: Decimal = Decimal("0.00759")
    minimum_wage_gross: Decimal = Decimal("33030")
    minimum_wage_gross_h2: Decimal | None = None
    minimum_wage_h2_month: int = 7
    disability_degree1_monthly: Decimal = Decimal("0")
    disability_degree2_monthly: Decimal = Decimal("0")
    disability_degree3_monthly: Decimal = Decimal("0")
    severance_ceiling_gross: Decimal = Decimal("0")
    income_tax_brackets: list[IncomeTaxBracketSchema] = Field(default_factory=list)
    is_persisted: bool = True


class PayrollComponentCreateRequest(BaseModel):
    employee_id: int = Field(ge=1)
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    kind: PayrollComponentKind
    code: str | None = Field(default=None, max_length=40)
    label: str = Field(min_length=1, max_length=120)
    amount: Decimal = Field(gt=0, le=Decimal("9999999999"))
    exempt_limit: Decimal | None = Field(default=None, ge=0, le=Decimal("9999999999"))
    sgk_exempt: bool = False
    income_tax_exempt: bool = False
    stamp_tax_exempt: bool = False
    note: str | None = Field(default=None, max_length=300)


class PayrollComponentRead(BaseModel):
    id: int
    employee_id: int
    year: int
    month: int
    kind: PayrollComponentKind
    code: str | None = None
    label: str
    amount: Decimal
    exempt_limit: Decimal | None = None
    sgk_exempt: bool = False
    income_tax_exempt: bool = False
    stamp_tax_exempt: bool = False
    note: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PayrollComponentSnapshot(BaseModel):
    kind: PayrollComponentKind
    code: str | None = None
    label: str
    amount: Decimal
    exempt_limit: Decimal | None = None
    sgk_exempt: bool = False
    income_tax_exempt: bool = False
    stamp_tax_exempt: bool = False


class PayrollItemRead(BaseModel):
    id: int
    employee_id: int | None = None
    employee_name: str
    department_name: str | None = None
    compensation_basis: CompensationBasis = CompensationBasis.GROSS
    sgk_status: SgkStatus = SgkStatus.NORMAL
    kanun_no: str | None = None
    gross_monthly: Decimal
    hourly_rate: Decimal
    worked_minutes: int
    fm1_minutes: int
    fm2_minutes: int
    fm3_minutes: int
    missing_minutes: int
    unpaid_leave_minutes: int
    incomplete_days: int
    base_earning: Decimal
    overtime_fm1_amount: Decimal
    overtime_fm2_amount: Decimal
    overtime_fm3_amount: Decimal
    missing_deduction: Decimal
    unpaid_leave_deduction: Decimal
    gross_total: Decimal
    additional_earnings: Decimal = Decimal("0")
    additional_deductions: Decimal = Decimal("0")
    components: list[PayrollComponentSnapshot] = Field(default_factory=list)
    # Yasal kesinti snapshot
    sgk_days: int = 30
    sgk_base: Decimal = Decimal("0")
    sgk_employee: Decimal = Decimal("0")
    unemployment_employee: Decimal = Decimal("0")
    income_tax_base: Decimal = Decimal("0")
    disability_reduction: Decimal = Decimal("0")
    cumulative_income_tax_base: Decimal = Decimal("0")
    income_tax_calculated: Decimal = Decimal("0")
    income_tax_exemption: Decimal = Decimal("0")
    income_tax_payable: Decimal = Decimal("0")
    stamp_tax_calculated: Decimal = Decimal("0")
    stamp_tax_exemption: Decimal = Decimal("0")
    stamp_tax_payable: Decimal = Decimal("0")
    net_total: Decimal = Decimal("0")
    sgk_employer: Decimal = Decimal("0")
    unemployment_employer: Decimal = Decimal("0")
    employer_incentive: Decimal = Decimal("0")
    employer_cost_total: Decimal = Decimal("0")

    model_config = ConfigDict(from_attributes=True)


class PayrollSkippedEmployee(BaseModel):
    employee_id: int
    employee_name: str


class PayrollRunSummaryRead(BaseModel):
    id: int
    year: int
    month: int
    status: PayrollRunStatus
    note: str | None = None
    approved_at: datetime | None = None
    approved_by: str | None = None
    created_at: datetime
    item_count: int = 0
    gross_total_sum: Decimal = Decimal("0")


class PayrollRunRead(PayrollRunSummaryRead):
    items: list[PayrollItemRead] = Field(default_factory=list)
    skipped_employees: list[PayrollSkippedEmployee] = Field(default_factory=list)


class PayrollReportSummary(BaseModel):
    employee_count: int = 0
    gross_total: Decimal = Decimal("0")
    additional_earnings: Decimal = Decimal("0")
    additional_deductions: Decimal = Decimal("0")
    sgk_employee: Decimal = Decimal("0")
    unemployment_employee: Decimal = Decimal("0")
    income_tax_payable: Decimal = Decimal("0")
    income_tax_exemption: Decimal = Decimal("0")
    stamp_tax_payable: Decimal = Decimal("0")
    disability_reduction: Decimal = Decimal("0")
    net_total: Decimal = Decimal("0")
    sgk_employer: Decimal = Decimal("0")
    unemployment_employer: Decimal = Decimal("0")
    employer_incentive: Decimal = Decimal("0")
    employer_cost_total: Decimal = Decimal("0")


class PayrollReportDepartmentRow(BaseModel):
    department_name: str
    employee_count: int = 0
    gross_total: Decimal = Decimal("0")
    additional_earnings: Decimal = Decimal("0")
    net_total: Decimal = Decimal("0")
    employer_cost_total: Decimal = Decimal("0")


class PayrollReportSgkRow(BaseModel):
    sgk_status: str
    kanun_no: str
    employee_count: int = 0
    sgk_days: int = 0
    sgk_base: Decimal = Decimal("0")
    sgk_employee: Decimal = Decimal("0")
    unemployment_employee: Decimal = Decimal("0")
    sgk_employer: Decimal = Decimal("0")
    unemployment_employer: Decimal = Decimal("0")
    employer_incentive: Decimal = Decimal("0")


class PayrollReportTaxRow(BaseModel):
    employee_name: str
    department_name: str | None = None
    income_tax_base: Decimal = Decimal("0")
    cumulative_income_tax_base: Decimal = Decimal("0")
    income_tax_calculated: Decimal = Decimal("0")
    income_tax_exemption: Decimal = Decimal("0")
    income_tax_payable: Decimal = Decimal("0")
    stamp_tax_payable: Decimal = Decimal("0")
    disability_reduction: Decimal = Decimal("0")


class PayrollReportRead(BaseModel):
    year: int
    month: int
    status: PayrollRunStatus
    summary: PayrollReportSummary
    by_department: list[PayrollReportDepartmentRow] = Field(default_factory=list)
    sgk_accrual: list[PayrollReportSgkRow] = Field(default_factory=list)
    tax_lines: list[PayrollReportTaxRow] = Field(default_factory=list)


class TerminationSettlementResponse(BaseModel):
    employee_id: int
    employee_name: str
    hire_date: date
    termination_date: date
    service_days: int
    service_label: str
    base_gross: Decimal
    daily_gross: Decimal
    severance_ceiling: Decimal = Decimal("0")
    ceiling_applied: bool = False
    severance_base_monthly: Decimal
    severance_gross: Decimal
    severance_stamp: Decimal
    severance_net: Decimal
    notice_weeks: int
    notice_gross: Decimal
    notice_stamp: Decimal
    notice_income_tax: Decimal
    notice_net: Decimal
    unused_leave_days: Decimal = Decimal("0")
    unused_leave_gross: Decimal = Decimal("0")
    total_gross: Decimal
    total_net: Decimal


class PayrollDashboardRow(BaseModel):
    year: int
    month: int
    status: PayrollRunStatus
    employee_count: int = 0
    gross_total: Decimal = Decimal("0")
    net_total: Decimal = Decimal("0")
    employer_cost_total: Decimal = Decimal("0")


class PayrollDashboardResponse(BaseModel):
    rows: list[PayrollDashboardRow] = Field(default_factory=list)
    latest: PayrollDashboardRow | None = None


class PayrollEmployeeHistoryRow(BaseModel):
    payroll_item_id: int
    year: int
    month: int
    status: PayrollRunStatus
    gross_monthly: Decimal = Decimal("0")
    gross_total: Decimal = Decimal("0")
    additional_earnings: Decimal = Decimal("0")
    additional_deductions: Decimal = Decimal("0")
    sgk_employee: Decimal = Decimal("0")
    income_tax_payable: Decimal = Decimal("0")
    net_total: Decimal = Decimal("0")
    employer_cost_total: Decimal = Decimal("0")


class PayrollEmployeeHistoryResponse(BaseModel):
    employee_id: int
    employee_name: str
    items: list[PayrollEmployeeHistoryRow] = Field(default_factory=list)
    compensations: list[EmployeeCompensationRead] = Field(default_factory=list)


class PayrollGenerateRequest(BaseModel):
    year: int = Field(ge=2000, le=2100)
    month: int = Field(ge=1, le=12)
    note: str | None = Field(default=None, max_length=500)


class CompanySettingsRead(BaseModel):
    firma_unvan: str | None = None
    merkez_adres: str | None = None
    sube_adres: str | None = None
    vergi_dairesi: str | None = None
    vergi_no: str | None = None
    ticaret_sicil_no: str | None = None
    mersis_no: str | None = None
    sgk_isyeri_no: str | None = None
    internet_adresi: str | None = None
    logo_hesap_ucret: str | None = None
    logo_hesap_sgk_isveren: str | None = None
    logo_hesap_net_odenecek: str | None = None
    logo_hesap_odenecek_vergi: str | None = None
    logo_hesap_odenecek_sgk: str | None = None
    logo_hesap_personel_kesinti: str | None = None

    model_config = ConfigDict(from_attributes=True)


class CompanySettingsUpsertRequest(BaseModel):
    firma_unvan: str | None = Field(default=None, max_length=255)
    merkez_adres: str | None = Field(default=None, max_length=500)
    sube_adres: str | None = Field(default=None, max_length=500)
    vergi_dairesi: str | None = Field(default=None, max_length=150)
    vergi_no: str | None = Field(default=None, max_length=20)
    ticaret_sicil_no: str | None = Field(default=None, max_length=40)
    mersis_no: str | None = Field(default=None, max_length=40)
    sgk_isyeri_no: str | None = Field(default=None, max_length=40)
    internet_adresi: str | None = Field(default=None, max_length=150)
    logo_hesap_ucret: str | None = Field(default=None, max_length=40)
    logo_hesap_sgk_isveren: str | None = Field(default=None, max_length=40)
    logo_hesap_net_odenecek: str | None = Field(default=None, max_length=40)
    logo_hesap_odenecek_vergi: str | None = Field(default=None, max_length=40)
    logo_hesap_odenecek_sgk: str | None = Field(default=None, max_length=40)
    logo_hesap_personel_kesinti: str | None = Field(default=None, max_length=40)


class EmployeePayrollProfileRead(BaseModel):
    employee_id: int
    sgk_status: SgkStatus = SgkStatus.NORMAL
    is_part_time: bool = False
    disability_degree: int = 0
    tc_kimlik_no: str | None = None
    sgk_sicil_no: str | None = None
    ise_giris_tarihi: date | None = None
    cinsiyet: str | None = None
    meslek_grubu: str | None = None
    kanun_no: str | None = None
    sozlesme_tipi: str | None = None
    pozisyon: str | None = None
    dogum_tarihi: date | None = None
    medeni_hal: str | None = None
    acil_kisi_adi: str | None = None
    acil_kisi_tel: str | None = None
    sirket_telefonu: str | None = None
    cep_telefonu: str | None = None
    adres: str | None = None
    banka_adi: str | None = None
    sube: str | None = None
    hesap_no: str | None = None

    model_config = ConfigDict(from_attributes=True)


class EmployeePayrollProfileUpsertRequest(BaseModel):
    sgk_status: SgkStatus = SgkStatus.NORMAL
    is_part_time: bool = False
    disability_degree: int = Field(default=0, ge=0, le=3)
    tc_kimlik_no: str | None = Field(default=None, max_length=11)
    sgk_sicil_no: str | None = Field(default=None, max_length=40)
    ise_giris_tarihi: date | None = None
    cinsiyet: str | None = Field(default=None, max_length=10)
    meslek_grubu: str | None = Field(default=None, max_length=100)
    kanun_no: str | None = Field(default=None, max_length=10)
    sozlesme_tipi: str | None = Field(default=None, max_length=20)
    pozisyon: str | None = Field(default=None, max_length=120)
    dogum_tarihi: date | None = None
    medeni_hal: str | None = Field(default=None, max_length=20)
    acil_kisi_adi: str | None = Field(default=None, max_length=120)
    acil_kisi_tel: str | None = Field(default=None, max_length=40)
    sirket_telefonu: str | None = Field(default=None, max_length=40)
    cep_telefonu: str | None = Field(default=None, max_length=40)
    adres: str | None = Field(default=None, max_length=500)
    banka_adi: str | None = Field(default=None, max_length=100)
    sube: str | None = Field(default=None, max_length=100)
    hesap_no: str | None = Field(default=None, max_length=40)


class OzlukMasterRow(BaseModel):
    """Ozluk ana grid satiri: Employee + profil + guncel ucret tek satirda.

    Tek kaynaktan beslenir; bordro/ozluk ekranlari arasinda ayni veri farkli
    formlarla tekrar tekrar sorulmasin diye tasarlandi.
    """

    employee_id: int
    full_name: str
    is_active: bool
    department_id: int | None = None
    department_name: str | None = None
    pozisyon: str | None = None
    sozlesme_tipi: str | None = None
    ise_giris_tarihi: date | None = None
    sgk_status: SgkStatus = SgkStatus.NORMAL
    is_part_time: bool = False
    tc_kimlik_no: str | None = None
    sgk_sicil_no: str | None = None
    sirket_telefonu: str | None = None
    cep_telefonu: str | None = None
    current_basis: CompensationBasis | None = None
    current_gross_monthly: Decimal | None = None
    current_net_monthly: Decimal | None = None
    current_effective_from: date | None = None
    has_profile: bool = False

    model_config = ConfigDict(from_attributes=True)


class OzlukEmployeeDetail(BaseModel):
    """Tek calisanin tam ozluk goruntusu: kimlik + profil + ucret gecmisi."""

    employee_id: int
    full_name: str
    is_active: bool
    department_id: int | None = None
    department_name: str | None = None
    profile: EmployeePayrollProfileRead
    compensations: list[EmployeeCompensationRead] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class PersonnelImportRowResponse(BaseModel):
    sira_no: int
    full_name: str
    tc_kimlik_no: str
    region_name: str
    department_name: str
    pozisyon: str | None = None
    ise_giris_tarihi: date | None = None
    dogum_tarihi: date | None = None
    cinsiyet: str | None = None
    cep_telefonu: str | None = None
    sirket_telefonu: str | None = None
    adres: str | None = None
    hesap_no: str | None = None
    sgk_sicil_no: str | None = None
    action: Literal["CREATE", "UPDATE"]
    employee_id: int | None = None
    changed_fields: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class PersonnelImportPreviewResponse(BaseModel):
    rows: list[PersonnelImportRowResponse]
    new_regions: list[str]
    new_departments: list[str]
    parse_errors: list[str]


class PersonnelImportCommitResponse(BaseModel):
    created: int
    updated: int
    skipped: int
    created_regions: list[str]
    created_departments: list[str]


class AssistantChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class AssistantChatRequest(BaseModel):
    messages: list[AssistantChatMessage] = Field(min_length=1, max_length=40)


class AssistantUsage(BaseModel):
    model: str
    used_today: int
    daily_cap: int | None = None
    remaining: int | None = None


class AssistantChatResponse(BaseModel):
    reply: str
    tool_calls: list[str] = Field(default_factory=list)
    usage: AssistantUsage | None = None


class AssistantConfigStatus(BaseModel):
    enabled: bool
    model: str
    base_url: str
    has_key: bool
    key_source: Literal["db", "env", "none"]
    key_masked: str | None = None
    updated_by: str | None = None
    updated_at: datetime | None = None


class AssistantConfigUpdateRequest(BaseModel):
    # Kullanici adi + sifre yalnizca api_key degistirilirken zorunludur.
    username: str | None = Field(default=None, max_length=150)
    password: str | None = Field(default=None, max_length=200)
    api_key: str | None = Field(default=None, max_length=400)
    model: str | None = Field(default=None, max_length=120)
    base_url: str | None = Field(default=None, max_length=255)
    enabled: bool | None = None


