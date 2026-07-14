import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import {
  downloadEmployeeMonthlyExport,
  deleteManualDayOverride,
  getDepartmentShifts,
  getEmployees,
  getManualDayOverrides,
  getMonthlyEmployee,
  upsertManualDayOverride,
} from '../api/admin'
import { parseApiError } from '../api/error'
import { EmployeeAutocompleteField } from '../components/EmployeeAutocompleteField'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { MinuteDisplay } from '../components/MinuteDisplay'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { SuspiciousBadge } from '../components/SuspiciousBadge'
import { SuspiciousReasonList } from '../components/SuspiciousReasonList'
import { StatusBadge } from '../components/StatusBadge'
import { NumberTicker } from '../components/magic/number-ticker'
import { ShineBorder } from '../components/magic/shine-border'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import type { ManualDayOverride, MonthlyEmployeeDay } from '../types/api'
import { cn } from '../utils/cn'
import { getFlagMeta, knownComplianceFlags } from '../utils/flagDictionary'

const FIELD_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500'
const FIELD_INPUT =
  'mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400'

type StatTone = 'slate' | 'brand' | 'rose' | 'amber' | 'emerald'

const STAT_VALUE_TONES: Record<StatTone, string> = {
  slate: 'text-slate-900',
  brand: 'text-brand-700',
  rose: 'text-rose-700',
  amber: 'text-amber-700',
  emerald: 'text-emerald-700',
}

function StatCard({
  label,
  numeric,
  value,
  sub,
  tone = 'slate',
  shine,
}: {
  label: string
  numeric?: number
  value?: React.ReactNode
  sub?: React.ReactNode
  tone?: StatTone
  shine?: boolean
}) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {shine ? <ShineBorder shineColor={['#0f5e72', '#34d399', '#0f5e72']} borderWidth={2} duration={9} /> : null}
      <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={cn('mt-1.5 break-words text-lg font-semibold tracking-tight tabular-nums sm:text-2xl', STAT_VALUE_TONES[tone])}>
        {numeric !== undefined ? <NumberTicker value={numeric} /> : value}
      </p>
      {sub ? <p className="mt-0.5 text-xs text-slate-500">{sub}</p> : null}
    </div>
  )
}

interface MonthlyFilters {
  employeeId: string
  year: string
  month: string
}

type ManualDayStatus = 'NORMAL' | 'IZINLI' | 'RESMI_TATIL' | 'CALISMADI'
type RuleSourceOverride = 'AUTO' | 'SHIFT' | 'WEEKLY' | 'WORK_RULE'

const statusLabels: Record<ManualDayStatus, string> = {
  NORMAL: 'Normal',
  IZINLI: 'İzinli',
  RESMI_TATIL: 'Resmi Tatil',
  CALISMADI: 'Çalışmadı',
}

const ruleSourceLabels: Record<'SHIFT' | 'WEEKLY' | 'WORK_RULE', string> = {
  SHIFT: 'Vardiya',
  WEEKLY: 'Haftalık Kural',
  WORK_RULE: 'Temel Kural',
}

const ruleSourceOverrideLabels: Record<RuleSourceOverride, string> = {
  AUTO: 'Otomatik (Öncelik: Vardiya > Haftalık > Temel)',
  SHIFT: 'Vardiya',
  WEEKLY: 'Haftalık Kural',
  WORK_RULE: 'Temel Kural',
}

const STATUS_OPTIONS: { value: ManualDayStatus; label: string; hint: string }[] = [
  { value: 'NORMAL', label: 'Normal', hint: 'Giriş/çıkış saatini düzelt' },
  { value: 'IZINLI', label: 'İzinli', hint: 'İzinli gün' },
  { value: 'RESMI_TATIL', label: 'Resmi Tatil', hint: 'Resmi tatil' },
  { value: 'CALISMADI', label: 'Çalışmadı', hint: 'Devamsız gün' },
]

const ATTENDANCE_TIMEZONE = 'Europe/Istanbul'

function hhmmToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

function timeStrToMinutes(value: string | null | undefined): number | null {
  if (!value) return null
  const match = /^(\d{1,2}):(\d{2})/.exec(value)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function getDaySuspicionReasons(day: MonthlyEmployeeDay): string[] {
  const reasons: string[] = []
  if (day.status === 'INCOMPLETE') {
    reasons.push('EKSIK_GUN')
  }
  for (const flag of day.flags) {
    reasons.push(flag)
  }
  return reasons
}

function buildSuspicionTooltip(reasons: string[]): string | undefined {
  if (reasons.length === 0) {
    return undefined
  }
  const lines = reasons.map((code, index) => {
    const meta = getFlagMeta(code)
    return `${index + 1}. ${meta.label}: ${meta.description}`
  })
  return `Şüpheli nedenleri:\n${lines.join('\n')}`
}

function isoToHHMM(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: ATTENDANCE_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatLocalDateTime(value: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: ATTENDANCE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

function formatLocalTime(value: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: ATTENDANCE_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatDayLabel(dateValue: string): string {
  const date = new Date(`${dateValue}T00:00:00`)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: ATTENDANCE_TIMEZONE,
    weekday: 'short',
  }).format(date)
}

function resolveDayRowTone(day: MonthlyEmployeeDay, suspicious: boolean): string {
  if (day.status === 'INCOMPLETE') {
    return 'bg-rose-50/70'
  }
  if (suspicious) {
    return 'bg-amber-50/55'
  }
  if (day.status === 'LEAVE' || day.status === 'OFF') {
    return 'bg-slate-50/70'
  }
  return ''
}

function MinuteCell({ minutes }: { minutes: number }) {
  if (!minutes) {
    return <span className="text-slate-300">·</span>
  }
  return <MinuteDisplay minutes={minutes} />
}

function decodeManualOverrideStatus(override: ManualDayOverride | undefined): {
  status: ManualDayStatus
  reason: string
} {
  if (!override) {
    return { status: 'NORMAL', reason: '' }
  }
  const rawNote = (override.note ?? '').trim()
  // Legacy rows stored the status as a note prefix; migration 0047 cleans them,
  // this strip only guards against stale cached responses.
  const prefixMatch = rawNote.match(/^\[MANUAL_STATUS:(NORMAL|IZINLI|RESMI_TATIL|CALISMADI)\]\s*/i)
  const reason = prefixMatch ? rawNote.replace(prefixMatch[0], '').trim() : rawNote
  if (override.status) {
    return { status: override.status, reason }
  }
  if (prefixMatch) {
    return { status: prefixMatch[1].toUpperCase() as ManualDayStatus, reason }
  }
  return { status: override.is_absent ? 'CALISMADI' : 'NORMAL', reason }
}

export function EmployeeMonthlyReportPage() {
  const queryClient = useQueryClient()
  const { pushToast } = useToast()
  const { hasPermission } = useAuth()
  const now = new Date()
  const canViewManualOverrides = hasPermission('manual_overrides')
  const canWriteManualOverrides = hasPermission('manual_overrides', 'write')
  const canUseManualShiftRules = canWriteManualOverrides && hasPermission('schedule')

  const defaultFilters: MonthlyFilters = {
    employeeId: '',
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
  }

  const [draftFilters, setDraftFilters] = useState<MonthlyFilters>(defaultFilters)
  const [appliedFilters, setAppliedFilters] = useState<MonthlyFilters>(defaultFilters)
  const [showSuspiciousOnly, setShowSuspiciousOnly] = useState(false)
  const [selectedConflictFlag, setSelectedConflictFlag] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)

  const [isManualModalOpen, setManualModalOpen] = useState(false)
  const [editingDay, setEditingDay] = useState<string>('')
  const [editingDayData, setEditingDayData] = useState<MonthlyEmployeeDay | null>(null)
  const [editInTime, setEditInTime] = useState('')
  const [editOutTime, setEditOutTime] = useState('')
  const [editReason, setEditReason] = useState('')
  const [editStatus, setEditStatus] = useState<ManualDayStatus>('NORMAL')
  const [editRuleSource, setEditRuleSource] = useState<RuleSourceOverride>('AUTO')
  const [editRuleShiftId, setEditRuleShiftId] = useState('')
  const [editOverrideId, setEditOverrideId] = useState<number | null>(null)
  const [manualFormWarning, setManualFormWarning] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const employeesQuery = useQuery({
    queryKey: ['employees', 'all'],
    queryFn: () => getEmployees({ status: 'all' }),
  })

  const parsedEmployeeId = Number(appliedFilters.employeeId)
  const parsedYear = Number(appliedFilters.year)
  const parsedMonth = Number(appliedFilters.month)

  const reportEnabled =
    Number.isFinite(parsedEmployeeId) &&
    parsedEmployeeId > 0 &&
    Number.isFinite(parsedYear) &&
    parsedYear > 0 &&
    Number.isFinite(parsedMonth) &&
    parsedMonth >= 1 &&
    parsedMonth <= 12

  const reportQuery = useQuery({
    queryKey: ['employee-monthly', parsedEmployeeId, parsedYear, parsedMonth],
    queryFn: () =>
      getMonthlyEmployee({
        employee_id: parsedEmployeeId,
        year: parsedYear,
        month: parsedMonth,
      }),
    enabled: reportEnabled,
  })

  const overridesQuery = useQuery({
    queryKey: ['manual-overrides', parsedEmployeeId, parsedYear, parsedMonth],
    queryFn: () => getManualDayOverrides(parsedEmployeeId, parsedYear, parsedMonth),
    enabled: reportEnabled && canViewManualOverrides,
  })

  const upsertOverrideMutation = useMutation({
    mutationFn: ({
      employeeId,
      dayDate,
      inTime,
      outTime,
      status,
      ruleSource,
      ruleShiftId,
      reason,
    }: {
      employeeId: number
      dayDate: string
      inTime: string
      outTime: string
      status: ManualDayStatus
      ruleSource: RuleSourceOverride
      ruleShiftId: string
      reason: string
    }) => {
      const isAbsent = status !== 'NORMAL'
      return upsertManualDayOverride(employeeId, {
        day_date: dayDate,
        in_time: isAbsent ? null : inTime || null,
        out_time: isAbsent ? null : outTime || null,
        is_absent: isAbsent,
        status,
        rule_source_override: ruleSource,
        rule_shift_id_override: ruleSource === 'SHIFT' ? (ruleShiftId ? Number(ruleShiftId) : null) : null,
        note: reason.trim() || null,
      })
    },
    onSuccess: () => {
      pushToast({
        variant: 'success',
        title: 'Manuel düzeltme kaydedildi',
        description: 'Günlük puantaj kaydı güncellendi.',
      })
      setManualModalOpen(false)
      setManualFormWarning(null)
      setEditRuleShiftId('')
      void queryClient.invalidateQueries({ queryKey: ['employee-monthly'] })
      void queryClient.invalidateQueries({ queryKey: ['manual-overrides'] })
    },
    onError: (error) => {
      pushToast({
        variant: 'error',
        title: 'Düzeltme kaydedilemedi',
        description: parseApiError(error, 'İşlem başarısız.').message,
      })
    },
  })

  const deleteOverrideMutation = useMutation({
    mutationFn: deleteManualDayOverride,
    onSuccess: () => {
      pushToast({
        variant: 'success',
        title: 'Manuel düzeltme kaldirildi',
        description: 'Seçili gün için manuel override silindi.',
      })
      setManualModalOpen(false)
      setManualFormWarning(null)
      void queryClient.invalidateQueries({ queryKey: ['employee-monthly'] })
      void queryClient.invalidateQueries({ queryKey: ['manual-overrides'] })
    },
    onError: (error) => {
      pushToast({
        variant: 'error',
        title: 'Silme işlemi başarısız',
        description: parseApiError(error, 'İşlem başarısız.').message,
      })
    },
  })

  const selectedEmployee = useMemo(
    () => employeesQuery.data?.find((item) => item.id === parsedEmployeeId),
    [employeesQuery.data, parsedEmployeeId],
  )
  const employeeName = selectedEmployee?.full_name

  const shiftsQuery = useQuery({
    queryKey: ['monthly-manual-shifts', selectedEmployee?.department_id],
    queryFn: () =>
      getDepartmentShifts(
        selectedEmployee?.department_id
          ? { department_id: selectedEmployee.department_id, active_only: false }
          : undefined,
      ),
    enabled: Boolean(selectedEmployee?.department_id) && canUseManualShiftRules && isManualModalOpen,
  })

  const overridesByDate = useMemo(() => {
    if (!canViewManualOverrides) {
      return new Map<string, ManualDayOverride>()
    }
    const map = new Map<string, ManualDayOverride>()
    for (const item of overridesQuery.data ?? []) {
      map.set(item.day_date, item)
    }
    return map
  }, [canViewManualOverrides, overridesQuery.data])

  const days = useMemo(() => reportQuery.data?.days ?? [], [reportQuery.data])
  const totalMissingMinutes = useMemo(
    () => days.reduce((sum, day) => sum + (day.missing_minutes ?? 0), 0),
    [days],
  )
  const shownDays = useMemo(() => {
    return days.filter((day) => {
      if (showSuspiciousOnly && getDaySuspicionReasons(day).length === 0) {
        return false
      }
      if (selectedConflictFlag && !day.flags.includes(selectedConflictFlag)) {
        return false
      }
      return true
    })
  }, [days, selectedConflictFlag, showSuspiciousOnly])

  const suspiciousDayCount = useMemo(
    () => days.filter((day) => getDaySuspicionReasons(day).length > 0).length,
    [days],
  )
  const legalOvertimeDayCount = useMemo(
    () => days.filter((day) => day.legal_overtime_minutes > 0).length,
    [days],
  )
  const earlyArrivalDayCount = useMemo(
    () => days.filter((day) => day.early_arrival_minutes > 0).length,
    [days],
  )
  const leaveDayCount = useMemo(() => days.filter((day) => day.status === 'LEAVE').length, [days])
  const offDayCount = useMemo(() => days.filter((day) => day.status === 'OFF').length, [days])
  const workingDayCount = useMemo(
    () => days.filter((day) => day.status === 'OK' || day.status === 'INCOMPLETE').length,
    [days],
  )
  const suspiciousRatioText = useMemo(() => {
    if (!days.length) return '%0'
    return `%${Math.round((suspiciousDayCount / days.length) * 100)}`
  }, [days.length, suspiciousDayCount])
  const reportPeriodLabel = useMemo(
    () => `${appliedFilters.year}-${String(appliedFilters.month).padStart(2, '0')}`,
    [appliedFilters.month, appliedFilters.year],
  )

  const previewWorkedMinutes = useMemo(() => {
    if (editStatus !== 'NORMAL') return null
    const inMin = hhmmToMinutes(editInTime)
    const outMin = hhmmToMinutes(editOutTime)
    if (inMin === null || outMin === null || outMin < inMin) return null
    const breakMinutes = editingDayData?.applied_break_minutes ?? 0
    return Math.max(0, outMin - inMin - breakMinutes)
  }, [editStatus, editInTime, editOutTime, editingDayData])

  const departmentShifts = useMemo(() => shiftsQuery.data ?? [], [shiftsQuery.data])

  const suggestedShift = useMemo(() => {
    if (editStatus !== 'NORMAL') return null
    const inMin = hhmmToMinutes(editInTime)
    if (inMin === null || departmentShifts.length === 0) return null
    let best: (typeof departmentShifts)[number] | null = null
    let bestDiff = Number.POSITIVE_INFINITY
    for (const shift of departmentShifts) {
      const startMin = timeStrToMinutes(shift.start_time_local)
      if (startMin === null) continue
      const diff = Math.abs(startMin - inMin)
      if (diff < bestDiff) {
        bestDiff = diff
        best = shift
      }
    }
    return best
  }, [editStatus, editInTime, departmentShifts])

  const currentEffectiveShiftId = useMemo(() => {
    if (editRuleSource === 'SHIFT' && editRuleShiftId) return Number(editRuleShiftId)
    return editingDayData?.shift_id ?? null
  }, [editRuleSource, editRuleShiftId, editingDayData])

  const currentEffectiveShiftName = useMemo(() => {
    const match = departmentShifts.find((shift) => shift.id === currentEffectiveShiftId)
    if (match) return `${match.name} (${match.start_time_local}-${match.end_time_local})`
    return editingDayData?.shift_name ?? (currentEffectiveShiftId ? `#${currentEffectiveShiftId}` : '-')
  }, [departmentShifts, currentEffectiveShiftId, editingDayData])

  const applySuggestedShift = () => {
    if (!suggestedShift) return
    setEditRuleSource('SHIFT')
    setEditRuleShiftId(String(suggestedShift.id))
    setShowAdvanced(true)
  }

  const conflictSummary = useMemo(() => {
    const targetFlags = ['SHIFT_WEEKLY_RULE_OVERRIDE', 'NEEDS_SHIFT_REVIEW', 'MISSING_IN', 'MISSING_OUT', 'UNDERWORKED']
    const counts = new Map<string, number>()
    for (const flag of targetFlags) {
      counts.set(flag, 0)
    }

    for (const day of days) {
      for (const flag of targetFlags) {
        if (day.flags.includes(flag)) {
          counts.set(flag, (counts.get(flag) ?? 0) + 1)
        }
      }
    }

    return targetFlags.map((flag) => ({
      code: flag,
      count: counts.get(flag) ?? 0,
    }))
  }, [days])

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = []
    if (appliedFilters.employeeId) labels.push(`Çalışan: ${appliedFilters.employeeId}`)
    labels.push(`Yıl: ${appliedFilters.year}`)
    labels.push(`Ay: ${appliedFilters.month}`)
    if (showSuspiciousOnly) labels.push('Sadece şüpheli günler')
    if (selectedConflictFlag) labels.push(`Çakışma: ${getFlagMeta(selectedConflictFlag).label}`)
    return labels
  }, [appliedFilters, selectedConflictFlag, showSuspiciousOnly])

  const applyFilters = () => setAppliedFilters({ ...draftFilters })
  const clearFilters = () => {
    setDraftFilters(defaultFilters)
    setAppliedFilters(defaultFilters)
    setShowSuspiciousOnly(false)
    setSelectedConflictFlag(null)
  }

  const handleDownloadExcel = async () => {
    if (!reportEnabled) {
      pushToast({
        variant: 'error',
        title: 'Filtre hatası',
        description: 'Excel indirmek için çalışan, yıl ve ay seçin.',
      })
      return
    }

    try {
      setIsDownloading(true)
      const blob = await downloadEmployeeMonthlyExport({
        employee_id: parsedEmployeeId,
        year: parsedYear,
        month: parsedMonth,
      })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `puantaj-employee-${parsedEmployeeId}-${parsedYear}-${String(parsedMonth).padStart(2, '0')}.xlsx`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      pushToast({
        variant: 'error',
        title: 'Excel indirilemedi',
        description: parseApiError(error, 'Dosya oluşturulamadı.').message,
      })
    } finally {
      setIsDownloading(false)
    }
  }

  const openManualModalForDay = (day: MonthlyEmployeeDay) => {
    if (!canViewManualOverrides) {
      return
    }
    const override = overridesByDate.get(day.date)
    const decoded = decodeManualOverrideStatus(override)
    const isNormal = decoded.status === 'NORMAL'
    setEditingDay(day.date)
    setEditingDayData(day)
    setEditOverrideId(override?.id ?? null)
    setEditStatus(decoded.status)
    setEditReason(decoded.reason)
    setEditInTime(isNormal ? (override?.in_ts ? isoToHHMM(override.in_ts) : isoToHHMM(day.in)) : '')
    setEditOutTime(isNormal ? (override?.out_ts ? isoToHHMM(override.out_ts) : isoToHHMM(day.out)) : '')
    setEditRuleSource(override?.rule_source_override ?? 'AUTO')
    setEditRuleShiftId(
      override?.rule_shift_id_override
        ? String(override.rule_shift_id_override)
        : day.shift_id
          ? String(day.shift_id)
          : '',
    )
    setShowAdvanced(Boolean(override?.rule_source_override))
    setManualFormWarning(null)
    setManualModalOpen(true)
  }

  const openManualModalFromToolbar = () => {
    if (!canWriteManualOverrides) {
      return
    }
    if (!reportEnabled || days.length === 0) {
      pushToast({
        variant: 'error',
        title: 'Rapor verisi yok',
        description: 'Önce çalışan, yıl ve ay seçip raporu yükleyin.',
      })
      return
    }
    const firstIncomplete = days.find((day) => day.status === 'INCOMPLETE')
    const firstSuspicious = days.find((day) => getDaySuspicionReasons(day).length > 0)
    openManualModalForDay(firstIncomplete ?? firstSuspicious ?? days[0])
  }

  const validateManualForm = (): boolean => {
    setManualFormWarning(null)

    if (!editingDay) {
      setManualFormWarning('Düzeltme için tarih seçmelisiniz.')
      return false
    }

    if (editStatus === 'NORMAL') {
      if (!editInTime && !editOutTime) {
        setManualFormWarning('Normal gün için en az bir saat bilgisi girin.')
        return false
      }
      if (editInTime && editOutTime && editOutTime < editInTime) {
        setManualFormWarning('Çıkış saati girişten önce olamaz. Gece vardiyası (gün aşan mesai) bu ekrandan henüz düzeltilemiyor.')
        return false
      }
    }
    if (editRuleSource === 'SHIFT' && !editRuleShiftId) {
      setManualFormWarning('Vardiya kurali için bir vardiya seçmelisiniz.')
      return false
    }
    return true
  }

  const handleResetToRecorded = () => {
    if (!editingDayData) return
    setEditInTime(isoToHHMM(editingDayData.in))
    setEditOutTime(isoToHHMM(editingDayData.out))
    setManualFormWarning(null)
  }

  const onSaveManual = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!reportEnabled || !canWriteManualOverrides) return
    if (!validateManualForm()) return

    upsertOverrideMutation.mutate({
      employeeId: parsedEmployeeId,
      dayDate: editingDay,
      inTime: editInTime,
      outTime: editOutTime,
      status: editStatus,
      ruleSource: editRuleSource,
      ruleShiftId: editRuleShiftId,
      reason: editReason,
    })
  }

  if (employeesQuery.isLoading) {
    return <LoadingBlock />
  }

  if (employeesQuery.isError) {
    return <ErrorBlock message="Çalışan listesi alınamadı." />
  }

  const employees = employeesQuery.data ?? []

  return (
    <div className="space-y-4">
      <PageHeader
        title="Aylık Çalışan Puantaj Raporu"
        description="Günlük giriş/çıkış ve fazla mesai bilgilerini inceleyin, HR için manuel düzeltme yapın."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openManualModalFromToolbar}
              disabled={!canWriteManualOverrides || !reportEnabled}
              className="btn-secondary rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Manuel Düzeltme
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadExcel()}
              disabled={isDownloading}
              className="btn-secondary rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDownloading ? (
                <>
                  <span className="inline-spinner inline-spinner-dark" aria-hidden="true" />
                  Hazırlanıyor...
                </>
              ) : (
                'Excel İndir'
              )}
            </button>
            <Link
              to="/reports/excel-export"
              className="btn-secondary rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Gelişmiş Export
            </Link>
          </div>
        }
      />

      <Panel>
        <h4 className="text-base font-semibold text-slate-900">Filtreler</h4>
        <p className="mt-1 text-sm text-slate-500">Çalışanı ve dönemi seçip raporu yükleyin.</p>
        <div className="mt-4 grid items-end gap-3 md:grid-cols-4">
          <EmployeeAutocompleteField
            label="Çalışan"
            employees={employees}
            value={draftFilters.employeeId}
            onChange={(employeeId) =>
              setDraftFilters((prev) => ({ ...prev, employeeId }))
            }
            emptyLabel="Seçiniz"
            helperText="Çalışan adını veya ID bilgisini yazabilirsiniz."
            className="md:col-span-2"
            labelTextClassName={FIELD_LABEL}
            inputClassName={FIELD_INPUT}
          />

          <label className="block">
            <span className={FIELD_LABEL}>Yıl</span>
            <input
              type="number"
              value={draftFilters.year}
              onChange={(event) =>
                setDraftFilters((prev) => ({ ...prev, year: event.target.value }))
              }
              className={FIELD_INPUT}
            />
          </label>

          <label className="block">
            <span className={FIELD_LABEL}>Ay</span>
            <input
              type="number"
              value={draftFilters.month}
              onChange={(event) =>
                setDraftFilters((prev) => ({ ...prev, month: event.target.value }))
              }
              className={FIELD_INPUT}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showSuspiciousOnly}
              onChange={(event) => setShowSuspiciousOnly(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Sadece şüpheli günleri göster
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={applyFilters}
              className="btn-primary rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              Uygula
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="btn-secondary rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Temizle
            </button>
          </div>
        </div>

        {activeFilterLabels.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {activeFilterLabels.map((label) => (
              <span
                key={label}
                className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}
      </Panel>

      {!reportEnabled ? <ErrorBlock message="Rapor için çalışan, yil ve ay seçmelisiniz." /> : null}
      {reportQuery.isLoading ? <LoadingBlock /> : null}
      {reportQuery.isError ? (
        <ErrorBlock message={parseApiError(reportQuery.error, 'Aylık rapor alınamadı.').message} />
      ) : null}

      {reportQuery.data ? (
        <>
          <Panel>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h4 className="text-base font-semibold text-slate-900">Aylık Özet</h4>
                <p className="mt-1 text-sm text-slate-500">
                  {employeeName ?? `#${reportQuery.data.employee_id}`} · Dönem {reportPeriodLabel} · {ATTENDANCE_TIMEZONE}
                </p>
              </div>
              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Vardiya kaynağı: Vardiya &gt; Haftalık &gt; Temel
              </span>
            </div>

            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Süreler</p>
            <div className="mt-2 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              <StatCard
                label="Toplam Çalışma"
                tone="brand"
                shine
                value={<MinuteDisplay minutes={reportQuery.data.totals.worked_minutes} />}
              />
              <StatCard
                label="Plan Üstü Süre"
                value={<MinuteDisplay minutes={reportQuery.data.totals.plan_overtime_minutes} />}
              />
              <StatCard
                label="Yasal Fazla Süre"
                value={<MinuteDisplay minutes={reportQuery.data.totals.legal_extra_work_minutes} />}
              />
              <StatCard
                label="Yasal Fazla Mesai"
                value={<MinuteDisplay minutes={reportQuery.data.totals.legal_overtime_minutes} />}
                sub={`${legalOvertimeDayCount} gün`}
              />
              <StatCard
                label="Toplam Eksik Süre"
                tone="rose"
                value={<MinuteDisplay minutes={totalMissingMinutes} />}
              />
              <StatCard
                label="Toplam Erken Geliş"
                value={<MinuteDisplay minutes={reportQuery.data.totals.early_arrival_minutes} />}
                sub={`${earlyArrivalDayCount} gün`}
              />
            </div>

            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Gün Sayıları</p>
            <div className="mt-2 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              <StatCard
                label="İşlenen Gün"
                numeric={workingDayCount}
                sub={`İzin ${leaveDayCount} · Tatil ${offDayCount}`}
              />
              <StatCard
                label="Eksik Gün"
                tone="rose"
                numeric={reportQuery.data.totals.incomplete_days}
              />
              <StatCard
                label="Şüpheli Gün"
                tone="amber"
                numeric={suspiciousDayCount}
                sub={`${suspiciousRatioText} (${days.length} gün)`}
              />
              <StatCard
                label="Filtrelenen Gün"
                numeric={shownDays.length}
                sub={selectedConflictFlag ? `Çakışma: ${getFlagMeta(selectedConflictFlag).label}` : 'Tüm günler'}
              />
            </div>

            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Fazla Mesai Dağılımı
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-cyan-200 bg-cyan-50/50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-800">FM1</p>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums text-slate-900">
                  <MinuteDisplay minutes={reportQuery.data.totals.fm1_minutes} />
                </p>
                <p className="mt-0.5 text-xs text-slate-600">Normal gün plan üstü</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800">FM2</p>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums text-slate-900">
                  <MinuteDisplay minutes={reportQuery.data.totals.fm2_minutes} />
                </p>
                <p className="mt-0.5 text-xs text-slate-600">Bayram / resmi tatil</p>
              </div>
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-indigo-800">FM3</p>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums text-slate-900">
                  <MinuteDisplay minutes={reportQuery.data.totals.fm3_minutes} />
                </p>
                <p className="mt-0.5 text-xs text-slate-600">Pazar / hafta tatili</p>
              </div>
            </div>
          </Panel>

          <Panel>
            <h4 className="text-base font-semibold text-slate-900">Uyumluluk (TR İş Kanunu)</h4>
            <p className="mt-1 text-sm text-slate-500">Net çalışma ve yıllık fazla mesai limiti durumu.</p>
            <div className="mt-4 grid gap-3 grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Net Çalışma"
                value={<MinuteDisplay minutes={reportQuery.data.worked_minutes_net} />}
              />
              <StatCard
                label="Yıllık FM Kullanımı"
                value={<MinuteDisplay minutes={reportQuery.data.annual_overtime_used_minutes} />}
              />
              <StatCard
                label="Yıllık Kalan FM"
                value={<MinuteDisplay minutes={reportQuery.data.annual_overtime_remaining_minutes} />}
              />
              <div
                className={cn(
                  'rounded-xl border p-4 shadow-sm',
                  reportQuery.data.annual_overtime_cap_exceeded
                    ? 'border-rose-200 bg-rose-50/60'
                    : 'border-emerald-200 bg-emerald-50/60',
                )}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Yıllık Limit Durumu
                </p>
                <p
                  className={cn(
                    'mt-1.5 text-lg font-semibold tracking-tight',
                    reportQuery.data.annual_overtime_cap_exceeded ? 'text-rose-700' : 'text-emerald-700',
                  )}
                >
                  {reportQuery.data.annual_overtime_cap_exceeded ? 'Limit Aşıldı' : 'Limit İçinde'}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Flag açıklamaları</p>
              <ul className="mt-2 grid gap-1.5 text-xs text-slate-600 sm:grid-cols-2">
                {knownComplianceFlags().map((flag) => (
                  <li key={flag}>
                    <span className="font-semibold text-slate-700" title={getFlagMeta(flag).description}>
                      {getFlagMeta(flag).label}
                    </span>{' '}
                    ({flag}): {getFlagMeta(flag).description}
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h4 className="text-base font-semibold text-slate-900">Çakışma Analizi</h4>
                <p className="mt-1 text-sm text-slate-500">
                  Vardiya, haftalık kural ve event sıralaması arasında tutarsız görünen günlerin özeti. Filtrelemek için
                  bir karta tıklayın.
                </p>
              </div>
              {selectedConflictFlag ? (
                <button
                  type="button"
                  onClick={() => setSelectedConflictFlag(null)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Filtreyi temizle
                </button>
              ) : null}
            </div>
            <div className="mt-4 grid gap-3 grid-cols-2 lg:grid-cols-5">
              {conflictSummary.map((item) => {
                const active = selectedConflictFlag === item.code
                return (
                  <button
                    key={item.code}
                    type="button"
                    onClick={() => {
                      setSelectedConflictFlag((prev) => (prev === item.code ? null : item.code))
                      setShowSuspiciousOnly(true)
                    }}
                    aria-pressed={active}
                    className={cn(
                      'rounded-xl border p-4 text-left shadow-sm transition',
                      active
                        ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <p
                      className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500"
                      title={getFlagMeta(item.code).description}
                    >
                      {getFlagMeta(item.code).label}
                    </p>
                    <p
                      className={cn(
                        'mt-1.5 text-2xl font-semibold tracking-tight tabular-nums',
                        active ? 'text-brand-700' : 'text-slate-900',
                      )}
                    >
                      <NumberTicker value={item.count} />
                    </p>
                  </button>
                )
              })}
            </div>
          </Panel>

          {shownDays.length === 0 ? (
            <Panel>
              <p className="text-sm text-slate-600">Seçilen filtreye uygun günlük kayıt bulunamadı.</p>
            </Panel>
          ) : (
            <Panel>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-base font-semibold text-slate-900">
                  Günlük Puantaj
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    {shownDays.length} / {days.length} satır
                  </span>
                </h4>
                <p className="text-xs text-slate-500">
                  Satır rengi riski gösterir: kırmızı eksik, amber şüpheli, gri izin/tatil.
                </p>
              </div>
              <div className="list-scroll-area w-full max-w-full overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="monthly-report-table w-full min-w-[1360px] text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 font-semibold uppercase tracking-wide text-slate-500 shadow-[inset_0_-1px_0_0_theme(colors.slate.200)]">
                    <tr className="text-[10px] text-slate-400">
                      <th className="px-3 pt-2.5 pb-1" colSpan={3}>Gün</th>
                      <th className="px-3 pt-2.5 pb-1 text-center" colSpan={2}>Saatler</th>
                      <th className="px-3 pt-2.5 pb-1 text-center" colSpan={5}>Çalışma Süresi</th>
                      <th className="border-l border-slate-200 px-3 pt-2.5 pb-1 text-center" colSpan={5}>Fazla Mesai</th>
                      <th className="border-l border-slate-200 px-3 pt-2.5 pb-1 text-center" colSpan={3}>Kural &amp; İzin</th>
                      <th className="px-3 pt-2.5 pb-1" colSpan={2} />
                    </tr>
                    <tr className="text-[11px]">
                      <th className="px-3 pb-2.5">Tarih</th>
                      <th className="px-3 pb-2.5">Gün</th>
                      <th className="px-3 pb-2.5">Durum</th>
                      <th className="px-3 pb-2.5">Giriş</th>
                      <th className="px-3 pb-2.5">Çıkış</th>
                      <th className="px-3 pb-2.5 text-right">Çalışma</th>
                      <th className="px-3 pb-2.5 text-right" title="Çalışanın mola butonu ile aldığı gerçek mola">Mola</th>
                      <th className="px-3 pb-2.5 text-right">Erken Geliş</th>
                      <th className="px-3 pb-2.5 text-right">Plan Üstü</th>
                      <th className="px-3 pb-2.5 text-right">Eksik Süre</th>
                      <th className="border-l border-slate-200 px-3 pb-2.5 text-right whitespace-nowrap" title="Normal gün plan üstü">FM1</th>
                      <th className="px-3 pb-2.5 text-right whitespace-nowrap" title="Bayram / resmi tatil">FM2</th>
                      <th className="px-3 pb-2.5 text-right whitespace-nowrap" title="Pazar / hafta tatili">FM3</th>
                      <th className="px-3 pb-2.5 text-right">Yasal Fazla Süre</th>
                      <th className="px-3 pb-2.5 text-right">Yasal Fazla Mesai</th>
                      <th className="border-l border-slate-200 px-3 pb-2.5">Kural Kaynağı</th>
                      <th className="px-3 pb-2.5">Vardiya</th>
                      <th className="px-3 pb-2.5">İzin</th>
                      <th className="px-3 pb-2.5">Şüpheli Neden</th>
                      <th className="px-3 pb-2.5 text-right">Aksiyon</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownDays.map((day) => {
                      const reasons = getDaySuspicionReasons(day)
                      const suspicious = reasons.length > 0
                      const suspiciousTooltip = buildSuspicionTooltip(reasons)
                      const override = canViewManualOverrides ? overridesByDate.get(day.date) : undefined
                      const decodedOverride = decodeManualOverrideStatus(override)
                      const hasManual =
                        canViewManualOverrides &&
                        (day.flags.includes('MANUAL_OVERRIDE') || day.flags.includes('MANUAL_EVENT') || Boolean(override))
                      const showManualStatusBadge = decodedOverride.status !== 'NORMAL'
                      const dayRowTone = resolveDayRowTone(day, suspicious)

                      return (
                        <tr
                        key={day.date}
                        className={`border-t border-slate-100 transition-colors ${dayRowTone || 'odd:bg-white even:bg-slate-50/40 hover:bg-brand-50/40'}`}
                      >
                          <td className="px-3 py-2.5 font-medium text-slate-800">{day.date}</td>
                          <td className="px-3 py-2.5 text-xs uppercase text-slate-500">{formatDayLabel(day.date)}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <StatusBadge value={day.status} />
                              {hasManual ? (
                                <span className="inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                                  MANUEL
                                </span>
                              ) : null}
                              {showManualStatusBadge ? (
                                <span className="inline-flex rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-semibold text-cyan-700">
                                  {statusLabels[decodedOverride.status]}
                                </span>
                              ) : null}
                              <SuspiciousBadge suspicious={suspicious} tooltip={suspiciousTooltip} />
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-800" title={day.in ? formatLocalDateTime(day.in) : undefined}>
                            {formatLocalTime(day.in)}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-800" title={day.out ? formatLocalDateTime(day.out) : undefined}>
                            {formatLocalTime(day.out)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-slate-900"><MinuteDisplay minutes={day.worked_minutes} /></td>
                          <td className="px-3 py-2.5 text-right text-slate-600"><MinuteCell minutes={day.break_taken_minutes ?? 0} /></td>
                          <td className="px-3 py-2.5 text-right text-slate-600"><MinuteCell minutes={day.early_arrival_minutes} /></td>
                          <td className="px-3 py-2.5 text-right text-slate-600"><MinuteCell minutes={day.plan_overtime_minutes} /></td>
                          <td className="px-3 py-2.5 text-right text-slate-600"><MinuteCell minutes={day.missing_minutes ?? 0} /></td>
                          <td className="border-l border-slate-100 px-3 py-2.5 text-right text-slate-600"><MinuteCell minutes={day.fm1_minutes} /></td>
                          <td className="px-3 py-2.5 text-right text-slate-600"><MinuteCell minutes={day.fm2_minutes} /></td>
                          <td className="px-3 py-2.5 text-right text-slate-600"><MinuteCell minutes={day.fm3_minutes} /></td>
                          <td className="px-3 py-2.5 text-right text-slate-600"><MinuteCell minutes={day.legal_extra_work_minutes} /></td>
                          <td className="px-3 py-2.5 text-right font-semibold text-slate-900"><MinuteCell minutes={day.legal_overtime_minutes} /></td>
                          <td className="border-l border-slate-100 px-3 py-2.5">
                            <span
                              className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700"
                              title={`Öncelik: Vardiya > Haftalık > Temel | Plan: ${day.applied_planned_minutes} dk | Mola: ${day.applied_break_minutes} dk`}
                            >
                              {ruleSourceLabels[day.rule_source]}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-slate-700">{day.shift_name ?? '-'}</td>
                          <td className="px-3 py-2.5 text-slate-700">{day.leave_type ?? '-'}</td>
                          <td className="px-3 py-2.5">
                            <SuspiciousReasonList reasons={reasons} />
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {canViewManualOverrides ? (
                              <button
                                type="button"
                                onClick={() => openManualModalForDay(day)}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                              >
                                {canWriteManualOverrides ? 'Manuel Düzelt' : 'İncele'}
                              </button>
                            ) : (
                              <span className="text-xs text-slate-500">Yetki yok</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </>
      ) : null}

      <Modal
        open={isManualModalOpen}
        title={editingDay ? `${editingDay} - Manuel Düzeltme` : 'Manuel Düzeltme'}
        onClose={() => setManualModalOpen(false)}
        placement="right"
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={onSaveManual} className="space-y-5">
          {!canWriteManualOverrides ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Manuel düzeltme verisini görüntüleyebilirsiniz, ancak kaydetme için yazma yetkisi gerekir.
            </p>
          ) : null}

          {editingDayData ? (
            <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-lg font-semibold text-slate-900">{editingDay}</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {formatDayLabel(editingDay)}
                  </span>
                </div>
                <StatusBadge value={editingDayData.status} />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-3">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Kayıtlı Giriş</dt>
                  <dd className="mt-0.5 font-mono text-sm text-slate-800">{isoToHHMM(editingDayData.in) || '--:--'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Kayıtlı Çıkış</dt>
                  <dd className="mt-0.5 font-mono text-sm text-slate-800">{isoToHHMM(editingDayData.out) || '--:--'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Kayıtlı Çalışma</dt>
                  <dd className="mt-0.5 text-sm text-slate-800">
                    <MinuteDisplay minutes={editingDayData.worked_minutes} />
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-[11px] text-slate-500">
                Vardiya: {editingDayData.shift_name ?? '-'} · Plan:{' '}
                <MinuteDisplay minutes={editingDayData.applied_planned_minutes} /> · Mola:{' '}
                <MinuteDisplay minutes={editingDayData.applied_break_minutes} />
              </p>
            </section>
          ) : null}

          <fieldset>
            <legend className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Gün durumu</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STATUS_OPTIONS.map((opt) => {
                const active = editStatus === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEditStatus(opt.value)}
                    disabled={!canWriteManualOverrides}
                    aria-pressed={active}
                    className={`rounded-xl border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      active
                        ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <span className={`block text-sm font-semibold ${active ? 'text-brand-700' : 'text-slate-800'}`}>
                      {opt.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">{opt.hint}</span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          {editStatus === 'NORMAL' ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Çalışma saatleri
                </span>
                {canWriteManualOverrides && editingDayData && (editingDayData.in || editingDayData.out) ? (
                  <button
                    type="button"
                    onClick={handleResetToRecorded}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                  >
                    Kayıtlı saatlere dön
                  </button>
                ) : null}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className={FIELD_LABEL}>Giriş Saati</span>
                  <input
                    type="time"
                    value={editInTime}
                    onChange={(event) => setEditInTime(event.target.value)}
                    disabled={!canWriteManualOverrides}
                    className={cn(FIELD_INPUT, 'font-mono')}
                  />
                </label>
                <label className="block">
                  <span className={FIELD_LABEL}>Çıkış Saati</span>
                  <input
                    type="time"
                    value={editOutTime}
                    onChange={(event) => setEditOutTime(event.target.value)}
                    disabled={!canWriteManualOverrides}
                    className={cn(FIELD_INPUT, 'font-mono')}
                  />
                </label>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">
                  Bu düzeltmeyle (tahmini)
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  {previewWorkedMinutes === null ? (
                    <span className="font-mono text-slate-400">--:--</span>
                  ) : (
                    <MinuteDisplay minutes={previewWorkedMinutes} />
                  )}
                  <span className="ml-1 text-[11px] font-normal text-slate-500">net çalışma</span>
                </span>
              </div>
              {canUseManualShiftRules ? (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Bu güne uygulanan vardiya
                    </span>
                    <span className="text-sm font-semibold text-slate-800">{currentEffectiveShiftName}</span>
                  </div>
                  {suggestedShift && suggestedShift.id !== currentEffectiveShiftId ? (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                      <span className="text-xs text-amber-800">
                        Giriş saatine göre uygun vardiya:{' '}
                        <strong>
                          {suggestedShift.name} ({suggestedShift.start_time_local}-{suggestedShift.end_time_local})
                        </strong>
                      </span>
                      <button
                        type="button"
                        onClick={applySuggestedShift}
                        className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700"
                      >
                        Bu vardiyayı uygula
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : (
            <p className="rounded-xl border border-cyan-200 bg-cyan-50/70 px-4 py-3 text-sm text-cyan-800">
              Bu gün <strong>{statusLabels[editStatus]}</strong> olarak işaretlenecek; giriş/çıkış saatleri sıfırlanır.
            </p>
          )}

          <label className="block">
            <span className={FIELD_LABEL}>Gerekçe / Not (opsiyonel)</span>
            <input
              type="text"
              value={editReason}
              onChange={(event) => setEditReason(event.target.value)}
              disabled={!canWriteManualOverrides}
              className={FIELD_INPUT}
              placeholder="Örn: Sağlık raporu / Sistem arızası"
            />
          </label>

          {canWriteManualOverrides ? (
            <section className="rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setShowAdvanced((value) => !value)}
                aria-expanded={showAdvanced}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Gelişmiş: kural kaynağı
                </span>
                <span className="text-xs text-slate-500">{showAdvanced ? 'Gizle' : 'Göster'}</span>
              </button>
              {showAdvanced ? (
                <div className="space-y-3 border-t border-slate-200 px-4 py-3">
                  <label className="block">
                    <span className={FIELD_LABEL}>Kural Kaynağı</span>
                    <select
                      value={editRuleSource}
                      onChange={(event) => {
                        const nextSource = event.target.value as RuleSourceOverride
                        setEditRuleSource(nextSource)
                        if (nextSource !== 'SHIFT') {
                          setEditRuleShiftId('')
                        }
                      }}
                      disabled={!canWriteManualOverrides}
                      className={FIELD_INPUT}
                    >
                      <option value="AUTO">{ruleSourceOverrideLabels.AUTO}</option>
                      <option value="SHIFT" disabled={!hasPermission('schedule')}>
                        {ruleSourceOverrideLabels.SHIFT}
                      </option>
                      <option value="WEEKLY">{ruleSourceOverrideLabels.WEEKLY}</option>
                      <option value="WORK_RULE">{ruleSourceOverrideLabels.WORK_RULE}</option>
                    </select>
                  </label>

                  {!hasPermission('schedule') ? (
                    <p className="text-xs text-slate-500">
                      Vardiya bazlı düzeltme için schedule yetkisi gerekir; bu nedenle vardiya seçimi gizlendi.
                    </p>
                  ) : null}

                  {editRuleSource === 'SHIFT' ? (
                    <label className="block">
                      <span className={FIELD_LABEL}>Kural Vardiyası</span>
                      <select
                        value={editRuleShiftId}
                        onChange={(event) => setEditRuleShiftId(event.target.value)}
                        disabled={!canWriteManualOverrides || !canUseManualShiftRules}
                        className={FIELD_INPUT}
                      >
                        <option value="">Vardiya seçiniz</option>
                        {(shiftsQuery.data ?? []).map((shift) => (
                          <option key={shift.id} value={shift.id}>
                            {shift.name} ({shift.start_time_local} - {shift.end_time_local})
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {manualFormWarning ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              {manualFormWarning}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            <button
              type="submit"
              disabled={!canWriteManualOverrides || upsertOverrideMutation.isPending}
              className="btn-primary rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {upsertOverrideMutation.isPending ? (
                <>
                  <span className="inline-spinner" aria-hidden="true" />
                  Kaydediliyor...
                </>
              ) : (
                'Kaydet'
              )}
            </button>
            {editOverrideId ? (
              <button
                type="button"
                onClick={() => deleteOverrideMutation.mutate(editOverrideId)}
                disabled={!canWriteManualOverrides || deleteOverrideMutation.isPending}
                className="btn-danger rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {deleteOverrideMutation.isPending ? (
                  <>
                    <span className="inline-spinner" aria-hidden="true" />
                    Siliniyor...
                  </>
                ) : (
                  'Manuel Kaydı Sil'
                )}
              </button>
            ) : null}
          </div>
        </form>
      </Modal>
    </div>
  )
}
