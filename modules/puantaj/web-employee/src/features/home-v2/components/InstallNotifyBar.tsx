import { useEffect, useState } from 'react'
import { Bell, BellRing, Check, Loader2, Plus, Share, SquarePlus } from 'lucide-react'

import { parseApiError, postEmployeeInstallFunnelEvent } from '../../../api/attendance'
import type { EmployeeInstallFunnelEventType } from '../../../types/api'
import { enablePushNotifications, isPushSupported } from '../../../utils/push'
import { SheetModal } from './SheetModal'
import { YabujinSpinner } from './YabujinSpinner'

let bannerShownFired = false

interface InstallNotifyBarProps {
  deviceFingerprint: string
  onInfo?: (msg: string) => void
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const displayMode = window.matchMedia?.('(display-mode: standalone)')?.matches
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true
  return Boolean(displayMode || iosStandalone)
}

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOSUA = /iphone|ipad|ipod/i.test(ua)
  const iPadOS = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1
  return iOSUA || iPadOS
}

export function InstallNotifyBar({ deviceFingerprint, onInfo }: InstallNotifyBarProps) {
  const ios = isIosDevice()
  const [installed, setInstalled] = useState(isStandalone)
  const [iosOpen, setIosOpen] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  )
  const [notifyBusy, setNotifyBusy] = useState(false)

  const fireFunnel = (event: EmployeeInstallFunnelEventType) => {
    if (!deviceFingerprint) return
    void postEmployeeInstallFunnelEvent({
      device_fingerprint: deviceFingerprint,
      event,
      occurred_at_ms: Date.now(),
    }).catch(() => undefined)
  }

  // Kurulum prompt'u main.tsx'te global yakalaniyor (window.__pfDeferredInstallPrompt).
  // Android'de tek tusla acmak icin tik aninda o global prompt kullanilir.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!installed && !bannerShownFired) {
      bannerShownFired = true
      fireFunnel('banner_shown')
    }
    const onInstalled = () => {
      setInstalled(true)
      fireFunnel('app_installed')
    }
    window.addEventListener('appinstalled', onInstalled)
    return () => window.removeEventListener('appinstalled', onInstalled)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!deviceFingerprint) return
    if (!isPushSupported()) return
    if (Notification.permission !== 'granted') return
    // Sessiz heal: aboneligi yeniden dogrula ama her acilista test bildirimi atma.
    void enablePushNotifications(deviceFingerprint, { sendTest: false }).catch(() => undefined)
  }, [deviceFingerprint])

  const handleInstall = async () => {
    if (installed) return
    fireFunnel('install_cta_clicked')
    if (ios) {
      fireFunnel('ios_onboarding_opened')
      setIosOpen(true)
      return
    }
    const prompt = window.__pfDeferredInstallPrompt
    if (prompt) {
      fireFunnel('install_prompt_opened')
      await prompt.prompt()
      const choice = await prompt.userChoice
      if (choice.outcome === 'accepted') {
        fireFunnel('install_prompt_accepted')
        setInstalled(true)
        onInfo?.('Uygulama ana ekrana eklendi.')
      } else {
        fireFunnel('install_prompt_dismissed')
      }
      window.__pfDeferredInstallPrompt = null
      return
    }
    onInfo?.('Tarayıcı menüsünden "Ana ekrana ekle" seçeneğini kullanın.')
  }

  const handleNotify = async () => {
    if (notifyBusy) return
    if (permission === 'unsupported' || !isPushSupported()) {
      onInfo?.('Bu cihaz bildirim desteklemiyor.')
      return
    }
    if (permission === 'denied') {
      onInfo?.('Bildirimler engelli. Tarayıcı ayarlarından izin verin.')
      return
    }
    setNotifyBusy(true)
    try {
      await enablePushNotifications(deviceFingerprint)
      setPermission('granted')
      onInfo?.('Bildirimler açıldı.')
    } catch (err) {
      setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
      onInfo?.(parseApiError(err, 'Bildirimler açılamadı.').message)
    } finally {
      setNotifyBusy(false)
    }
  }

  const notifyGranted = permission === 'granted'
  const notifyBlocked = permission === 'denied' || permission === 'unsupported'

  const btn =
    'flex h-full flex-col items-center justify-center gap-1.5 rounded-md border border-rule bg-cream/40 px-3 py-3.5 ' +
    'font-sans text-sm font-semibold text-ink transition-colors hover:border-accent ' +
    'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-rule'

  return (
    <>
      <section className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3 rounded-md border border-rule bg-paper px-3 py-4 shadow-[0_1px_0_rgba(16,42,58,0.03)]">
        <button type="button" onClick={() => void handleInstall()} disabled={installed} className={btn}>
          {installed ? <Check className="h-5 w-5 text-ok" /> : <Plus className="h-5 w-5 text-accent" />}
          <span className="text-center leading-tight">{installed ? 'Ana ekranda' : 'Ana ekrana ekle'}</span>
        </button>

        <div className="flex flex-col items-center justify-center px-1">
          <YabujinSpinner size={84} />
        </div>

        <button
          type="button"
          onClick={() => void handleNotify()}
          disabled={notifyGranted || notifyBlocked || notifyBusy}
          className={btn}
        >
          {notifyBusy ? (
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
          ) : notifyGranted ? (
            <BellRing className="h-5 w-5 text-ok" />
          ) : (
            <Bell className="h-5 w-5 text-ink/80" />
          )}
          <span className="text-center leading-tight">
            {notifyGranted ? 'Bildirim açık' : notifyBlocked ? 'Bildirim kapalı' : 'Bildirimleri aç'}
          </span>
        </button>
      </section>

      <SheetModal open={iosOpen} title="Ana ekrana ekle" subtitle="iPhone / iPad" onClose={() => setIosOpen(false)}>
        <ol className="space-y-3">
          <li className="flex items-start gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-accent">1</span>
            <p className="font-sans text-sm text-ink/80">
              Safari'de alttaki <Share className="inline h-4 w-4 -mt-0.5 text-accent" /> <b>Paylaş</b> simgesine dokunun.
            </p>
          </li>
          <li className="flex items-start gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-accent">2</span>
            <p className="font-sans text-sm text-ink/80">
              Açılan menüde <SquarePlus className="inline h-4 w-4 -mt-0.5 text-accent" /> <b>Ana Ekrana Ekle</b>'ye dokunun.
            </p>
          </li>
          <li className="flex items-start gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-accent">3</span>
            <p className="font-sans text-sm text-ink/80">Sağ üstten <b>Ekle</b>'ye dokunun. Uygulama ana ekranınıza eklenir.</p>
          </li>
        </ol>
        <p className="mt-4 rounded-md border border-rule bg-cream/40 px-3 py-2 font-sans text-xs text-ink/55">
          Not: iPhone'da bu adım yalnızca Safari tarayıcısında çalışır.
        </p>
      </SheetModal>
    </>
  )
}
