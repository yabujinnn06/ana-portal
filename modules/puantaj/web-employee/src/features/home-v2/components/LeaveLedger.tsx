import { useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, ChevronDown, ChevronRight, MessageSquare, Paperclip } from 'lucide-react'

import type { EmployeeLeaveRecord, LeaveStatus, LeaveType } from '../../../types/api'

interface LeaveLedgerProps {
  leaves: EmployeeLeaveRecord[]
  onOpen: (leaveId: number) => void
}

const COLLAPSED_COUNT = 4

const TYPE_LABEL: Record<LeaveType, string> = {
  ANNUAL: 'Yıllık izin',
  SICK: 'Rapor / hastalık',
  UNPAID: 'Ücretsiz izin',
  EXCUSE: 'Mazeret izni',
  PUBLIC_HOLIDAY: 'Resmi tatil',
}

const STATUS: Record<LeaveStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Onay bekliyor', cls: 'border-warn/40 bg-warn/10 text-warn' },
  APPROVED: { label: 'Onaylandı', cls: 'border-ok/40 bg-ok/10 text-ok' },
  REJECTED: { label: 'Reddedildi', cls: 'border-err/40 bg-err/10 text-err' },
}

function formatRange(start: string, end: string): string {
  if (start === end) return start
  return `${start} – ${end}`
}

export function LeaveLedger({ leaves, onOpen }: LeaveLedgerProps) {
  const [expanded, setExpanded] = useState(false)
  if (leaves.length === 0) return null

  const overflow = leaves.length > COLLAPSED_COUNT
  const rows = expanded ? leaves : leaves.slice(0, COLLAPSED_COUNT)

  return (
    <section>
      <header className="flex items-baseline justify-between mb-3 px-1">
        <h2 className="font-display text-lg text-ink">İzin geçmişi</h2>
        <span className="font-sans text-xs text-ink/45">{leaves.length} kayıt</span>
      </header>
      <ol
        className={
          'rounded-md border border-rule bg-paper divide-y divide-rule overflow-hidden ' +
          (expanded && overflow ? 'max-h-[340px] overflow-y-auto' : '')
        }
      >
        {rows.map((leave) => {
          const status = STATUS[leave.status]
          return (
            <li key={leave.id}>
              <button
                type="button"
                onClick={() => onOpen(leave.id)}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-accent-soft/40 focus-visible:outline-none focus-visible:bg-accent-soft/40"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent" aria-hidden>
                  <CalendarDays className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-sans text-sm font-semibold text-ink truncate">
                      {TYPE_LABEL[leave.type]}
                    </span>
                    <span
                      className={
                        'shrink-0 rounded-full border px-2 py-0.5 font-sans text-[0.65rem] uppercase tracking-wider ' +
                        status.cls
                      }
                    >
                      {status.label}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-ink/60">
                    {formatRange(leave.start_date, leave.end_date)}
                  </p>
                  {(leave.message_count || leave.attachment_count) ? (
                    <div className="mt-1 flex items-center gap-3 font-sans text-[0.7rem] text-ink/45">
                      {leave.message_count ? (
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" />
                          {leave.message_count}
                        </span>
                      ) : null}
                      {leave.attachment_count ? (
                        <span className="inline-flex items-center gap-1">
                          <Paperclip className="h-3 w-3" />
                          {leave.attachment_count}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink/35" />
              </button>
            </li>
          )
        })}
      </ol>
      {overflow && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-rule bg-cream/40 px-3 py-2 font-sans text-xs font-semibold text-ink/70 hover:border-accent hover:text-accent transition-colors"
        >
          {expanded ? 'Daha az göster' : `Tümünü gör (${leaves.length})`}
          <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="h-3.5 w-3.5" />
          </motion.span>
        </button>
      )}
    </section>
  )
}
