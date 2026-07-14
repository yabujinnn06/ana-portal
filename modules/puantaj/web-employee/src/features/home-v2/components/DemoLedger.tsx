import { useState } from 'react'
import { motion } from 'framer-motion'
import { Briefcase, ChevronDown } from 'lucide-react'

import type { EmployeeDemoDayResponse } from '../../../types/api'

interface DemoLedgerProps {
  demo: EmployeeDemoDayResponse | null
}

const COLLAPSED_COUNT = 3

function formatTime(utc: string | null | undefined): string {
  if (!utc) return '--:--'
  return new Date(utc).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(min: number): string {
  if (min < 60) return `${min} dk`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} sa ${m} dk` : `${h} sa`
}

export function DemoLedger({ demo }: DemoLedgerProps) {
  const [expanded, setExpanded] = useState(false)
  if (!demo || demo.session_count === 0) return null

  const overflow = demo.sessions.length > COLLAPSED_COUNT
  const rows = expanded ? demo.sessions : demo.sessions.slice(0, COLLAPSED_COUNT)

  return (
    <section>
      <header className="flex items-baseline justify-between mb-3 px-1">
        <h2 className="font-display text-lg text-ink">Bugünkü ziyaretler</h2>
        <span className="font-sans text-xs text-ink/45">
          {demo.session_count} ziyaret · {formatDuration(demo.total_minutes)}
        </span>
      </header>
      <ol
        className={
          'rounded-md border border-rule bg-paper divide-y divide-rule overflow-hidden ' +
          (expanded && overflow ? 'max-h-[300px] overflow-y-auto' : '')
        }
      >
        {rows.map((session, index) => (
          <li key={`${session.started_at_utc}-${index}`} className="flex items-center gap-4 px-5 py-3.5">
            <span
              className={
                'grid h-7 w-7 shrink-0 place-items-center rounded-full ' +
                (session.is_active ? 'bg-warn text-paper' : 'bg-accent-soft text-accent')
              }
              aria-hidden
            >
              <Briefcase className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-sans text-sm text-ink">
                Ziyaret {index + 1}
                {session.is_active && (
                  <span className="ml-2 font-sans text-[0.7rem] uppercase tracking-wider text-warn">devam ediyor</span>
                )}
              </p>
              <p className="mt-0.5 font-mono text-xs text-ink/60">
                {formatTime(session.started_at_utc)} – {session.is_active ? '...' : formatTime(session.ended_at_utc)}
              </p>
            </div>
            <span className="font-mono text-sm text-ink/70 tabular-nums whitespace-nowrap">
              {formatDuration(session.duration_minutes)}
            </span>
          </li>
        ))}
      </ol>
      {overflow && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-rule bg-cream/40 px-3 py-2 font-sans text-xs font-semibold text-ink/70 hover:border-accent hover:text-accent transition-colors"
        >
          {expanded ? 'Daha az göster' : `Tümünü gör (${demo.sessions.length})`}
          <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-3.5 w-3.5" />
          </motion.span>
        </button>
      )}
    </section>
  )
}
