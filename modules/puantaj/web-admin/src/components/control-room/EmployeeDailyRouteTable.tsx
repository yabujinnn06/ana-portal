import { MinuteDisplay } from '../MinuteDisplay'
import { formatClock, formatDate, formatDistance } from './utils'

export type EmployeeDailyRouteRow = {
  employeeId: number
  employeeName: string
  date: string
  firstTimestamp: string | null
  lastTimestamp: string | null
  pointCount: number
  distanceMeters: number | null
  geofenceLabel: string
  geofenceTone: 'inside' | 'outside' | 'unknown'
  suspiciousJumpCount: number
  lowAccuracyCount: number
  workedMinutes: number
}

export type RouteSortField = 'date' | 'employee' | 'distance' | 'worked'

function GeofenceBadge({
  label,
  tone,
}: {
  label: string
  tone: EmployeeDailyRouteRow['geofenceTone']
}) {
  return <span className={`cr-daily-badge is-${tone}`}>{label}</span>
}

export function EmployeeDailyRouteTable({
  rows,
  selectedEmployeeId,
  selectedDay,
  loading,
  mobile = false,
  sortField,
  sortDir = 'desc',
  onSort,
  onSelectRow,
  onClearEmployee,
}: {
  rows: EmployeeDailyRouteRow[]
  selectedEmployeeId: number | null
  selectedDay: string | null
  loading: boolean
  mobile?: boolean
  sortField?: RouteSortField
  sortDir?: 'asc' | 'desc'
  onSort?: (field: RouteSortField) => void
  onSelectRow: (employeeId: number, day: string) => void
  onClearEmployee: () => void
}) {
  const totalDistance = rows.reduce((sum, row) => sum + (row.distanceMeters ?? 0), 0)
  const totalWorked = rows.reduce((sum, row) => sum + row.workedMinutes, 0)

  const sortHeader = (field: RouteSortField, label: string) => {
    if (!onSort) return label
    const active = sortField === field
    return (
      <button type="button" className={`cr-daily-sort ${active ? 'is-active' : ''}`} onClick={() => onSort(field)}>
        {label}
        <span className="cr-daily-sort__arrow" aria-hidden="true">
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    )
  }

  if (mobile) {
    return (
      <section className="cr-daily-table-panel">
        <header className="cr-daily-table-panel__header">
          <div>
            <p className="cr-ops-kicker">Günler</p>
            <h3>Günlük rota listesi</h3>
          </div>
          <div className="cr-daily-table-panel__actions">
            {selectedEmployeeId != null ? (
              <button type="button" className="cr-ops-action is-secondary" onClick={onClearEmployee}>
                Tüm personeller
              </button>
            ) : null}
            <span className="cr-daily-table-panel__count">{rows.length} satir</span>
          </div>
        </header>

        {loading && rows.length === 0 ? <div className="cr-feed-empty">Günlük rota listesi hazırlanıyor...</div> : null}

        <div className="cr-daily-mobile-list">
          {rows.length ? (
            rows.map((row) => {
              const selected = row.employeeId === selectedEmployeeId && row.date === selectedDay
              return (
                <button
                  key={`${row.employeeId}-${row.date}`}
                  type="button"
                  className={`cr-daily-mobile-card ${selected ? 'is-selected' : ''}`}
                  onClick={() => onSelectRow(row.employeeId, row.date)}
                >
                  <div className="cr-daily-mobile-card__head">
                    <div>
                      <strong>{row.employeeName}</strong>
                      <span>{formatDate(row.date)}</span>
                    </div>
                    <GeofenceBadge label={row.geofenceLabel} tone={row.geofenceTone} />
                  </div>
                  <div className="cr-daily-mobile-card__grid">
                    <span>
                      İlk <strong className="cr-mono">{formatClock(row.firstTimestamp)}</strong>
                    </span>
                    <span>
                      Son <strong className="cr-mono">{formatClock(row.lastTimestamp)}</strong>
                    </span>
                    <span>
                      Nokta <strong className="cr-mono">{row.pointCount}</strong>
                    </span>
                    <span>
                      Mesafe <strong className="cr-mono">{formatDistance(row.distanceMeters)}</strong>
                    </span>
                    <span>
                      Sıçrama <strong className="cr-mono">{row.suspiciousJumpCount}</strong>
                    </span>
                    <span>
                      Düşük doğr. <strong className="cr-mono">{row.lowAccuracyCount}</strong>
                    </span>
                  </div>
                </button>
              )
            })
          ) : (
            <div className="cr-feed-empty">Seçili filtreler için günlük rota satiri bulunamadı.</div>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="cr-daily-table-panel">
      <header className="cr-daily-table-panel__header">
        <div>
          <p className="cr-ops-kicker">Günlük rota listesi</p>
          <h3>Çalışan + gün seçimi</h3>
        </div>
        <div className="cr-daily-table-panel__actions">
          {selectedEmployeeId != null ? (
            <button type="button" className="cr-ops-action is-secondary" onClick={onClearEmployee}>
              Tüm personeller
            </button>
          ) : null}
          <span className="cr-daily-table-panel__count">{rows.length} satir</span>
        </div>
      </header>

      <div className="cr-daily-table-shell">
        {loading && rows.length === 0 ? (
          <div className="board-skeleton cr-daily-skeleton">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="board-skeleton__row" />
            ))}
          </div>
        ) : (
          <table className="cr-daily-table">
            <thead>
              <tr>
                <th>{sortHeader('date', 'Tarih')}</th>
                <th>{sortHeader('employee', 'Çalışan')}</th>
                <th>İlk saat</th>
                <th>Son saat</th>
                <th>Nokta</th>
                <th>{sortHeader('distance', 'Mesafe')}</th>
                <th>Geofence</th>
                <th>Şüpheli sıçrama</th>
                <th>Düşük doğruluk</th>
                <th>{sortHeader('worked', 'Çalışılan')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => {
                  const selected = row.employeeId === selectedEmployeeId && row.date === selectedDay

                  return (
                    <tr
                      key={`${row.employeeId}-${row.date}`}
                      className={selected ? 'is-selected' : ''}
                      onClick={() => onSelectRow(row.employeeId, row.date)}
                    >
                      <td><span className="cr-mono">{formatDate(row.date)}</span></td>
                      <td className="cr-daily-table__name">{row.employeeName}</td>
                      <td><span className="cr-mono">{formatClock(row.firstTimestamp)}</span></td>
                      <td><span className="cr-mono">{formatClock(row.lastTimestamp)}</span></td>
                      <td><span className="cr-mono">{row.pointCount}</span></td>
                      <td><span className="cr-mono">{formatDistance(row.distanceMeters)}</span></td>
                      <td>
                        <GeofenceBadge label={row.geofenceLabel} tone={row.geofenceTone} />
                      </td>
                      <td><span className="cr-mono">{row.suspiciousJumpCount}</span></td>
                      <td><span className="cr-mono">{row.lowAccuracyCount}</span></td>
                      <td><MinuteDisplay minutes={row.workedMinutes} /></td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={10}>
                    <div className="cr-feed-empty">Seçili filtreler için günlük rota satiri bulunamadı.</div>
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length ? (
              <tfoot>
                <tr className="cr-daily-table__totals">
                  <td colSpan={5}>Toplam · {rows.length} gün</td>
                  <td><span className="cr-mono">{formatDistance(totalDistance)}</span></td>
                  <td colSpan={3} />
                  <td><MinuteDisplay minutes={totalWorked} /></td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        )}
      </div>
    </section>
  )
}
