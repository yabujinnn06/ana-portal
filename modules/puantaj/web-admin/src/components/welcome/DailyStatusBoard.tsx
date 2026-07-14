import { Fragment, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'

import {
  downloadDailyBoardExport,
  getDailyAttendanceBoard,
  getDepartments,
  getEmployeeAttendanceHistory,
  getRegions,
  type DailyBoardParams,
} from '../../api/admin'
import { parseApiError } from '../../api/error'
import { ErrorBlock } from '../ErrorBlock'
import { MinuteDisplay } from '../MinuteDisplay'
import { Panel } from '../Panel'
import { useToast } from '../../hooks/useToast'
import type { DailyBoardEmployeeRow, DailyBoardResponse, DailyBoardStatus, DailyBoardSummary } from '../../types/api'

type EmploymentFilter = 'all' | 'active' | 'inactive'
type QrFilter = 'all' | 'missing' | 'scanned'
type SortField = 'employee_name' | 'status' | 'worked' | 'first_in'

const PAGE_SIZES = [12, 24, 48, 100]

const STATUS_ORDER: DailyBoardStatus[] = [
  'ABSENT',
  'ABSENT_RISK',
  'OPEN_OVERDUE',
  'NOT_STARTED',
  'IN_PROGRESS',
  'FINISHED',
  'OFF',
]

const STATUS_LABELS: Record<DailyBoardStatus, string> = {
  OFF: 'Calisma gunu degil',
  NOT_STARTED: 'Henuz gelmedi',
  ABSENT_RISK: 'Devamsizlik riski',
  ABSENT: 'Devamsiz',
  IN_PROGRESS: 'Mesai acik',
  OPEN_OVERDUE: 'Cikis yapilmadi',
  FINISHED: 'Tamamlandi',
}

const STATUS_TONE: Record<DailyBoardStatus, string> = {
  OFF: 'is-muted',
  NOT_STARTED: 'is-waiting',
  ABSENT_RISK: 'is-warn',
  ABSENT: 'is-alert',
  IN_PROGRESS: 'is-live',
  OPEN_OVERDUE: 'is-waiting',
  FINISHED: 'is-finished',
}

const STATUS_RANK: Record<DailyBoardStatus, number> = {
  ABSENT: 6,
  ABSENT_RISK: 5,
  OPEN_OVERDUE: 4,
  NOT_STARTED: 3,
  IN_PROGRESS: 2,
  FINISHED: 1,
  OFF: 0,
}

const ISO_DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const DAY_LABEL_FORMAT = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

const TIME_FORMAT = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function todayIsoDay(): string {
  return ISO_DAY_FORMAT.format(new Date())
}

function monthStartIsoDay(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(0, 8)}01` : iso
}

function shiftIsoDay(iso: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  const [, year, month, day] = match
  const reference = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0))
  reference.setUTCDate(reference.getUTCDate() + days)
  return reference.toISOString().slice(0, 10)
}

function formatDayLabel(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  const [, year, month, day] = match
  return DAY_LABEL_FORMAT.format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0)))
}

function formatLocalTime(value: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return TIME_FORMAT.format(date)
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function rowMatchesStatus(row: DailyBoardEmployeeRow, statusFilter: Set<DailyBoardStatus>): boolean {
  return statusFilter.size === 0 || statusFilter.has(row.status)
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase('tr')
  return (parts[0][0] + parts[parts.length - 1][0]).toLocaleUpperCase('tr')
}

const STATUS_COUNT_KEY: Record<DailyBoardStatus, keyof DailyBoardSummary> = {
  ABSENT: 'absent',
  ABSENT_RISK: 'absent_risk',
  OPEN_OVERDUE: 'open_overdue',
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'working',
  FINISHED: 'finished',
  OFF: 'off',
}

export function DailyStatusBoard({
  initialDate,
  onDataChange,
}: {
  initialDate?: string
  onDataChange?: (data: DailyBoardResponse | null) => void
}) {
  const { pushToast } = useToast()
  const [targetDate, setTargetDate] = useState(() => initialDate ?? todayIsoDay())
  const [searchTerm, setSearchTerm] = useState('')
  const [regionId, setRegionId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [employment, setEmployment] = useState<EmploymentFilter>('active')
  const [qrFilter, setQrFilter] = useState<QrFilter>('all')
  const [statusFilter, setStatusFilter] = useState<Set<DailyBoardStatus>>(() => new Set(['IN_PROGRESS']))
  const [sortField, setSortField] = useState<SortField>('status')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [pageSize, setPageSize] = useState(24)
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [historyStart, setHistoryStart] = useState(() => monthStartIsoDay(initialDate ?? todayIsoDay()))
  const [historyEnd, setHistoryEnd] = useState(() => initialDate ?? todayIsoDay())

  const deferredSearch = useDeferredValue(searchTerm)
  const today = useMemo(() => todayIsoDay(), [])

  useEffect(() => {
    if (initialDate) setTargetDate(initialDate)
  }, [initialDate])

  const includeInactive = employment !== 'active'

  const boardParams = useMemo<DailyBoardParams>(
    () => ({
      date: targetDate,
      q: deferredSearch.trim() || undefined,
      region_id: regionId ? Number(regionId) : undefined,
      department_id: departmentId ? Number(departmentId) : undefined,
      include_inactive: includeInactive,
    }),
    [targetDate, deferredSearch, regionId, departmentId, includeInactive],
  )

  const boardQuery = useQuery({
    queryKey: ['daily-board', boardParams],
    queryFn: () => getDailyAttendanceBoard(boardParams),
    refetchInterval: 45_000,
    staleTime: 30_000,
  })

  const regionsQuery = useQuery({
    queryKey: ['regions', 'daily-board'],
    queryFn: () => getRegions({ include_inactive: true }),
    staleTime: 5 * 60_000,
  })

  const departmentsQuery = useQuery({
    queryKey: ['departments', 'daily-board'],
    queryFn: () => getDepartments(),
    staleTime: 5 * 60_000,
  })

  const historyQuery = useQuery({
    enabled: expandedId !== null,
    queryKey: ['daily-board-history', expandedId, historyStart, historyEnd],
    queryFn: () =>
      getEmployeeAttendanceHistory(expandedId as number, { start_date: historyStart, end_date: historyEnd }),
    staleTime: 30_000,
  })

  useEffect(() => {
    onDataChange?.(boardQuery.data ?? null)
  }, [boardQuery.data, onDataChange])

  useEffect(() => {
    setPage(1)
  }, [boardParams, employment, qrFilter, statusFilter, sortField, sortDirection, pageSize])

  const departments = departmentsQuery.data ?? []
  const filteredDepartments = useMemo(() => {
    if (!regionId) return departments
    return departments.filter((department) => String(department.region_id) === regionId)
  }, [departments, regionId])

  useEffect(() => {
    if (!departmentId) return
    if (filteredDepartments.some((department) => String(department.id) === departmentId)) return
    setDepartmentId('')
  }, [departmentId, filteredDepartments])

  const items = boardQuery.data?.items ?? []

  const filteredRows = useMemo(() => {
    return items.filter((row) => {
      if (employment === 'inactive' && row.is_active) return false
      if (employment === 'active' && !row.is_active) return false
      if (qrFilter === 'missing' && !row.qr_missing) return false
      if (qrFilter === 'scanned' && row.qr_missing) return false
      if (!rowMatchesStatus(row, statusFilter)) return false
      return true
    })
  }, [items, employment, qrFilter, statusFilter])

  const sortedRows = useMemo(() => {
    const multiplier = sortDirection === 'asc' ? 1 : -1
    return [...filteredRows].sort((left, right) => {
      if (sortField === 'employee_name') {
        return left.full_name.localeCompare(right.full_name, 'tr') * multiplier
      }
      const leftValue =
        sortField === 'status'
          ? STATUS_RANK[left.status]
          : sortField === 'worked'
            ? left.worked_minutes
            : left.first_in_utc
              ? new Date(left.first_in_utc).getTime()
              : 0
      const rightValue =
        sortField === 'status'
          ? STATUS_RANK[right.status]
          : sortField === 'worked'
            ? right.worked_minutes
            : right.first_in_utc
              ? new Date(right.first_in_utc).getTime()
              : 0
      if (leftValue === rightValue) {
        return left.full_name.localeCompare(right.full_name, 'tr')
      }
      return (leftValue - rightValue) * multiplier
    })
  }, [filteredRows, sortField, sortDirection])

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * pageSize
  const pagedRows = sortedRows.slice(pageStart, pageStart + pageSize)
  const rangeStart = sortedRows.length === 0 ? 0 : pageStart + 1
  const rangeEnd = sortedRows.length === 0 ? 0 : Math.min(pageStart + pageSize, sortedRows.length)

  const summary = boardQuery.data?.summary

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortField(field)
    setSortDirection(field === 'employee_name' ? 'asc' : 'desc')
  }

  const renderSortHeader = (field: SortField, label: string) => {
    const isActive = sortField === field
    return (
      <button
        type="button"
        className={`board-sort-btn ${isActive ? 'is-active' : ''}`}
        onClick={() => handleSort(field)}
        aria-sort={isActive ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        {label}
        <span className={`board-sort-arrow ${isActive ? 'is-active' : ''}`} aria-hidden="true">
          {isActive ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    )
  }

  const toggleStatus = (status: DailyBoardStatus) => {
    setStatusFilter((current) => {
      const next = new Set(current)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  const toggleQrMissing = () => {
    setQrFilter((current) => (current === 'missing' ? 'all' : 'missing'))
  }

  const showAllStatuses = () => {
    setStatusFilter(new Set())
    setQrFilter('all')
  }

  const toggleExpand = (employeeId: number) => {
    if (expandedId === employeeId) {
      setExpandedId(null)
      return
    }
    setExpandedId(employeeId)
    setHistoryEnd(targetDate)
    setHistoryStart(monthStartIsoDay(targetDate))
  }

  const setDay = (iso: string) => {
    const next = iso || today
    setTargetDate(next)
    setExpandedId(null)
  }

  const hasActiveFilters =
    searchTerm.trim().length > 0 ||
    regionId !== '' ||
    departmentId !== '' ||
    employment !== 'active' ||
    qrFilter !== 'all' ||
    statusFilter.size > 0

  const resetFilters = () => {
    setSearchTerm('')
    setRegionId('')
    setDepartmentId('')
    setEmployment('active')
    setQrFilter('all')
    setStatusFilter(new Set())
  }

  const exportMutation = useMutation({
    mutationFn: () =>
      downloadDailyBoardExport({
        ...boardParams,
        start_date: historyStart || monthStartIsoDay(targetDate),
        end_date: historyEnd || targetDate,
      }),
    onSuccess: (blob) => {
      downloadBlob(blob, `calisan-durum-${targetDate}.xlsx`)
      pushToast({ variant: 'success', title: 'Excel indirildi', description: 'Calisan durum tablosu indirildi.' })
    },
    onError: (error) => {
      pushToast({
        variant: 'error',
        title: 'Disa aktarma basarisiz',
        description: parseApiError(error, 'Excel uretilemedi.').message,
      })
    },
  })

  if (boardQuery.isPending) {
    return (
      <Panel className="welcome-table-panel">
        <div className="board-skeleton" aria-busy="true" aria-label="Tablo yukleniyor">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="board-skeleton__row" />
          ))}
        </div>
      </Panel>
    )
  }
  if (boardQuery.isError) {
    return <ErrorBlock message="Calisan durum tablosu yuklenemedi." />
  }

  return (
    <Panel className="welcome-table-panel board-panel welcome-reveal is-delay-2">
      <div className="welcome-table-panel__head">
        <div>
          <p className="welcome-panel-kicker">CANLI DURUM</p>
          <h3>Canli calisan durum tablosu</h3>
          <p>Vardiya planina gore devamsizlik, QR okutmayan ve mesaisi acik/eksik calisanlar tek tabloda.</p>
        </div>

        <div className="welcome-table-panel__meta">
          <span>{sortedRows.length} satir</span>
          <span>{formatDayLabel(targetDate)}</span>
          {summary ? (
            <span>
              {summary.absent} devamsiz / {summary.qr_missing} QR yok
            </span>
          ) : null}
          <label className="welcome-inline-field">
            <span>Sayfa boyutu</span>
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="board-action-btn is-primary"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
          >
            <span className="board-action-btn__icon" aria-hidden="true">⤓</span>
            {exportMutation.isPending ? 'Hazirlaniyor...' : 'Excel indir'}
          </button>
        </div>
      </div>

      {summary ? (
        <div className="board-kpis">
          <button
            type="button"
            className={`board-kpi is-accent ${statusFilter.size === 0 && qrFilter === 'all' ? 'is-active' : ''}`}
            aria-pressed={statusFilter.size === 0 && qrFilter === 'all'}
            onClick={showAllStatuses}
          >
            <strong>{summary.total}</strong>
            <span>Kadro</span>
          </button>
          <button
            type="button"
            className={`board-kpi is-live ${statusFilter.has('IN_PROGRESS') ? 'is-active' : ''}`}
            aria-pressed={statusFilter.has('IN_PROGRESS')}
            onClick={() => toggleStatus('IN_PROGRESS')}
          >
            <strong>{summary.working}</strong>
            <span>Mesai açık</span>
          </button>
          <button
            type="button"
            className={`board-kpi is-ok ${statusFilter.has('FINISHED') ? 'is-active' : ''}`}
            aria-pressed={statusFilter.has('FINISHED')}
            onClick={() => toggleStatus('FINISHED')}
          >
            <strong>{summary.finished}</strong>
            <span>Tamamlandı</span>
          </button>
          <button
            type="button"
            className={`board-kpi is-err ${statusFilter.has('ABSENT') ? 'is-active' : ''}`}
            aria-pressed={statusFilter.has('ABSENT')}
            onClick={() => toggleStatus('ABSENT')}
          >
            <strong>{summary.absent}</strong>
            <span>Devamsız</span>
          </button>
          <button
            type="button"
            className={`board-kpi is-err-soft ${qrFilter === 'missing' ? 'is-active' : ''}`}
            aria-pressed={qrFilter === 'missing'}
            onClick={toggleQrMissing}
          >
            <strong>{summary.qr_missing}</strong>
            <span>QR okutmadı</span>
          </button>
          <button
            type="button"
            className={`board-kpi is-warn ${statusFilter.has('OPEN_OVERDUE') ? 'is-active' : ''}`}
            aria-pressed={statusFilter.has('OPEN_OVERDUE')}
            onClick={() => toggleStatus('OPEN_OVERDUE')}
          >
            <strong>{summary.open_overdue}</strong>
            <span>Çıkış yok</span>
          </button>
        </div>
      ) : null}

      <div className="welcome-filter-bar">
        <div className="welcome-filters">
          <label className="welcome-filter">
            <span className="welcome-filter__label">Gun</span>
            <input
              type="date"
              className="welcome-filter__control"
              value={targetDate}
              onChange={(event) => setDay(event.target.value)}
            />
          </label>

          <label className="welcome-filter">
            <span className="welcome-filter__label">Arama</span>
            <input
              className="welcome-filter__control"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Ad, soyad veya #ID"
            />
          </label>

          <label className="welcome-filter">
            <span className="welcome-filter__label">Bolge</span>
            <select className="welcome-filter__control" value={regionId} onChange={(event) => setRegionId(event.target.value)}>
              <option value="">Tum bolgeler</option>
              {(regionsQuery.data ?? []).map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          </label>

          <label className="welcome-filter">
            <span className="welcome-filter__label">Departman</span>
            <select
              className="welcome-filter__control"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
            >
              <option value="">Tum departmanlar</option>
              {filteredDepartments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>

          <label className="welcome-filter">
            <span className="welcome-filter__label">QR durumu</span>
            <select
              className="welcome-filter__control"
              value={qrFilter}
              onChange={(event) => setQrFilter(event.target.value as QrFilter)}
            >
              <option value="all">Tumu</option>
              <option value="missing">QR okutmayanlar</option>
              <option value="scanned">QR okutanlar</option>
            </select>
          </label>

          <label className="welcome-filter">
            <span className="welcome-filter__label">Personel durumu</span>
            <select
              className="welcome-filter__control"
              value={employment}
              onChange={(event) => setEmployment(event.target.value as EmploymentFilter)}
            >
              <option value="active">Sadece aktif</option>
              <option value="all">Tum durumlar</option>
              <option value="inactive">Sadece pasif</option>
            </select>
          </label>
        </div>

        <div className="welcome-date-actions">
          <button type="button" onClick={() => setDay(shiftIsoDay(targetDate, -1))}>
            <span aria-hidden="true">‹</span> Onceki
          </button>
          <button type="button" onClick={() => setDay(today)}>
            Bugun
          </button>
          <button type="button" onClick={() => setDay(shiftIsoDay(targetDate, 1))} disabled={targetDate >= today}>
            Sonraki <span aria-hidden="true">›</span>
          </button>
        </div>
      </div>

      <div className="board-status-chips">
        {STATUS_ORDER.map((status) => (
          <button
            key={status}
            type="button"
            className={`board-status-chip ${STATUS_TONE[status]} ${statusFilter.has(status) ? 'is-active' : ''}`}
            aria-pressed={statusFilter.has(status)}
            onClick={() => toggleStatus(status)}
          >
            <span className="board-dot" aria-hidden="true" />
            {STATUS_LABELS[status]}
            {summary ? <span className="board-status-chip__count">{summary[STATUS_COUNT_KEY[status]]}</span> : null}
          </button>
        ))}
        {hasActiveFilters ? (
          <button type="button" className="welcome-absence-clear" onClick={resetFilters}>
            Filtreleri sifirla
          </button>
        ) : null}
      </div>

      <div className="welcome-table-shell board-table-shell">
        <table className="welcome-table board-table">
          <thead>
            <tr>
              <th>{renderSortHeader('employee_name', 'Calisan')}</th>
              <th>Bolge</th>
              <th>Departman</th>
              <th>{renderSortHeader('status', 'Durum')}</th>
              <th>Vardiya</th>
              <th>{renderSortHeader('first_in', 'Giris')}</th>
              <th>Cikis</th>
              <th>{renderSortHeader('worked', 'Sure')}</th>
              <th>Detay</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.length ? (
              pagedRows.map((row) => {
                const isExpanded = expandedId === row.employee_id
                const isComplete = row.status === 'FINISHED'
                const isQrMissing = row.qr_missing
                return (
                  <Fragment key={row.employee_id}>
                    <tr
                      className={`${isExpanded ? 'is-expanded' : ''} ${isComplete ? 'is-complete' : ''} ${
                        isQrMissing ? 'is-qr-missing' : ''
                      }`.trim()}
                    >
                      <td>
                        <div className="board-employee">
                          <span className="board-avatar" aria-hidden="true">{initials(row.full_name)}</span>
                          <div className="board-employee__text">
                            <strong>{row.full_name}</strong>
                            <span className="board-mono">#{row.employee_id}</span>
                          </div>
                        </div>
                      </td>
                      <td>{row.region_name ?? '-'}</td>
                      <td>{row.department_name ?? '-'}</td>
                      <td>
                        <div className="welcome-status-stack">
                          <span className={`welcome-status ${STATUS_TONE[row.status]}`}>
                            <span className="board-dot" aria-hidden="true" />
                            {STATUS_LABELS[row.status]}
                          </span>
                          <span className={`welcome-status ${row.is_active ? 'is-verified' : 'is-muted'}`}>
                            {row.is_active ? 'Aktif' : 'Pasif'}
                          </span>
                          {row.manual_checkin ? <span className="welcome-status is-waiting">Manuel</span> : null}
                          {row.qr_missing ? <span className="welcome-status is-alert">QR yok</span> : null}
                        </div>
                      </td>
                      <td><span className="board-mono">{row.shift_window_label ?? '-'}</span></td>
                      <td><span className="board-mono">{formatLocalTime(row.first_in_utc)}</span></td>
                      <td><span className="board-mono">{formatLocalTime(row.last_out_utc)}</span></td>
                      <td>
                        <MinuteDisplay minutes={row.worked_minutes} />
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`board-expand-btn ${isExpanded ? 'is-open' : ''}`}
                          onClick={() => toggleExpand(row.employee_id)}
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? 'Kapat' : 'Detay'}
                          <span className="board-chevron" aria-hidden="true">⌄</span>
                        </button>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="board-detail-row">
                        <td colSpan={9}>
                          <div className="board-detail">
                            <div className="board-detail__head">
                              <label className="welcome-inline-field">
                                <span>Baslangic</span>
                                <input
                                  type="date"
                                  value={historyStart}
                                  max={historyEnd}
                                  onChange={(event) => setHistoryStart(event.target.value || historyStart)}
                                />
                              </label>
                              <label className="welcome-inline-field">
                                <span>Bitis</span>
                                <input
                                  type="date"
                                  value={historyEnd}
                                  min={historyStart}
                                  max={today}
                                  onChange={(event) => setHistoryEnd(event.target.value || historyEnd)}
                                />
                              </label>
                            </div>

                            {historyQuery.isPending ? (
                              <div className="board-detail__loading">Detay yukleniyor...</div>
                            ) : historyQuery.isError ? (
                              <ErrorBlock message="Calisan detayi yuklenemedi." />
                            ) : historyQuery.data ? (
                              <>
                                <div className="board-detail__cards">
                                  <article>
                                    <span>Calisma gunu</span>
                                    <strong>{historyQuery.data.aggregate.workday_count}</strong>
                                  </article>
                                  <article>
                                    <span>Calisilan gun</span>
                                    <strong>{historyQuery.data.aggregate.worked_days}</strong>
                                  </article>
                                  <article className="is-alert">
                                    <span>Devamsiz gun</span>
                                    <strong>{historyQuery.data.aggregate.absent_days}</strong>
                                  </article>
                                  <article className="is-alert">
                                    <span>QR okutmadigi gun</span>
                                    <strong>{historyQuery.data.aggregate.qr_missing_days}</strong>
                                  </article>
                                  <article className="is-warn">
                                    <span>Eksik cikis</span>
                                    <strong>{historyQuery.data.aggregate.incomplete_days}</strong>
                                  </article>
                                </div>

                                <div className="board-detail__days">
                                  {historyQuery.data.days
                                    .filter((day) => day.is_workday || day.status !== 'OFF')
                                    .map((day) => (
                                      <div
                                        key={day.day}
                                        className={`board-detail__day ${
                                          day.status === 'ABSENT' ? 'is-alert' : day.status === 'OPEN_OVERDUE' ? 'is-warn' : ''
                                        }`}
                                      >
                                        <span className="board-detail__day-date">{day.day}</span>
                                        <span className={`welcome-status ${STATUS_TONE[day.status]}`}>
                                          {STATUS_LABELS[day.status]}
                                        </span>
                                        <span className="board-detail__day-time">
                                          {formatLocalTime(day.first_in_utc)} - {formatLocalTime(day.last_out_utc)}
                                        </span>
                                        <MinuteDisplay minutes={day.worked_minutes} />
                                      </div>
                                    ))}
                                </div>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })
            ) : (
              <tr>
                <td colSpan={9}>
                  <div className="welcome-empty">Secili filtreler icin uygun kayit bulunamadi.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="welcome-pagination">
        <p>
          {rangeStart}-{rangeEnd} / {sortedRows.length} satir gosteriliyor
        </p>
        <div className="welcome-pagination__actions">
          <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage <= 1}>
            <span aria-hidden="true">‹</span> Geri
          </button>
          <span>
            Sayfa {safePage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={safePage >= totalPages}
          >
            Ileri <span aria-hidden="true">›</span>
          </button>
        </div>
      </div>
    </Panel>
  )
}
