import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, AlertTriangle, Info } from 'lucide-react'
import type { ReactNode } from 'react'

interface AlertRibbonProps {
  items: { id: string; tone: 'warn' | 'err' | 'info'; text: ReactNode }[]
}

const TONE: Record<
  'warn' | 'err' | 'info',
  { border: string; bg: string; iconColor: string; label: string; Icon: typeof Info }
> = {
  warn: { border: 'border-l-warn', bg: 'bg-[#fff8ed]', iconColor: 'text-warn', label: 'Uyarı', Icon: AlertTriangle },
  err:  { border: 'border-l-err',  bg: 'bg-[#fdf2f2]', iconColor: 'text-err',  label: 'Acil',  Icon: AlertCircle },
  info: { border: 'border-l-accent', bg: 'bg-accent-soft/60', iconColor: 'text-accent', label: 'Bilgi', Icon: Info },
}

export function AlertRibbon({ items }: AlertRibbonProps) {
  if (items.length === 0) return null

  return (
    <ul className="space-y-2">
      <AnimatePresence initial={true}>
        {items.map((item, i) => {
          const t = TONE[item.tone]
          return (
            <motion.li
              key={item.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ delay: 0.2 + i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className={`flex items-start gap-3 rounded-md border border-rule ${t.bg} ${t.border} border-l-[3px] px-4 py-3 shadow-[0_1px_0_rgba(16,42,58,0.03)]`}
            >
              <motion.span
                className={`${t.iconColor} mt-0.5 shrink-0`}
                animate={{ rotate: [0, -8, 8, -4, 0] }}
                transition={{ delay: 0.4 + i * 0.1, duration: 0.6 }}
              >
                <t.Icon className="h-4 w-4" aria-hidden />
              </motion.span>
              <div className="min-w-0 flex-1">
                <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-wider text-ink/60">
                  {t.label}
                </p>
                <p className="mt-0.5 font-sans text-sm text-ink/85">{item.text}</p>
              </div>
            </motion.li>
          )
        })}
      </AnimatePresence>
    </ul>
  )
}
