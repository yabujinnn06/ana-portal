import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, X } from 'lucide-react'
import { YabujinSpinner } from './YabujinSpinner'

// Hero "mesaini bitir" onayindan sonra gercek cikisi HomePageV2 yapar.
export const REQUEST_CHECKOUT_EVENT = 'pf:request-checkout'

interface PushItem {
  id: string
  title: string
  body: string
  url?: string
}

const AUTO_DISMISS_MS = 6500
const HERO_AUTO_DISMISS_MS = 9000
// Backend bu tip ile saatlik "mesaini bitir" hatirlatmasini yollar
// (attendance_notification_monitor.TYPE_OVERTIME_CHECKOUT_REMINDER).
const HERO_NOTIFICATION_TYPE = 'cikis_hatirlatma_saatlik'

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isHeroPayload(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false
  const notificationType = typeof data.notification_type === 'string' ? data.notification_type : ''
  const variant = typeof data.variant === 'string' ? data.variant : ''
  return notificationType === HERO_NOTIFICATION_TYPE || variant === 'hero'
}

// Uygulama acikken gelen push bildirimlerini program ici gosterir.
// - Normal bildirimler: ustte kucuk toast.
// - "Mesaini bitir" hatirlatmasi: ekran ortasinda donerek gelen YABUJIN hero popup.
// Kaynaklar: service worker mesaji (gercek push) + 'pf:inapp-notification' event'i.
export function PushNotificationPopup() {
  const [items, setItems] = useState<PushItem[]>([])
  const [hero, setHero] = useState<PushItem | null>(null)
  const [confirming, setConfirming] = useState(false)
  const confirmingRef = useRef(false)

  useEffect(() => {
    confirmingRef.current = confirming
  }, [confirming])

  useEffect(() => {
    const addToast = (title: string, body: string, url?: string) => {
      const id = makeId()
      setItems((prev) => [...prev.slice(-2), { id, title, body, url }])
      window.setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== id))
      }, AUTO_DISMISS_MS)
    }

    const showHero = (title: string, body: string, url?: string) => {
      const id = makeId()
      setConfirming(false)
      setHero({ id, title, body, url })
      window.setTimeout(() => {
        // Onay adimindaysa kapatma; karar bekleniyor.
        setHero((cur) => (cur && cur.id === id && !confirmingRef.current ? null : cur))
      }, HERO_AUTO_DISMISS_MS)
    }

    const route = (
      title: string,
      body: string,
      url: string | undefined,
      data: Record<string, unknown> | null | undefined,
    ) => {
      if (isHeroPayload(data)) {
        showHero(title || 'Mesai hatirlatmasi', body || 'Mesainizi bitirmeyi unutmayin.', url)
      } else {
        addToast(title, body, url)
      }
    }

    const onSwMessage = (event: MessageEvent) => {
      const data = event.data as
        | { type?: string; payload?: { title?: string; body?: string; data?: Record<string, unknown> } }
        | null
      if (!data || data.type !== 'PUSH_NOTIFICATION' || !data.payload) return
      const payload = data.payload
      const url = typeof payload.data?.url === 'string' ? payload.data.url : undefined
      route(payload.title?.trim() || 'Bildirim', payload.body?.trim() || '', url, payload.data)
    }

    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail
      const title = typeof detail?.title === 'string' ? detail.title.trim() : ''
      const body = typeof detail?.body === 'string' ? detail.body.trim() : ''
      const url = typeof detail?.url === 'string' ? detail.url : undefined
      route(title || 'Bildirim', body, url, detail)
    }

    navigator.serviceWorker?.addEventListener('message', onSwMessage)
    window.addEventListener('pf:inapp-notification', onCustom as EventListener)

    // Onizleme/dev kancasi: /employee/?inapp-demo=checkout acilisinda hero gosterir.
    let demoTimer: number | undefined
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('inapp-demo') === 'checkout') {
        demoTimer = window.setTimeout(
          () => showHero('Mesai hatirlatmasi', 'Mesainizi bitirmeyi unutmayin.', '/employee/'),
          600,
        )
      }
    } catch {
      // yok say
    }

    return () => {
      navigator.serviceWorker?.removeEventListener('message', onSwMessage)
      window.removeEventListener('pf:inapp-notification', onCustom as EventListener)
      if (demoTimer) window.clearTimeout(demoTimer)
    }
  }, [])

  const dismiss = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id))

  const open = (item: PushItem) => {
    if (item.url) {
      try {
        window.location.assign(item.url)
      } catch {
        // yok say
      }
    }
    dismiss(item.id)
  }

  const dismissHero = () => {
    setConfirming(false)
    setHero(null)
  }

  // "Evet, bitir" -> gercek cikisi HomePageV2'ye birak (GPS/flash/ton tutarli kalsin).
  const confirmCheckout = () => {
    try {
      window.dispatchEvent(new CustomEvent(REQUEST_CHECKOUT_EVENT, { detail: { source: 'inapp-hero' } }))
    } catch {
      // yok say
    }
    dismissHero()
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: -24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className="pointer-events-auto relative w-full max-w-[420px] rounded-md border border-rule bg-white shadow-[0_20px_50px_-20px_rgba(0,0,0,0.45)]"
            >
              <button
                type="button"
                onClick={() => open(item)}
                className="flex w-full items-start gap-3 px-4 py-3 pr-10 text-left"
              >
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-paper" aria-hidden>
                  <Bell className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-sans text-sm font-semibold text-black">{item.title}</p>
                  {item.body && <p className="mt-0.5 font-sans text-xs text-black/75">{item.body}</p>}
                </div>
              </button>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Kapat"
                className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-ink/40 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {hero && (
          <motion.div
            key={hero.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={dismissHero}
            className="fixed inset-0 z-[80] grid place-items-center px-6"
            style={{
              background:
                'radial-gradient(circle at 50% 42%, rgba(173,222,242,0.18) 0%, transparent 34%), linear-gradient(180deg, rgba(6,24,35,0.62) 0%, rgba(6,31,44,0.66) 100%)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
            }}
          >
            <div
              className="flex w-full max-w-[360px] flex-col items-center gap-[22px] text-center"
              onClick={(event) => event.stopPropagation()}
            >
              <motion.div
                className="relative"
                initial={{ scale: 0.28, rotate: -540, opacity: 0 }}
                animate={{ scale: [0.28, 1.05, 1], rotate: [-540, 0, 0], opacity: [0, 1, 1] }}
                transition={{ duration: 1, times: [0, 0.82, 1], ease: [0.16, 1, 0.3, 1] }}
                style={{ transformOrigin: 'center center' }}
              >
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute -inset-[22%] rounded-full"
                  style={{
                    background:
                      'radial-gradient(circle, rgba(120,205,245,0.42), rgba(120,205,245,0) 66%)',
                    filter: 'blur(14px)',
                  }}
                  animate={{ scale: [0.96, 1.06, 0.96], opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                />
                <div className="relative">
                  <YabujinSpinner size={156} />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 0.42, duration: 0.56, ease: [0.16, 1, 0.3, 1] }}
                className="relative w-full overflow-hidden rounded-[22px] border border-white/70 bg-white px-[22px] pb-5 pt-[22px] shadow-[0_36px_80px_-30px_rgba(4,20,30,0.72)]"
              >
                <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#5fb3d6] to-[#0b2a3a]" aria-hidden />
                <AnimatePresence mode="wait">
                  {!confirming ? (
                    <motion.div
                      key="remind"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.22 }}
                    >
                      <span className="mx-auto inline-flex items-center gap-1.5 rounded-full bg-[#5fb3d6]/15 px-3 py-1.5 font-sans text-[10.5px] font-extrabold uppercase tracking-[0.24em] text-[#2a7aa0]">
                        <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-[#2a7aa0]" />
                        {hero.title}
                      </span>
                      <h2 className="m-0 mt-3 font-sans text-[22px] font-black leading-[1.22] tracking-[-0.01em] text-[#0b2230]">
                        {hero.body}
                      </h2>
                      <p className="m-0 mt-2.5 font-sans text-[13px] font-medium leading-relaxed text-[#0b2230]/60">
                        Mesaini bitirdiysen kaydini kapat. Devam ediyorsan bu mesaji kapatabilirsin.
                      </p>
                      <div className="mt-[18px] flex gap-2.5">
                        <button
                          type="button"
                          onClick={() => setConfirming(true)}
                          className="flex-1 rounded-[14px] bg-[#0b2a3a] px-3.5 py-3 font-sans text-sm font-extrabold text-white transition active:scale-[0.97]"
                        >
                          Mesaini bitir
                        </button>
                        <button
                          type="button"
                          onClick={dismissHero}
                          className="flex-1 rounded-[14px] bg-[#0b2a3a]/10 px-3.5 py-3 font-sans text-sm font-extrabold text-[#0b2230] transition active:scale-[0.97]"
                        >
                          Kapat
                        </button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="confirm"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.22 }}
                    >
                      <span className="mx-auto inline-flex items-center gap-1.5 rounded-full bg-[#b3261e]/12 px-3 py-1.5 font-sans text-[10.5px] font-extrabold uppercase tracking-[0.24em] text-[#b3261e]">
                        Onay
                      </span>
                      <h2 className="m-0 mt-3 font-sans text-[22px] font-black leading-[1.22] tracking-[-0.01em] text-[#0b2230]">
                        Emin misin?
                      </h2>
                      <p className="m-0 mt-2.5 font-sans text-[13px] font-medium leading-relaxed text-[#0b2230]/60">
                        Mesain kapatilacak ve cikis kaydin olusturulacak.
                      </p>
                      <div className="mt-[18px] flex gap-2.5">
                        <button
                          type="button"
                          onClick={confirmCheckout}
                          className="flex-1 rounded-[14px] bg-[#b3261e] px-3.5 py-3 font-sans text-sm font-extrabold text-white transition active:scale-[0.97]"
                        >
                          Evet, bitir
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(false)}
                          className="flex-1 rounded-[14px] bg-[#0b2a3a]/10 px-3.5 py-3 font-sans text-sm font-extrabold text-[#0b2230] transition active:scale-[0.97]"
                        >
                          Hayir
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body,
  )
}
