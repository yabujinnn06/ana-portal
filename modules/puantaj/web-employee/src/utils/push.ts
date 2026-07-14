// Push abonelik akisi (admin panelinin calisana bildirim gonderebilmesi icin).
// v1 HomePage'deki mantik yeniden kullanilabilir hale getirildi.
import { getEmployeePushConfig, subscribeEmployeePush } from '../api/attendance'

const PUSH_VAPID_KEY_STORAGE = 'pf_push_vapid_public_key'
const RETRYABLE_STATUS = new Set([404, 410])

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.isSecureContext) &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  )
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index)
  }
  return outputArray
}

function isRetryable(statusCode: number | null | undefined): boolean {
  return typeof statusCode === 'number' && RETRYABLE_STATUS.has(statusCode)
}

function failureMessage(statusCode: number | null | undefined, rawError: string | null | undefined): string {
  if (statusCode === 410 || statusCode === 404) {
    return 'Bildirim aboneliği süresi dolmuş. Lütfen tekrar deneyin.'
  }
  const statusPart = typeof statusCode === 'number' ? ` (durum ${statusCode})` : ''
  const errorPart = rawError?.trim() ? ` ${rawError.trim()}` : ''
  return `Sunucu push testi başarısız${statusPart}.${errorPart}`.trim()
}

// Bildirim iznini alir, push aboneligini olusturur ve backend'e kaydeder.
// Hata durumunda Turkce mesajli Error firlatir.
export async function enablePushNotifications(
  deviceFingerprint: string,
  options: { sendTest?: boolean } = {},
): Promise<void> {
  const sendTest = options.sendTest ?? true
  if (!isPushSupported()) {
    throw new Error('Bu tarayıcı bildirim aboneliğini desteklemiyor veya güvenli bağlantı (HTTPS) yok.')
  }

  const permission =
    Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Bildirim izni verilmedi.')
  }

  const config = await getEmployeePushConfig()
  if (!config.enabled || !config.vapid_public_key) {
    throw new Error('Bildirim servisi şu anda aktif değil.')
  }
  const vapidPublicKey = config.vapid_public_key

  const registration = await navigator.serviceWorker.ready
  const savedVapidKey = window.localStorage.getItem(PUSH_VAPID_KEY_STORAGE)
  let subscription = await registration.pushManager.getSubscription()

  const ensureSubscription = async (forceRefresh: boolean): Promise<PushSubscription> => {
    let current = subscription
    const vapidMismatch = Boolean(current) && Boolean(savedVapidKey) && savedVapidKey !== vapidPublicKey
    if (current && (forceRefresh || vapidMismatch)) {
      try {
        await current.unsubscribe()
      } catch {
        // abonelik zaten kopuk olabilir
      }
      current = null
    }
    if (!current) {
      current = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as BufferSource,
      })
    }
    subscription = current
    return current
  }

  let ensured = await ensureSubscription(false)
  let result = await subscribeEmployeePush({
    device_fingerprint: deviceFingerprint,
    subscription: ensured.toJSON() as Record<string, unknown>,
    send_test: sendTest,
  })

  if (sendTest && result.test_push_ok === false && isRetryable(result.test_push_status_code)) {
    ensured = await ensureSubscription(true)
    result = await subscribeEmployeePush({
      device_fingerprint: deviceFingerprint,
      subscription: ensured.toJSON() as Record<string, unknown>,
      send_test: true,
    })
  }

  if (sendTest && result.test_push_ok === false) {
    throw new Error(failureMessage(result.test_push_status_code, result.test_push_error))
  }

  window.localStorage.setItem(PUSH_VAPID_KEY_STORAGE, vapidPublicKey)

  // SW pushsubscriptionchange'de arka planda yeniden abone olabilsin diye meta'yi sakla.
  registration.active?.postMessage({
    type: 'PUSH_META',
    deviceFingerprint,
    vapidPublicKey,
  })
}
