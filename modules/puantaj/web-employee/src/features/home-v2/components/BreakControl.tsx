import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Coffee } from 'lucide-react'

import { getBreakStatus } from '../../../api/attendance'
import type { BreakStatusRecord } from '../../../types/api'
import { NumberTicker } from '../../../components/magic/NumberTicker'
import { ShineBorder } from '../../../components/magic/ShineBorder'

interface BreakControlProps {
  deviceFingerprint: string
  workState: string
}

function elapsedMinutes(startedAt: string | null): number {
  if (!startedAt) return 0
  const started = new Date(startedAt).getTime()
  if (Number.isNaN(started)) return 0
  return Math.max(0, Math.floor((Date.now() - started) / 60000))
}

export function BreakControl({ deviceFingerprint, workState }: BreakControlProps) {
  const [status, setStatus] = useState<BreakStatusRecord | null>(null)
  const [, setTick] = useState(0)

  const refresh = useCallback(async () => {
    try {
      setStatus(await getBreakStatus(deviceFingerprint))
    } catch {
      // sessiz: durum gosterimi opsiyonel
    }
  }, [deviceFingerprint])

  useEffect(() => {
    void refresh()
    const poll = window.setInterval(() => void refresh(), 30000)
    return () => window.clearInterval(poll)
  }, [refresh])

  const onBreak = status?.on_break ?? false

  useEffect(() => {
    if (!onBreak) return
    const tick = window.setInterval(() => setTick((t) => t + 1), 15000)
    return () => window.clearInterval(tick)
  }, [onBreak])

  const working = workState === 'WORKING'
  const limit = status?.limit_minutes ?? 60

  const liveCurrent = onBreak
    ? Math.max(elapsedMinutes(status?.current_started_at ?? null), status?.current_elapsed_minutes ?? 0)
    : 0
  const todayTotal = onBreak
    ? (status?.today_total_minutes ?? 0) - (status?.current_elapsed_minutes ?? 0) + liveCurrent
    : status?.today_total_minutes ?? 0
  const overLimit = todayTotal > limit
  const bigValue = onBreak ? liveCurrent : todayTotal
  const blocked = !working && !onBreak

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
      className={`relative overflow-hidden rounded-md border bg-paper shadow-[0_1px_0_rgba(16,42,58,0.03)] ${
        overLimit ? 'border-err/50' : onBreak ? 'border-warn/40' : 'border-rule'
      }`}
    >
      {onBreak && (
        <ShineBorder
          borderWidth={1.5}
          duration={9}
          shineColor={overLimit ? ['#b91c1c', '#f59e0b', '#b91c1c'] : ['#f59e0b', '#d97706', '#f59e0b']}
          className="rounded-md"
        />
      )}

      <header className="flex items-center justify-between border-b border-rule px-5 py-3">
        <span className="flex items-center gap-2 font-sans text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink/70">
          <Coffee className="h-3.5 w-3.5" strokeWidth={2.4} />
          Mola
        </span>
        <span className="font-mono text-[0.64rem] uppercase tracking-widest text-ink/45">
          Günlük limit {limit} dk
        </span>
      </header>

      {blocked ? (
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink/5 text-ink/40">
            <Coffee className="h-5 w-5" strokeWidth={2} />
          </span>
          <div>
            <p className="font-sans text-sm font-medium text-ink/70">Mesai başlamadan mola yok</p>
            <p className="font-sans text-xs text-ink/45">Önce QR ile giriş yapın.</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="flex-1 font-sans text-sm font-medium text-ink/60">
            {onBreak ? 'Mola devam ediyor' : 'Mola kaydı kapalı'}
          </div>

          <div className="text-right">
            <p className="font-mono text-2xl font-medium tabular-nums text-ink">
              <NumberTicker key={onBreak ? 'cur' : 'tot'} value={bigValue} />
              <span className="ml-1 font-sans text-xs font-normal text-ink/45">dk</span>
            </p>
            <p className="font-sans text-[0.62rem] uppercase tracking-wider text-ink/45">
              {onBreak ? 'şu anki mola' : 'bugün toplam'}
            </p>
          </div>
        </div>
      )}

      {overLimit && !blocked && (
        <p className="relative border-t border-err/30 bg-err/5 px-5 py-2 font-sans text-xs text-err">
          Günlük mola limitini aştın ({todayTotal} dk). İK bilgilendirildi.
        </p>
      )}
    </motion.section>
  )
}
