import { motion } from 'framer-motion'

interface TodayLedgerProps {
  shiftLabel: string
  breakMinutes: number
  netHours: string
}

export function TodayLedger({ shiftLabel, breakMinutes, netHours }: TodayLedgerProps) {
  const items = [
    { label: 'Vardiya', value: shiftLabel, suffix: null as string | null },
    { label: 'Mola', value: String(breakMinutes), suffix: 'dk' },
    { label: 'Net', value: netHours, suffix: 'sa' },
  ]

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2 }}
      className="rounded-md border border-rule bg-paper shadow-[0_1px_0_rgba(16,42,58,0.03),0_18px_36px_-30px_rgba(14,124,155,0.35)] transition-shadow hover:shadow-[0_1px_0_rgba(16,42,58,0.03),0_22px_42px_-26px_rgba(14,124,155,0.45)]"
    >
      <header className="flex items-center justify-between border-b border-rule px-5 py-3 bg-accent-soft/50">
        <span className="font-sans text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink/70">
          Bugun
        </span>
        <span className="font-mono text-[0.64rem] uppercase tracking-widest text-ink/45">
          {new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </span>
      </header>
      <dl className="grid grid-cols-3 divide-x divide-rule">
        {items.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.06, duration: 0.4 }}
            className="px-4 py-5 min-w-0"
          >
            <dt className="font-sans text-[0.7rem] uppercase tracking-wider text-ink/55">
              {item.label}
            </dt>
            <dd className="mt-1.5 flex items-baseline gap-1 font-mono text-xl font-medium text-ink tabular-nums">
              <span className="truncate">{item.value}</span>
              {item.suffix && (
                <span className="font-sans text-[0.62rem] uppercase tracking-wider text-ink/45">
                  {item.suffix}
                </span>
              )}
            </dd>
          </motion.div>
        ))}
      </dl>
    </motion.section>
  )
}
