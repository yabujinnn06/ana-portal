import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { DailyStatusBoard } from '../components/welcome/DailyStatusBoard'
import { formatDateTime } from '../components/control-room/utils'
import { useAuth } from '../hooks/useAuth'
import type { DailyBoardResponse } from '../types/api'

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

function todayIsoDay(): string {
  return ISO_DAY_FORMAT.format(new Date())
}

function normalizeIsoDay(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim())
  return match?.[1] ?? null
}

function formatIsoDayLabel(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  const [, year, month, day] = match
  return DAY_LABEL_FORMAT.format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12, 0, 0)))
}

function WelcomeHeroMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: number | string
  tone?: 'default' | 'live' | 'watch' | 'active'
}) {
  return (
    <article className={`welcome-summary-card is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}

function WelcomeSignalCard({ label, title }: { label: string; title: number | string }) {
  return (
    <article className="welcome-signal-card">
      <span>{label}</span>
      <strong>{title}</strong>
    </article>
  )
}

export function WelcomePage() {
  const location = useLocation()
  const { hasPermission } = useAuth()
  const [boardData, setBoardData] = useState<DailyBoardResponse | null>(null)
  const canViewBoard = hasPermission('attendance_events')

  const initialDate = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return (
      normalizeIsoDay(params.get('absence_date')) ??
      normalizeIsoDay(params.get('shift_date')) ??
      normalizeIsoDay(params.get('start_date')) ??
      todayIsoDay()
    )
  }, [location.search])

  const summary = boardData?.summary
  const total = summary?.total ?? 0
  const came = summary ? summary.working + summary.finished : 0
  const cameRate = total ? Math.round((came / total) * 100) : 0
  const dayLabel = formatIsoDayLabel(boardData?.target_date ?? initialDate)

  return (
    <div className="welcome-page">
      <PageHeader title="Hoş geldiniz" />

      <Panel className="welcome-hero">
        <div className="welcome-hero__grid">
          <div className="welcome-hero__content">
            <div className="welcome-reveal is-delay-1">
              <p className="welcome-hero__eyebrow">OPERASYON GİRİŞİ</p>
              <h2>Günlük puantaj, devamsızlık ve ekip kontrolü tek ekranda canlı.</h2>
            </div>

            <div className="welcome-hero__chips welcome-reveal is-delay-3">
              <span className="welcome-chip is-live">Sistem hazır</span>
              <span className="welcome-chip">
                Son güncelleme {boardData?.generated_at_utc ? formatDateTime(boardData.generated_at_utc) : '-'}
              </span>
              <span className="welcome-chip">{dayLabel}</span>
              <span className="welcome-chip">{total} kayıt</span>
            </div>

            <div className="welcome-summary-grid welcome-reveal is-delay-4">
              <WelcomeHeroMetric label="Kapsamdaki kadro" value={total} tone="active" />
              <WelcomeHeroMetric label="Mesai açık" value={summary?.working ?? 0} tone="live" />
              <WelcomeHeroMetric
                label="Devamsız"
                value={summary?.absent ?? 0}
                tone={summary?.absent ? 'watch' : 'default'}
              />
              <WelcomeHeroMetric label="QR okutmadı" value={summary?.qr_missing ?? 0} />
            </div>
          </div>

          <div className="welcome-hero__visual welcome-reveal is-delay-5">
            <div className="welcome-scene">
              <span className="welcome-scene__chip is-top">Hızlı tarama</span>
              <div className="welcome-hero-logo" aria-hidden="true">
                <div className="welcome-hero-logo__shadow" />
                <div className="welcome-hero-logo__nebula welcome-hero-logo__nebula--back" />
                <div className="welcome-hero-logo__nebula welcome-hero-logo__nebula--front" />
                <div className="welcome-hero-logo__aura" />
                <div className="welcome-hero-logo__orbit welcome-hero-logo__orbit--outer" />
                <div className="welcome-hero-logo__orbit welcome-hero-logo__orbit--mid" />
                <div className="welcome-hero-logo__orbit welcome-hero-logo__orbit--inner" />
                <div className="welcome-hero-logo__orbit welcome-hero-logo__orbit--polar" />
                <div className="welcome-hero-logo__satellite welcome-hero-logo__satellite--outer">
                  <div className="welcome-hero-logo__satellite-core" />
                </div>
                <div className="welcome-hero-logo__satellite welcome-hero-logo__satellite--mid">
                  <div className="welcome-hero-logo__satellite-core" />
                </div>
                <div className="welcome-hero-logo__satellite welcome-hero-logo__satellite--inner">
                  <div className="welcome-hero-logo__satellite-core" />
                </div>
                <div className="welcome-hero-logo__planet">
                  <div className="welcome-hero-logo__depth" />
                  <div className="welcome-hero-logo__halo" />
                  <div className="welcome-hero-logo__ring welcome-hero-logo__ring--back" />
                  <div className="welcome-hero-logo__core">
                    <span className="welcome-hero-logo__monogram">Y</span>
                    <span className="welcome-hero-logo__brand">YABUJIN</span>
                    <span className="welcome-hero-logo__sub">ADMIN CORE</span>
                  </div>
                  <div className="welcome-hero-logo__ring welcome-hero-logo__ring--front" />
                  <div className="welcome-hero-logo__spark welcome-hero-logo__spark--a" />
                  <div className="welcome-hero-logo__spark welcome-hero-logo__spark--b" />
                </div>
              </div>

              <div className="welcome-scene__panel">
                <div>
                  <span>Mesai açık</span>
                  <strong>{summary?.working ?? 0}</strong>
                </div>
                <div>
                  <span>Henüz gelmedi</span>
                  <strong>{summary?.not_started ?? 0}</strong>
                </div>
                <div>
                  <span>Geliş oranı</span>
                  <strong>%{cameRate}</strong>
                </div>
              </div>
            </div>

            <div className="welcome-signal-grid">
              <WelcomeSignalCard label="Devamsız" title={`${summary?.absent ?? 0} kişi`} />
              <WelcomeSignalCard label="Devamsızlık riski" title={`${summary?.absent_risk ?? 0} kişi`} />
              <WelcomeSignalCard label="Çıkış yapılmadı" title={`${summary?.open_overdue ?? 0} kişi`} />
            </div>
          </div>
        </div>
      </Panel>

      {canViewBoard ? (
        <DailyStatusBoard initialDate={initialDate} onDataChange={setBoardData} />
      ) : (
        <Panel className="welcome-table-panel">
          <div className="welcome-empty">Çalışan durum tablosunu görmek için yetkiniz yok.</div>
        </Panel>
      )}
    </div>
  )
}
