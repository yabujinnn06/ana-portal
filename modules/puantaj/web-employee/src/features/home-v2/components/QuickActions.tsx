import { motion } from 'framer-motion'
import { Boxes, Briefcase, CalendarOff, Loader2, MessageSquare, QrCode, Settings, type LucideIcon } from 'lucide-react'

interface QuickActionsProps {
  onScanQr: () => void
  onDemoToggle: () => void
  onLeave: () => void
  onSettings: () => void
  onMessages: () => void
  onDepo?: () => void
  showDepo?: boolean
  isDemoActive: boolean
  isDemoDisabled?: boolean
  isDemoBusy?: boolean
}

interface ActionDef {
  key: 'qr' | 'demo' | 'leave' | 'settings' | 'messages' | 'depo'
  label: string
  desc: string
  Icon: LucideIcon
  highlighted?: boolean
  disabled?: boolean
}

export function QuickActions({
  onScanQr,
  onDemoToggle,
  onLeave,
  onSettings,
  onMessages,
  onDepo,
  showDepo,
  isDemoActive,
  isDemoDisabled,
  isDemoBusy,
}: QuickActionsProps) {
  const actions: ActionDef[] = [
    { key: 'qr', label: 'QR Tara', desc: 'Giriş / çıkış', Icon: QrCode },
    {
      key: 'demo',
      label: isDemoBusy ? 'İşleniyor...' : isDemoActive ? 'Demo Devam Ediyor' : 'Demo Başlat',
      desc: isDemoActive ? 'Bitirmek için tıklayın' : 'Başlatmak için tıklayın',
      Icon: Briefcase,
      highlighted: isDemoActive,
      disabled: isDemoDisabled,
    },
    { key: 'leave', label: 'İzin Talep', desc: 'Yıllık / mazeret', Icon: CalendarOff },
    { key: 'messages', label: 'Mesajlar', desc: 'İK ile iletişim', Icon: MessageSquare },
    ...(showDepo
      ? [{ key: 'depo' as const, label: 'Depo', desc: 'Sayım uygulamasını aç', Icon: Boxes }]
      : []),
    { key: 'settings', label: 'Ayarlar', desc: 'Passkey / recovery', Icon: Settings },
  ]

  const handlers: Record<ActionDef['key'], () => void> = {
    qr: onScanQr,
    demo: onDemoToggle,
    leave: onLeave,
    settings: onSettings,
    messages: onMessages,
    depo: () => onDepo?.(),
  }

  return (
    <motion.section
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.08, delayChildren: 0.25 } },
      }}
    >
      <motion.header
        variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }}
        className="flex items-baseline justify-between mb-3 px-1"
      >
        <h2 className="font-display text-lg text-ink">İşlemler</h2>
        <span className="font-sans text-xs text-ink/45">{actions.length} modül</span>
      </motion.header>
      <div className="grid grid-cols-2 gap-2.5">
        {actions.map(({ key, label, desc, Icon, highlighted, disabled }, index) => {
          const isWide = actions.length % 2 === 1 && index === actions.length - 1
          const iconNode = (
            <motion.span
              className={
                'grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors ' +
                (highlighted
                  ? 'bg-warn text-paper'
                  : 'bg-accent-soft text-accent group-hover:bg-accent group-hover:text-paper')
              }
              whileHover={disabled ? undefined : { rotate: -6, scale: 1.05 }}
              transition={{ type: 'spring', stiffness: 320, damping: 18 }}
            >
              {key === 'demo' && isDemoBusy ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              ) : (
                <Icon className="h-5 w-5" aria-hidden />
              )}
            </motion.span>
          )
          return (
            <motion.button
              key={key}
              variants={{
                hidden: { opacity: 0, y: 10 },
                show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
              }}
              whileHover={disabled ? undefined : { y: -3 }}
              whileTap={disabled ? undefined : { scale: 0.97 }}
              type="button"
              onClick={handlers[key]}
              disabled={disabled}
              className={
                (isWide ? 'col-span-2 ' : '') +
                'group rounded-md border px-4 py-4 text-left transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ' +
                (highlighted
                  ? 'border-warn bg-warn/5 hover:border-warn'
                  : 'border-rule bg-paper hover:border-accent hover:shadow-[0_14px_28px_-18px_rgba(14,124,155,0.5)] focus-visible:border-accent')
              }
            >
              {isWide ? (
                <span className="flex items-center gap-3">
                  {iconNode}
                  <span className="min-w-0">
                    <span className="block font-sans text-base font-semibold text-ink">{label}</span>
                    <span className="mt-0.5 block font-sans text-xs text-ink/55">{desc}</span>
                  </span>
                </span>
              ) : (
                <>
                  {iconNode}
                  <span className="mt-3 block font-sans text-base font-semibold text-ink">{label}</span>
                  <span className="mt-0.5 block font-sans text-xs text-ink/55">{desc}</span>
                </>
              )}
            </motion.button>
          )
        })}
      </div>
    </motion.section>
  )
}
