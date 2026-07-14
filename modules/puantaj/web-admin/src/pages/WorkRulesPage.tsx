import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import {
  cancelSchedulePlan,
  createWorkRule,
  deleteDepartmentShift,
  deactivateSaturdayRotation,
  deactivateEmployeeWeeklyRestDay,
  deactivateSpecialDay,
  deactivateSpecialDayEmployeeOverride,
  getDepartmentShifts,
  getDepartmentWeekdayShiftAssignments,
  getDepartments,
  getEmployees,
  getEmployeeWeeklyRestDays,
  getRegions,
  getSaturdayRotations,
  getSchedulePlans,
  getSpecialDays,
  getSpecialDayEmployeeOverrides,
  getWorkRules,
  replaceDepartmentWeekdayShiftAssignments,
  upsertDepartmentShift,
  upsertEmployeeWeeklyRestDay,
  upsertSaturdayRotation,
  upsertSchedulePlan,
  upsertSpecialDay,
  upsertSpecialDayEmployeeOverride,
} from '../api/admin'
import { WeekdayShiftAssignmentEditor } from '../components/schedule/WeekdayShiftAssignmentEditor'
import { parseApiError } from '../api/error'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { MinuteDisplay } from '../components/MinuteDisplay'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { useToast } from '../hooks/useToast'
import type {
  DepartmentShift,
  EmployeeWeeklyRestDay,
  OvertimeCode,
  SaturdayRotation,
  SchedulePlan,
  SchedulePlanTargetType,
  SpecialDay,
  SpecialDayEmployeeOverride,
  SpecialDayType,
  SpecialDayWorkPolicy,
} from '../types/api'
import { formatMinutesForHr } from '../utils/minutes'

const workRuleSchema = z.object({
  department_id: z.coerce.number().int().positive(),
  daily_minutes_planned: z.coerce.number().int().nonnegative(),
  break_minutes: z.coerce.number().int().nonnegative(),
  grace_minutes: z.coerce.number().int().nonnegative(),
  early_arrival_tolerance_minutes: z.coerce.number().int().nonnegative(),
  overtime_grace_minutes: z.coerce.number().int().nonnegative(),
  off_shift_tolerance_minutes: z.coerce.number().int().nonnegative(),
  overtime_threshold_minutes: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z.coerce.number().int().nonnegative().nullable(),
  ),
})

const shiftSchema = z.object({
  department_id: z.coerce.number().int().positive(),
  name: z.string().min(1).max(100),
  start_time_local: z.string().regex(/^\d{2}:\d{2}$/),
  end_time_local: z.string().regex(/^\d{2}:\d{2}$/),
  break_minutes: z.coerce.number().int().nonnegative(),
  is_active: z.boolean(),
})

const PLAN_TARGET_OPTIONS: Array<{ value: SchedulePlanTargetType; label: string }> = [
  { value: 'DEPARTMENT', label: 'Tüm departman' },
  { value: 'DEPARTMENT_EXCEPT_EMPLOYEE', label: 'Departman (çalışan haric)' },
  { value: 'ONLY_EMPLOYEE', label: 'Sadece seçili çalışan' },
]

const PLAN_TARGET_LABELS: Record<SchedulePlanTargetType, string> = {
  DEPARTMENT: 'Departman geneli',
  DEPARTMENT_EXCEPT_EMPLOYEE: 'Departman (haric)',
  ONLY_EMPLOYEE: 'Sadece çalışan',
}

const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Pazartesi' },
  { value: 1, label: 'Sali' },
  { value: 2, label: 'Carsamba' },
  { value: 3, label: 'Persembe' },
  { value: 4, label: 'Cuma' },
  { value: 5, label: 'Cumartesi' },
  { value: 6, label: 'Pazar' },
]

const SPECIAL_DAY_TYPE_OPTIONS: Array<{ value: SpecialDayType; label: string }> = [
  { value: 'PUBLIC_HOLIDAY', label: 'Resmi tatil' },
  { value: 'COMPANY_HOLIDAY', label: 'Sirket tatili' },
  { value: 'ADMINISTRATIVE_LEAVE', label: 'Idari izin' },
  { value: 'HALF_DAY', label: 'Yarim gun' },
  { value: 'OTHER', label: 'Diger' },
]

const SPECIAL_DAY_TYPE_LABELS = Object.fromEntries(
  SPECIAL_DAY_TYPE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<SpecialDayType, string>

const SPECIAL_DAY_POLICY_OPTIONS: Array<{ value: SpecialDayWorkPolicy; label: string }> = [
  { value: 'OFF', label: 'Tatil / izin yaz' },
  { value: 'HALF_DAY', label: 'Yarim gun calisma' },
  { value: 'WORKDAY', label: 'Normal calisma' },
]

const SPECIAL_DAY_POLICY_LABELS = Object.fromEntries(
  SPECIAL_DAY_POLICY_OPTIONS.map((option) => [option.value, option.label]),
) as Record<SpecialDayWorkPolicy, string>

const OVERTIME_CODE_OPTIONS: Array<{ value: OvertimeCode; label: string }> = [
  { value: 'FM2', label: 'FM2 - Bayram/resmi tatil' },
  { value: 'FM3', label: 'FM3 - Pazar/hafta tatili' },
  { value: 'FM1', label: 'FM1 - Normal gun plan ustu' },
  { value: 'NONE', label: 'Mesai grubuna ayirma' },
]

const FIELD_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500'
const FIELD_INPUT =
  'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400'
const FORM_SECTION = 'rounded-xl border border-slate-200 bg-slate-50/70 p-4'
const FORM_SECTION_TITLE = 'text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700'

function parseOptionalMinutes(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.trunc(parsed)
}

function planToPayload(plan: SchedulePlan, isActive: boolean) {
  const normalizedTargets =
    plan.target_employee_ids && plan.target_employee_ids.length > 0
      ? plan.target_employee_ids
      : plan.target_employee_id
        ? [plan.target_employee_id]
        : []
  return {
    id: plan.id,
    department_id: plan.department_id,
    target_type: plan.target_type,
    target_employee_id: normalizedTargets.length > 0 ? normalizedTargets[0] : null,
    target_employee_ids: normalizedTargets,
    shift_id: plan.shift_id,
    daily_minutes_planned: plan.daily_minutes_planned,
    break_minutes: plan.break_minutes,
    grace_minutes: plan.grace_minutes,
    early_arrival_tolerance_minutes: plan.early_arrival_tolerance_minutes,
    overtime_grace_minutes: plan.overtime_grace_minutes,
    off_shift_tolerance_minutes: plan.off_shift_tolerance_minutes,
    overtime_threshold_minutes: plan.overtime_threshold_minutes,
    start_date: plan.start_date,
    end_date: plan.end_date,
    is_locked: plan.is_locked,
    is_active: isActive,
    note: plan.note,
  }
}

interface SaturdayRotationDayDraft {
  day_date: string
  employee_ids: number[]
  is_active: boolean
  note: string
}

function addDaysIso(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function listSaturdays(startDate: string, endDate: string): string[] {
  if (!startDate || !endDate || startDate > endDate) return []
  const cursor = new Date(`${startDate}T12:00:00`)
  const end = new Date(`${endDate}T12:00:00`)
  while (cursor.getDay() !== 6) cursor.setDate(cursor.getDate() + 1)
  const result: string[] = []
  while (cursor <= end) {
    result.push(cursor.toISOString().slice(0, 10))
    cursor.setDate(cursor.getDate() + 7)
  }
  return result
}

function formatSaturdayLabel(value: string): string {
  const date = new Date(`${value}T12:00:00`)
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })
}

function rotateEmployeeIds(employeeIds: number[], index: number, teamSize: number): number[] {
  if (employeeIds.length === 0 || teamSize <= 0) return []
  const result: number[] = []
  const start = (index * teamSize) % employeeIds.length
  for (let offset = 0; offset < Math.min(teamSize, employeeIds.length); offset += 1) {
    result.push(employeeIds[(start + offset) % employeeIds.length])
  }
  return result
}

export function WorkRulesPage() {
  const queryClient = useQueryClient()
  const { pushToast } = useToast()

  const [departmentId, setDepartmentId] = useState('')
  const [dailyMinutesPlanned, setDailyMinutesPlanned] = useState('540')
  const [breakMinutes, setBreakMinutes] = useState('60')
  const [graceMinutes, setGraceMinutes] = useState('5')
  const [earlyArrivalToleranceMinutes, setEarlyArrivalToleranceMinutes] = useState('0')
  const [overtimeGraceMinutes, setOvertimeGraceMinutes] = useState('0')
  const [offShiftToleranceMinutes, setOffShiftToleranceMinutes] = useState('0')
  const [overtimeThresholdMinutes, setOvertimeThresholdMinutes] = useState('')

  const [weekdayAssignmentDepartmentId, setWeekdayAssignmentDepartmentId] = useState('')

  const [shiftDepartmentId, setShiftDepartmentId] = useState('')
  const [shiftName, setShiftName] = useState('')
  const [shiftStart, setShiftStart] = useState('10:00')
  const [shiftEnd, setShiftEnd] = useState('18:00')
  const [shiftBreakMinutes, setShiftBreakMinutes] = useState('60')
  const [shiftIsActive, setShiftIsActive] = useState(true)
  const [shiftEditingId, setShiftEditingId] = useState<number | null>(null)

  const [planId, setPlanId] = useState<number | null>(null)
  const [planDepartmentId, setPlanDepartmentId] = useState('')
  const [planTargetType, setPlanTargetType] = useState<SchedulePlanTargetType>('DEPARTMENT')
  const [planTargetEmployeeIds, setPlanTargetEmployeeIds] = useState<number[]>([])
  const [planTargetSearch, setPlanTargetSearch] = useState('')
  const [planShiftId, setPlanShiftId] = useState('')
  const [planDailyMinutes, setPlanDailyMinutes] = useState('')
  const [planBreakMinutes, setPlanBreakMinutes] = useState('')
  const [planGraceMinutes, setPlanGraceMinutes] = useState('')
  const [planEarlyArrivalToleranceMinutes, setPlanEarlyArrivalToleranceMinutes] = useState('')
  const [planOvertimeGraceMinutes, setPlanOvertimeGraceMinutes] = useState('')
  const [planOffShiftToleranceMinutes, setPlanOffShiftToleranceMinutes] = useState('')
  const [planOvertimeThresholdMinutes, setPlanOvertimeThresholdMinutes] = useState('')
  const [planStartDate, setPlanStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [planEndDate, setPlanEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [planIsLocked, setPlanIsLocked] = useState(false)
  const [planIsActive, setPlanIsActive] = useState(true)
  const [planNote, setPlanNote] = useState('')
  const [showInactivePlans, setShowInactivePlans] = useState(true)

  const [rotationId, setRotationId] = useState<number | null>(null)
  const [rotationName, setRotationName] = useState('Teknik Servis Cumartesi Rotasyonu')
  const [rotationDepartmentId, setRotationDepartmentId] = useState('')
  const [rotationShiftId, setRotationShiftId] = useState('')
  const [rotationStartDate, setRotationStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [rotationEndDate, setRotationEndDate] = useState(addDaysIso(new Date().toISOString().slice(0, 10), 56))
  const [rotationTeamSize, setRotationTeamSize] = useState('2')
  const [rotationRepeatWeeks, setRotationRepeatWeeks] = useState('1')
  const [rotationPoolEmployeeIds, setRotationPoolEmployeeIds] = useState<number[]>([])
  const [rotationEmployeeSearch, setRotationEmployeeSearch] = useState('')
  const [rotationDays, setRotationDays] = useState<SaturdayRotationDayDraft[]>([])
  const [dirtyRotationDayDates, setDirtyRotationDayDates] = useState<Set<string>>(new Set())
  const [lastSavedRotationDayDate, setLastSavedRotationDayDate] = useState<string | null>(null)
  const [rotationFormError, setRotationFormError] = useState<string | null>(null)
  const [rotationIsActive, setRotationIsActive] = useState(true)
  const [rotationNote, setRotationNote] = useState('')
  const [showInactiveRotations, setShowInactiveRotations] = useState(true)

  const [restDayEmployeeId, setRestDayEmployeeId] = useState('')
  const [restDayWeekday, setRestDayWeekday] = useState('6')
  const [restDayNote, setRestDayNote] = useState('')
  const [showInactiveRestDays, setShowInactiveRestDays] = useState(false)

  const currentYear = new Date().getFullYear()
  const [specialDayId, setSpecialDayId] = useState<number | null>(null)
  const [specialDayDate, setSpecialDayDate] = useState(new Date().toISOString().slice(0, 10))
  const [specialDayName, setSpecialDayName] = useState('')
  const [specialDayType, setSpecialDayType] = useState<SpecialDayType>('PUBLIC_HOLIDAY')
  const [specialDayWorkPolicy, setSpecialDayWorkPolicy] = useState<SpecialDayWorkPolicy>('OFF')
  const [specialDayPlannedOverride, setSpecialDayPlannedOverride] = useState('')
  const [specialDayCountsAsPaidLeave, setSpecialDayCountsAsPaidLeave] = useState(true)
  const [specialDayOvertimeCode, setSpecialDayOvertimeCode] = useState<OvertimeCode>('FM2')
  const [specialDayHalfDayOvertimeStart, setSpecialDayHalfDayOvertimeStart] = useState('')
  const [specialDayScopeType, setSpecialDayScopeType] = useState<'GLOBAL' | 'DEPARTMENT' | 'REGION'>('GLOBAL')
  const [specialDayDepartmentId, setSpecialDayDepartmentId] = useState('')
  const [specialDayRegionId, setSpecialDayRegionId] = useState('')
  const [specialDayIsActive, setSpecialDayIsActive] = useState(true)
  const [specialDayNote, setSpecialDayNote] = useState('')
  const [specialDayListStart, setSpecialDayListStart] = useState(`${currentYear}-01-01`)
  const [specialDayListEnd, setSpecialDayListEnd] = useState(`${currentYear}-12-31`)
  const [showInactiveSpecialDays, setShowInactiveSpecialDays] = useState(false)

  const [specialDayOverrideId, setSpecialDayOverrideId] = useState<number | null>(null)
  const [specialDayOverrideSpecialDayId, setSpecialDayOverrideSpecialDayId] = useState('')
  const [specialDayOverrideEmployeeId, setSpecialDayOverrideEmployeeId] = useState('')
  const [specialDayOverrideWorkPolicy, setSpecialDayOverrideWorkPolicy] = useState<SpecialDayWorkPolicy>('OFF')
  const [specialDayOverridePlannedMinutes, setSpecialDayOverridePlannedMinutes] = useState('')
  const [specialDayOverrideCountsAsPaidLeave, setSpecialDayOverrideCountsAsPaidLeave] = useState(true)
  const [specialDayOverrideOvertimeCode, setSpecialDayOverrideOvertimeCode] = useState<OvertimeCode>('FM2')
  const [specialDayOverrideIsActive, setSpecialDayOverrideIsActive] = useState(true)
  const [specialDayOverrideNote, setSpecialDayOverrideNote] = useState('')
  const [showInactiveSpecialDayOverrides, setShowInactiveSpecialDayOverrides] = useState(false)

  const [formError, setFormError] = useState<string | null>(null)

  const departmentsQuery = useQuery({ queryKey: ['departments'], queryFn: getDepartments })
  const regionsQuery = useQuery({ queryKey: ['regions', 'active'], queryFn: () => getRegions({ include_inactive: false }) })
  const employeesQuery = useQuery({ queryKey: ['employees', 'all'], queryFn: () => getEmployees({ status: 'all' }) })
  const workRulesQuery = useQuery({ queryKey: ['work-rules'], queryFn: getWorkRules })
  const weekdayShiftAssignmentsQuery = useQuery({
    queryKey: ['department-weekday-shifts'],
    queryFn: () => getDepartmentWeekdayShiftAssignments({ active_only: true }),
  })
  const shiftsQuery = useQuery({ queryKey: ['department-shifts'], queryFn: () => getDepartmentShifts() })
  const schedulePlansQuery = useQuery({ queryKey: ['schedule-plans', 'all'], queryFn: () => getSchedulePlans({ active_only: false }) })
  const saturdayRotationsQuery = useQuery({
    queryKey: ['saturday-rotations', showInactiveRotations],
    queryFn: () => getSaturdayRotations({ active_only: !showInactiveRotations }),
  })
  const employeeWeeklyRestDaysQuery = useQuery({
    queryKey: ['employee-weekly-rest-days', showInactiveRestDays],
    queryFn: () => getEmployeeWeeklyRestDays({ active_only: !showInactiveRestDays }),
  })
  const specialDaysQuery = useQuery({
    queryKey: ['special-days', specialDayListStart, specialDayListEnd, showInactiveSpecialDays],
    queryFn: () =>
      getSpecialDays({
        start_date: specialDayListStart || undefined,
        end_date: specialDayListEnd || undefined,
        active_only: !showInactiveSpecialDays,
      }),
  })
  const specialDayEmployeeOverridesQuery = useQuery({
    queryKey: ['special-day-employee-overrides', showInactiveSpecialDayOverrides],
    queryFn: () => getSpecialDayEmployeeOverrides({ active_only: !showInactiveSpecialDayOverrides }),
  })

  const createWorkRuleMutation = useMutation({
    mutationFn: createWorkRule,
    onSuccess: () => {
      setFormError(null)
      pushToast({ variant: 'success', title: 'Mesai kurali kaydedildi', description: 'Departman mesai kurali kaydedildi.' })
      void queryClient.invalidateQueries({ queryKey: ['work-rules'] })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Mesai kurali kaydedilemedi.')
      setFormError(parsed.message)
      pushToast({ variant: 'error', title: 'Mesai kurali kaydedilemedi', description: parsed.message })
    },
  })

  const replaceWeekdayShiftAssignmentsMutation = useMutation({
    mutationFn: replaceDepartmentWeekdayShiftAssignments,
    onSuccess: () => {
      setFormError(null)
      pushToast({
        variant: 'success',
        title: 'Günlük vardiya planı kaydedildi',
        description: 'Seçilen gün için vardiya eşleştirmesi güncellendi.',
      })
      void queryClient.invalidateQueries({ queryKey: ['department-weekday-shifts'] })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Günlük vardiya planı kaydedilemedi.')
      setFormError(parsed.message)
      pushToast({ variant: 'error', title: 'Günlük vardiya planı kaydedilemedi', description: parsed.message })
    },
  })

  const upsertShiftMutation = useMutation({
    mutationFn: upsertDepartmentShift,
    onSuccess: () => {
      setFormError(null)
      setShiftEditingId(null)
      setShiftName('')
      setShiftStart('10:00')
      setShiftEnd('18:00')
      setShiftBreakMinutes('60')
      setShiftIsActive(true)
      pushToast({ variant: 'success', title: 'Vardiya kaydedildi', description: 'Departman vardiyasi güncellendi.' })
      void queryClient.invalidateQueries({ queryKey: ['department-shifts'] })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Vardiya kaydedilemedi.')
      setFormError(parsed.message)
      pushToast({ variant: 'error', title: 'Vardiya kaydedilemedi', description: parsed.message })
    },
  })

  const deactivateShiftMutation = useMutation({
    mutationFn: deleteDepartmentShift,
    onSuccess: () => {
      setFormError(null)
      if (shiftEditingId !== null) {
        setShiftEditingId(null)
        setShiftName('')
        setShiftStart('10:00')
        setShiftEnd('18:00')
        setShiftBreakMinutes('60')
        setShiftIsActive(true)
      }
      pushToast({ variant: 'success', title: 'Vardiya pasife alındı', description: 'Vardiya kaydı pasif duruma getirildi.' })
      void queryClient.invalidateQueries({ queryKey: ['department-shifts'] })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Vardiya pasife alınamadı.')
      setFormError(parsed.message)
      pushToast({ variant: 'error', title: 'Vardiya pasife alınamadı', description: parsed.message })
    },
  })

  const setShiftActiveMutation = useMutation({
    mutationFn: ({ shift, nextActive }: { shift: DepartmentShift; nextActive: boolean }) =>
      upsertDepartmentShift({
        id: shift.id,
        department_id: shift.department_id,
        name: shift.name,
        start_time_local: shift.start_time_local,
        end_time_local: shift.end_time_local,
        break_minutes: shift.break_minutes,
        is_active: nextActive,
      }),
    onSuccess: (_result, variables) => {
      setFormError(null)
      pushToast({
        variant: 'success',
        title: variables.nextActive ? 'Vardiya aktif edildi' : 'Vardiya pasife alındı',
        description: variables.nextActive
          ? 'Vardiya tekrar kullanilabilir duruma getirildi.'
          : 'Vardiya kaydı pasif duruma getirildi.',
      })
      void queryClient.invalidateQueries({ queryKey: ['department-shifts'] })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Vardiya durumu güncellenemedi.')
      setFormError(parsed.message)
      pushToast({ variant: 'error', title: 'Vardiya durumu güncellenemedi', description: parsed.message })
    },
  })

  const upsertSchedulePlanMutation = useMutation({
    mutationFn: upsertSchedulePlan,
    onSuccess: () => {
      setFormError(null)
      pushToast({ variant: 'success', title: 'Planlama kaydedildi', description: 'Departman/çalışan plani kaydedildi.' })
      void queryClient.invalidateQueries({ queryKey: ['schedule-plans'] })
      setPlanId(null)
      setPlanTargetEmployeeIds([])
      setPlanShiftId('')
      setPlanDailyMinutes('')
      setPlanBreakMinutes('')
      setPlanGraceMinutes('')
      setPlanEarlyArrivalToleranceMinutes('')
      setPlanOvertimeGraceMinutes('')
      setPlanOffShiftToleranceMinutes('')
      setPlanIsLocked(false)
      setPlanIsActive(true)
      setPlanNote('')
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Planlama kaydedilemedi.')
      setFormError(parsed.message)
      pushToast({ variant: 'error', title: 'Planlama kaydedilemedi', description: parsed.message })
    },
  })

  const cancelSchedulePlanMutation = useMutation({
    mutationFn: cancelSchedulePlan,
    onSuccess: () => {
      setFormError(null)
      pushToast({ variant: 'success', title: 'Planlama iptal edildi', description: 'Plan pasife alındı.' })
      void queryClient.invalidateQueries({ queryKey: ['schedule-plans'] })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Planlama iptal edilemedi.')
      setFormError(parsed.message)
      pushToast({ variant: 'error', title: 'Planlama iptal edilemedi', description: parsed.message })
    },
  })

  const activateSchedulePlanMutation = useMutation({
    mutationFn: (plan: SchedulePlan) => upsertSchedulePlan(planToPayload(plan, true)),
    onSuccess: () => {
      setFormError(null)
      pushToast({ variant: 'success', title: 'Planlama aktif edildi', description: 'Plan tekrar aktif olarak kaydedildi.' })
      void queryClient.invalidateQueries({ queryKey: ['schedule-plans'] })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Plan aktif edilemedi.')
      setFormError(parsed.message)
      pushToast({ variant: 'error', title: 'Plan aktif edilemedi', description: parsed.message })
    },
  })

  const upsertSaturdayRotationMutation = useMutation({
    mutationFn: upsertSaturdayRotation,
    onSuccess: (rotation) => {
      setRotationFormError(null)
      setRotationId(rotation.id)
      setRotationDays(
        rotation.days.map((day) => ({
          day_date: day.day_date,
          employee_ids: day.employee_ids,
          is_active: day.is_active,
          note: day.note ?? '',
        })),
      )
      setDirtyRotationDayDates(new Set())
      pushToast({ variant: 'success', title: 'Cumartesi rotasyonu kaydedildi', description: 'Rotasyon gunleri ve vardiya planlari guncellendi.' })
      void queryClient.invalidateQueries({ queryKey: ['saturday-rotations'] })
      void queryClient.invalidateQueries({ queryKey: ['schedule-plans'] })
      void queryClient.invalidateQueries({ queryKey: ['monthly-employee'] })
      void queryClient.invalidateQueries({ queryKey: ['department-monthly-summary'] })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Cumartesi rotasyonu kaydedilemedi.')
      setRotationFormError(parsed.message)
      pushToast({ variant: 'error', title: 'Cumartesi rotasyonu kaydedilemedi', description: parsed.message })
    },
  })

  const deactivateSaturdayRotationMutation = useMutation({
    mutationFn: deactivateSaturdayRotation,
    onSuccess: () => {
      setFormError(null)
      pushToast({ variant: 'success', title: 'Cumartesi rotasyonu pasife alindi', description: 'Bagli vardiya planlari da pasife alindi.' })
      void queryClient.invalidateQueries({ queryKey: ['saturday-rotations'] })
      void queryClient.invalidateQueries({ queryKey: ['schedule-plans'] })
      void queryClient.invalidateQueries({ queryKey: ['monthly-employee'] })
      void queryClient.invalidateQueries({ queryKey: ['department-monthly-summary'] })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Cumartesi rotasyonu pasife alinamadi.')
      setRotationFormError(parsed.message)
      pushToast({ variant: 'error', title: 'Cumartesi rotasyonu pasife alinamadi', description: parsed.message })
    },
  })

  const upsertEmployeeWeeklyRestDayMutation = useMutation({
    mutationFn: upsertEmployeeWeeklyRestDay,
    onSuccess: () => {
      setFormError(null)
      setRestDayNote('')
      pushToast({ variant: 'success', title: 'Hafta tatili kaydedildi', description: 'Calisan hafta tatili guncellendi.' })
      void queryClient.invalidateQueries({ queryKey: ['employee-weekly-rest-days'] })
      void queryClient.invalidateQueries({ queryKey: ['monthly-employee'] })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Hafta tatili kaydedilemedi.')
      setFormError(parsed.message)
      pushToast({ variant: 'error', title: 'Hafta tatili kaydedilemedi', description: parsed.message })
    },
  })

  const deactivateEmployeeWeeklyRestDayMutation = useMutation({
    mutationFn: deactivateEmployeeWeeklyRestDay,
    onSuccess: () => {
      setFormError(null)
      pushToast({ variant: 'success', title: 'Hafta tatili pasife alindi', description: 'Calisan hafta tatili pasife alindi.' })
      void queryClient.invalidateQueries({ queryKey: ['employee-weekly-rest-days'] })
      void queryClient.invalidateQueries({ queryKey: ['monthly-employee'] })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Hafta tatili pasife alinamadi.')
      setFormError(parsed.message)
      pushToast({ variant: 'error', title: 'Hafta tatili pasife alinamadi', description: parsed.message })
    },
  })

  const upsertSpecialDayMutation = useMutation({
    mutationFn: upsertSpecialDay,
    onSuccess: () => {
      setFormError(null)
      setSpecialDayId(null)
      setSpecialDayName('')
      setSpecialDayPlannedOverride('')
      setSpecialDayNote('')
      pushToast({ variant: 'success', title: 'Ozel gun kaydedildi', description: 'Ozel gun ve mesai kurali guncellendi.' })
      void queryClient.invalidateQueries({ queryKey: ['special-days'] })
      void queryClient.invalidateQueries({ queryKey: ['monthly-employee'] })
      void queryClient.invalidateQueries({ queryKey: ['department-monthly-summary'] })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Ozel gun kaydedilemedi.')
      setFormError(parsed.message)
      pushToast({ variant: 'error', title: 'Ozel gun kaydedilemedi', description: parsed.message })
    },
  })

  const deactivateSpecialDayMutation = useMutation({
    mutationFn: deactivateSpecialDay,
    onSuccess: () => {
      setFormError(null)
      pushToast({ variant: 'success', title: 'Ozel gun pasife alindi', description: 'Ozel gun kural disina cikarildi.' })
      void queryClient.invalidateQueries({ queryKey: ['special-days'] })
      void queryClient.invalidateQueries({ queryKey: ['monthly-employee'] })
      void queryClient.invalidateQueries({ queryKey: ['department-monthly-summary'] })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Ozel gun pasife alinamadi.')
      setFormError(parsed.message)
      pushToast({ variant: 'error', title: 'Ozel gun pasife alinamadi', description: parsed.message })
    },
  })

  const upsertSpecialDayEmployeeOverrideMutation = useMutation({
    mutationFn: upsertSpecialDayEmployeeOverride,
    onSuccess: () => {
      setFormError(null)
      setSpecialDayOverrideId(null)
      setSpecialDayOverridePlannedMinutes('')
      setSpecialDayOverrideNote('')
      pushToast({ variant: 'success', title: 'Istisna kaydedildi', description: 'Calisan ozel gun istisnasi guncellendi.' })
      void queryClient.invalidateQueries({ queryKey: ['special-day-employee-overrides'] })
      void queryClient.invalidateQueries({ queryKey: ['monthly-employee'] })
      void queryClient.invalidateQueries({ queryKey: ['department-monthly-summary'] })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Istisna kaydedilemedi.')
      setFormError(parsed.message)
      pushToast({ variant: 'error', title: 'Istisna kaydedilemedi', description: parsed.message })
    },
  })

  const deactivateSpecialDayEmployeeOverrideMutation = useMutation({
    mutationFn: deactivateSpecialDayEmployeeOverride,
    onSuccess: () => {
      setFormError(null)
      pushToast({ variant: 'success', title: 'Istisna pasife alindi', description: 'Calisan ozel gun istisnasi pasife alindi.' })
      void queryClient.invalidateQueries({ queryKey: ['special-day-employee-overrides'] })
      void queryClient.invalidateQueries({ queryKey: ['monthly-employee'] })
      void queryClient.invalidateQueries({ queryKey: ['department-monthly-summary'] })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Istisna pasife alinamadi.')
      setFormError(parsed.message)
      pushToast({ variant: 'error', title: 'Istisna pasife alinamadi', description: parsed.message })
    },
  })

  const livePreview = useMemo(() => {
    const daily = Number(dailyMinutesPlanned)
    const breakValue = Number(breakMinutes)
    const grace = Number(graceMinutes)
    const earlyArrivalTolerance = Number(earlyArrivalToleranceMinutes)
    const overtimeGrace = Number(overtimeGraceMinutes)
    const offShift = Number(offShiftToleranceMinutes)
    const overtimeThreshold = overtimeThresholdMinutes.trim() ? Number(overtimeThresholdMinutes) : null
    return {
      daily: formatMinutesForHr(daily),
      breakValue: formatMinutesForHr(breakValue),
      grace: formatMinutesForHr(grace),
      earlyArrivalTolerance: formatMinutesForHr(earlyArrivalTolerance),
      overtimeGrace: formatMinutesForHr(overtimeGrace),
      offShift: formatMinutesForHr(offShift),
      overtimeThreshold: overtimeThreshold === null ? 'Kapali' : formatMinutesForHr(overtimeThreshold),
    }
  }, [dailyMinutesPlanned, breakMinutes, graceMinutes, earlyArrivalToleranceMinutes, overtimeGraceMinutes, offShiftToleranceMinutes, overtimeThresholdMinutes])

  if (
    departmentsQuery.isLoading ||
    regionsQuery.isLoading ||
    employeesQuery.isLoading ||
    workRulesQuery.isLoading ||
    weekdayShiftAssignmentsQuery.isLoading ||
    shiftsQuery.isLoading ||
    schedulePlansQuery.isLoading ||
    saturdayRotationsQuery.isLoading ||
    employeeWeeklyRestDaysQuery.isLoading ||
    specialDaysQuery.isLoading ||
    specialDayEmployeeOverridesQuery.isLoading
  ) {
    return <LoadingBlock />
  }

  if (
    departmentsQuery.isError ||
    regionsQuery.isError ||
    employeesQuery.isError ||
    workRulesQuery.isError ||
    weekdayShiftAssignmentsQuery.isError ||
    shiftsQuery.isError ||
    schedulePlansQuery.isError ||
    saturdayRotationsQuery.isError ||
    employeeWeeklyRestDaysQuery.isError ||
    specialDaysQuery.isError ||
    specialDayEmployeeOverridesQuery.isError
  ) {
    return <ErrorBlock message="Mesai kurali verileri alınamadı." />
  }

  const departments = departmentsQuery.data ?? []
  const regions = regionsQuery.data ?? []
  const employees = employeesQuery.data ?? []
  const workRules = workRulesQuery.data ?? []
  const weekdayShiftAssignments = weekdayShiftAssignmentsQuery.data ?? []
  const shifts = shiftsQuery.data ?? []
  const schedulePlans = schedulePlansQuery.data ?? []
  const saturdayRotations = saturdayRotationsQuery.data ?? []
  const employeeWeeklyRestDays = employeeWeeklyRestDaysQuery.data ?? []
  const specialDays = specialDaysQuery.data ?? []
  const specialDayEmployeeOverrides = specialDayEmployeeOverridesQuery.data ?? []

  const departmentNameById = new Map(departments.map((department) => [department.id, department.name]))
  const regionNameById = new Map(regions.map((region) => [region.id, region.name]))
  const employeeNameById = new Map(employees.map((employee) => [employee.id, employee.full_name]))
  const specialDayNameById = new Map(specialDays.map((day) => [day.id, `${day.day_date} - ${day.name}`]))
  const shiftNameById = new Map(shifts.map((shift) => [shift.id, shift.name]))

  const filteredPlans = schedulePlans.filter((plan) => showInactivePlans || plan.is_active)
  const selectedWeekdayAssignmentDepartmentId = weekdayAssignmentDepartmentId
    ? Number(weekdayAssignmentDepartmentId)
    : null
  const weekdayAssignmentDepartmentShifts = selectedWeekdayAssignmentDepartmentId !== null
    ? shifts.filter((shift) => shift.department_id === selectedWeekdayAssignmentDepartmentId)
    : []
  const weekdayAssignmentRows = selectedWeekdayAssignmentDepartmentId !== null
    ? weekdayShiftAssignments.filter((item) => item.department_id === selectedWeekdayAssignmentDepartmentId)
    : []
  const selectedPlanDepartmentId = planDepartmentId ? Number(planDepartmentId) : null
  const planDepartmentShifts = selectedPlanDepartmentId !== null
    ? shifts.filter((shift) => shift.department_id === selectedPlanDepartmentId)
    : []
  const planDepartmentEmployees = selectedPlanDepartmentId !== null
    ? employees.filter((employee) => employee.department_id === selectedPlanDepartmentId)
    : []
  const filteredPlanDepartmentEmployees = planTargetSearch.trim()
    ? planDepartmentEmployees.filter((employee) => {
        const normalized = planTargetSearch.trim().toLowerCase()
        return (
          employee.full_name.toLowerCase().includes(normalized) ||
          String(employee.id).includes(normalized.replace('#', ''))
        )
      })
    : planDepartmentEmployees

  const selectedRotationDepartmentId = rotationDepartmentId ? Number(rotationDepartmentId) : null
  const rotationDepartmentShifts = selectedRotationDepartmentId !== null
    ? shifts.filter((shift) => shift.department_id === selectedRotationDepartmentId)
    : []
  const rotationDepartmentEmployees = selectedRotationDepartmentId !== null
    ? employees.filter((employee) => employee.department_id === selectedRotationDepartmentId && employee.is_active)
    : []
  const filteredRotationEmployees = rotationEmployeeSearch.trim()
    ? rotationDepartmentEmployees.filter((employee) => {
        const normalized = rotationEmployeeSearch.trim().toLowerCase()
        return (
          employee.full_name.toLowerCase().includes(normalized) ||
          String(employee.id).includes(normalized.replace('#', ''))
        )
      })
    : rotationDepartmentEmployees
  const filteredSaturdayRotations = saturdayRotations.filter((rotation) => showInactiveRotations || rotation.is_active)

  const resetSaturdayRotationForm = () => {
    const today = new Date().toISOString().slice(0, 10)
    setRotationId(null)
    setRotationName('Teknik Servis Cumartesi Rotasyonu')
    setRotationDepartmentId('')
    setRotationShiftId('')
    setRotationStartDate(today)
    setRotationEndDate(addDaysIso(today, 56))
    setRotationTeamSize('2')
    setRotationRepeatWeeks('1')
    setRotationPoolEmployeeIds([])
    setRotationEmployeeSearch('')
    setRotationDays([])
    setDirtyRotationDayDates(new Set())
    setLastSavedRotationDayDate(null)
    setRotationIsActive(true)
    setRotationNote('')
    setRotationFormError(null)
  }

  const generateSaturdayRotationDays = () => {
    setRotationFormError(null)
    const teamSize = Number(rotationTeamSize)
    if (rotationPoolEmployeeIds.length > 0 && (!Number.isInteger(teamSize) || teamSize <= 0)) {
      setRotationFormError('Rotasyon ekip sayisi pozitif tam sayi olmali.')
      return
    }
    const repeatWeeks = Number(rotationRepeatWeeks)
    if (rotationPoolEmployeeIds.length > 0 && (!Number.isInteger(repeatWeeks) || repeatWeeks <= 0)) {
      setRotationFormError('Tekrar araligi pozitif tam sayi olmali.')
      return
    }
    if (!rotationStartDate || !rotationEndDate || rotationStartDate > rotationEndDate) {
      setRotationFormError('Rotasyon tarih araligini kontrol edin.')
      return
    }
    const saturdayDates = listSaturdays(rotationStartDate, rotationEndDate)
    if (saturdayDates.length === 0) {
      setRotationFormError('Secilen aralikta Cumartesi gunu bulunamadi.')
      return
    }
    setRotationDays(
      saturdayDates.map((dayDate, index) => ({
        day_date: dayDate,
        employee_ids:
          rotationPoolEmployeeIds.length > 0
            ? rotateEmployeeIds(rotationPoolEmployeeIds, Math.floor(index / repeatWeeks), teamSize)
            : [],
        is_active: true,
        note: '',
      })),
    )
    setDirtyRotationDayDates(new Set(saturdayDates))
    setLastSavedRotationDayDate(null)
  }

  const startEditSaturdayRotation = (rotation: SaturdayRotation) => {
    setRotationId(rotation.id)
    setRotationName(rotation.name)
    setRotationDepartmentId(String(rotation.department_id))
    setRotationShiftId(String(rotation.shift_id))
    setRotationStartDate(rotation.start_date)
    setRotationEndDate(rotation.end_date)
    setRotationTeamSize(String(rotation.team_size))
    setRotationRepeatWeeks(String(rotation.repeat_interval_weeks))
    setRotationIsActive(rotation.is_active)
    setRotationNote(rotation.note ?? '')
    const poolIds = Array.from(new Set(rotation.days.flatMap((day) => day.employee_ids)))
    setRotationPoolEmployeeIds(poolIds)
    setRotationEmployeeSearch('')
    setRotationDays(
      rotation.days.map((day) => ({
        day_date: day.day_date,
        employee_ids: day.employee_ids,
        is_active: day.is_active,
        note: day.note ?? '',
      })),
    )
    setDirtyRotationDayDates(new Set())
    setLastSavedRotationDayDate(null)
    setRotationFormError(null)
  }

  const addRotationDayEmployee = (dayDate: string, employeeId: number) => {
    setDirtyRotationDayDates((items) => new Set(items).add(dayDate))
    setLastSavedRotationDayDate(null)
    setRotationDays((items) =>
      items.map((item) =>
        item.day_date === dayDate && !item.employee_ids.includes(employeeId)
          ? { ...item, employee_ids: [...item.employee_ids, employeeId] }
          : item,
      ),
    )
  }

  const removeRotationDayEmployee = (dayDate: string, employeeId: number) => {
    setDirtyRotationDayDates((items) => new Set(items).add(dayDate))
    setLastSavedRotationDayDate(null)
    setRotationDays((items) =>
      items.map((item) =>
        item.day_date === dayDate
          ? { ...item, employee_ids: item.employee_ids.filter((id) => id !== employeeId) }
          : item,
      ),
    )
  }

  const updateRotationDayNote = (dayDate: string, note: string) => {
    setDirtyRotationDayDates((items) => new Set(items).add(dayDate))
    setLastSavedRotationDayDate(null)
    setRotationDays((items) =>
      items.map((item) => (item.day_date === dayDate ? { ...item, note } : item)),
    )
  }

  const updateRotationDayActive = (dayDate: string, isActive: boolean) => {
    setDirtyRotationDayDates((items) => new Set(items).add(dayDate))
    setLastSavedRotationDayDate(null)
    setRotationDays((items) =>
      items.map((item) => (item.day_date === dayDate ? { ...item, is_active: isActive } : item)),
    )
  }

  const resetSchedulePlanForm = () => {
    setPlanId(null)
    setPlanTargetType('DEPARTMENT')
    setPlanTargetEmployeeIds([])
    setPlanTargetSearch('')
    setPlanShiftId('')
    setPlanDailyMinutes('')
    setPlanBreakMinutes('')
    setPlanGraceMinutes('')
    setPlanEarlyArrivalToleranceMinutes('')
    setPlanOvertimeGraceMinutes('')
    setPlanOffShiftToleranceMinutes('')
    setPlanOvertimeThresholdMinutes('')
    setPlanStartDate(new Date().toISOString().slice(0, 10))
    setPlanEndDate(new Date().toISOString().slice(0, 10))
    setPlanIsLocked(false)
    setPlanIsActive(true)
    setPlanNote('')
  }

  const startEditSchedulePlan = (plan: SchedulePlan) => {
    const normalizedTargets =
      plan.target_employee_ids && plan.target_employee_ids.length > 0
        ? plan.target_employee_ids
        : plan.target_employee_id
          ? [plan.target_employee_id]
          : []
    setPlanId(plan.id)
    setPlanDepartmentId(String(plan.department_id))
    setPlanTargetType(plan.target_type)
    setPlanTargetEmployeeIds(normalizedTargets)
    setPlanTargetSearch('')
    setPlanShiftId(plan.shift_id ? String(plan.shift_id) : '')
    setPlanDailyMinutes(plan.daily_minutes_planned !== null ? String(plan.daily_minutes_planned) : '')
    setPlanBreakMinutes(plan.break_minutes !== null ? String(plan.break_minutes) : '')
    setPlanGraceMinutes(plan.grace_minutes !== null ? String(plan.grace_minutes) : '')
    setPlanEarlyArrivalToleranceMinutes(
      plan.early_arrival_tolerance_minutes !== null ? String(plan.early_arrival_tolerance_minutes) : '',
    )
    setPlanOvertimeGraceMinutes(
      plan.overtime_grace_minutes !== null ? String(plan.overtime_grace_minutes) : '',
    )
    setPlanOffShiftToleranceMinutes(
      plan.off_shift_tolerance_minutes !== null ? String(plan.off_shift_tolerance_minutes) : '',
    )
    setPlanOvertimeThresholdMinutes(
      plan.overtime_threshold_minutes !== null ? String(plan.overtime_threshold_minutes) : '',
    )
    setPlanStartDate(plan.start_date)
    setPlanEndDate(plan.end_date)
    setPlanIsLocked(plan.is_locked)
    setPlanIsActive(plan.is_active)
    setPlanNote(plan.note ?? '')
  }

  const startEditEmployeeRestDay = (restDay: EmployeeWeeklyRestDay) => {
    setRestDayEmployeeId(String(restDay.employee_id))
    setRestDayWeekday(String(restDay.weekday))
    setRestDayNote(restDay.note ?? '')
    setFormError(null)
  }

  const resetSpecialDayForm = () => {
    setSpecialDayId(null)
    setSpecialDayDate(new Date().toISOString().slice(0, 10))
    setSpecialDayName('')
    setSpecialDayType('PUBLIC_HOLIDAY')
    setSpecialDayWorkPolicy('OFF')
    setSpecialDayPlannedOverride('')
    setSpecialDayCountsAsPaidLeave(true)
    setSpecialDayOvertimeCode('FM2')
    setSpecialDayHalfDayOvertimeStart('')
    setSpecialDayScopeType('GLOBAL')
    setSpecialDayDepartmentId('')
    setSpecialDayRegionId('')
    setSpecialDayIsActive(true)
    setSpecialDayNote('')
    setFormError(null)
  }

  const startEditSpecialDay = (day: SpecialDay) => {
    setSpecialDayId(day.id)
    setSpecialDayDate(day.day_date)
    setSpecialDayName(day.name)
    setSpecialDayType(day.day_type)
    setSpecialDayWorkPolicy(day.work_policy)
    setSpecialDayPlannedOverride(day.planned_minutes_override !== null ? String(day.planned_minutes_override) : '')
    setSpecialDayCountsAsPaidLeave(day.counts_as_paid_leave)
    setSpecialDayOvertimeCode(day.overtime_code)
    setSpecialDayHalfDayOvertimeStart(day.half_day_overtime_start ? day.half_day_overtime_start.slice(0, 5) : '')
    if (day.department_id !== null) {
      setSpecialDayScopeType('DEPARTMENT')
      setSpecialDayDepartmentId(String(day.department_id))
      setSpecialDayRegionId('')
    } else if (day.region_id !== null) {
      setSpecialDayScopeType('REGION')
      setSpecialDayDepartmentId('')
      setSpecialDayRegionId(String(day.region_id))
    } else {
      setSpecialDayScopeType('GLOBAL')
      setSpecialDayDepartmentId('')
      setSpecialDayRegionId('')
    }
    setSpecialDayIsActive(day.is_active)
    setSpecialDayNote(day.note ?? '')
    setFormError(null)
  }

  const resetSpecialDayOverrideForm = () => {
    setSpecialDayOverrideId(null)
    setSpecialDayOverrideSpecialDayId('')
    setSpecialDayOverrideEmployeeId('')
    setSpecialDayOverrideWorkPolicy('OFF')
    setSpecialDayOverridePlannedMinutes('')
    setSpecialDayOverrideCountsAsPaidLeave(true)
    setSpecialDayOverrideOvertimeCode('FM2')
    setSpecialDayOverrideIsActive(true)
    setSpecialDayOverrideNote('')
    setFormError(null)
  }

  const startEditSpecialDayOverride = (override: SpecialDayEmployeeOverride) => {
    setSpecialDayOverrideId(override.id)
    setSpecialDayOverrideSpecialDayId(String(override.special_day_id))
    setSpecialDayOverrideEmployeeId(String(override.employee_id))
    setSpecialDayOverrideWorkPolicy(override.work_policy)
    setSpecialDayOverridePlannedMinutes(
      override.planned_minutes_override !== null ? String(override.planned_minutes_override) : '',
    )
    setSpecialDayOverrideCountsAsPaidLeave(override.counts_as_paid_leave)
    setSpecialDayOverrideOvertimeCode(override.overtime_code)
    setSpecialDayOverrideIsActive(override.is_active)
    setSpecialDayOverrideNote(override.note ?? '')
    setFormError(null)
  }

  const onSubmitEmployeeRestDay = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    const employeeId = Number(restDayEmployeeId)
    const weekday = Number(restDayWeekday)
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      setFormError('Hafta tatili icin calisan secmelisiniz.')
      return
    }
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      setFormError('Gecerli bir hafta gunu secmelisiniz.')
      return
    }
    upsertEmployeeWeeklyRestDayMutation.mutate({
      employee_id: employeeId,
      weekday,
      is_active: true,
      note: restDayNote.trim() || null,
    })
  }

  const onSubmitSpecialDay = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    if (!specialDayDate) {
      setFormError('Ozel gun tarihi zorunludur.')
      return
    }
    if (!specialDayName.trim()) {
      setFormError('Ozel gun adi zorunludur.')
      return
    }
    const plannedOverride = specialDayPlannedOverride.trim()
      ? parseOptionalMinutes(specialDayPlannedOverride)
      : null
    if (specialDayPlannedOverride.trim() && plannedOverride === null) {
      setFormError('Plan dakika override alani sifir veya pozitif sayi olmali.')
      return
    }
    const parsedDepartmentId = Number(specialDayDepartmentId)
    const parsedRegionId = Number(specialDayRegionId)
    if (specialDayScopeType === 'DEPARTMENT' && (!Number.isFinite(parsedDepartmentId) || parsedDepartmentId <= 0)) {
      setFormError('Departman kapsaminda departman secmelisiniz.')
      return
    }
    if (specialDayScopeType === 'REGION' && (!Number.isFinite(parsedRegionId) || parsedRegionId <= 0)) {
      setFormError('Bolge kapsaminda bolge secmelisiniz.')
      return
    }
    const departmentId = specialDayScopeType === 'DEPARTMENT' ? parsedDepartmentId : null
    const regionId = specialDayScopeType === 'REGION' ? parsedRegionId : null
    upsertSpecialDayMutation.mutate({
      id: specialDayId ?? undefined,
      day_date: specialDayDate,
      name: specialDayName.trim(),
      day_type: specialDayType,
      work_policy: specialDayWorkPolicy,
      planned_minutes_override: plannedOverride,
      half_day_overtime_start:
        specialDayWorkPolicy === 'HALF_DAY' && specialDayHalfDayOvertimeStart ? specialDayHalfDayOvertimeStart : null,
      counts_as_paid_leave: specialDayCountsAsPaidLeave,
      overtime_code: specialDayOvertimeCode,
      overtime_multiplier: 1,
      department_id: departmentId,
      region_id: regionId,
      is_active: specialDayIsActive,
      note: specialDayNote.trim() || null,
    })
  }

  const onSubmitSpecialDayOverride = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    const specialDayIdValue = Number(specialDayOverrideSpecialDayId)
    const employeeIdValue = Number(specialDayOverrideEmployeeId)
    if (!Number.isFinite(specialDayIdValue) || specialDayIdValue <= 0) {
      setFormError('Istisna icin ozel gun secmelisiniz.')
      return
    }
    if (!Number.isFinite(employeeIdValue) || employeeIdValue <= 0) {
      setFormError('Istisna icin calisan secmelisiniz.')
      return
    }
    const plannedOverride = specialDayOverridePlannedMinutes.trim()
      ? parseOptionalMinutes(specialDayOverridePlannedMinutes)
      : null
    if (specialDayOverridePlannedMinutes.trim() && plannedOverride === null) {
      setFormError('Istisna plan dakika alani sifir veya pozitif sayi olmali.')
      return
    }
    upsertSpecialDayEmployeeOverrideMutation.mutate({
      id: specialDayOverrideId ?? undefined,
      special_day_id: specialDayIdValue,
      employee_id: employeeIdValue,
      work_policy: specialDayOverrideWorkPolicy,
      planned_minutes_override: plannedOverride,
      counts_as_paid_leave: specialDayOverrideCountsAsPaidLeave,
      overtime_code: specialDayOverrideOvertimeCode,
      overtime_multiplier: 1,
      is_active: specialDayOverrideIsActive,
      note: specialDayOverrideNote.trim() || null,
    })
  }

  const onSubmitWorkRule = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const parsed = workRuleSchema.safeParse({
      department_id: departmentId,
      daily_minutes_planned: dailyMinutesPlanned,
      break_minutes: breakMinutes,
      grace_minutes: graceMinutes,
      early_arrival_tolerance_minutes: earlyArrivalToleranceMinutes,
      overtime_grace_minutes: overtimeGraceMinutes,
      off_shift_tolerance_minutes: offShiftToleranceMinutes,
      overtime_threshold_minutes: overtimeThresholdMinutes,
    })

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Mesai kurali formunu kontrol edin.'
      setFormError(message)
      pushToast({ variant: 'error', title: 'Form hatası', description: message })
      return
    }

    createWorkRuleMutation.mutate(parsed.data)
  }

  const onSaveWeekdayAssignments = (weekday: number, shiftIds: number[]) => {
    if (selectedWeekdayAssignmentDepartmentId === null || selectedWeekdayAssignmentDepartmentId <= 0) {
      setFormError('Günlük vardiya planı için departman seçmelisiniz.')
      return
    }
    setFormError(null)
    replaceWeekdayShiftAssignmentsMutation.mutate({
      department_id: selectedWeekdayAssignmentDepartmentId,
      weekday,
      shift_ids: shiftIds,
    })
  }

  const onSubmitShift = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const parsed = shiftSchema.safeParse({
      department_id: shiftDepartmentId,
      name: shiftName.trim(),
      start_time_local: shiftStart,
      end_time_local: shiftEnd,
      break_minutes: shiftBreakMinutes,
      is_active: shiftIsActive,
    })
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Vardiya formunu kontrol edin.'
      setFormError(message)
      pushToast({ variant: 'error', title: 'Form hatası', description: message })
      return
    }
    upsertShiftMutation.mutate({
      id: shiftEditingId ?? undefined,
      ...parsed.data,
    })
  }

  const onEditShift = (shift: DepartmentShift) => {
    setShiftEditingId(shift.id)
    setShiftDepartmentId(String(shift.department_id))
    setShiftName(shift.name)
    setShiftStart(shift.start_time_local)
    setShiftEnd(shift.end_time_local)
    setShiftBreakMinutes(String(shift.break_minutes))
    setShiftIsActive(shift.is_active)
    setFormError(null)
  }

  const resetShiftForm = () => {
    setShiftEditingId(null)
    setShiftName('')
    setShiftStart('10:00')
    setShiftEnd('18:00')
    setShiftBreakMinutes('60')
    setShiftIsActive(true)
    setFormError(null)
  }

  const onSchedulePlanSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const parsedDepartmentId = Number(planDepartmentId)
    if (!Number.isFinite(parsedDepartmentId) || parsedDepartmentId <= 0) {
      setFormError('Planlama için departman seçmelisiniz.')
      return
    }
    if (!planStartDate || !planEndDate) {
      setFormError('Baslangic ve bitis tarihi zorunludur.')
      return
    }
    if (planStartDate > planEndDate) {
      setFormError('Baslangic tarihi bitis tarihinden buyuk olamaz.')
      return
    }

    const parsedTargetEmployeeIds = planTargetType === 'DEPARTMENT' ? [] : [...planTargetEmployeeIds]
    if (planTargetType !== 'DEPARTMENT' && parsedTargetEmployeeIds.length === 0) {
      setFormError('Seçilen hedef tipi için en az bir çalışan seçmelisiniz.')
      return
    }

    const parsedShiftId = planShiftId ? Number(planShiftId) : null
    const daily = parseOptionalMinutes(planDailyMinutes)
    const planBreak = parseOptionalMinutes(planBreakMinutes)
    const grace = parseOptionalMinutes(planGraceMinutes)
    const earlyArrivalTolerance = parseOptionalMinutes(planEarlyArrivalToleranceMinutes)
    const overtimeGrace = parseOptionalMinutes(planOvertimeGraceMinutes)
    const offShiftTolerance = parseOptionalMinutes(planOffShiftToleranceMinutes)
    const overtimeThreshold = parseOptionalMinutes(planOvertimeThresholdMinutes)

    if (
      !parsedShiftId
      && daily === null
      && planBreak === null
      && grace === null
      && earlyArrivalTolerance === null
      && overtimeGrace === null
      && offShiftTolerance === null
      && overtimeThreshold === null
    ) {
      setFormError('En az bir plan degeri girmelisiniz (vardiya veya dakika alanlari).')
      return
    }

    upsertSchedulePlanMutation.mutate({
      id: planId ?? undefined,
      department_id: parsedDepartmentId,
      target_type: planTargetType,
      target_employee_id: parsedTargetEmployeeIds.length > 0 ? parsedTargetEmployeeIds[0] : null,
      target_employee_ids: parsedTargetEmployeeIds,
      shift_id: parsedShiftId,
      daily_minutes_planned: daily,
      break_minutes: planBreak,
      grace_minutes: grace,
      early_arrival_tolerance_minutes: earlyArrivalTolerance,
      overtime_grace_minutes: overtimeGrace,
      off_shift_tolerance_minutes: offShiftTolerance,
      overtime_threshold_minutes: overtimeThreshold,
      start_date: planStartDate,
      end_date: planEndDate,
      is_locked: planIsLocked,
      is_active: planIsActive,
      note: planNote.trim() || null,
    })
  }

  const saveSaturdayRotation = (savedDayDate: string | null = null) => {
    setRotationFormError(null)

    const parsedDepartmentId = Number(rotationDepartmentId)
    const parsedShiftId = Number(rotationShiftId)
    const parsedTeamSize = Number(rotationTeamSize)
    const parsedRepeatWeeks = Number(rotationRepeatWeeks)

    if (!Number.isFinite(parsedDepartmentId) || parsedDepartmentId <= 0) {
      setRotationFormError('Cumartesi rotasyonu icin departman secmelisiniz.')
      return
    }
    if (!Number.isFinite(parsedShiftId) || parsedShiftId <= 0) {
      setRotationFormError('Cumartesi rotasyonu icin vardiya secmelisiniz.')
      return
    }
    if (!rotationName.trim()) {
      setRotationFormError('Rotasyon adi zorunludur.')
      return
    }
    if (!rotationStartDate || !rotationEndDate || rotationStartDate > rotationEndDate) {
      setRotationFormError('Rotasyon tarih araligini kontrol edin.')
      return
    }
    if (!Number.isInteger(parsedTeamSize) || parsedTeamSize <= 0) {
      setRotationFormError('Ekip sayisi pozitif tam sayi olmali.')
      return
    }
    if (!Number.isInteger(parsedRepeatWeeks) || parsedRepeatWeeks <= 0) {
      setRotationFormError('Tekrar araligi pozitif tam sayi olmali.')
      return
    }
    if (rotationDays.length === 0) {
      setRotationFormError('Kaydetmeden once "Cumartesi Gunlerini Hazirla" butonuna basin.')
      return
    }

    upsertSaturdayRotationMutation.mutate({
      id: rotationId ?? undefined,
      department_id: parsedDepartmentId,
      shift_id: parsedShiftId,
      name: rotationName.trim(),
      start_date: rotationStartDate,
      end_date: rotationEndDate,
      team_size: parsedTeamSize,
      repeat_interval_weeks: parsedRepeatWeeks,
      is_active: rotationIsActive,
      note: rotationNote.trim() || null,
      days: rotationDays.map((day) => ({
        day_date: day.day_date,
        employee_ids: day.employee_ids,
        is_active: day.is_active,
        note: day.note.trim() || null,
      })),
    }, {
      onSuccess: () => {
        setLastSavedRotationDayDate(savedDayDate)
      },
    })
  }

  const onSaturdayRotationSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    saveSaturdayRotation(null)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mesai Kurallari"
        description="Departman bazinda günlük plan, haftalık gün davranisi ve çoklu vardiya tanimlarini yonetin."
      />

      <Panel>
        <h4 className="text-base font-semibold text-slate-900">Temel Departman Kurali</h4>
        <form onSubmit={onSubmitWorkRule} className="mt-3 grid gap-3 md:grid-cols-6">
          <label className="text-sm text-slate-700">
            Departman
            <select
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">Seçiniz</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700">
            Planlanan Günlük Dakika
            <input
              value={dailyMinutesPlanned}
              onChange={(event) => setDailyMinutesPlanned(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="text-sm text-slate-700">
            Mola Dakikasi
            <input
              value={breakMinutes}
              onChange={(event) => setBreakMinutes(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="text-sm text-slate-700">
            Gec Giriş Toleransi (Dakika)
            <input
              value={graceMinutes}
              onChange={(event) => setGraceMinutes(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="text-sm text-slate-700">
            Erken Gelis Toleransi (Dakika)
            <input
              value={earlyArrivalToleranceMinutes}
              onChange={(event) => setEarlyArrivalToleranceMinutes(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="text-sm text-slate-700">
            Fazla Mesai Toleransi (Dakika)
            <input
              value={overtimeGraceMinutes}
              onChange={(event) => setOvertimeGraceMinutes(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="text-sm text-slate-700">
            Vardiya Disi Aktivite Toleransi (Dakika)
            <input
              value={offShiftToleranceMinutes}
              onChange={(event) => setOffShiftToleranceMinutes(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="text-sm text-slate-700">
            Net Mesai Esigi (Dakika)
            <input
              value={overtimeThresholdMinutes}
              onChange={(event) => setOvertimeThresholdMinutes(event.target.value)}
              placeholder="Bos"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <div className="md:col-span-6 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Onizleme: Planlanan {livePreview.daily} | Mola {livePreview.breakValue} | Gec giriş toleransi {livePreview.grace} | Erken gelis toleransi {livePreview.earlyArrivalTolerance} | Fazla mesai toleransi {livePreview.overtimeGrace} | Vardiya disi tolerans {livePreview.offShift} | Net mesai esigi {livePreview.overtimeThreshold}
          </div>

          <div className="md:col-span-6">
            <button
              type="submit"
              disabled={createWorkRuleMutation.isPending}
              className="btn-primary rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {createWorkRuleMutation.isPending ? 'Kaydediliyor...' : 'Kurali Kaydet'}
            </button>
          </div>
        </form>
      </Panel>

      <Panel>
        <h4 className="text-base font-semibold text-slate-900">Günlük Vardiya Atama Planı</h4>
        <p className="mt-1 text-xs text-slate-500">
          Haftalık dakika kuralı yerine her gün için geçerli vardiyaları belirleyin. Bir güne birden fazla vardiya
          atanabilir; sistem önce o günün vardiya listesini dikkate alır.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(260px,340px)_1fr]">
          <label className="text-sm text-slate-700">
            Departman
            <select
              value={weekdayAssignmentDepartmentId}
              onChange={(event) => setWeekdayAssignmentDepartmentId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">Seçiniz</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
            <p className="font-medium text-slate-800">Karar sırası</p>
            <p className="mt-1">
              Tarih aralıklı vardiya override varsa o kazanır. Yoksa bu günün vardiya atamaları kullanılır. Bu gün
              için atama yoksa sistem legacy fallback kurallarına döner.
            </p>
          </div>
        </div>

        <WeekdayShiftAssignmentEditor
          departmentId={selectedWeekdayAssignmentDepartmentId}
          shifts={weekdayAssignmentDepartmentShifts}
          assignments={weekdayAssignmentRows}
          isSaving={replaceWeekdayShiftAssignmentsMutation.isPending}
          onSave={onSaveWeekdayAssignments}
          emptyMessage="Günlük vardiya planı düzenlemek için departman seçin."
        />
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-slate-900">Cumartesi Planlama</h4>
            <p className="mt-1 text-xs text-slate-500">
              Her Cumartesi icin calisacak kisileri ayri ayri secin. Kaydedince puantaj vardiya planlari otomatik guncellenir.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={showInactiveRotations} onChange={(event) => setShowInactiveRotations(event.target.checked)} />
            Pasif rotasyonlari goster
          </label>
        </div>

        <form onSubmit={onSaturdayRotationSubmit} className="mt-4 space-y-4">
          {rotationId !== null ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5">
              <p className="text-sm font-semibold text-sky-800">Rotasyon #{rotationId} duzenleniyor</p>
              <button type="button" onClick={resetSaturdayRotationForm} className="text-xs font-semibold text-sky-700 underline-offset-2 hover:underline">
                Yeni rotasyon
              </button>
            </div>
          ) : null}

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">1</span>
              <h5 className="text-sm font-semibold text-slate-900">Rotasyon Bilgileri</h5>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm text-slate-700">
                Rotasyon Adi
                <input value={rotationName} onChange={(event) => setRotationName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm text-slate-700">
                Departman
                <select
                  value={rotationDepartmentId}
                  onChange={(event) => {
                    setRotationDepartmentId(event.target.value)
                    setRotationShiftId('')
                    setRotationPoolEmployeeIds([])
                    setRotationDays([])
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value="">Seciniz</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>{department.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-slate-700">
                Cumartesi Vardiyasi
                <select value={rotationShiftId} onChange={(event) => setRotationShiftId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                  <option value="">Seciniz</option>
                  {rotationDepartmentShifts.map((shift) => (
                    <option key={shift.id} value={shift.id}>{shift.name} ({shift.start_time_local} - {shift.end_time_local})</option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-slate-700">
                Baslangic
                <input type="date" value={rotationStartDate} onChange={(event) => setRotationStartDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm text-slate-700">
                Bitis
                <input type="date" value={rotationEndDate} onChange={(event) => setRotationEndDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
              </label>
              <label className="text-sm text-slate-700">
                Not
                <input value={rotationNote} onChange={(event) => setRotationNote(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Opsiyonel" />
              </label>
            </div>
            <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={rotationIsActive} onChange={(event) => setRotationIsActive(event.target.checked)} />
              Rotasyon aktif
            </label>
          </section>

          <details className="rounded-xl border border-slate-200 bg-white">
            <summary className="flex cursor-pointer select-none flex-wrap items-center gap-2.5 rounded-xl px-4 py-3 hover:bg-slate-50">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-500 text-xs font-bold text-white">2</span>
              <span className="text-sm font-semibold text-slate-900">Otomatik Dagitim Havuzu</span>
              <span className="text-xs text-slate-500">
                opsiyonel{rotationPoolEmployeeIds.length > 0 ? ` — ${rotationPoolEmployeeIds.length} kisi secili` : ' — acmak icin tikla'}
              </span>
            </summary>
            <div className="border-t border-slate-100 p-4">
              <p className="text-xs text-slate-500">
                Havuza kisi eklersen "Cumartesi Gunlerini Hazirla" bunlari gunlere sirayla dagitir. Bos birakirsan gunler bos olusur, gun kartlarindan elle secersin.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <label className="text-sm text-slate-700">
                  Calisan Ara
                  <input value={rotationEmployeeSearch} onChange={(event) => setRotationEmployeeSearch(event.target.value)} placeholder="Ad veya ID" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
                </label>
                <label className="text-sm text-slate-700">
                  Her Cumartesi Kisi Sayisi
                  <input value={rotationTeamSize} onChange={(event) => setRotationTeamSize(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
                </label>
                <label className="text-sm text-slate-700">
                  Tekrar Araligi (hafta)
                  <input value={rotationRepeatWeeks} onChange={(event) => setRotationRepeatWeeks(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
                </label>
              </div>
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Havuzdaki Calisanlar ({rotationPoolEmployeeIds.length})</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {rotationPoolEmployeeIds.length === 0 ? (
                    <span className="text-sm text-slate-500">Havuz bos.</span>
                  ) : (
                    rotationPoolEmployeeIds.map((employeeId) => (
                      <span key={employeeId} className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm font-medium text-sky-800">
                        {employeeNameById.get(employeeId) ?? `#${employeeId}`}
                        <button
                          type="button"
                          onClick={() => setRotationPoolEmployeeIds((ids) => ids.filter((id) => id !== employeeId))}
                          className="rounded-full px-1 text-xs font-bold text-rose-600 hover:bg-rose-100"
                          aria-label="Havuzdan cikar"
                        >
                          x
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <div className="mt-2 flex max-h-36 flex-wrap gap-1.5 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                  {filteredRotationEmployees.filter((employee) => !rotationPoolEmployeeIds.includes(employee.id)).length === 0 ? (
                    <span className="text-sm text-slate-500">
                      {rotationDepartmentId ? 'Eklenecek calisan kalmadi veya arama sonucu yok.' : 'Once departman secin.'}
                    </span>
                  ) : (
                    filteredRotationEmployees
                      .filter((employee) => !rotationPoolEmployeeIds.includes(employee.id))
                      .map((employee) => (
                        <button
                          key={employee.id}
                          type="button"
                          onClick={() => setRotationPoolEmployeeIds((ids) => [...ids, employee.id])}
                          className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                        >
                          + {employee.full_name}
                        </button>
                      ))
                  )}
                </div>
              </div>
            </div>
          </details>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">3</span>
                <h5 className="text-sm font-semibold text-slate-900">
                  Cumartesi Gunleri{rotationDays.length > 0 ? ` (${rotationDays.length})` : ''}
                </h5>
              </div>
              <button type="button" onClick={generateSaturdayRotationDays} className="btn-secondary rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Cumartesi Gunlerini Hazirla
              </button>
            </div>

            {rotationDays.length > 0 ? (
              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {rotationDays.map((day) => {
                  const selectedEmployees = day.employee_ids.map((id) => ({
                    id,
                    full_name: employeeNameById.get(id) ?? `#${id}`,
                  }))
                  const availableEmployees = filteredRotationEmployees.filter(
                    (employee) => !day.employee_ids.includes(employee.id),
                  )
                  const isDirty = dirtyRotationDayDates.has(day.day_date)
                  const isLastSaved = lastSavedRotationDayDate === day.day_date
                  return (
                    <section
                      key={day.day_date}
                      className={`flex flex-col rounded-xl border p-4 ${
                        isDirty
                          ? 'border-amber-300 bg-amber-50/40'
                          : isLastSaved
                            ? 'border-emerald-300 bg-emerald-50/30'
                            : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{formatSaturdayLabel(day.day_date)}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-slate-400">{day.day_date}</p>
                        </div>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            isDirty
                              ? 'bg-amber-100 text-amber-800'
                              : isLastSaved
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {isDirty ? 'Kaydedilmedi' : isLastSaved ? 'Kaydedildi' : 'Kayitli'}
                        </span>
                      </div>

                      <div className="mt-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Calisacak Kisiler ({selectedEmployees.length})
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {selectedEmployees.length === 0 ? (
                            <span className="text-sm text-slate-500">Henuz calisan secilmedi.</span>
                          ) : (
                            selectedEmployees.map((employee) => (
                              <span key={employee.id} className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">
                                {employee.full_name}
                                <button
                                  type="button"
                                  onClick={() => removeRotationDayEmployee(day.day_date, employee.id)}
                                  className="rounded-full px-1 text-xs font-bold text-rose-600 hover:bg-rose-100"
                                  aria-label="Gunden cikar"
                                >
                                  x
                                </button>
                              </span>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="mt-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Calisan Ekle</p>
                        <div className="mt-1.5 flex max-h-28 flex-wrap gap-1.5 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2">
                          {availableEmployees.length === 0 ? (
                            <span className="text-sm text-slate-500">Eklenecek calisan kalmadi veya arama sonucu yok.</span>
                          ) : (
                            availableEmployees.map((employee) => (
                              <button
                                key={employee.id}
                                type="button"
                                onClick={() => addRotationDayEmployee(day.day_date, employee.id)}
                                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                              >
                                + {employee.full_name}
                              </button>
                            ))
                          )}
                        </div>
                      </div>

                      <input
                        value={day.note}
                        onChange={(event) => updateRotationDayNote(day.day_date, event.target.value)}
                        className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                        placeholder="Gun notu (opsiyonel)"
                      />

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                          <input type="checkbox" checked={day.is_active} onChange={(event) => updateRotationDayActive(day.day_date, event.target.checked)} />
                          Gun aktif
                        </label>
                        <button
                          type="button"
                          onClick={() => saveSaturdayRotation(day.day_date)}
                          disabled={upsertSaturdayRotationMutation.isPending}
                          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {upsertSaturdayRotationMutation.isPending ? 'Kaydediliyor...' : 'Bu Gunu Kaydet'}
                        </button>
                      </div>
                    </section>
                  )
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                Departman, vardiya ve tarih araligini secip <strong>Cumartesi Gunlerini Hazirla</strong> butonuna basin. Sonra her Cumartesi kartinda calisanlari tek tek ekleyip cikarabilirsiniz.
              </div>
            )}
          </section>

          {rotationFormError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">
              {rotationFormError}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <button type="submit" disabled={upsertSaturdayRotationMutation.isPending} className="btn-primary rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
              {upsertSaturdayRotationMutation.isPending ? 'Kaydediliyor...' : rotationId ? 'Rotasyonu Guncelle' : 'Rotasyonu Kaydet'}
            </button>
            <button type="button" onClick={resetSaturdayRotationForm} className="btn-secondary rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Formu Temizle
            </button>
          </div>
        </form>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Rotasyon</th>
                <th className="py-2">Departman</th>
                <th className="py-2">Vardiya</th>
                <th className="py-2">Tarih</th>
                <th className="py-2">Gun</th>
                <th className="py-2">Durum</th>
                <th className="py-2 text-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody>
              {filteredSaturdayRotations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="border-t border-slate-100 py-3 text-sm text-slate-500">Kayit bulunamadi.</td>
                </tr>
              ) : (
                filteredSaturdayRotations.map((rotation) => (
                  <tr key={rotation.id} className="border-t border-slate-100">
                    <td className="py-2">{rotation.name}</td>
                    <td className="py-2">{departmentNameById.get(rotation.department_id) ?? rotation.department_id}</td>
                    <td className="py-2">{shiftNameById.get(rotation.shift_id) ?? `#${rotation.shift_id}`}</td>
                    <td className="py-2">{rotation.start_date} - {rotation.end_date}</td>
                    <td className="py-2">{rotation.days.filter((day) => day.is_active).length}</td>
                    <td className="py-2">{rotation.is_active ? 'Aktif' : 'Pasif'}</td>
                    <td className="py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={() => startEditSaturdayRotation(rotation)} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                          Duzenle
                        </button>
                        {rotation.is_active ? (
                          <button
                            type="button"
                            disabled={deactivateSaturdayRotationMutation.isPending}
                            onClick={() => deactivateSaturdayRotationMutation.mutate(rotation.id)}
                            className="rounded-lg border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                          >
                            Pasife Al
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-slate-900">Calisan Hafta Tatili</h4>
            <p className="mt-1 text-xs text-slate-500">
              Calisan bazinda hafta ici veya hafta sonu tatil gunu tanimlayin. Bu gunde calisma olursa puantaj FM3 olarak ayirir.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showInactiveRestDays}
              onChange={(event) => setShowInactiveRestDays(event.target.checked)}
            />
            Pasif kayitlari goster
          </label>
        </div>

        <form onSubmit={onSubmitEmployeeRestDay} className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="text-sm text-slate-700">
            Calisan
            <select
              value={restDayEmployeeId}
              onChange={(event) => setRestDayEmployeeId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">Seciniz</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  #{employee.id} - {employee.full_name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700">
            Tatil Gunu
            <select
              value={restDayWeekday}
              onChange={(event) => setRestDayWeekday(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              {WEEKDAY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700 md:col-span-2">
            Not
            <input
              value={restDayNote}
              onChange={(event) => setRestDayNote(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Opsiyonel"
            />
          </label>

          <div className="md:col-span-4">
            <button
              type="submit"
              disabled={upsertEmployeeWeeklyRestDayMutation.isPending}
              className="btn-primary rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {upsertEmployeeWeeklyRestDayMutation.isPending ? 'Kaydediliyor...' : 'Hafta Tatili Kaydet'}
            </button>
          </div>
        </form>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Calisan</th>
                <th className="py-2">Tatil Gunu</th>
                <th className="py-2">Durum</th>
                <th className="py-2">Not</th>
                <th className="py-2 text-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody>
              {employeeWeeklyRestDays.length === 0 ? (
                <tr>
                  <td colSpan={5} className="border-t border-slate-100 py-3 text-sm text-slate-500">
                    Kayit bulunamadi.
                  </td>
                </tr>
              ) : (
                employeeWeeklyRestDays.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="py-2">{employeeNameById.get(item.employee_id) ?? `#${item.employee_id}`}</td>
                    <td className="py-2">{WEEKDAY_OPTIONS[item.weekday]?.label ?? item.weekday}</td>
                    <td className="py-2">{item.is_active ? 'Aktif' : 'Pasif'}</td>
                    <td className="py-2 text-xs text-slate-600">{item.note || '-'}</td>
                    <td className="py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEditEmployeeRestDay(item)}
                          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Duzenle
                        </button>
                        {item.is_active ? (
                          <button
                            type="button"
                            disabled={deactivateEmployeeWeeklyRestDayMutation.isPending}
                            onClick={() => deactivateEmployeeWeeklyRestDayMutation.mutate(item.id)}
                            className="rounded-lg border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                          >
                            Pasife Al
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={upsertEmployeeWeeklyRestDayMutation.isPending}
                            onClick={() =>
                              upsertEmployeeWeeklyRestDayMutation.mutate({
                                employee_id: item.employee_id,
                                weekday: item.weekday,
                                is_active: true,
                                note: item.note,
                              })
                            }
                            className="rounded-lg border border-emerald-300 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                          >
                            Aktif Et
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={FORM_SECTION_TITLE}>Istisna</p>
            <h4 className="mt-2 text-base font-semibold text-slate-900">Ozel Gun Calisan Istisnalari</h4>
            <p className="mt-1 text-sm text-slate-500">
              Departman veya genel ozel gun kuralinda tek calisan icin farkli izin/calisma ve FM davranisi tanimlayin.
            </p>
          </div>
          <label
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
              showInactiveSpecialDayOverrides
                ? 'border-sky-300 bg-sky-50 text-sky-800'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            <input
              type="checkbox"
              checked={showInactiveSpecialDayOverrides}
              onChange={(event) => setShowInactiveSpecialDayOverrides(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Pasif istisnalari goster
          </label>
        </div>

        <form onSubmit={onSubmitSpecialDayOverride} className="mt-4 space-y-4">
          {specialDayOverrideId !== null ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5">
              <p className="text-sm font-semibold text-sky-800">Istisna #{specialDayOverrideId} duzenleniyor</p>
              <button
                type="button"
                onClick={resetSpecialDayOverrideForm}
                className="text-xs font-semibold text-sky-700 underline-offset-2 hover:underline"
              >
                Duzenlemeyi birak
              </button>
            </div>
          ) : null}

          <div className={FORM_SECTION}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="block">
                <span className={FIELD_LABEL}>Ozel Gun</span>
                <select
                  value={specialDayOverrideSpecialDayId}
                  onChange={(event) => setSpecialDayOverrideSpecialDayId(event.target.value)}
                  className={FIELD_INPUT}
                >
                  <option value="">Seciniz</option>
                  {specialDays.map((day) => (
                    <option key={day.id} value={day.id}>
                      {day.day_date} - {day.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className={FIELD_LABEL}>Calisan</span>
                <select
                  value={specialDayOverrideEmployeeId}
                  onChange={(event) => setSpecialDayOverrideEmployeeId(event.target.value)}
                  className={FIELD_INPUT}
                >
                  <option value="">Seciniz</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      #{employee.id} - {employee.full_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className={FIELD_LABEL}>Politika</span>
                <select
                  value={specialDayOverrideWorkPolicy}
                  onChange={(event) => setSpecialDayOverrideWorkPolicy(event.target.value as SpecialDayWorkPolicy)}
                  className={FIELD_INPUT}
                >
                  {SPECIAL_DAY_POLICY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className={FIELD_LABEL}>Plan Override (dk)</span>
                <input
                  value={specialDayOverridePlannedMinutes}
                  onChange={(event) => setSpecialDayOverridePlannedMinutes(event.target.value)}
                  className={FIELD_INPUT}
                  placeholder="Bos: kural"
                />
              </label>

              <label className="block">
                <span className={FIELD_LABEL}>Mesai Grubu</span>
                <select
                  value={specialDayOverrideOvertimeCode}
                  onChange={(event) => setSpecialDayOverrideOvertimeCode(event.target.value as OvertimeCode)}
                  className={FIELD_INPUT}
                >
                  {OVERTIME_CODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block md:col-span-2 xl:col-span-1">
                <span className={FIELD_LABEL}>Not</span>
                <input
                  value={specialDayOverrideNote}
                  onChange={(event) => setSpecialDayOverrideNote(event.target.value)}
                  className={FIELD_INPUT}
                  placeholder="Opsiyonel"
                />
              </label>

              <div className="flex items-end gap-2 md:col-span-2">
                <label
                  className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                    specialDayOverrideCountsAsPaidLeave
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={specialDayOverrideCountsAsPaidLeave}
                    onChange={(event) => setSpecialDayOverrideCountsAsPaidLeave(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Ucretli izin say
                </label>

                <label
                  className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                    specialDayOverrideIsActive
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={specialDayOverrideIsActive}
                    onChange={(event) => setSpecialDayOverrideIsActive(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Aktif
                </label>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="submit"
              disabled={upsertSpecialDayEmployeeOverrideMutation.isPending}
              className="btn-primary rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {upsertSpecialDayEmployeeOverrideMutation.isPending
                ? 'Kaydediliyor...'
                : specialDayOverrideId
                  ? 'Istisnayi Guncelle'
                  : 'Istisna Kaydet'}
            </button>
            <button
              type="button"
              onClick={resetSpecialDayOverrideForm}
              className="btn-secondary rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Formu Temizle
            </button>
          </div>
        </form>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Ozel Gun</th>
                <th className="py-2">Calisan</th>
                <th className="py-2">Politika</th>
                <th className="py-2">Mesai Grubu</th>
                <th className="py-2">Durum</th>
                <th className="py-2 text-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody>
              {specialDayEmployeeOverrides.length === 0 ? (
                <tr>
                  <td colSpan={6} className="border-t border-slate-100 py-3 text-sm text-slate-500">
                    Kayit bulunamadi.
                  </td>
                </tr>
              ) : (
                specialDayEmployeeOverrides.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="py-2">{specialDayNameById.get(item.special_day_id) ?? `Ozel gun #${item.special_day_id}`}</td>
                    <td className="py-2">{employeeNameById.get(item.employee_id) ?? `#${item.employee_id}`}</td>
                    <td className="py-2 text-xs text-slate-700">
                      <div>{SPECIAL_DAY_POLICY_LABELS[item.work_policy]}</div>
                      <div>Plan: {item.planned_minutes_override !== null ? `${item.planned_minutes_override} dk` : 'Ozel gun kuralindan'}</div>
                      <div>{item.counts_as_paid_leave ? 'Ucretli izin' : 'Izin yazma'}</div>
                      {item.note ? <div className="text-slate-500">{item.note}</div> : null}
                    </td>
                    <td className="py-2">{item.overtime_code}</td>
                    <td className="py-2">{item.is_active ? 'Aktif' : 'Pasif'}</td>
                    <td className="py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEditSpecialDayOverride(item)}
                          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Duzenle
                        </button>
                        {item.is_active ? (
                          <button
                            type="button"
                            disabled={deactivateSpecialDayEmployeeOverrideMutation.isPending}
                            onClick={() => deactivateSpecialDayEmployeeOverrideMutation.mutate(item.id)}
                            className="rounded-lg border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                          >
                            Pasife Al
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={upsertSpecialDayEmployeeOverrideMutation.isPending}
                            onClick={() =>
                              upsertSpecialDayEmployeeOverrideMutation.mutate({
                                id: item.id,
                                special_day_id: item.special_day_id,
                                employee_id: item.employee_id,
                                work_policy: item.work_policy,
                                planned_minutes_override: item.planned_minutes_override,
                                counts_as_paid_leave: item.counts_as_paid_leave,
                                overtime_code: item.overtime_code,
                                overtime_multiplier: 1,
                                is_active: true,
                                note: item.note,
                              })
                            }
                            className="rounded-lg border border-emerald-300 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                          >
                            Aktif Et
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={FORM_SECTION_TITLE}>Ozel Gun</p>
            <h4 className="mt-2 text-base font-semibold text-slate-900">Ozel Gun Kurallari</h4>
            <p className="mt-1 text-sm text-slate-500">
              Tarih bazinda resmi tatil, idari izin, yarim gun veya normal calisma kurali tanimlayin.
            </p>
          </div>
          <label
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
              showInactiveSpecialDays
                ? 'border-sky-300 bg-sky-50 text-sky-800'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            <input
              type="checkbox"
              checked={showInactiveSpecialDays}
              onChange={(event) => setShowInactiveSpecialDays(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Pasif ozel gunleri goster
          </label>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:max-w-md">
          <label className="block">
            <span className={FIELD_LABEL}>Liste Baslangic</span>
            <input
              type="date"
              value={specialDayListStart}
              onChange={(event) => setSpecialDayListStart(event.target.value)}
              className={FIELD_INPUT}
            />
          </label>
          <label className="block">
            <span className={FIELD_LABEL}>Liste Bitis</span>
            <input
              type="date"
              value={specialDayListEnd}
              onChange={(event) => setSpecialDayListEnd(event.target.value)}
              className={FIELD_INPUT}
            />
          </label>
        </div>

        <form onSubmit={onSubmitSpecialDay} className="mt-4 space-y-4">
          {specialDayId !== null ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5">
              <p className="text-sm font-semibold text-sky-800">Ozel gun #{specialDayId} duzenleniyor</p>
              <button
                type="button"
                onClick={resetSpecialDayForm}
                className="text-xs font-semibold text-sky-700 underline-offset-2 hover:underline"
              >
                Duzenlemeyi birak
              </button>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            <section className={FORM_SECTION}>
              <p className={FORM_SECTION_TITLE}>Gun Bilgisi</p>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className={FIELD_LABEL}>Tarih</span>
                  <input
                    type="date"
                    value={specialDayDate}
                    onChange={(event) => setSpecialDayDate(event.target.value)}
                    className={FIELD_INPUT}
                  />
                </label>

                <label className="block">
                  <span className={FIELD_LABEL}>Ad</span>
                  <input
                    value={specialDayName}
                    onChange={(event) => setSpecialDayName(event.target.value)}
                    className={FIELD_INPUT}
                    placeholder="Orn: 29 Ekim"
                  />
                </label>

                <label className="block">
                  <span className={FIELD_LABEL}>Tur</span>
                  <select
                    value={specialDayType}
                    onChange={(event) => setSpecialDayType(event.target.value as SpecialDayType)}
                    className={FIELD_INPUT}
                  >
                    {SPECIAL_DAY_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className={FORM_SECTION}>
              <p className={FORM_SECTION_TITLE}>Calisma ve Mesai</p>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className={FIELD_LABEL}>Calisma Politikasi</span>
                  <select
                    value={specialDayWorkPolicy}
                    onChange={(event) => setSpecialDayWorkPolicy(event.target.value as SpecialDayWorkPolicy)}
                    className={FIELD_INPUT}
                  >
                    {SPECIAL_DAY_POLICY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className={FIELD_LABEL}>Plan Override (dk)</span>
                    <input
                      value={specialDayPlannedOverride}
                      onChange={(event) => setSpecialDayPlannedOverride(event.target.value)}
                      className={FIELD_INPUT}
                      placeholder="Bos: otomatik"
                    />
                  </label>

                  <label className="block">
                    <span className={FIELD_LABEL}>FM Baslangic Saati</span>
                    <input
                      type="time"
                      value={specialDayHalfDayOvertimeStart}
                      onChange={(event) => setSpecialDayHalfDayOvertimeStart(event.target.value)}
                      disabled={specialDayWorkPolicy !== 'HALF_DAY'}
                      className={FIELD_INPUT}
                    />
                  </label>
                </div>

                {specialDayWorkPolicy === 'HALF_DAY' ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                    Yarim gun politikasinda fazla mesai FM baslangic saatinden sonra yazilir. Bos birakilirsa 13:00
                    kullanilir.
                  </p>
                ) : null}

                <label className="block">
                  <span className={FIELD_LABEL}>Mesai Grubu</span>
                  <select
                    value={specialDayOvertimeCode}
                    onChange={(event) => setSpecialDayOvertimeCode(event.target.value as OvertimeCode)}
                    className={FIELD_INPUT}
                  >
                    {OVERTIME_CODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className={FORM_SECTION}>
              <p className={FORM_SECTION_TITLE}>Kapsam ve Durum</p>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className={FIELD_LABEL}>Kapsam</span>
                  <select
                    value={specialDayScopeType}
                    onChange={(event) => {
                      const nextScope = event.target.value as 'GLOBAL' | 'DEPARTMENT' | 'REGION'
                      setSpecialDayScopeType(nextScope)
                      if (nextScope !== 'DEPARTMENT') setSpecialDayDepartmentId('')
                      if (nextScope !== 'REGION') setSpecialDayRegionId('')
                    }}
                    className={FIELD_INPUT}
                  >
                    <option value="GLOBAL">Genel</option>
                    <option value="DEPARTMENT">Departman</option>
                    <option value="REGION">Bolge</option>
                  </select>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className={FIELD_LABEL}>Departman</span>
                    <select
                      value={specialDayDepartmentId}
                      onChange={(event) => setSpecialDayDepartmentId(event.target.value)}
                      disabled={specialDayScopeType !== 'DEPARTMENT'}
                      className={FIELD_INPUT}
                    >
                      <option value="">Seciniz</option>
                      {departments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className={FIELD_LABEL}>Bolge</span>
                    <select
                      value={specialDayRegionId}
                      onChange={(event) => setSpecialDayRegionId(event.target.value)}
                      disabled={specialDayScopeType !== 'REGION'}
                      className={FIELD_INPUT}
                    >
                      <option value="">Seciniz</option>
                      {regions.map((region) => (
                        <option key={region.id} value={region.id}>
                          {region.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <label
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                      specialDayCountsAsPaidLeave
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={specialDayCountsAsPaidLeave}
                      onChange={(event) => setSpecialDayCountsAsPaidLeave(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Ucretli izin say
                  </label>

                  <label
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                      specialDayIsActive
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={specialDayIsActive}
                      onChange={(event) => setSpecialDayIsActive(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Aktif
                  </label>
                </div>
              </div>
            </section>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3 border-t border-slate-100 pt-4">
            <label className="block min-w-[240px] flex-1">
              <span className={FIELD_LABEL}>Not</span>
              <input
                value={specialDayNote}
                onChange={(event) => setSpecialDayNote(event.target.value)}
                className={FIELD_INPUT}
                placeholder="Opsiyonel"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={upsertSpecialDayMutation.isPending}
                className="btn-primary rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {upsertSpecialDayMutation.isPending ? 'Kaydediliyor...' : specialDayId ? 'Ozel Gunu Guncelle' : 'Ozel Gun Kaydet'}
              </button>
              <button
                type="button"
                onClick={resetSpecialDayForm}
                className="btn-secondary rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Formu Temizle
              </button>
            </div>
          </div>
        </form>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Tarih</th>
                <th className="py-2">Ad</th>
                <th className="py-2">Tur</th>
                <th className="py-2">Politika</th>
                <th className="py-2">Mesai Grubu</th>
                <th className="py-2">Kapsam</th>
                <th className="py-2">Durum</th>
                <th className="py-2 text-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody>
              {specialDays.length === 0 ? (
                <tr>
                  <td colSpan={8} className="border-t border-slate-100 py-3 text-sm text-slate-500">
                    Kayit bulunamadi.
                  </td>
                </tr>
              ) : (
                specialDays.map((item) => {
                  const scopeLabel = item.department_id
                    ? departmentNameById.get(item.department_id) ?? `Departman #${item.department_id}`
                    : item.region_id
                      ? regionNameById.get(item.region_id) ?? `Bolge #${item.region_id}`
                      : 'Genel'
                  return (
                    <tr key={item.id} className="border-t border-slate-100">
                      <td className="py-2">{item.day_date}</td>
                      <td className="py-2">
                        <div className="flex flex-col">
                          <span>{item.name}</span>
                          {item.note ? <span className="text-xs text-slate-500">{item.note}</span> : null}
                        </div>
                      </td>
                      <td className="py-2">{SPECIAL_DAY_TYPE_LABELS[item.day_type]}</td>
                      <td className="py-2 text-xs text-slate-700">
                        <div>{SPECIAL_DAY_POLICY_LABELS[item.work_policy]}</div>
                        <div>Plan: {item.planned_minutes_override !== null ? `${item.planned_minutes_override} dk` : 'Otomatik'}</div>
                        {item.work_policy === 'HALF_DAY' ? (
                          <div>FM baslangic: {item.half_day_overtime_start ? item.half_day_overtime_start.slice(0, 5) : '13:00'}</div>
                        ) : null}
                        <div>{item.counts_as_paid_leave ? 'Ucretli izin' : 'Ucretsiz/izin yazma'}</div>
                      </td>
                      <td className="py-2">{item.overtime_code}</td>
                      <td className="py-2">{scopeLabel}</td>
                      <td className="py-2">{item.is_active ? 'Aktif' : 'Pasif'}</td>
                      <td className="py-2 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => startEditSpecialDay(item)}
                            className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Duzenle
                          </button>
                          {item.is_active ? (
                            <button
                              type="button"
                              disabled={deactivateSpecialDayMutation.isPending}
                              onClick={() => deactivateSpecialDayMutation.mutate(item.id)}
                              className="rounded-lg border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                            >
                              Pasife Al
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={upsertSpecialDayMutation.isPending}
                              onClick={() =>
                                upsertSpecialDayMutation.mutate({
                                  id: item.id,
                                  day_date: item.day_date,
                                  name: item.name,
                                  day_type: item.day_type,
                                  work_policy: item.work_policy,
                                  planned_minutes_override: item.planned_minutes_override,
                                  half_day_overtime_start: item.half_day_overtime_start,
                                  counts_as_paid_leave: item.counts_as_paid_leave,
                                  overtime_code: item.overtime_code,
                                  overtime_multiplier: 1,
                                  department_id: item.department_id,
                                  region_id: item.region_id,
                                  is_active: true,
                                  note: item.note,
                                })
                              }
                              className="rounded-lg border border-emerald-300 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                            >
                              Aktif Et
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <h4 className="text-base font-semibold text-slate-900">Departman Vardiyaları</h4>
        <p className="mt-1 text-xs text-slate-500">
          Ornek: Stant için 10:00-18:00 ve 14:00-22:00 vardiyalarini ayri ayri tanimlayabilirsiniz.
        </p>
        {shiftEditingId ? (
          <p className="mt-2 text-xs font-medium text-brand-700">Duzenleme modu: #{shiftEditingId}</p>
        ) : null}
        <form onSubmit={onSubmitShift} className="mt-3 grid gap-3 md:grid-cols-6">
          <label className="text-sm text-slate-700">
            Departman
            <select
              value={shiftDepartmentId}
              onChange={(event) => setShiftDepartmentId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">Seçiniz</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700">
            Vardiya Adi
            <input
              value={shiftName}
              onChange={(event) => setShiftName(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Orn: Sabah 10-18"
            />
          </label>

          <label className="text-sm text-slate-700">
            Baslangic
            <input
              type="time"
              value={shiftStart}
              onChange={(event) => setShiftStart(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="text-sm text-slate-700">
            Bitis
            <input
              type="time"
              value={shiftEnd}
              onChange={(event) => setShiftEnd(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="text-sm text-slate-700">
            Mola Dakikasi
            <input
              value={shiftBreakMinutes}
              onChange={(event) => setShiftBreakMinutes(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="inline-flex items-center gap-2 pt-8 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={shiftIsActive}
              onChange={(event) => setShiftIsActive(event.target.checked)}
            />
            Aktif
          </label>

          <div className="md:col-span-6">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={upsertShiftMutation.isPending}
                className="btn-primary rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {upsertShiftMutation.isPending
                  ? 'Kaydediliyor...'
                  : shiftEditingId
                    ? 'Vardiya Güncelle'
                    : 'Vardiya Kaydet'}
              </button>
              {shiftEditingId ? (
                <button
                  type="button"
                  onClick={resetShiftForm}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Vazgec
                </button>
              ) : null}
            </div>
          </div>
        </form>

        <div className="mt-4 list-scroll-area">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Departman</th>
                <th className="py-2">Vardiya</th>
                <th className="py-2">Saat</th>
                <th className="py-2">Mola</th>
                <th className="py-2">Durum</th>
                <th className="py-2 text-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((item) => (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="py-2">{departmentNameById.get(item.department_id) ?? item.department_id}</td>
                  <td className="py-2">{item.name}</td>
                  <td className="py-2">{item.start_time_local} - {item.end_time_local}</td>
                  <td className="py-2">
                    <MinuteDisplay minutes={item.break_minutes} />
                  </td>
                  <td className="py-2">{item.is_active ? 'Aktif' : 'Pasif'}</td>
                  <td className="py-2 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onEditShift(item)}
                        className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Duzenle
                      </button>
                      {item.is_active ? (
                        <button
                          type="button"
                          disabled={deactivateShiftMutation.isPending || setShiftActiveMutation.isPending}
                          onClick={() => {
                            if (!window.confirm('Bu vardiya pasife alinsin mi?')) return
                            deactivateShiftMutation.mutate(item.id)
                          }}
                          className="rounded-lg border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                        >
                          Pasife Al
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={setShiftActiveMutation.isPending || deactivateShiftMutation.isPending}
                          onClick={() => setShiftActiveMutation.mutate({ shift: item, nextActive: true })}
                          className="rounded-lg border border-emerald-300 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                        >
                          Aktif Et
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-slate-900">İleri Planlama (Departman/Çalışan)</h4>
            <p className="mt-1 text-xs text-slate-500">
              Gelecek tarihli vardiya ve sure kurali tanimlayin. Planlar duzenlenebilir, iptal edilebilir, tekrar aktif edilebilir.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={showInactivePlans} onChange={(event) => setShowInactivePlans(event.target.checked)} />
            Pasif planlari göster
          </label>
        </div>

        <form onSubmit={onSchedulePlanSubmit} className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="text-sm text-slate-700">
            Departman
            <select
              value={planDepartmentId}
              onChange={(event) => {
                setPlanDepartmentId(event.target.value)
                setPlanTargetEmployeeIds([])
                setPlanShiftId('')
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">Seçiniz</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700">
            Hedef Tipi
            <select
              value={planTargetType}
              onChange={(event) => {
                const nextTarget = event.target.value as SchedulePlanTargetType
                setPlanTargetType(nextTarget)
                if (nextTarget === 'DEPARTMENT') setPlanTargetEmployeeIds([])
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              {PLAN_TARGET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700">
            Çalışanlar (gerekliyse)
            <input
              type="text"
              value={planTargetSearch}
              onChange={(event) => setPlanTargetSearch(event.target.value)}
              disabled={planTargetType === 'DEPARTMENT'}
              placeholder="Çalışan adi veya ID ile ara..."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
            />
            <select
              multiple
              value={planTargetEmployeeIds.map(String)}
              onChange={(event) => {
                const selected = Array.from(event.target.selectedOptions).map((option) => Number(option.value))
                setPlanTargetEmployeeIds(selected.filter((item) => Number.isFinite(item) && item > 0))
              }}
              disabled={planTargetType === 'DEPARTMENT'}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
            >
              {filteredPlanDepartmentEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>#{employee.id} - {employee.full_name}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              Ctrl/Cmd ile birden fazla çalışan seçilebilir. Binlerce kayıtta önce arama yapın.
            </span>
          </label>

          <label className="text-sm text-slate-700">
            Vardiya (opsiyonel)
            <select value={planShiftId} onChange={(event) => setPlanShiftId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="">Seçiniz</option>
              {planDepartmentShifts.map((shift) => (
                <option key={shift.id} value={shift.id}>{shift.name} ({shift.start_time_local} - {shift.end_time_local})</option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700">Günlük Dakika (ops.)
            <input value={planDailyMinutes} onChange={(event) => setPlanDailyMinutes(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>

          <label className="text-sm text-slate-700">Mola Dakika (ops.)
            <input value={planBreakMinutes} onChange={(event) => setPlanBreakMinutes(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>

          <label className="text-sm text-slate-700">Gec Giriş Toleransi (ops.)
            <input value={planGraceMinutes} onChange={(event) => setPlanGraceMinutes(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>

          <label className="text-sm text-slate-700">Erken Gelis Toleransi (ops.)
            <input value={planEarlyArrivalToleranceMinutes} onChange={(event) => setPlanEarlyArrivalToleranceMinutes(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>

          <label className="text-sm text-slate-700">Fazla Mesai Toleransi (ops.)
            <input value={planOvertimeGraceMinutes} onChange={(event) => setPlanOvertimeGraceMinutes(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>

          <label className="text-sm text-slate-700">Vardiya Disi Aktivite Toleransi (ops.)
            <input value={planOffShiftToleranceMinutes} onChange={(event) => setPlanOffShiftToleranceMinutes(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>

          <label className="text-sm text-slate-700">Net Mesai Esigi (ops.)
            <input value={planOvertimeThresholdMinutes} onChange={(event) => setPlanOvertimeThresholdMinutes(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>

          <label className="text-sm text-slate-700">Baslangic Tarihi
            <input type="date" value={planStartDate} onChange={(event) => setPlanStartDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>

          <label className="text-sm text-slate-700">Bitis Tarihi
            <input type="date" value={planEndDate} onChange={(event) => setPlanEndDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>

          <label className="inline-flex items-center gap-2 pt-8 text-sm text-slate-700">
            <input type="checkbox" checked={planIsLocked} onChange={(event) => setPlanIsLocked(event.target.checked)} />
            Vardiya kilitli
          </label>

          <label className="inline-flex items-center gap-2 pt-8 text-sm text-slate-700">
            <input type="checkbox" checked={planIsActive} onChange={(event) => setPlanIsActive(event.target.checked)} />
            Aktif
          </label>

          <label className="text-sm text-slate-700 md:col-span-2">
            Not
            <input value={planNote} onChange={(event) => setPlanNote(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>

          <div className="md:col-span-4 flex flex-wrap gap-2">
            <button type="submit" disabled={upsertSchedulePlanMutation.isPending} className="btn-primary rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
              {upsertSchedulePlanMutation.isPending ? 'Kaydediliyor...' : planId ? 'Plani Güncelle' : 'Plan Oluştur'}
            </button>
            <button type="button" onClick={resetSchedulePlanForm} className="btn-secondary rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Formu Temizle
            </button>
          </div>
        </form>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Departman</th>
                <th className="py-2">Hedef</th>
                <th className="py-2">Vardiya</th>
                <th className="py-2">Plan/Mola</th>
                <th className="py-2">Tarih Araligi</th>
                <th className="py-2">Kilit</th>
                <th className="py-2">Durum</th>
                <th className="py-2">Aksiyon</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlans.map((plan) => {
                const scopedEmployeeIds =
                  plan.target_employee_ids && plan.target_employee_ids.length > 0
                    ? plan.target_employee_ids
                    : plan.target_employee_id
                      ? [plan.target_employee_id]
                      : []
                const targetEmployeeNames = scopedEmployeeIds.map(
                  (id) => employeeNameById.get(id) ?? `#${id}`,
                )

                return (
                  <tr key={plan.id} className="border-t border-slate-100">
                    <td className="py-2">{departmentNameById.get(plan.department_id) ?? plan.department_id}</td>
                    <td className="py-2">
                      <div className="flex flex-col">
                        <span>{PLAN_TARGET_LABELS[plan.target_type]}</span>
                        {targetEmployeeNames.length > 0 ? (
                          <span className="text-xs text-slate-500">{targetEmployeeNames.join(', ')}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-2">{plan.shift_id ? shiftNameById.get(plan.shift_id) ?? `#${plan.shift_id}` : '-'}</td>
                    <td className="py-2 text-xs text-slate-700">
                      <div>Plan: {plan.daily_minutes_planned !== null ? `${plan.daily_minutes_planned} dk` : '-'}</div>
                      <div>Mola: {plan.break_minutes !== null ? `${plan.break_minutes} dk` : '-'}</div>
                      <div>Gec giriş toleransi: {plan.grace_minutes !== null ? `${plan.grace_minutes} dk` : '-'}</div>
                      <div>Erken gelis toleransi: {plan.early_arrival_tolerance_minutes !== null ? `${plan.early_arrival_tolerance_minutes} dk` : '-'}</div>
                      <div>Fazla mesai toleransi: {plan.overtime_grace_minutes !== null ? `${plan.overtime_grace_minutes} dk` : '-'}</div>
                      <div>Vardiya disi tolerans: {plan.off_shift_tolerance_minutes !== null ? `${plan.off_shift_tolerance_minutes} dk` : '-'}</div>
                      <div>Net mesai esigi: {plan.overtime_threshold_minutes !== null ? `${plan.overtime_threshold_minutes} dk` : '-'}</div>
                    </td>
                    <td className="py-2">{plan.start_date} - {plan.end_date}</td>
                    <td className="py-2">{plan.is_locked ? 'Kilitli' : 'Serbest'}</td>
                    <td className="py-2">{plan.is_active ? 'Aktif' : 'Pasif'}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => startEditSchedulePlan(plan)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Duzenle</button>
                        {plan.is_active ? (
                          <button type="button" onClick={() => cancelSchedulePlanMutation.mutate(plan.id)} disabled={cancelSchedulePlanMutation.isPending} className="rounded-lg border border-rose-300 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60">Iptal Et</button>
                        ) : (
                          <button type="button" onClick={() => activateSchedulePlanMutation.mutate(plan)} disabled={activateSchedulePlanMutation.isPending} className="rounded-lg border border-emerald-300 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60">Aktif Et</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <h4 className="text-base font-semibold text-slate-900">Mevcut Temel Kurallar</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Departman</th>
                <th className="py-2">Planlanan Günlük Sure</th>
                <th className="py-2">Mola Süresi</th>
                <th className="py-2">Gec Giriş Toleransi</th>
                <th className="py-2">Erken Gelis Toleransi</th>
                <th className="py-2">Fazla Mesai Toleransi</th>
                <th className="py-2">Vardiya Disi Tolerans</th>
                <th className="py-2">Net Mesai Esigi</th>
              </tr>
            </thead>
            <tbody>
              {workRules.map((rule) => (
                <tr key={rule.id} className="border-t border-slate-100">
                  <td className="py-2">{departmentNameById.get(rule.department_id) ?? rule.department_id}</td>
                  <td className="py-2"><MinuteDisplay minutes={rule.daily_minutes_planned} /></td>
                  <td className="py-2"><MinuteDisplay minutes={rule.break_minutes} /></td>
                  <td className="py-2"><MinuteDisplay minutes={rule.grace_minutes} /></td>
                  <td className="py-2"><MinuteDisplay minutes={rule.early_arrival_tolerance_minutes} /></td>
                  <td className="py-2"><MinuteDisplay minutes={rule.overtime_grace_minutes} /></td>
                  <td className="py-2"><MinuteDisplay minutes={rule.off_shift_tolerance_minutes} /></td>
                  <td className="py-2">
                    {rule.overtime_threshold_minutes === null ? '-' : <MinuteDisplay minutes={rule.overtime_threshold_minutes} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {formError ? <p className="form-validation">{formError}</p> : null}
    </div>
  )
}
