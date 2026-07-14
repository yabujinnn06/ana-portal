/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{
    revision: string | null
    url: string
  }>
}

self.skipWaiting()
clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

function parsePushPayload(event: PushEvent): {
  title: string
  body: string
  data: Record<string, unknown>
} {
  const fallback = {
    title: 'Puantaj Bildirimi',
    body: 'Yeni bir puantaj bildirimi var.',
    data: {} as Record<string, unknown>,
  }

  if (!event.data) {
    return fallback
  }

  try {
    const parsed = event.data.json() as {
      title?: string
      body?: string
      data?: Record<string, unknown>
    }
    return {
      title: parsed.title?.trim() || fallback.title,
      body: parsed.body?.trim() || fallback.body,
      data: parsed.data ?? {},
    }
  } catch {
    try {
      const textBody = event.data.text().trim()
      return {
        title: fallback.title,
        body: textBody || fallback.body,
        data: {},
      }
    } catch {
      return fallback
    }
  }
}

function coerceBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'evet') {
      return true
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'hayir') {
      return false
    }
  }
  return fallback
}

function parseVibratePattern(value: unknown): number[] | undefined {
  if (Array.isArray(value)) {
    const parsed = value
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item >= 0)
      .slice(0, 8)
      .map((item) => Math.trunc(item))
    return parsed.length > 0 ? parsed : undefined
  }
  if (typeof value === 'string') {
    const parsed = value
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item) && item >= 0)
      .slice(0, 8)
      .map((item) => Math.trunc(item))
    return parsed.length > 0 ? parsed : undefined
  }
  return undefined
}

function buildNotificationOptions(payload: {
  title: string
  body: string
  data: Record<string, unknown>
}): NotificationOptions {
  const now = Date.now()
  const rawTag = typeof payload.data.tag === 'string' ? payload.data.tag.trim() : ''
  const vibrate = parseVibratePattern(payload.data.vibrate) ?? [240, 120, 240, 120, 320]

  return {
    body: payload.body,
    icon: '/employee/icons/icon-192.png',
    badge: '/employee/icons/icon-192.png',
    data: payload.data,
    requireInteraction: coerceBoolean(payload.data.requireInteraction, true),
    tag: rawTag || `employee-push-${now}`,
    vibrate,
    silent: false,
    timestamp: now,
    actions: [
      { action: 'open', title: 'Ac' },
      { action: 'dismiss', title: 'Kapat' },
    ],
  } as NotificationOptions
}

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event)
  const options = buildNotificationOptions(payload)

  event.waitUntil(
    (async () => {
      // Acik olan tum client'lara in-app pop-up icin mesaj at.
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of clients) {
        client.postMessage({ type: 'PUSH_NOTIFICATION', payload })
      }
      // Uygulama acik da olsa kapali da telefona sistem bildirimi goster.
      await self.registration.showNotification(payload.title, options)
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'dismiss') {
    return
  }

  const rawUrl = event.notification.data?.url
  const targetUrl =
    typeof rawUrl === 'string' && rawUrl.trim() ? rawUrl.trim() : '/employee/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        const windowClient = client as WindowClient
        if (windowClient.url.includes('/employee/')) {
          return windowClient.focus()
        }
      }
      return self.clients.openWindow(targetUrl)
    }),
  )
})

// --- Push abonelik dayanikliligi (pushsubscriptionchange icin) ---
// Cihaz parmak izi ve VAPID anahtari IDB'de saklanir; tarayici aboneligi
// dondurdugunde SW arka planda yeniden abone olup backend'e kaydeder.
const PUSH_META_DB = 'pf-push-meta'
const PUSH_META_STORE = 'meta'
const PUSH_META_KEY = 'employee'

interface PushMeta {
  deviceFingerprint: string
  vapidPublicKey: string
}

function openMetaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PUSH_META_DB, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PUSH_META_STORE)) {
        request.result.createObjectStore(PUSH_META_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function savePushMeta(meta: PushMeta): Promise<void> {
  const db = await openMetaDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PUSH_META_STORE, 'readwrite')
    tx.objectStore(PUSH_META_STORE).put(meta, PUSH_META_KEY)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function loadPushMeta(): Promise<PushMeta | null> {
  const db = await openMetaDb()
  const result = await new Promise<PushMeta | null>((resolve, reject) => {
    const tx = db.transaction(PUSH_META_STORE, 'readonly')
    const request = tx.objectStore(PUSH_META_STORE).get(PUSH_META_KEY)
    request.onsuccess = () => resolve((request.result as PushMeta) ?? null)
    request.onerror = () => reject(request.error)
  })
  db.close()
  return result
}

function swUrlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/')
  const raw = self.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index)
  }
  return output
}

self.addEventListener('message', (event) => {
  const data = (event as ExtendableMessageEvent).data as
    | { type?: string; deviceFingerprint?: string; vapidPublicKey?: string }
    | undefined
  if (
    data &&
    data.type === 'PUSH_META' &&
    typeof data.deviceFingerprint === 'string' &&
    typeof data.vapidPublicKey === 'string'
  ) {
    ;(event as ExtendableMessageEvent).waitUntil(
      savePushMeta({ deviceFingerprint: data.deviceFingerprint, vapidPublicKey: data.vapidPublicKey }).catch(
        () => undefined,
      ),
    )
  }
})

self.addEventListener('pushsubscriptionchange', (event) => {
  const evt = event as ExtendableEvent & { oldSubscription?: PushSubscription | null }
  evt.waitUntil(
    (async () => {
      try {
        const meta = await loadPushMeta()
        const oldKey = (evt.oldSubscription?.options?.applicationServerKey ?? null) as BufferSource | null
        const applicationServerKey =
          oldKey ??
          (meta?.vapidPublicKey
            ? (swUrlBase64ToUint8Array(meta.vapidPublicKey) as unknown as BufferSource)
            : null)
        if (!applicationServerKey || !meta?.deviceFingerprint) {
          return
        }
        const newSubscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        })
        await fetch(`${self.location.origin}/api/employee/push/subscribe`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_fingerprint: meta.deviceFingerprint,
            subscription: newSubscription.toJSON(),
            send_test: false,
          }),
        })
      } catch {
        // best effort: sonraki uygulama acilisinda heal devreye girer
      }
    })(),
  )
})
