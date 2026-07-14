import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'

import {
  createDeviceInvite,
  getDepartments,
  getDepartmentShifts,
  getEmployeeDetail,
  getEmployees,
  getLocationMonitorEmployeeTimeline,
  getMonthlyEmployee,
  updateEmployeeActive,
  updateEmployeeProfile,
  updateEmployeeShift,
} from '../api/admin'
import { parseApiError } from '../api/error'
import { CopyField } from '../components/CopyField'
import { EmployeeAutocompleteField } from '../components/EmployeeAutocompleteField'
import { ErrorBlock } from '../components/ErrorBlock'
import { NumberTicker } from '../components/magic/number-ticker'
import { ShineBorder } from '../components/magic/shine-border'
import { LoadingBlock } from '../components/LoadingBlock'
import { MinuteDisplay } from '../components/MinuteDisplay'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { StatusBadge } from '../components/StatusBadge'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import type { LocationStatus, MonthlyEmployeeDay } from '../types/api'
import { buildMonthlyAttendanceInsight, getAttendanceDayType } from '../utils/attendanceInsights'
import { getFlagMeta } from '../utils/flagDictionary'

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

function DetailStat({
  label,
  numeric,
  text,
  sub,
}: {
  label: string
  numeric?: number
  text?: ReactNode
  sub?: ReactNode
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
      <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1.5 break-words text-base font-semibold tracking-tight text-slate-900 sm:text-xl">
        {numeric !== undefined ? <NumberTicker value={numeric} /> : text}
      </p>
      {sub ? <p className="mt-0.5 text-xs text-slate-500">{sub}</p> : null}
    </div>
  )
}

const maxInviteDurationMinutes = 60 * 24 * 30
const defaultInviteDurationMinutes = 60 * 24

const inviteSchema = z.object({
  expires_in_minutes: z.coerce.number().int().positive().max(maxInviteDurationMinutes),
})

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '-'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })
}

function formatDayStatus(status: MonthlyEmployeeDay['status']): string {
  if (status === 'OK') return 'Tamam'
  if (status === 'INCOMPLETE') return 'Eksik'
  if (status === 'LEAVE') return 'İzinli'
  return 'Tatilde'
}

function formatDayShortLabel(value: string): string {
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return '-'
  }
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    weekday: 'short',
  }).format(parsed)
}

function resolveMonthlyRowTone(day: MonthlyEmployeeDay): string {
  if (day.status === 'INCOMPLETE') {
    return 'bg-rose-50/70'
  }
  if (day.flags.length > 0) {
    return 'bg-amber-50/45'
  }
  if (day.status === 'LEAVE' || day.status === 'OFF') {
    return 'bg-slate-50/70'
  }
  return ''
}

function formatFlagList(flags: string[]): string {
  if (!flags.length) {
    return '-'
  }
  return flags.map((flag) => `${getFlagMeta(flag).label} (${flag})`).join(', ')
}

function formatLocationSignalStatus(status?: LocationStatus | null): string {
  if (status === 'VERIFIED_HOME') return 'Doğrulama güçlü'
  if (status === 'UNVERIFIED_LOCATION') return 'Kontrol gerektiriyor'
  if (status === 'NO_LOCATION') return 'Sinyal alınmadı'
  return 'Bekleniyor'
}

function locationSignalTone(status?: LocationStatus | null): string {
  if (status === 'VERIFIED_HOME') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-900'
  }
  if (status === 'UNVERIFIED_LOCATION') {
    return 'border-amber-200 bg-amber-50 text-amber-900'
  }
  if (status === 'NO_LOCATION') {
    return 'border-slate-200 bg-slate-50 text-slate-800'
  }
  return 'border-slate-200 bg-white text-slate-800'
}

const istanbulDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function toIstanbulDay(value?: string | null): string | null {
  if (!value) {
    return null
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return istanbulDayFormatter.format(parsed)
}

export function EmployeeDetailPage() {
  const params = useParams()
  const queryClient = useQueryClient()
  const { hasPermission } = useAuth()
  const { pushToast } = useToast()
  const now = new Date()
  const todayIstanbul = istanbulDayFormatter.format(now)

  const navigate = useNavigate()
  const employeeId = Number(params.id)
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null)
  const [profileFullName, setProfileFullName] = useState<string | null>(null)
  const [profileDepartmentId, setProfileDepartmentId] = useState<string | null>(null)

  // Calisan degisince (ust gezinme) duzenleme alanlarini sunucu degerine sifirla.
  useEffect(() => {
    setSelectedShiftId(null)
    setProfileFullName(null)
    setProfileDepartmentId(null)
  }, [employeeId])

  const employeesListQuery = useQuery({
    queryKey: ['employees-switcher'],
    queryFn: () => getEmployees({ include_inactive: true, status: 'all' }),
  })
  const employeesList = employeesListQuery.data ?? []
  const sortedEmployees = useMemo(
    () => [...employeesList].sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr')),
    [employeesList],
  )
  const currentIndex = sortedEmployees.findIndex((e) => e.id === employeeId)
  const prevEmployee = currentIndex > 0 ? sortedEmployees[currentIndex - 1] : null
  const nextEmployee =
    currentIndex >= 0 && currentIndex < sortedEmployees.length - 1 ? sortedEmployees[currentIndex + 1] : null

  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()))
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1))

  const [isInviteModalOpen, setInviteModalOpen] = useState(false)
  const [expiresInMinutes, setExpiresInMinutes] = useState(String(defaultInviteDurationMinutes))
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)

  const detailQuery = useQuery({
    queryKey: ['employee-detail', employeeId],
    queryFn: () => getEmployeeDetail(employeeId),
    enabled: Number.isFinite(employeeId),
  })

  const employee = detailQuery.data?.employee

  const departmentsQuery = useQuery({
    queryKey: ['departments', 'employee-detail-edit'],
    queryFn: () => getDepartments(),
    enabled: Number.isFinite(employeeId),
  })

  const shiftsQuery = useQuery({
    queryKey: ['department-shifts', employee?.department_id],
    queryFn: () =>
      getDepartmentShifts(
        employee?.department_id ? { department_id: employee.department_id, active_only: false } : undefined,
      ),
    enabled: Boolean(employee?.department_id),
  })

  const parsedYear = Number(selectedYear)
  const parsedMonth = Number(selectedMonth)
  const selectedMonthValid = Number.isFinite(parsedYear) && Number.isFinite(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12

  const monthlyQuery = useQuery({
    queryKey: ['employee-monthly', employeeId, parsedYear, parsedMonth],
    queryFn: () => getMonthlyEmployee({ employee_id: employeeId, year: parsedYear, month: parsedMonth }),
    enabled: Number.isFinite(employeeId) && selectedMonthValid,
  })

  const currentMonthQuery = useQuery({
    queryKey: ['employee-monthly-current', employeeId, now.getFullYear(), now.getMonth() + 1],
    queryFn: () =>
      getMonthlyEmployee({
        employee_id: employeeId,
        year: now.getFullYear(),
        month: now.getMonth() + 1,
    }),
    enabled: Number.isFinite(employeeId),
  })

  const fieldSignalQuery = useQuery({
    queryKey: ['employee-detail-field-signal', employeeId, todayIstanbul],
    queryFn: () =>
      getLocationMonitorEmployeeTimeline(employeeId, {
        start_date: todayIstanbul,
        end_date: todayIstanbul,
      }),
    enabled: Number.isFinite(employeeId) && hasPermission('log'),
    retry: false,
  })

  const toggleActiveMutation = useMutation({
    mutationFn: (nextStatus: boolean) => updateEmployeeActive(employeeId, { is_active: nextStatus }),
    onSuccess: (updatedEmployee) => {
      pushToast({
        variant: 'success',
        title: updatedEmployee.is_active ? 'Çalışan aktife alındı' : 'Çalışan arşive alındı',
        description: `${updatedEmployee.full_name} için durum güncellendi.`,
      })
      void queryClient.invalidateQueries({ queryKey: ['employees'] })
      void queryClient.invalidateQueries({ queryKey: ['employee-detail', employeeId] })
    },
    onError: (error) => {
      pushToast({
        variant: 'error',
        title: 'Durum güncellenemedi',
        description: parseApiError(error, 'İşlem başarısız.').message,
      })
    },
  })

  const updateProfileMutation = useMutation({
    mutationFn: (payload: { full_name?: string; department_id?: number | null }) =>
      updateEmployeeProfile(employeeId, payload),
    onSuccess: (updatedEmployee) => {
      pushToast({
        variant: 'success',
        title: 'Çalışan bilgileri güncellendi',
        description: `${updatedEmployee.full_name} için profil bilgileri kaydedildi.`,
      })
      void queryClient.invalidateQueries({ queryKey: ['employees'] })
      void queryClient.invalidateQueries({ queryKey: ['employee-detail', employeeId] })
      void queryClient.invalidateQueries({ queryKey: ['employee-monthly'] })
      void queryClient.invalidateQueries({ queryKey: ['department-shifts', updatedEmployee.department_id] })
    },
    onError: (error) => {
      pushToast({
        variant: 'error',
        title: 'Çalışan bilgileri güncellenemedi',
        description: parseApiError(error, 'İşlem başarısız.').message,
      })
    },
  })

  const updateShiftMutation = useMutation({
    mutationFn: (shiftId: number | null) => updateEmployeeShift(employeeId, { shift_id: shiftId }),
    onSuccess: (updatedEmployee) => {
      pushToast({
        variant: 'success',
        title: 'Vardiya ataması güncellendi',
        description: `${updatedEmployee.full_name} için vardiya kaydedildi.`,
      })
      void queryClient.invalidateQueries({ queryKey: ['employees'] })
      void queryClient.invalidateQueries({ queryKey: ['employee-detail', employeeId] })
      void queryClient.invalidateQueries({ queryKey: ['employee-monthly'] })
    },
    onError: (error) => {
      pushToast({
        variant: 'error',
        title: 'Vardiya ataması başarısız',
        description: parseApiError(error, 'İşlem başarısız.').message,
      })
    },
  })

  const inviteMutation = useMutation({
    mutationFn: createDeviceInvite,
    onSuccess: (result) => {
      setInviteError(null)
      setInviteToken(result.token)
      setInviteUrl(result.invite_url)
      pushToast({
        variant: 'success',
        title: 'Cihaz daveti oluşturuldu',
        description: `Çalışan #${employeeId} için davet hazır.`,
      })
      void queryClient.invalidateQueries({ queryKey: ['employee-detail', employeeId] })
    },
    onError: (error) => {
      const message = parseApiError(error, 'Cihaz daveti oluşturulamadı.').message
      setInviteError(message)
      pushToast({
        variant: 'error',
        title: 'Davet oluşturulamadı',
        description: message,
      })
    },
  })

  const copyText = async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      pushToast({
        variant: 'success',
        title: 'Kopyalandı',
        description: 'Değer panoya kopyalandı.',
      })
    } catch {
      pushToast({
        variant: 'error',
        title: 'Kopyalanamadı',
        description: 'Tarayıcı kopyalama işlemini engelledi.',
      })
    }
  }

  const onCreateInvite = () => {
    setInviteError(null)
    setInviteToken(null)
    setInviteUrl(null)
    setExpiresInMinutes(String(defaultInviteDurationMinutes))
    setInviteModalOpen(true)
  }

  const onInviteSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setInviteError(null)

    const parsed = inviteSchema.safeParse({
      expires_in_minutes: expiresInMinutes,
    })

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Süre alanını kontrol edin.'
      setInviteError(message)
      pushToast({
        variant: 'error',
        title: 'Form hatası',
        description: message,
      })
      return
    }

    inviteMutation.mutate({
      employee_id: employeeId,
      expires_in_minutes: parsed.data.expires_in_minutes,
    })
  }

  const onProfileSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedFullName = (profileFullName ?? employee?.full_name ?? '').trim()
    if (!normalizedFullName) {
      pushToast({
        variant: 'error',
        title: 'Form hatası',
        description: 'Ad Soyad alanı boş bırakılamaz.',
      })
      return
    }

    const effectiveDepartmentId = profileDepartmentId ?? (employee?.department_id ? String(employee.department_id) : '')
    const parsedDepartmentId = effectiveDepartmentId ? Number(effectiveDepartmentId) : null
    if (
      effectiveDepartmentId &&
      (parsedDepartmentId === null || !Number.isFinite(parsedDepartmentId) || parsedDepartmentId <= 0)
    ) {
      pushToast({
        variant: 'error',
        title: 'Form hatası',
        description: 'Departman seçimi geçersiz.',
      })
      return
    }

    updateProfileMutation.mutate({
      full_name: normalizedFullName,
      department_id: parsedDepartmentId,
    })
  }

  const monthlyRows = useMemo(() => monthlyQuery.data?.days ?? [], [monthlyQuery.data])
  const monthlyInsight = useMemo(() => buildMonthlyAttendanceInsight(monthlyRows), [monthlyRows])
  const monthlyFlaggedDayCount = useMemo(
    () => monthlyRows.filter((day) => day.flags.length > 0).length,
    [monthlyRows],
  )
  const monthlyIncompleteRatio = useMemo(() => {
    if (!monthlyRows.length) {
      return '%0'
    }
    return `%${Math.round(((monthlyQuery.data?.totals.incomplete_days ?? 0) / monthlyRows.length) * 100)}`
  }, [monthlyQuery.data?.totals.incomplete_days, monthlyRows.length])
  const recentLocationRows = useMemo(
    () => detailQuery.data?.recent_locations ?? [],
    [detailQuery.data?.recent_locations],
  )
  const portalActivityRows = useMemo(
    () => detailQuery.data?.recent_activity ?? [],
    [detailQuery.data?.recent_activity],
  )
  const effectiveSelectedShiftId = selectedShiftId ?? (employee?.shift_id ? String(employee.shift_id) : '')
  const effectiveProfileFullName = profileFullName ?? employee?.full_name ?? ''
  const effectiveProfileDepartmentId =
    profileDepartmentId ?? (employee?.department_id ? String(employee.department_id) : '')
  const todayFieldSignal = useMemo(
    () => fieldSignalQuery.data?.days.find((day) => day.date === todayIstanbul) ?? fieldSignalQuery.data?.days[0] ?? null,
    [fieldSignalQuery.data, todayIstanbul],
  )
  const latestFieldSignal =
    todayFieldSignal?.last_location_point
    ?? fieldSignalQuery.data?.summary.latest_location
    ?? detailQuery.data?.latest_location
    ?? null
  const demoStartAt = todayFieldSignal?.first_demo_start_utc ?? fieldSignalQuery.data?.summary.last_demo_start_utc ?? null
  const demoEndAt = todayFieldSignal?.last_demo_end_utc ?? fieldSignalQuery.data?.summary.last_demo_end_utc ?? null
  const fieldSignalStatus = latestFieldSignal?.location_status ?? null
  const fieldSignalMessage =
    demoStartAt || demoEndAt
      ? 'Bugün gün içi demo ritminde saha doğrulaması kullanıldı.'
      : hasPermission('log')
        ? 'Bugün için saha sinyali kaydı görünmüyor.'
        : 'Detaylı konum göstermeden saha kullanımının izi burada özetlenir.'

  const deviceCountText = useMemo(() => {
    const count = detailQuery.data?.devices.length ?? 0
    return `${count} cihaz`
  }, [detailQuery.data?.devices.length])
  const activeDeviceCount = useMemo(
    () => (detailQuery.data?.devices ?? []).filter((device) => device.is_active).length,
    [detailQuery.data?.devices],
  )
  const todayFieldSignalRows = useMemo(
    () => recentLocationRows.filter((row) => toIstanbulDay(row.ts_utc) === todayIstanbul),
    [recentLocationRows, todayIstanbul],
  )
  const departmentNameById = useMemo(
    () => new Map((departmentsQuery.data ?? []).map((department) => [department.id, department.name])),
    [departmentsQuery.data],
  )
  const currentDepartmentName = employee?.department_id ? departmentNameById.get(employee.department_id) ?? 'Atanmamış' : 'Atanmamış'
  const assignmentHealthLabel = employee?.department_id && employee?.region_id ? 'Düzenli atama' : 'Atama eksikleri var'
  const assignmentHealthTone = employee?.department_id && employee?.region_id
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : 'border-amber-200 bg-amber-50 text-amber-800'
  const lastPortalActivity = portalActivityRows[0] ?? null
  const lastFieldSignalAt = latestFieldSignal?.ts_utc ?? null

  if (!Number.isFinite(employeeId)) {
    return <ErrorBlock message="Geçersiz çalışan kimliği." />
  }

  if (detailQuery.isLoading) {
    return <LoadingBlock />
  }

  if (detailQuery.isError || !employee) {
    return <ErrorBlock message="Çalışan kaydı bulunamadı." />
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Çalışan Profili #${employee.id}`}
        description={`${employee.full_name} için puantaj, cihaz ve gün içi hareket özetini tek ekranda yönetin.`}
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const nextStatus = !employee.is_active
                const confirmed = window.confirm(
                  nextStatus
                    ? `${employee.full_name} arşivden çıkarılsın mı?`
                    : `${employee.full_name} arşivlensin mi?`,
                )
                if (!confirmed) return
                toggleActiveMutation.mutate(nextStatus)
              }}
              disabled={toggleActiveMutation.isPending}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${
                employee.is_active ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {employee.is_active ? 'Arşivle' : 'Arşivden Çıkar'}
            </button>
            <button
              type="button"
              onClick={onCreateInvite}
              className="btn-primary rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Cihaz Bağlama Linki Oluştur
            </button>
          </div>
        }
      />

      <Panel>
        <div className="flex flex-wrap items-start gap-4">
          <div className="relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-brand-600 text-xl font-semibold text-white">
            {initialsOf(employee.full_name) || '–'}
            {employee.is_active ? (
              <ShineBorder borderWidth={2} duration={8} shineColor={['#34d399', '#5f9db2', '#34d399']} />
            ) : null}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{employee.full_name}</h2>
              <StatusBadge value={employee.is_active ? 'Aktif' : 'Pasif'} />
            </div>
            <p className="mt-1 text-sm text-slate-500">
              #{employee.id} · {employee.region_name ?? 'Bölge atanmadı'} · {currentDepartmentName}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${assignmentHealthTone}`}>
                {assignmentHealthLabel}
              </span>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${locationSignalTone(fieldSignalStatus)}`}>
                {formatLocationSignalStatus(fieldSignalStatus)}
              </span>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={!prevEmployee}
              title={prevEmployee?.full_name ?? ''}
              onClick={() => prevEmployee && navigate(`/employees/${prevEmployee.id}`)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-300 text-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              ‹
            </button>
            <div className="w-52 sm:w-64">
              <EmployeeAutocompleteField
                label=""
                employees={sortedEmployees}
                value={String(employeeId)}
                onChange={(id) => {
                  if (id && Number(id) !== employeeId) navigate(`/employees/${id}`)
                }}
                placeholder="Çalışan ara / değiştir..."
                emptyLabel="Çalışan ara..."
                labelClassName="block"
                labelTextClassName="sr-only"
                inputClassName="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              disabled={!nextEmployee}
              title={nextEmployee?.full_name ?? ''}
              onClick={() => nextEmployee && navigate(`/employees/${nextEmployee.id}`)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-300 text-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              ›
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <DetailStat
            label="Bu Ay Yasal Fazla Mesai"
            text={<MinuteDisplay minutes={currentMonthQuery.data?.totals.legal_overtime_minutes ?? 0} />}
            sub={
              <>
                Plan üstü: <MinuteDisplay minutes={currentMonthQuery.data?.totals.plan_overtime_minutes ?? 0} />
              </>
            }
          />
          <DetailStat label="Aktif Cihaz" numeric={activeDeviceCount} sub={deviceCountText} />
          <DetailStat
            label="Bugün Saha Sinyali"
            numeric={todayFieldSignalRows.length}
            sub={`Son: ${formatDateTime(lastFieldSignalAt)}`}
          />
          <DetailStat
            label="Son Portal İzi"
            text={formatDateTime(detailQuery.data?.last_portal_seen_utc)}
            sub={lastPortalActivity?.action ?? 'Portal izi yok'}
          />
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Saha Hareketi</p>
            <span className="text-xs text-slate-500">
              İlk: {formatDateTime(demoStartAt)} · Son: {formatDateTime(demoEndAt)}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">{fieldSignalMessage}</p>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-base font-semibold text-slate-900">Profil düzeni</h4>
              <p className="mt-1 text-xs text-slate-500">
                Ad, departman ve temel organizasyon akışını bu bloktan düzenleyebilirsiniz.
              </p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              ID #{employee.id}
            </span>
          </div>
          <form onSubmit={onProfileSubmit} className="mt-4 grid gap-3 md:grid-cols-3 md:items-end">
            <label className="text-sm text-slate-700">
              Ad Soyad
              <input
                value={effectiveProfileFullName}
                onChange={(event) => setProfileFullName(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5"
                placeholder="Çalışan adı soyadı"
              />
            </label>

            <label className="text-sm text-slate-700">
              Departman
              <select
                value={effectiveProfileDepartmentId}
                onChange={(event) => setProfileDepartmentId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5"
                disabled={departmentsQuery.isLoading}
              >
                <option value="">Atanmamış</option>
                {(departmentsQuery.data ?? []).map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              disabled={updateProfileMutation.isPending || departmentsQuery.isLoading}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {updateProfileMutation.isPending ? 'Kaydediliyor...' : 'Profili Kaydet'}
            </button>
          </form>
          {departmentsQuery.isError ? (
            <p className="mt-3 text-xs text-amber-700">Departman listesi alınamadı. Lütfen tekrar deneyin.</p>
          ) : null}
        </Panel>

        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-base font-semibold text-slate-900">Vardiya ataması</h4>
              <p className="mt-1 text-xs text-slate-500">
                Çalışanın aktif departmanına göre uygun vardiyayı seçip anında kaydedin.
              </p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              {employee.shift_id ? `Mevcut vardiya #${employee.shift_id}` : 'Vardiya bekliyor'}
            </span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <label className="text-sm text-slate-700">
              Vardiya
              <select
                value={effectiveSelectedShiftId}
                onChange={(event) => setSelectedShiftId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5"
                disabled={!employee.department_id || shiftsQuery.isLoading}
              >
                <option value="">Atanmamış</option>
                {(shiftsQuery.data ?? []).map((shift) => (
                  <option key={shift.id} value={shift.id}>
                    {shift.name} ({shift.start_time_local}-{shift.end_time_local})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={updateShiftMutation.isPending || !employee.department_id}
              onClick={() => {
                const shiftId = effectiveSelectedShiftId ? Number(effectiveSelectedShiftId) : null
                updateShiftMutation.mutate(shiftId)
              }}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {updateShiftMutation.isPending ? 'Kaydediliyor...' : 'Vardiyayı Uygula'}
            </button>
          </div>
          {!employee.department_id ? (
            <p className="mt-3 text-xs text-amber-700">Önce departman ataması yapıldığında vardiya seçimi açılır.</p>
          ) : null}
        </Panel>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-slate-900">Aylık puantaj</h4>
            <p className="text-xs text-slate-500">Aydan aya puantaj ve seçili ay fazla mesai durumunu inceleyin.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-600">
              Yıl
              <input
                type="number"
                value={selectedYear}
                onChange={(event) => setSelectedYear(event.target.value)}
                className="mt-1 w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs text-slate-600">
              Ay
              <input
                type="number"
                min={1}
                max={12}
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
                className="mt-1 w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
              />
            </label>
          </div>
        </div>

        {!selectedMonthValid ? (
          <p className="mt-3 text-sm text-amber-700">Yıl/ay değeri geçersiz.</p>
        ) : monthlyQuery.isLoading ? (
          <LoadingBlock />
        ) : monthlyQuery.isError ? (
          <ErrorBlock message={parseApiError(monthlyQuery.error, 'Aylık puantaj alınamadı.').message} />
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Seçili ay net çalışma</p>
                <p className="text-lg font-semibold text-slate-900">
                  <MinuteDisplay minutes={monthlyQuery.data?.totals.worked_minutes ?? 0} />
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Seçili ay plan üstü süre</p>
                <p className="text-lg font-semibold text-slate-900">
                  <MinuteDisplay minutes={monthlyQuery.data?.totals.plan_overtime_minutes ?? 0} />
                </p>
                <p className="text-xs text-slate-500">{monthlyInsight.planOvertimeDayCount} gün</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Seçili ay yasal fazla süre</p>
                <p className="text-lg font-semibold text-slate-900">
                  <MinuteDisplay minutes={monthlyQuery.data?.totals.legal_extra_work_minutes ?? 0} />
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Seçili ay yasal fazla mesai</p>
                <p className="text-lg font-semibold text-slate-900">
                  <MinuteDisplay minutes={monthlyQuery.data?.totals.legal_overtime_minutes ?? 0} />
                </p>
                <p className="text-xs text-slate-500">{monthlyInsight.overtimeDayCount} gün fazla mesai</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Eksik gün</p>
                <p className="text-lg font-semibold text-slate-900">{monthlyQuery.data?.totals.incomplete_days ?? 0}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Erken geliş</p>
                <p className="text-lg font-semibold text-slate-900">
                  <MinuteDisplay minutes={monthlyQuery.data?.totals.early_arrival_minutes ?? 0} />
                </p>
                <p className="text-xs text-slate-500">{monthlyRows.filter((day) => day.early_arrival_minutes > 0).length} gün</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Çalışılan gün</p>
                <p className="text-lg font-semibold text-slate-900">{monthlyInsight.workedDayCount}</p>
                <p className="text-xs text-slate-500">Hafta içi: {monthlyInsight.weekdayWorkedDayCount} gün</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Pazar mesaisi</p>
                <p className="text-sm font-semibold text-slate-900">{monthlyInsight.sundayWorkedDayCount} gün</p>
                <p className="text-xs text-slate-500">
                  <MinuteDisplay minutes={monthlyInsight.sundayWorkedMinutes} />
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Özel gün mesaisi</p>
                <p className="text-sm font-semibold text-slate-900">{monthlyInsight.specialWorkedDayCount} gün</p>
                <p className="text-xs text-slate-500">
                  <MinuteDisplay minutes={monthlyInsight.specialWorkedMinutes} />
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Bayraklı gün</p>
                <p className="text-lg font-semibold text-slate-900">{monthlyFlaggedDayCount}</p>
                <p className="text-xs text-slate-500">Riskli veya kontrol gerektiren satır sayısı</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Eksik gün oranı</p>
                <p className="text-lg font-semibold text-slate-900">{monthlyIncompleteRatio}</p>
                <p className="text-xs text-slate-500">{monthlyQuery.data?.totals.incomplete_days ?? 0} / {monthlyRows.length} gün</p>
              </div>
            </div>

            <div className="list-scroll-area w-full max-w-full overflow-x-auto">
              <table className="w-full min-w-[1020px] text-left text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2">Tarih</th>
                    <th className="py-2">Gün</th>
                    <th className="py-2">Durum</th>
                    <th className="py-2">Gün Tipi</th>
                    <th className="py-2">Giriş</th>
                    <th className="py-2">Çıkış</th>
                    <th className="py-2">Net Süre</th>
                    <th className="py-2">Erken Geliş</th>
                    <th className="py-2">Plan Üstü</th>
                    <th className="py-2">Yasal Fazla Süre</th>
                    <th className="py-2">Yasal Fazla Mesai</th>
                    <th className="py-2">Bayraklar</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyRows.map((day) => {
                    const rowTone = resolveMonthlyRowTone(day)
                    return (
                      <tr key={day.date} className={`border-t border-slate-100 ${rowTone}`}>
                        <td className="py-2 font-medium text-slate-800">{day.date}</td>
                        <td className="py-2 text-xs uppercase text-slate-600">{formatDayShortLabel(day.date)}</td>
                        <td className="py-2">{formatDayStatus(day.status)}</td>
                        <td className="py-2">{getAttendanceDayType(day).label}</td>
                        <td className="py-2">{formatDateTime(day.in)}</td>
                        <td className="py-2">{formatDateTime(day.out)}</td>
                        <td className="py-2">
                          <MinuteDisplay minutes={day.worked_minutes} />
                        </td>
                        <td className="py-2">
                          <MinuteDisplay minutes={day.early_arrival_minutes} />
                        </td>
                        <td className="py-2">
                          <MinuteDisplay minutes={day.plan_overtime_minutes} />
                        </td>
                        <td className="py-2">
                          <MinuteDisplay minutes={day.legal_extra_work_minutes} />
                        </td>
                        <td className="py-2">
                          <MinuteDisplay minutes={day.legal_overtime_minutes} />
                        </td>
                        <td className="py-2 text-xs text-slate-600">{formatFlagList(day.flags)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-slate-900">Kayıtlı cihazlar</h4>
            <p className="mt-1 text-xs text-slate-500">Cihazlar, son attendance zamanı ve canlılık sinyalini birlikte gösterir.</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            {activeDeviceCount}/{detailQuery.data?.devices.length ?? 0} aktif
          </span>
        </div>
        <div className="mt-4 list-scroll-area">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Cihaz ID</th>
                <th className="py-2">Parmak İzi</th>
                <th className="py-2">Durum</th>
                <th className="py-2">Oluşma</th>
                <th className="py-2">Son Attendance</th>
                <th className="py-2">Son İşlem</th>
              </tr>
            </thead>
            <tbody>
              {(detailQuery.data?.devices ?? []).map((device) => (
                <tr key={device.id} className="border-t border-slate-100">
                  <td className="py-2">{device.id}</td>
                  <td className="py-2 font-mono text-xs">{device.device_fingerprint}</td>
                  <td className="py-2">
                    <StatusBadge value={device.is_active ? 'Aktif' : 'Pasif'} />
                  </td>
                  <td className="py-2">{formatDateTime(device.created_at)}</td>
                  <td className="py-2">{formatDateTime(device.last_attendance_ts_utc)}</td>
                  <td className="py-2">{formatDateTime(device.last_seen_at_utc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">Özlük / SGK Bilgileri</p>
        <h3 className="mt-1 text-base font-semibold text-slate-900">Bordro ve Kişisel Bilgiler</h3>
        <p className="mt-2 text-sm text-slate-500">
          Kimlik, sözleşme, SGK, banka ve ücret geçmişi tek ekrandan{' '}
          <Link to="/ozluk" className="font-semibold text-brand-700 underline">
            Özlük Yönetimi
          </Link>{' '}
          sayfasında yönetilir.
        </p>
      </Panel>

      <Modal open={isInviteModalOpen} title="Cihaz Bağlama Linki Oluştur" onClose={() => setInviteModalOpen(false)}>
        <form onSubmit={onInviteSubmit} className="space-y-4">
          <label className="block text-sm text-slate-700">
            Geçerlilik süresi (dakika)
            <input
              type="number"
              min={1}
              max={maxInviteDurationMinutes}
              step={1}
              value={expiresInMinutes}
              onChange={(event) => setExpiresInMinutes(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <p className="text-xs text-slate-500">Ornek: 1440 = 1 gun, 10080 = 7 gun, 43200 = 30 gun.</p>

          <button
            type="submit"
            disabled={inviteMutation.isPending}
            className="btn-primary rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {inviteMutation.isPending ? (
              <>
                <span className="inline-spinner" aria-hidden="true" />
                Oluşturuluyor...
              </>
            ) : (
              'Daveti Üret'
            )}
          </button>
        </form>

        <p className="mt-3 text-xs text-slate-500">
          Bu linki çalışana iletin. Çalışan linki açınca cihazını otomatik olarak hesabına bağlayabilir.
        </p>

        {inviteError ? <p className="form-validation">{inviteError}</p> : null}

        {inviteToken && inviteUrl ? (
          <div className="mt-4 space-y-3">
            <CopyField label="Token" value={inviteToken} onCopy={copyText} />
            <CopyField label="Bağlantı linki (invite_url)" value={inviteUrl} onCopy={copyText} />
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
