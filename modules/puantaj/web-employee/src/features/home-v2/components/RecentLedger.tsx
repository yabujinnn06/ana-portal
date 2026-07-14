import { motion } from 'framer-motion'
import { Clock, Coffee, LogIn, LogOut } from 'lucide-react'

export interface RecentEntry {
  id: string
  type: 'CHECKIN' | 'CHECKOUT' | 'DEMO' | 'LEAVE'
  label: string
  timestamp: string
  location?: string
}

interface RecentLedgerProps {
  entries: RecentEntry[]
}

const TYPE: Record<
  RecentEntry['type'],
  { label: string; color: string; bg: string; Icon: typeof LogIn }
> = {
  CHECKIN:  { label: 'Giriş', color: 'text-ok',     bg: 'bg-ok',      Icon: LogIn },
  CHECKOUT: { label: 'Çıkış', color: 'text-warn',   bg: 'bg-warn',    Icon: LogOut },
  DEMO:     { label: 'Mola',  color: 'text-accent', bg: 'bg-accent',  Icon: Coffee },
  LEAVE:    { label: 'İzin',  color: 'text-ink/55', bg: 'bg-ink/45',  Icon: Clock },
}

export function RecentLedger({ entries }: RecentLedgerProps) {
  return (
    <section>
      <header className="flex items-baseline justify-between mb-3 px-1">
        <h2 className="font-display text-lg text-ink">Son işlemler</h2>
        <span className="font-sans text-xs text-ink/45">bugün</span>
      </header>

      {entries.length === 0 ? (
        <div className="rounded-md border border-rule bg-paper px-5 py-8 text-center">
          <p className="font-sans text-sm text-ink/50">Henüz işlem yok</p>
        </div>
      ) : (
        <motion.ol
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.2 } } }}
          className="relative rounded-md border border-rule bg-paper px-5 py-2"
        >
          {/* dikey zaman cizgisi */}
          {entries.length > 1 && (
            <span aria-hidden className="absolute left-[34px] top-7 bottom-7 w-px bg-rule" />
          )}
          {entries.map((entry) => {
            const t = TYPE[entry.type]
            return (
              <motion.li
                key={entry.id}
                variants={{
                  hidden: { opacity: 0, x: -8 },
                  show: { opacity: 1, x: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
                }}
                className="relative flex items-center gap-4 py-3.5"
              >
                <span
                  className={`relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full text-white ring-4 ring-paper ${t.bg}`}
                  aria-hidden
                >
                  <t.Icon className="h-4 w-4" strokeWidth={2.25} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`font-sans text-sm font-semibold ${t.color}`}>{t.label}</p>
                  <p className="mt-0.5 font-sans text-[0.72rem] text-ink/45 truncate">
                    {entry.location ?? entry.label}
                  </p>
                </div>
                <time className="font-mono text-lg font-medium text-ink tabular-nums whitespace-nowrap">
                  {entry.timestamp}
                </time>
              </motion.li>
            )
          })}
        </motion.ol>
      )}
    </section>
  )
}
