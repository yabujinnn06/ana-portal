import { AnimatePresence, motion } from 'framer-motion'
import { Briefcase, CheckCircle, LogIn, LogOut, type LucideIcon } from 'lucide-react'

type FlashType = 'checkin' | 'checkout' | 'demo-start' | 'demo-end'

interface ActionSuccessFlashProps {
  visible: boolean
  type: FlashType
}

const TONE = {
  ok: { text: 'text-ok', circle: 'bg-ok', wash: 'rgba(34,197,94,0.12)' },
  warn: { text: 'text-warn', circle: 'bg-warn', wash: 'rgba(245,158,11,0.12)' },
  accent: { text: 'text-accent', circle: 'bg-accent', wash: 'rgba(14,124,155,0.12)' },
} as const

const CONFIG: Record<FlashType, { label: string; Icon: LucideIcon; tone: keyof typeof TONE }> = {
  checkin: { label: 'Mesai başladı', Icon: LogIn, tone: 'ok' },
  checkout: { label: 'Mesai tamamlandı', Icon: LogOut, tone: 'warn' },
  'demo-start': { label: 'Ziyaret başladı', Icon: Briefcase, tone: 'accent' },
  'demo-end': { label: 'Ziyaret tamamlandı', Icon: Briefcase, tone: 'accent' },
}

export function ActionSuccessFlash({ visible, type }: ActionSuccessFlashProps) {
  const { label, Icon, tone } = CONFIG[type]
  const t = TONE[tone]

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="flash"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <motion.div
            className="absolute inset-0"
            style={{ background: t.wash, backdropFilter: 'blur(2px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            className="relative z-10 flex flex-col items-center gap-4"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.1, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          >
            <div className="relative">
              <motion.span
                className={`absolute inset-0 rounded-full ${t.circle}`}
                animate={{ scale: [1, 2.2], opacity: [0.35, 0] }}
                transition={{ duration: 0.7, repeat: 1, ease: 'easeOut' }}
              />
              <motion.span
                className={`absolute inset-0 rounded-full ${t.circle}`}
                animate={{ scale: [1, 1.7], opacity: [0.25, 0] }}
                transition={{ duration: 0.9, delay: 0.1, repeat: 1, ease: 'easeOut' }}
              />
              <div className={`relative grid h-20 w-20 place-items-center rounded-full ${t.circle} shadow-[0_8px_32px_rgba(0,0,0,0.2)]`}>
                <Icon className="h-9 w-9 text-white" strokeWidth={2.5} />
              </div>
            </div>

            <div className="text-center">
              <p className={`font-display text-2xl ${t.text}`}>{label}</p>
              <motion.div className="flex items-center gap-1.5 justify-center mt-1">
                <CheckCircle className={`h-3.5 w-3.5 ${t.text}`} />
                <p className="font-sans text-sm text-ink/60">Kaydedildi</p>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
