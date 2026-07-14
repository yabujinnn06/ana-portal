import { motion } from 'framer-motion'
import { Loader2, LogIn, LogOut, RotateCcw } from 'lucide-react'

import { cn } from '../../../utils/cn'
import { LiveDateLabel, LiveFlipClock } from './LiveClock'

interface HeroStatusProps {
  state: 'NOT_STARTED' | 'WORKING' | 'FINISHED'
  employeeName?: string | null
  departmentName?: string | null
  regionName?: string | null
  checkInTime: string | null
  checkOutTime: string | null
  primaryActionLabel: string
  onPrimaryAction: () => void
  disabled?: boolean
  isLoading?: boolean
}

const STATE_COPY: Record<HeroStatusProps['state'], { kicker: string; sub: string; tone: string; dot: string }> = {
  NOT_STARTED: { kicker: 'Mesai bekleniyor', sub: 'Vardiyanız başlamadı', tone: 'text-warn', dot: 'bg-warn' },
  WORKING: { kicker: 'Mesaidesiniz', sub: 'Çalışmaya devam ediyorsunuz', tone: 'text-ok', dot: 'bg-ok' },
  FINISHED: { kicker: 'Mesai tamamlandı', sub: 'Bugünlük çıkış yapıldı', tone: 'text-ink/50', dot: 'bg-ink/35' },
}

export function HeroStatus({
  state,
  employeeName,
  departmentName,
  regionName,
  checkInTime,
  checkOutTime,
  primaryActionLabel,
  onPrimaryAction,
  disabled,
  isLoading,
}: HeroStatusProps) {
  const copy = STATE_COPY[state]
  const identityLine = [departmentName, regionName].filter(Boolean).join(' · ')

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-md border border-rule bg-paper shadow-[0_1px_0_rgba(16,42,58,0.04),0_22px_50px_-32px_rgba(14,124,155,0.45)]"
      aria-label="Mesai durumu"
    >
      {/* soft rain drops floating */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {[10, 25, 42, 58, 72, 86].map((left, i) => (
          <span
            key={left}
            className="absolute top-0 h-3 w-px bg-gradient-to-b from-transparent via-accent/40 to-transparent animate-rain-drop"
            style={{
              left: `${left}%`,
              animationDelay: `${i * 0.35}s`,
              animationDuration: `${2.4 + (i % 3) * 0.4}s`,
            }}
          />
        ))}
      </div>

      {/* subtle diagonal rain stripes */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(78deg, rgba(14,124,155,0.5) 0 1px, transparent 1px 24px)',
        }}
      />

      <div className="relative px-6 py-7 sm:px-8 sm:py-9">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="flex items-start justify-between gap-4"
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2" aria-hidden>
              {state === 'WORKING' && (
                <span className="absolute inset-0 rounded-full bg-ok/45 animate-ping" />
              )}
              <span className={cn('relative inline-flex h-2 w-2 rounded-full', copy.dot)} />
            </span>
            <p className={cn('font-sans text-[0.7rem] font-semibold uppercase tracking-[0.16em]', copy.tone)}>
              {copy.kicker}
            </p>
          </div>
          <LiveDateLabel className="font-sans text-xs text-ink/50" />
        </motion.div>

        {/* KIMLIK + KOMPAKT SAAT */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5"
        >
          <div className="flex justify-center sm:justify-start">
            <LiveFlipClock size="md" />
          </div>
          <div className="mt-4">
            <p className="font-display text-xl leading-tight text-ink sm:text-2xl">
              {employeeName || 'Çalışan'}
            </p>
            {identityLine && (
              <p className="mt-0.5 font-sans text-sm text-ink/60">{identityLine}</p>
            )}
            <p className="mt-1 font-sans text-xs text-ink/45">{copy.sub}</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.45 }}
          className="mt-6 flex items-stretch border-t border-rule pt-4"
        >
          <div className="flex-1">
            <p className="font-sans text-xs uppercase tracking-wider text-ink/50">Giriş saati</p>
            <p className="mt-1 flex items-center gap-2 font-mono text-3xl font-medium text-ink tabular-nums">
              <LogIn className="h-5 w-5 text-ok" aria-hidden />
              {checkInTime ?? '--:--'}
            </p>
          </div>
          {checkOutTime && (
            <div className="flex-1 border-l border-rule pl-4">
              <p className="font-sans text-xs uppercase tracking-wider text-ink/50">Çıkış saati</p>
              <p className="mt-1 flex items-center gap-2 font-mono text-3xl font-medium text-ink tabular-nums">
                <LogOut className="h-5 w-5 text-warn" aria-hidden />
                {checkOutTime}
              </p>
            </div>
          )}
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={onPrimaryAction}
          disabled={disabled || isLoading}
          className={cn(
            'mt-7 inline-flex h-12 w-full items-center justify-center gap-2',
            'rounded-md border border-accent bg-accent font-sans text-[0.95rem] font-semibold text-paper',
            'transition-shadow duration-200 shadow-[0_6px_20px_-10px_rgba(14,124,155,0.6)]',
            'hover:shadow-[0_14px_28px_-12px_rgba(14,124,155,0.7)]',
            'disabled:cursor-not-allowed disabled:opacity-40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
          )}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <>
              {state === 'NOT_STARTED' && <LogIn className="h-4 w-4" aria-hidden />}
              {state === 'WORKING' && <LogOut className="h-4 w-4" aria-hidden />}
              {state === 'FINISHED' && <RotateCcw className="h-4 w-4" aria-hidden />}
            </>
          )}
          {isLoading ? 'İşleniyor...' : primaryActionLabel}
        </motion.button>
      </div>
    </motion.section>
  )
}
