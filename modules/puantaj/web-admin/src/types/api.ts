export type AttendanceType = 'IN' | 'OUT'
export type LocationStatus =
  | 'VERIFIED_HOME'
  | 'UNVERIFIED_LOCATION'
  | 'NO_LOCATION'
  | 'LOW_ACCURACY'
  | 'STALE_LOCATION'
  | 'OUTSIDE_GEOFENCE'
  | 'INSIDE_GEOFENCE'
  | 'SUSPICIOUS_JUMP'
  | 'MOCK_GPS_SUSPECTED'
  | 'VERIFIED'
export type AttendanceEventSource = 'DEVICE' | 'MANUAL'
export type SchedulePlanTargetType = 'DEPARTMENT' | 'DEPARTMENT_EXCEPT_EMPLOYEE' | 'ONLY_EMPLOYEE'
export type OvertimeCode = 'NONE' | 'FM1' | 'FM2' | 'FM3'
export type SpecialDayType = 'PUBLIC_HOLIDAY' | 'COMPANY_HOLIDAY' | 'ADMINISTRATIVE_LEAVE' | 'HALF_DAY' | 'OTHER'
export type SpecialDayWorkPolicy = 'OFF' | 'HALF_DAY' | 'WORKDAY'
export type MonthlyDayType = 'WORKDAY' | 'SUNDAY' | 'WEEKLY_REST' | 'SPECIAL_DAY' | 'SPECIAL_HALF_DAY'

export type LeaveType = 'ANNUAL' | 'SICK' | 'UNPAID' | 'EXCUSE' | 'PUBLIC_HOLIDAY'
export type LeaveStatus = 'APPROVED' | 'PENDING' | 'REJECTED'
export type EmployeeConversationCategory = 'ATTENDANCE' | 'SHIFT' | 'DEVICE' | 'DOCUMENT' | 'OTHER'
export type EmployeeConversationStatus = 'OPEN' | 'CLOSED'

export interface Region {
  id: number
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Department {
  id: number
  name: string
  region_id: number | null
  region_name: string | null
}

export interface Employee {
  id: number
  full_name: string
  region_id: number | null
  region_name: string | null
  department_id: number | null
  shift_id: number | null
  is_active: boolean
  contract_weekly_minutes?: number | null
  device_count?: number | null
  active_device_count?: number | null
}

export interface EmployeeDeviceDetail {
  id: number
  device_fingerprint: string
  is_active: boolean
  created_at: string
  last_attendance_ts_utc: string | null
  last_seen_ip: string | null
  last_seen_action: string | null
  last_seen_at_utc: string | null
}

export interface EmployeePortalActivity {
  ts_utc: string
  action: string
  ip: string | null
  user_agent: string | null
}

export interface EmployeeIpSummary {
  ip: string
  last_seen_at_utc: string
  last_action: string
  last_lat: number | null
  last_lon: number | null
  last_accuracy_m: number | null
  last_location_status: LocationStatus | null
  last_location_ts_utc: string | null
}

export interface EmployeeLiveLocation {
  lat: number
  lon: number
  accuracy_m: number | null
  ts_utc: string
  location_status: LocationStatus
  event_type: AttendanceType
  device_id: number
}

export interface EmployeeDetail {
  employee: Employee
  last_portal_seen_utc: string | null
  recent_ips: string[]
  ip_summary: EmployeeIpSummary[]
  devices: EmployeeDeviceDetail[]
  latest_location: EmployeeLiveLocation | null
  first_location: EmployeeLiveLocation | null
  recent_locations: EmployeeLiveLocation[]
  home_location: EmployeeLocation | null
  recent_activity: EmployeePortalActivity[]
}

export type EmployeeStatusFilter = 'active' | 'inactive' | 'all'

export interface Device {
  id: number
  employee_id: number
  device_fingerprint: string
  is_active: boolean
  created_at: string
  last_seen?: string | null
}

export interface EmployeeDeviceOverviewDevice {
  id: number
  device_fingerprint: string
  is_active: boolean
  created_at: string
  recovery_ready: boolean
  recovery_code_active_count: number
  recovery_expires_at: string | null
  recovery_pin_updated_at: string | null
  recovery_pin_plain: string | null
  recovery_code_entries: RecoveryCodeAdminEntry[]
}

export interface RecoveryCodeAdminEntry {
  code: string
  status: 'ACTIVE' | 'USED_OR_EXPIRED'
}

export interface EmployeeDeviceOverview {
  employee_id: number
  employee_name: string
  region_id: number | null
  region_name: string | null
  department_id: number | null
  department_name: string | null
  is_employee_active: boolean
  total_devices: number
  active_devices: number
  shown_devices: number
  has_more_devices: boolean
  token_total: number
  token_used: number
  token_pending: number
  token_expired: number
  devices: EmployeeDeviceOverviewDevice[]
}

export interface EmployeeLocation {
  id: number
  employee_id: number
  home_lat: number
  home_lon: number
  radius_m: number
  updated_at: string
}

export interface WorkRule {
  id: number
  department_id: number
  daily_minutes_planned: number
  break_minutes: number
  grace_minutes: number
  early_arrival_tolerance_minutes: number
  overtime_grace_minutes: number
  off_shift_tolerance_minutes: number
  overtime_threshold_minutes: number | null
}

export interface DepartmentWeeklyRule {
  id: number
  department_id: number
  weekday: number
  is_workday: boolean
  planned_minutes: number
  break_minutes: number
  created_at: string
  updated_at: string
}

export interface DepartmentWeekdayShiftAssignment {
  id: number
  department_id: number
  weekday: number
  shift_id: number
  shift_name: string
  shift_start_time_local: string
  shift_end_time_local: string
  shift_break_minutes: number
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface DepartmentShift {
  id: number
  department_id: number
  name: string
  start_time_local: string
  end_time_local: string
  break_minutes: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface EmployeeWeeklyRestDay {
  id: number
  employee_id: number
  weekday: number
  is_active: boolean
  note: string | null
  created_at: string
  updated_at: string
}

export interface SpecialDay {
  id: number
  day_date: string
  name: string
  day_type: SpecialDayType
  work_policy: SpecialDayWorkPolicy
  planned_minutes_override: number | null
  half_day_overtime_start: string | null
  counts_as_paid_leave: boolean
  overtime_code: OvertimeCode
  overtime_multiplier: number
  department_id: number | null
  region_id: number | null
  is_active: boolean
  note: string | null
  created_at: string
  updated_at: string
}

export interface SpecialDayEmployeeOverride {
  id: number
  special_day_id: number
  employee_id: number
  work_policy: SpecialDayWorkPolicy
  planned_minutes_override: number | null
  counts_as_paid_leave: boolean
  overtime_code: OvertimeCode
  overtime_multiplier: number
  is_active: boolean
  note: string | null
  created_at: string
  updated_at: string
}

export type QrCodeType = 'CHECKIN' | 'CHECKOUT' | 'BOTH'

export interface QrCode {
  id: number
  name: string | null
  code_value: string
  code_type: QrCodeType
  is_active: boolean
  point_ids: number[]
  created_at: string
  updated_at: string
}

export interface QrPoint {
  id: number
  name: string
  lat: number
  lon: number
  radius_m: number
  is_active: boolean
  department_id: number | null
  region_id: number | null
  created_at: string
  updated_at: string
}

export interface AttendanceEvent {
  id: number
  employee_id: number
  employee_name: string | null
  department_name: string | null
  device_id: number
  type: AttendanceType
  ts_utc: string
  lat: number | null
  lon: number | null
  accuracy_m: number | null
  location_status: LocationStatus
  flags: Record<string, unknown>
  source: AttendanceEventSource
  created_by_admin: boolean
  note: string | null
  created_at: string | null
  updated_at: string | null
  deleted_at: string | null
  deleted_by_admin: boolean
}

export interface SchedulePlan {
  id: number
  department_id: number
  target_type: SchedulePlanTargetType
  target_employee_id: number | null
  target_employee_ids: number[]
  shift_id: number | null
  daily_minutes_planned: number | null
  break_minutes: number | null
  grace_minutes: number | null
  early_arrival_tolerance_minutes: number | null
  overtime_grace_minutes: number | null
  off_shift_tolerance_minutes: number | null
  overtime_threshold_minutes: number | null
  start_date: string
  end_date: string
  is_locked: boolean
  is_active: boolean
  note: string | null
  created_at: string
  updated_at: string
}

export interface SaturdayRotationDay {
  id: number
  day_date: string
  employee_ids: number[]
  schedule_plan_id: number | null
  is_active: boolean
  note: string | null
  created_at: string
  updated_at: string
}

export interface SaturdayRotation {
  id: number
  department_id: number
  shift_id: number
  name: string
  start_date: string
  end_date: string
  team_size: number
  repeat_interval_weeks: number
  is_active: boolean
  note: string | null
  days: SaturdayRotationDay[]
  created_at: string
  updated_at: string
}

export type AuditActorType = 'ADMIN' | 'SYSTEM'

export interface AuditLog {
  id: number
  ts_utc: string
  actor_type: AuditActorType
  actor_id: string
  module: string
  event_type: string | null
  employee_id: number | null
  device_id: number | null
  action: string
  entity_type: string | null
  entity_id: string | null
  ip: string | null
  user_agent: string | null
  success: boolean
  details: Record<string, unknown>
}

export type NotificationJobStatus = 'PENDING' | 'SENDING' | 'SENT' | 'CANCELED' | 'FAILED'
export type NotificationAudience = 'employee' | 'admin'
export type NotificationRiskLevel = 'Bilgi' | 'Uyari' | 'Kritik'

export interface NotificationJob {
  id: number
  employee_id: number | null
  admin_user_id: number | null
  job_type: string
  notification_type: string | null
  audience: NotificationAudience | null
  risk_level: NotificationRiskLevel | null
  event_id: string | null
  event_hash: string | null
  local_day: string | null
  event_ts_utc: string | null
  title: string | null
  description: string | null
  shift_summary: string | null
  actual_time_summary: string | null
  suggested_action: string | null
  admin_note: string | null
  payload: Record<string, unknown>
  scheduled_at_utc: string
  status: NotificationJobStatus
  attempts: number
  last_error: string | null
  idempotency_key: string
  created_at: string
  updated_at: string
}

export interface NotificationDeliveryLog {
  id: number
  notification_job_id: number | null
  event_id: string
  notification_type: string | null
  audience: NotificationAudience | null
  sent_at_utc: string
  title: string | null
  recipient_type: 'employee' | 'admin'
  recipient_id: number | null
  recipient_name: string | null
  recipient_address: string | null
  device_id: number | null
  endpoint: string | null
  ip: string | null
  channel: 'push' | 'email'
  status: 'PENDING' | 'SENT' | 'FAILED'
  error: string | null
}

export interface AdminPushSubscription {
  id: number
  device_id: number
  employee_id: number
  endpoint: string
  is_active: boolean
  user_agent: string | null
  last_error: string | null
  created_at: string
  updated_at: string
  last_seen_at: string
}

export interface AdminDevicePushSubscription {
  id: number
  admin_user_id: number | null
  admin_username: string
  endpoint: string
  is_active: boolean
  user_agent: string | null
  last_error: string | null
  created_at: string
  updated_at: string
  last_seen_at: string
}

export interface AdminDeviceInviteCreateResponse {
  token: string
  invite_url: string
  expires_at: string
}

export interface AdminDeviceClaimResponse {
  ok: boolean
  admin_username: string
  subscription_id: number
}

export interface AdminDeviceHealResponse {
  ok: boolean
  admin_username: string
  subscription_id: number
  test_push_ok: boolean | null
  test_push_error: string | null
  test_push_status_code: number | null
}

export interface AdminPushSelfCheckResponse {
  push_enabled: boolean
  actor_username: string
  actor_admin_user_id: number | null
  active_total_subscriptions: number
  active_claims_for_actor: number
  active_claims_for_actor_by_id: number
  active_claims_for_actor_by_username: number
  active_claims_healthy: number
  active_claims_with_error: number
  active_claims_stale: number
  latest_claim_seen_at: string | null
  latest_claim_error: string | null
  last_self_test_at: string | null
  last_self_test_total_targets: number | null
  last_self_test_sent: number | null
  last_self_test_failed: number | null
  last_self_test_success: boolean | null
  ready_for_receive: boolean
  has_other_active_subscriptions: boolean
  self_check_ok: boolean
  self_check_error: string | null
}

export interface AdminPushSelfTestResponse {
  ok: boolean
  total_targets: number
  sent: number
  failed: number
  deactivated: number
  admin_user_ids: number[]
  admin_usernames: string[]
}

export interface AdminDailyReportJobHealth {
  report_date: string
  evaluated_at_utc: string | null
  evaluated_local_time: string | null
  idempotency_key: string
  job_exists: boolean
  job_id: number | null
  archive_exists: boolean
  archive_id: number | null
  archive_created_at_utc: string | null
  archive_employee_count: number
  archive_file_size_bytes: number
  status: string | null
  scheduled_at_utc: string | null
  job_created_at_utc: string | null
  job_updated_at_utc: string | null
  attempts: number
  last_error: string | null
  push_total_targets: number
  push_sent: number
  push_failed: number
  email_sent: number
  delivery_succeeded: boolean
  target_zero: boolean
  alarms: string[]
}

export interface AdminNotificationEmailTarget {
  id: number
  email: string
  is_active: boolean
  created_by_username: string | null
  updated_by_username: string | null
  created_at: string
  updated_at: string
}

export interface AdminNotificationEmailTargetsResponse {
  recipients: AdminNotificationEmailTarget[]
  active_recipients: string[]
  active_count: number
}

export interface AdminNotificationEmailTestResponse {
  ok: boolean
  sent: number
  mode: string
  recipients: string[]
  configured: boolean
  error: string | null
  channel: Record<string, unknown>
}

export interface AdminDailyReportArchive {
  id: number
  report_date: string
  department_id: number | null
  region_id: number | null
  file_name: string
  file_size_bytes: number
  employee_count: number
  created_at: string
}

export interface AdminDailyReportArchiveNotifyResponse {
  ok: boolean
  archive_id: number
  archive_url: string
  total_targets: number
  sent: number
  failed: number
  deactivated: number
  admin_user_ids: number[]
  admin_usernames: string[]
}

export interface AdminDailyReportArchivePasswordDownloadPayload {
  username: string
  password: string
}

export type AttendanceExtraCheckinApprovalStatus = 'PENDING' | 'APPROVED' | 'CONSUMED' | 'EXPIRED'

export interface AttendanceExtraCheckinApproval {
  approval_id: number
  employee_id: number
  employee_name: string
  device_id: number | null
  local_day: string
  status: AttendanceExtraCheckinApprovalStatus
  requested_at: string
  expires_at: string
  approved_at: string | null
  approved_by_username: string | null
  consumed_at: string | null
  push_total_targets: number
  push_sent: number
  push_failed: number
  last_push_at: string | null
}

export interface AttendanceExtraCheckinApprovalApproveResponse {
  ok: boolean
  approval: AttendanceExtraCheckinApproval
  already_processed: boolean
}

export interface AdminManualNotificationSendResponse {
  ok: boolean
  total_targets: number
  sent: number
  failed: number
  deactivated: number
  employee_ids: number[]
  admin_user_ids: number[]
  admin_usernames: string[]
  employee_total_targets: number
  employee_sent: number
  employee_failed: number
  employee_deactivated: number
  admin_total_targets: number
  admin_sent: number
  admin_failed: number
  admin_deactivated: number
  admin_target_missing: boolean
}

export interface ScheduledNotificationTask {
  id: number
  name: string
  title: string
  message: string
  target: 'employees' | 'admins' | 'both'
  employee_scope: 'all' | 'selected' | null
  admin_scope: 'all' | 'selected' | null
  employee_ids: number[]
  admin_user_ids: number[]
  schedule_kind: 'once' | 'daily'
  run_date_local: string | null
  run_time_local: string
  timezone_name: string
  is_active: boolean
  last_enqueued_local_date: string | null
  last_enqueued_at_utc: string | null
  next_run_at_utc: string | null
  created_by_username: string | null
  updated_by_username: string | null
  created_at: string
  updated_at: string
}

export interface ScheduledNotificationTaskPageResponse {
  items: ScheduledNotificationTask[]
  total: number
}

export interface ManualDayOverride {
  id: number
  employee_id: number
  day_date: string
  in_ts: string | null
  out_ts: string | null
  is_absent: boolean
  status: 'NORMAL' | 'IZINLI' | 'RESMI_TATIL' | 'CALISMADI'
  rule_source_override: 'SHIFT' | 'WEEKLY' | 'WORK_RULE' | null
  rule_shift_id_override: number | null
  note: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface LeaveRecord {
  id: number
  employee_id: number
  start_date: string
  end_date: string
  type: LeaveType
  status: LeaveStatus
  half_day: boolean
  note: string | null
  requested_by_employee: boolean
  decision_note: string | null
  decided_at: string | null
  created_at: string
  attachment_count?: number
  message_count?: number
  last_message_at?: string | null
  latest_message_preview?: string | null
}

export interface LeaveLedgerRow {
  employee_id: number
  employee_name: string
  department_name: string | null
  hire_date: string | null
  has_hire_date: boolean
  seniority_label: string
  completed_service_years: number
  annual_rate: number
  entitled_total: string
  used_total: string
  used_year: string
  remaining: string
}

export interface LeaveLedgerResponse {
  as_of: string
  year: number | null
  rows: LeaveLedgerRow[]
}

export interface LeaveAttachmentRecord {
  id: number
  leave_id: number
  employee_id: number
  uploaded_by_actor: string
  uploaded_by_label: string
  file_name: string
  content_type: string
  file_size_bytes: number
  created_at: string
}

export interface LeaveMessageRecord {
  id: number
  leave_id: number
  employee_id: number
  sender_actor: string
  sender_label: string
  message: string
  created_at: string
}

export interface LeaveThreadRecord {
  leave: LeaveRecord
  attachments: LeaveAttachmentRecord[]
  messages: LeaveMessageRecord[]
}

export interface EmployeeConversationRecord {
  id: number
  employee_id: number
  employee_name: string
  category: EmployeeConversationCategory
  subject: string
  status: EmployeeConversationStatus
  created_at: string
  updated_at: string
  closed_at: string | null
  last_message_at: string
  message_count: number
  latest_message_preview: string | null
}

export interface EmployeeConversationMessageRecord {
  id: number
  conversation_id: number
  employee_id: number
  sender_actor: string
  sender_label: string
  message: string
  created_at: string
}

export interface EmployeeConversationThreadRecord {
  conversation: EmployeeConversationRecord
  messages: EmployeeConversationMessageRecord[]
}

export interface DeviceInviteCreateResponse {
  token: string
  invite_url: string
}

export interface DashboardEmployeeMonthMetrics {
  year: number
  month: number
  worked_minutes: number
  plan_overtime_minutes: number
  extra_work_minutes: number
  overtime_minutes: number
  incomplete_days: number
}

export interface DashboardEmployeeLastEvent {
  event_id: number
  event_type: AttendanceType
  ts_utc: string
  location_status: LocationStatus
  device_id: number
  lat: number | null
  lon: number | null
  accuracy_m: number | null
}

export interface DashboardEmployeeSnapshot {
  employee: Employee
  today_status: 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED'
  total_devices: number
  active_devices: number
  devices: EmployeeDeviceDetail[]
  current_month: DashboardEmployeeMonthMetrics
  previous_month: DashboardEmployeeMonthMetrics
  last_event: DashboardEmployeeLastEvent | null
  latest_location: EmployeeLiveLocation | null
  generated_at_utc: string
}

export type ControlRoomLocationState = 'LIVE' | 'STALE' | 'DORMANT' | 'NONE'
export type ControlRoomAlertSeverity = 'info' | 'warning' | 'critical'
export type ControlRoomRiskStatus = 'NORMAL' | 'WATCH' | 'CRITICAL'

export interface ControlRoomEmployeeAlert {
  code: string
  label: string
  severity: ControlRoomAlertSeverity
}

export interface ControlRoomTooltip {
  title: string
  body: string
}

export interface ControlRoomRiskFactor {
  code: string
  label: string
  value: string
  impact_score: number
  description: string
}

export interface ControlRoomMeasure {
  action_type: 'SUSPEND' | 'DISABLE_TEMP' | 'REVIEW' | 'RISK_OVERRIDE'
  label: string
  reason: string
  note: string
  duration_days: number | null
  expires_at: string | null
  created_at: string
  created_by: string
  ip: string | null
  override_score: number | null
}

export interface ControlRoomNote {
  note: string
  created_at: string
  created_by: string
  ip: string | null
}

export interface ControlRoomAuditEntry {
  audit_id: number
  action: string
  label: string
  ts_utc: string
  actor_id: string
  ip: string | null
  details: Record<string, unknown>
}

export interface ControlRoomEmployeeState {
  employee: Employee
  department_name: string | null
  shift_name: string | null
  shift_window_label: string | null
  today_status: 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED'
  location_state: ControlRoomLocationState
  last_event: DashboardEmployeeLastEvent | null
  last_checkin_utc: string | null
  last_checkout_utc: string | null
  latest_location: EmployeeLiveLocation | null
  last_portal_seen_utc: string | null
  last_activity_utc: string | null
  recent_ip: string | null
  location_label: string | null
  active_devices: number
  total_devices: number
  current_month: DashboardEmployeeMonthMetrics
  worked_today_minutes: number
  weekly_total_minutes: number
  violation_count_7d: number
  risk_score: number
  risk_status: ControlRoomRiskStatus
  absence_minutes_7d: number
  active_measure: ControlRoomMeasure | null
  latest_note: ControlRoomNote | null
  attention_flags: ControlRoomEmployeeAlert[]
  tooltip_items: ControlRoomTooltip[]
  risk_factors: ControlRoomRiskFactor[]
}

export interface ControlRoomMapPoint {
  employee_id: number
  employee_name: string
  department_name: string | null
  lat: number
  lon: number
  ts_utc: string
  accuracy_m: number | null
  today_status: 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED'
  location_state: ControlRoomLocationState
  label: string
}

export interface ControlRoomRecentEvent {
  event_id: number
  employee_id: number
  employee_name: string
  department_name: string | null
  event_type: AttendanceType
  ts_utc: string
  location_status: LocationStatus
  device_id: number
  lat: number | null
  lon: number | null
  accuracy_m: number | null
}

export interface ControlRoomTrendPoint {
  label: string
  value: number
}

export interface ControlRoomHistogramBucket {
  label: string
  min_score: number
  max_score: number
  count: number
}

export type ControlRoomSystemStatus = 'HEALTHY' | 'ATTENTION' | 'CRITICAL'

export interface ControlRoomDepartmentMetric {
  department_name: string
  employee_count: number
  average_checkin_minutes: number | null
  late_rate_percent: number
  average_active_minutes: number
}

export interface ControlRoomRiskFormulaItem {
  code: string
  label: string
  max_score: number
  description: string
}

export interface ControlRoomActiveFilters {
  q: string | null
  region_id: number | null
  department_id: number | null
  start_date: string | null
  end_date: string | null
  map_date: string | null
  include_inactive: boolean
  risk_min: number | null
  risk_max: number | null
  risk_status: ControlRoomRiskStatus | null
  sort_by: string
  sort_dir: 'asc' | 'desc'
  limit: number
  offset: number
}

export interface ControlRoomSummary {
  total_employees: number
  active_employees: number
  not_started_count: number
  in_progress_count: number
  finished_count: number
  normal_count: number
  watch_count: number
  critical_count: number
  average_risk_score: number
  active_overtime_count: number
  daily_violation_count: number
  system_status: ControlRoomSystemStatus
  average_checkin_minutes: number | null
  late_rate_percent: number
  average_active_minutes: number
  most_common_violation_window: string | null
  risk_histogram: ControlRoomHistogramBucket[]
  weekly_trend: ControlRoomTrendPoint[]
  department_metrics: ControlRoomDepartmentMetric[]
}

export interface ControlRoomOverview {
  generated_at_utc: string
  total: number
  offset: number
  limit: number
  summary: ControlRoomSummary
  active_filters: ControlRoomActiveFilters
  risk_formula: ControlRoomRiskFormulaItem[]
  items: ControlRoomEmployeeState[]
  map_points: ControlRoomMapPoint[]
  recent_events: ControlRoomRecentEvent[]
}

export interface ControlRoomEmployeeDetail {
  generated_at_utc: string
  employee_state: ControlRoomEmployeeState
  risk_history: ControlRoomTrendPoint[]
  risk_formula: ControlRoomRiskFormulaItem[]
  recent_measures: ControlRoomMeasure[]
  recent_notes: ControlRoomNote[]
  recent_audit_entries: ControlRoomAuditEntry[]
}

export interface MonthlyEmployeeDay {
  date: string
  status: 'OK' | 'INCOMPLETE' | 'LEAVE' | 'OFF'
  in: string | null
  out: string | null
  in_lat: number | null
  in_lon: number | null
  out_lat: number | null
  out_lon: number | null
  worked_minutes: number
  early_arrival_minutes: number
  overtime_minutes: number
  plan_overtime_minutes: number
  legal_extra_work_minutes: number
  legal_overtime_minutes: number
  fm1_minutes: number
  fm2_minutes: number
  fm3_minutes: number
  sunday_work_minutes: number
  weekly_rest_work_minutes: number
  special_day_work_minutes: number
  missing_minutes: number
  rule_source: 'SHIFT' | 'WEEKLY' | 'WORK_RULE'
  applied_planned_minutes: number
  applied_break_minutes: number
  break_taken_minutes?: number
  leave_type: LeaveType | null
  shift_id: number | null
  shift_name: string | null
  day_type: MonthlyDayType
  special_day_name: string | null
  special_day_type: SpecialDayType | null
  special_day_work_policy: SpecialDayWorkPolicy | null
  overtime_code: OvertimeCode
  overtime_multiplier: number | null
  flags: string[]
}

export interface MonthlyEmployeeWeek {
  week_start: string
  week_end: string
  normal_minutes: number
  extra_work_minutes: number
  overtime_minutes: number
  flags: string[]
}

export interface MonthlyEmployeeTotals {
  worked_minutes: number
  early_arrival_minutes: number
  overtime_minutes: number
  plan_overtime_minutes: number
  legal_extra_work_minutes: number
  legal_overtime_minutes: number
  fm1_minutes: number
  fm2_minutes: number
  fm3_minutes: number
  sunday_work_minutes: number
  weekly_rest_work_minutes: number
  special_day_work_minutes: number
  break_taken_minutes?: number
  incomplete_days: number
}

export type OvertimeRoundingMode = 'OFF' | 'REG_HALF_HOUR'

export interface LaborProfile {
  id: number
  name: string
  weekly_normal_minutes_default: number
  daily_max_minutes: number
  enforce_min_break_rules: boolean
  night_work_max_minutes_default: number
  night_work_exceptions_note_enabled: boolean
  overtime_annual_cap_minutes: number
  overtime_premium: number
  extra_work_premium: number
  overtime_rounding_mode: OvertimeRoundingMode
  created_at: string
  updated_at: string
}

export interface MonthlyEmployeeResponse {
  employee_id: number
  year: number
  month: number
  days: MonthlyEmployeeDay[]
  totals: MonthlyEmployeeTotals
  worked_minutes_net: number
  weekly_totals: MonthlyEmployeeWeek[]
  annual_overtime_used_minutes: number
  annual_overtime_remaining_minutes: number
  annual_overtime_cap_exceeded: boolean
  labor_profile: LaborProfile | null
}

export type LocationMonitorPointSource =
  | 'CHECKIN'
  | 'CHECKOUT'
  | 'APP_OPEN'
  | 'APP_CLOSE'
  | 'DEMO_START'
  | 'DEMO_END'
  | 'LOCATION_PING'
  | 'LAST_LOCATION'

export type LocationGeofenceStatus = 'NOT_CONFIGURED' | 'INSIDE' | 'OUTSIDE' | 'UNKNOWN'
export type LocationTrustStatus = 'NO_DATA' | 'LOW' | 'MEDIUM' | 'HIGH' | 'SUSPICIOUS'

export interface LocationMonitorPrivacy {
  exact_coordinates: boolean
  ip_visible: boolean
  device_visible: boolean
}

export interface LocationMonitorInsight {
  code: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  message: string
  value: number | null
}

export interface LocationMonitorGeofence {
  home_lat: number | null
  home_lon: number | null
  radius_m: number | null
  status: LocationGeofenceStatus
  distance_m: number | null
}

export interface LocationMonitorRouteStats {
  total_distance_m: number
  total_duration_minutes: number
  event_count: number
  simplified_point_count: number
  repeated_group_count: number
  suspicious_jump_count: number
  low_accuracy_event_count: number
  dwell_stop_count: number
}

export interface LocationMonitorRepeatedPoint {
  id: string
  lat: number
  lon: number
  point_count: number
  dwell_minutes: number
  label: string
}

export interface LocationMonitorMapPoint {
  id: string
  day: string
  source: LocationMonitorPointSource
  lat: number
  lon: number
  accuracy_m: number | null
  ts_utc: string
  label: string
  location_status: LocationStatus | null
  device_id: number | null
  ip: string | null
  geofence_status: LocationGeofenceStatus | null
  trust_status: LocationTrustStatus | null
  trust_score: number | null
  provider: string | null
  speed_mps: number | null
  heading_deg: number | null
  altitude_m: number | null
  is_mocked: boolean | null
  battery_level: number | null
  network_type: string | null
  marker_kind: 'START' | 'END' | 'EVENT' | 'LAST' | 'DWELL' | 'JUMP'
}

export interface LocationMonitorTimelineEvent {
  id: string
  ts_utc: string
  day: string
  source: 'CHECKIN' | 'CHECKOUT' | 'APP_OPEN' | 'APP_CLOSE' | 'DEMO_START' | 'DEMO_END' | 'LOCATION_PING'
  label: string
  lat: number | null
  lon: number | null
  accuracy_m: number | null
  location_status: LocationStatus | null
  geofence_status: LocationGeofenceStatus | null
  trust_status: LocationTrustStatus | null
  trust_score: number | null
  device_id: number | null
  ip: string | null
  provider: string | null
  speed_mps: number | null
  heading_deg: number | null
  altitude_m: number | null
  is_mocked: boolean | null
  battery_level: number | null
  network_type: string | null
  flags: Record<string, unknown>
}

export interface LocationMonitorEmployeeSummary {
  employee: Employee
  department_name: string | null
  region_name: string | null
  shift_name: string | null
  today_status: 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED'
  worked_today_minutes: number
  weekly_total_minutes: number
  active_devices: number
  total_devices: number
  recent_ip: string | null
  last_activity_utc: string | null
  last_portal_seen_utc: string | null
  last_checkin_utc: string | null
  last_checkout_utc: string | null
  last_app_open_utc: string | null
  last_app_close_utc: string | null
  last_demo_start_utc: string | null
  last_demo_end_utc: string | null
  location_label: string | null
  latest_location: LocationMonitorMapPoint | null
  last_location_status: LocationStatus | null
  last_geofence_status: LocationGeofenceStatus | null
  last_trust_status: LocationTrustStatus | null
  last_trust_score: number | null
  last_accuracy_m: number | null
  last_device_id: number | null
  last_provider: string | null
}

export interface LocationMonitorRangeTotals {
  worked_minutes: number
  overtime_minutes: number
  plan_overtime_minutes: number
  legal_overtime_minutes: number
  overtime_day_count: number
}

export interface LocationMonitorDayRecord {
  date: string
  status: 'OK' | 'INCOMPLETE' | 'LEAVE' | 'OFF'
  check_in: string | null
  check_out: string | null
  worked_minutes: number
  overtime_minutes: number
  plan_overtime_minutes: number
  legal_overtime_minutes: number
  first_app_open_utc: string | null
  last_app_close_utc: string | null
  first_demo_start_utc: string | null
  last_demo_end_utc: string | null
  check_in_point: LocationMonitorMapPoint | null
  check_out_point: LocationMonitorMapPoint | null
  first_app_open_point: LocationMonitorMapPoint | null
  last_app_close_point: LocationMonitorMapPoint | null
  first_demo_start_point: LocationMonitorMapPoint | null
  last_demo_end_point: LocationMonitorMapPoint | null
  last_location_point: LocationMonitorMapPoint | null
  suspicious_jump_count: number
  low_accuracy_count: number
  outside_geofence_count: number
  event_count: number
  distance_m: number | null
  point_count: number
}

export interface LocationMonitorSummaryResponse {
  generated_at_utc: string
  summary: LocationMonitorEmployeeSummary
  insights: LocationMonitorInsight[]
  geofence: LocationMonitorGeofence | null
  privacy: LocationMonitorPrivacy
}

export interface LocationMonitorTimelineResponse {
  generated_at_utc: string
  start_date: string
  end_date: string
  days: LocationMonitorDayRecord[]
  events: LocationMonitorTimelineEvent[]
  insights: LocationMonitorInsight[]
  totals: LocationMonitorRangeTotals
}

export interface LocationMonitorMapResponse {
  generated_at_utc: string
  start_date: string
  end_date: string
  points: LocationMonitorMapPoint[]
  simplified_points: LocationMonitorMapPoint[]
  repeated_groups: LocationMonitorRepeatedPoint[]
  route_stats: LocationMonitorRouteStats
  geofence: LocationMonitorGeofence | null
  privacy: LocationMonitorPrivacy
}

export interface LocationMonitorEmployeeTimelineResponse {
  generated_at_utc: string
  start_date: string
  end_date: string
  summary: LocationMonitorEmployeeSummary
  totals: LocationMonitorRangeTotals
  days: LocationMonitorDayRecord[]
  map_points: LocationMonitorMapPoint[]
  simplified_map_points: LocationMonitorMapPoint[]
  timeline_events: LocationMonitorTimelineEvent[]
  insights: LocationMonitorInsight[]
  route_stats: LocationMonitorRouteStats
  repeated_groups: LocationMonitorRepeatedPoint[]
  geofence: LocationMonitorGeofence | null
  privacy: LocationMonitorPrivacy
}

export interface DepartmentSummaryItem {
  department_id: number
  department_name: string
  region_id?: number | null
  region_name?: string | null
  worked_minutes: number
  overtime_minutes: number
  plan_overtime_minutes: number
  legal_extra_work_minutes: number
  legal_overtime_minutes: number
  fm1_minutes: number
  fm2_minutes: number
  fm3_minutes: number
  sunday_work_minutes: number
  weekly_rest_work_minutes: number
  special_day_work_minutes: number
  employee_count: number
}

export interface AdminAuthResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string | null
  user?: AdminMeResponse | null
}

export interface AdminPermissionValue {
  read: boolean
  write: boolean
}

export type AdminPermissions = Record<string, AdminPermissionValue>

export interface AdminUser {
  id: number
  username: string
  full_name: string | null
  is_active: boolean
  is_super_admin: boolean
  mfa_enabled: boolean
  mfa_secret_configured: boolean
  claim_total: number
  claim_active_total: number
  claim_inactive_total: number
  permissions: AdminPermissions
  last_seen_at: string | null
  last_login_at: string | null
  is_online: boolean
  created_at: string
  updated_at: string
}

export interface AdminPushClaimDetail {
  id: number
  admin_user_id: number | null
  admin_username: string
  is_active: boolean
  endpoint: string
  endpoint_fingerprint: string
  user_agent: string | null
  last_error: string | null
  created_at: string
  updated_at: string
  last_seen_at: string
}

export type AdminDeviceInviteStatus = 'PENDING' | 'USED' | 'EXPIRED'

export interface AdminDeviceInviteDetail {
  id: number
  status: AdminDeviceInviteStatus
  expires_at: string
  is_used: boolean
  attempt_count: number
  max_attempts: number
  created_by_admin_user_id: number | null
  created_by_username: string
  used_by_admin_user_id: number | null
  used_by_username: string | null
  created_at: string
  used_at: string | null
}

export interface AdminUserClaimDetail {
  admin_user: AdminUser
  claim_total: number
  claim_active_total: number
  claim_inactive_total: number
  claims: AdminPushClaimDetail[]
  created_invites: AdminDeviceInviteDetail[]
  used_invites: AdminDeviceInviteDetail[]
}

export interface AdminUserMfaStatus {
  admin_user_id: number
  username: string
  mfa_enabled: boolean
  has_secret: boolean
  recovery_code_active_count: number
  recovery_code_total_count: number
  recovery_code_expires_at: string | null
  updated_at: string | null
}

export interface AdminUserMfaSetupStartResponse {
  admin_user_id: number
  username: string
  issuer: string
  secret_key: string
  otpauth_uri: string
}

export interface AdminUserMfaSetupConfirmResponse {
  ok: boolean
  mfa_enabled: boolean
  recovery_codes: string[]
  recovery_code_expires_at: string
}

export interface AdminUserMfaRecoveryRegenerateResponse {
  ok: boolean
  recovery_codes: string[]
  recovery_code_expires_at: string
}

export interface AdminMeResponse {
  sub: string
  username: string
  admin_user_id: number | null
  full_name?: string | null
  role: string
  is_super_admin: boolean
  permissions: AdminPermissions
  iat: number
  exp: number
}

export interface ApiErrorShape {
  error?: {
    code: string
    message: string
    request_id?: string
  }
}

export type DailyBoardStatus =
  | 'OFF'
  | 'NOT_STARTED'
  | 'ABSENT_RISK'
  | 'ABSENT'
  | 'IN_PROGRESS'
  | 'OPEN_OVERDUE'
  | 'FINISHED'

export interface DailyBoardEmployeeRow {
  employee_id: number
  full_name: string
  region_id: number | null
  region_name: string | null
  department_id: number | null
  department_name: string | null
  is_active: boolean
  status: DailyBoardStatus
  is_workday: boolean
  shift_window_label: string | null
  first_in_utc: string | null
  last_out_utc: string | null
  worked_minutes: number
  qr_missing: boolean
  manual_checkin: boolean
}

export interface DailyBoardSummary {
  total: number
  active: number
  working: number
  finished: number
  absent: number
  absent_risk: number
  not_started: number
  open_overdue: number
  off: number
  qr_missing: number
}

export interface DailyBoardResponse {
  generated_at_utc: string
  target_date: string
  summary: DailyBoardSummary
  items: DailyBoardEmployeeRow[]
}

export interface EmployeeAttendanceHistoryDay {
  day: string
  is_workday: boolean
  status: DailyBoardStatus
  first_in_utc: string | null
  last_out_utc: string | null
  worked_minutes: number
  qr_missing: boolean
  manual_checkin: boolean
}

export interface EmployeeAttendanceHistoryAggregate {
  workday_count: number
  worked_days: number
  absent_days: number
  qr_missing_days: number
  incomplete_days: number
  absent_dates: string[]
}

export interface EmployeeAttendanceHistoryResponse {
  employee_id: number
  full_name: string
  department_name: string | null
  start_date: string
  end_date: string
  aggregate: EmployeeAttendanceHistoryAggregate
  days: EmployeeAttendanceHistoryDay[]
}

export interface AdminPresenceEntry {
  key: string
  username: string
  full_name: string | null
  role: string | null
  last_seen_utc: string
}

export interface AdminPresenceRosterEntry {
  username: string
  full_name: string | null
  role: string | null
  is_online: boolean
  last_seen_utc: string | null
  last_login_utc: string | null
}

export interface AdminPresenceResponse {
  generated_at_utc: string
  online: AdminPresenceEntry[]
  roster: AdminPresenceRosterEntry[]
}

export type PayrollRunStatus = 'DRAFT' | 'APPROVED'

export type CompensationBasis = 'GROSS' | 'NET'
export type SgkStatus = 'NORMAL' | 'EMEKLI'
export type PayrollComponentKind = 'EARNING' | 'DEDUCTION'

export interface PayrollComponentRecord {
  id: number
  employee_id: number
  year: number
  month: number
  kind: PayrollComponentKind
  code: string | null
  label: string
  amount: string
  exempt_limit: string | null
  sgk_exempt: boolean
  income_tax_exempt: boolean
  stamp_tax_exempt: boolean
  note: string | null
  created_at: string
}

export interface PayrollComponentSnapshot {
  kind: PayrollComponentKind
  code: string | null
  label: string
  amount: string
  exempt_limit: string | null
  sgk_exempt: boolean
  income_tax_exempt: boolean
  stamp_tax_exempt: boolean
}

export interface IncomeTaxBracket {
  upTo: number | null
  rate: string
}

export interface CompanySettingsRecord {
  firma_unvan: string | null
  merkez_adres: string | null
  sube_adres: string | null
  vergi_dairesi: string | null
  vergi_no: string | null
  ticaret_sicil_no: string | null
  mersis_no: string | null
  sgk_isyeri_no: string | null
  internet_adresi: string | null
  logo_hesap_ucret: string | null
  logo_hesap_sgk_isveren: string | null
  logo_hesap_net_odenecek: string | null
  logo_hesap_odenecek_vergi: string | null
  logo_hesap_odenecek_sgk: string | null
  logo_hesap_personel_kesinti: string | null
}

export interface EmployeePayrollProfileRecord {
  employee_id: number
  sgk_status: SgkStatus
  is_part_time: boolean
  disability_degree: number
  tc_kimlik_no: string | null
  sgk_sicil_no: string | null
  ise_giris_tarihi: string | null
  cinsiyet: string | null
  meslek_grubu: string | null
  kanun_no: string | null
  sozlesme_tipi: string | null
  pozisyon: string | null
  dogum_tarihi: string | null
  medeni_hal: string | null
  acil_kisi_adi: string | null
  acil_kisi_tel: string | null
  sirket_telefonu: string | null
  cep_telefonu: string | null
  adres: string | null
  banka_adi: string | null
  sube: string | null
  hesap_no: string | null
}

export interface PayrollParameterRecord {
  year: number
  monthly_hours_divisor: string
  overtime_multiplier_fm1: string
  overtime_multiplier_fm2: string
  overtime_multiplier_fm3: string
  deduct_missing_minutes: boolean
  sgk_employee_rate: string
  unemployment_employee_rate: string
  sgk_employer_rate: string
  unemployment_employer_rate: string
  sgk_employer_incentive_rate: string
  sgdp_employee_rate: string
  sgdp_employer_rate: string
  apply_employer_incentive: boolean
  sgk_base_monthly: string
  sgk_ceiling_monthly: string
  stamp_tax_rate: string
  minimum_wage_gross: string
  minimum_wage_gross_h2: string | null
  minimum_wage_h2_month: number
  disability_degree1_monthly: string
  disability_degree2_monthly: string
  disability_degree3_monthly: string
  severance_ceiling_gross: string
  income_tax_brackets: IncomeTaxBracket[]
  is_persisted: boolean
}

export interface TerminationSettlement {
  employee_id: number
  employee_name: string
  hire_date: string
  termination_date: string
  service_days: number
  service_label: string
  base_gross: string
  daily_gross: string
  severance_ceiling: string
  ceiling_applied: boolean
  severance_base_monthly: string
  severance_gross: string
  severance_stamp: string
  severance_net: string
  notice_weeks: number
  notice_gross: string
  notice_stamp: string
  notice_income_tax: string
  notice_net: string
  unused_leave_days: string
  unused_leave_gross: string
  total_gross: string
  total_net: string
}

export interface EmployeeCompensationBulkResult {
  department_id: number
  created: number
  updated: number
  total: number
  employee_names: string[]
}

export interface EmployeeCompensationRecord {
  id: number
  employee_id: number
  basis: CompensationBasis
  gross_monthly: string
  net_monthly: string | null
  effective_from: string
  note: string | null
  created_at: string
}

export interface OzlukMasterRow {
  employee_id: number
  full_name: string
  is_active: boolean
  department_id: number | null
  department_name: string | null
  pozisyon: string | null
  sozlesme_tipi: string | null
  ise_giris_tarihi: string | null
  sgk_status: SgkStatus
  is_part_time: boolean
  tc_kimlik_no: string | null
  sgk_sicil_no: string | null
  sirket_telefonu: string | null
  cep_telefonu: string | null
  current_basis: CompensationBasis | null
  current_gross_monthly: string | null
  current_net_monthly: string | null
  current_effective_from: string | null
  has_profile: boolean
}

export interface PersonnelImportRow {
  sira_no: number
  full_name: string
  tc_kimlik_no: string
  region_name: string
  department_name: string
  pozisyon: string | null
  ise_giris_tarihi: string | null
  dogum_tarihi: string | null
  cinsiyet: string | null
  cep_telefonu: string | null
  sirket_telefonu: string | null
  adres: string | null
  hesap_no: string | null
  sgk_sicil_no: string | null
  action: 'CREATE' | 'UPDATE'
  employee_id: number | null
  changed_fields: string[]
  warnings: string[]
}

export interface PersonnelImportPreviewResponse {
  rows: PersonnelImportRow[]
  new_regions: string[]
  new_departments: string[]
  parse_errors: string[]
}

export interface PersonnelImportCommitResponse {
  created: number
  updated: number
  skipped: number
  created_regions: string[]
  created_departments: string[]
}

export interface OzlukEmployeeDetail {
  employee_id: number
  full_name: string
  is_active: boolean
  department_id: number | null
  department_name: string | null
  profile: EmployeePayrollProfileRecord
  compensations: EmployeeCompensationRecord[]
}

export interface PayrollItemRecord {
  id: number
  employee_id: number | null
  employee_name: string
  department_name: string | null
  compensation_basis: CompensationBasis
  sgk_status: SgkStatus
  kanun_no: string | null
  gross_monthly: string
  hourly_rate: string
  worked_minutes: number
  fm1_minutes: number
  fm2_minutes: number
  fm3_minutes: number
  missing_minutes: number
  unpaid_leave_minutes: number
  incomplete_days: number
  base_earning: string
  overtime_fm1_amount: string
  overtime_fm2_amount: string
  overtime_fm3_amount: string
  missing_deduction: string
  unpaid_leave_deduction: string
  gross_total: string
  additional_earnings: string
  additional_deductions: string
  components: PayrollComponentSnapshot[]
  sgk_days: number
  sgk_base: string
  sgk_employee: string
  unemployment_employee: string
  income_tax_base: string
  disability_reduction: string
  cumulative_income_tax_base: string
  income_tax_calculated: string
  income_tax_exemption: string
  income_tax_payable: string
  stamp_tax_calculated: string
  stamp_tax_exemption: string
  stamp_tax_payable: string
  net_total: string
  sgk_employer: string
  unemployment_employer: string
  employer_incentive: string
  employer_cost_total: string
}

export interface PayrollSkippedEmployee {
  employee_id: number
  employee_name: string
}

export interface PayrollRunSummaryRecord {
  id: number
  year: number
  month: number
  status: PayrollRunStatus
  note: string | null
  approved_at: string | null
  approved_by: string | null
  created_at: string
  item_count: number
  gross_total_sum: string
}

export interface PayrollRunRecord extends PayrollRunSummaryRecord {
  items: PayrollItemRecord[]
  skipped_employees: PayrollSkippedEmployee[]
}

export interface PayrollDashboardRow {
  year: number
  month: number
  status: PayrollRunStatus
  employee_count: number
  gross_total: string
  net_total: string
  employer_cost_total: string
}

export interface PayrollDashboardResponse {
  rows: PayrollDashboardRow[]
  latest: PayrollDashboardRow | null
}

export interface PayrollEmployeeHistoryRow {
  payroll_item_id: number
  year: number
  month: number
  status: PayrollRunStatus
  gross_monthly: string
  gross_total: string
  additional_earnings: string
  additional_deductions: string
  sgk_employee: string
  income_tax_payable: string
  net_total: string
  employer_cost_total: string
}

export interface PayrollEmployeeHistoryResponse {
  employee_id: number
  employee_name: string
  items: PayrollEmployeeHistoryRow[]
  compensations: EmployeeCompensationRecord[]
}

export interface PayrollReportSummary {
  employee_count: number
  gross_total: string
  additional_earnings: string
  additional_deductions: string
  sgk_employee: string
  unemployment_employee: string
  income_tax_payable: string
  income_tax_exemption: string
  stamp_tax_payable: string
  disability_reduction: string
  net_total: string
  sgk_employer: string
  unemployment_employer: string
  employer_incentive: string
  employer_cost_total: string
}

export interface PayrollReportDepartmentRow {
  department_name: string
  employee_count: number
  gross_total: string
  additional_earnings: string
  net_total: string
  employer_cost_total: string
}

export interface PayrollReportSgkRow {
  sgk_status: string
  kanun_no: string
  employee_count: number
  sgk_days: number
  sgk_base: string
  sgk_employee: string
  unemployment_employee: string
  sgk_employer: string
  unemployment_employer: string
  employer_incentive: string
}

export interface PayrollReportTaxRow {
  employee_name: string
  department_name: string | null
  income_tax_base: string
  cumulative_income_tax_base: string
  income_tax_calculated: string
  income_tax_exemption: string
  income_tax_payable: string
  stamp_tax_payable: string
  disability_reduction: string
}

export interface PayrollReportRecord {
  year: number
  month: number
  status: PayrollRunStatus
  summary: PayrollReportSummary
  by_department: PayrollReportDepartmentRow[]
  sgk_accrual: PayrollReportSgkRow[]
  tax_lines: PayrollReportTaxRow[]
}

export interface AssistantChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantChatResponse {
  reply: string
  tool_calls: string[]
  usage?: AssistantUsage | null
}

export interface AssistantConfigStatus {
  enabled: boolean
  model: string
  base_url: string
  has_key: boolean
  key_source: 'db' | 'env' | 'none'
  key_masked: string | null
  updated_by: string | null
  updated_at: string | null
}

export interface AssistantUsage {
  model: string
  used_today: number
  daily_cap: number | null
  remaining: number | null
}

export interface AssistantConfigUpdatePayload {
  username?: string
  password?: string
  api_key?: string
  model?: string
  base_url?: string
  enabled?: boolean
}

export interface DepoKullanici {
  id: number
  ad: string
  rol: string
  aktif: boolean
  employee_id: number | null
  employee_ad: string | null
}

export interface DepoKullaniciUpdatePayload {
  employee_id: number | null
}

export interface DepoCalisanIzin {
  employee_id: number
  ad_soyad: string
  depo_stok_izni: boolean
}

export interface DepoCalisanIzinUpdatePayload {
  izinli: boolean
}
