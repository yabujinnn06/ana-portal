import { motion } from 'framer-motion'

import { YabujinSpinner } from './YabujinSpinner'

export function Masthead() {
  const now = new Date()
  const weekday = now.toLocaleDateString('tr-TR', { weekday: 'long' })
  const dayMonth = now.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="mb-6 flex items-center justify-between gap-4 pb-4 border-b border-rule"
    >
      <div className="flex items-center gap-3 min-w-0">
        <YabujinSpinner size={40} className="shrink-0" />
        <div className="min-w-0">
          <p className="font-display text-lg italic leading-none text-ink">Puantaj</p>
          <p className="mt-0.5 font-sans text-[0.72rem] text-ink/55">Çalışan Portalı</p>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="font-sans text-xs font-semibold text-ink/70 capitalize">{weekday}</p>
        <p className="mt-0.5 font-mono text-[0.62rem] uppercase tracking-widest text-ink/40">
          {dayMonth}
        </p>
      </div>
    </motion.header>
  )
}
