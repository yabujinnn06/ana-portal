import type { ControlRoomSummary } from '../../types/api'

type Tone = 'accent' | 'live' | 'ok' | 'err' | 'err-soft' | 'warn' | 'muted'

export function TrackingDashboard({
  summary,
  liveCount,
  markerCount,
}: {
  summary: ControlRoomSummary
  liveCount: number
  markerCount: number
}) {
  const cards: Array<{ label: string; value: number | string; tone: Tone }> = [
    { label: 'Kapsam', value: summary.total_employees, tone: 'accent' },
    { label: 'Mesai açık', value: summary.in_progress_count, tone: 'live' },
    { label: 'Tamamlandı', value: summary.finished_count, tone: 'ok' },
    { label: 'Henüz gelmedi', value: summary.not_started_count, tone: 'muted' },
    { label: 'Canlı konum', value: liveCount, tone: 'live' },
    { label: 'Harita marker', value: markerCount, tone: 'accent' },
    { label: 'İzlemede', value: summary.watch_count, tone: 'warn' },
    { label: 'Kritik risk', value: summary.critical_count, tone: 'err' },
    { label: 'İhlal (gün)', value: summary.daily_violation_count, tone: 'err-soft' },
    { label: 'Geç gelme', value: `%${Math.round(summary.late_rate_percent)}`, tone: 'warn' },
  ]

  return (
    <section className="cr-dashboard" aria-label="Takip özeti">
      <div className="board-kpis cr-dashboard__kpis">
        {cards.map((card) => (
          <article key={card.label} className={`board-kpi is-${card.tone}`}>
            <strong>{card.value}</strong>
            <span>{card.label}</span>
          </article>
        ))}
      </div>
    </section>
  )
}
