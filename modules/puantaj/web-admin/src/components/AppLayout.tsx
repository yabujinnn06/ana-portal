import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'

import {
  getAdminPushConfig,
  getEmployees,
  getNotificationDeliveryLogs,
  getNotificationJobs,
  healAdminDevice,
} from '../api/admin'
import {
  adminNavSections,
  adminPageTitles,
  type AdminNavItem,
} from '../config/adminNavigation'
import { UI_BRANDING } from '../config/ui'
import { runWithSystemTransition } from '../lib/systemTransition'
import { AdminPresenceBar } from './AdminPresenceBar'
import { BlurFade } from './magicui/blur-fade'
import { useAuth } from '../hooks/useAuth'
import type {
  Employee,
  NotificationDeliveryLog,
  NotificationJob,
  NotificationJobStatus,
} from '../types/api'
import { urlBase64ToUint8Array } from '../utils/push'

const PUSH_VAPID_KEY_STORAGE = 'pf_admin_push_vapid_public_key'
const ADMIN_AUTO_HEAL_TS_STORAGE = 'pf_admin_push_auto_heal_ts'
const ADMIN_AUTO_HEAL_INTERVAL_MS = 10 * 60 * 1000
const NOTIFICATION_DRAWER_REFRESH_MS = 30 * 1000
const NOTIFICATION_DRAWER_PAGE_SIZE = 20
const NOTIFICATION_DELIVERY_LOG_BASE_LIMIT = 120
const NOTIFICATION_DELIVERY_LOG_MAX_LIMIT = 500
const notificationDateTimeFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

type AdminNotificationDrawerSummary = {
  jobs: NotificationJob[]
  logs: NotificationDeliveryLog[]
  employees: Employee[]
  activeCount: number
  failedCount: number
  totalJobs: number
}

function notificationStatusLabel(status: NotificationJobStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Bekliyor'
    case 'SENDING':
      return 'Gönderiliyor'
    case 'SENT':
      return 'Gönderildi'
    case 'CANCELED':
      return 'İptal'
    case 'FAILED':
      return 'Başarısız'
    default:
      return status
  }
}

function notificationStatusClass(status: NotificationJobStatus): string {
  switch (status) {
    case 'SENT':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'FAILED':
      return 'border-rose-200 bg-rose-50 text-rose-700'
    case 'PENDING':
    case 'SENDING':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    case 'CANCELED':
      return 'border-slate-200 bg-slate-100 text-slate-600'
    default:
      return 'border-slate-200 bg-slate-100 text-slate-600'
  }
}

function notificationDeliveryStatusLabel(
  status: NotificationDeliveryLog['status'],
): string {
  switch (status) {
    case 'SENT':
      return 'Gitti'
    case 'FAILED':
      return 'Gitmedi'
    case 'PENDING':
      return 'Bekliyor'
    default:
      return status
  }
}

function notificationDeliveryStatusClass(
  status: NotificationDeliveryLog['status'],
): string {
  switch (status) {
    case 'SENT':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'FAILED':
      return 'border-rose-200 bg-rose-50 text-rose-700'
    case 'PENDING':
      return 'border-amber-200 bg-amber-50 text-amber-700'
    default:
      return 'border-slate-200 bg-slate-100 text-slate-600'
  }
}

function formatNotificationChannel(
  channel: NotificationDeliveryLog['channel'],
): string {
  return channel === 'email' ? 'E-posta' : 'Push'
}

function formatNotificationDeliveryRecipient(
  log: NotificationDeliveryLog,
): string {
  const roleLabel = log.recipient_type === 'admin' ? 'Admin' : 'Çalışan'
  const fallback =
    log.recipient_id !== null && log.recipient_id !== undefined
      ? `#${log.recipient_id}`
      : 'Bilinmeyen alıcı'
  return `${roleLabel}: ${log.recipient_name?.trim() || fallback}`
}

function formatNotificationDate(value: string | null | undefined): string {
  if (!value) {
    return '-'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return notificationDateTimeFormatter.format(parsed)
}

function getNotificationRecipient(
  job: NotificationJob,
  employeeNameById: Map<number, string>,
): string {
  if (job.employee_id) {
    return employeeNameById.get(job.employee_id) ?? `Çalışan #${job.employee_id}`
  }
  if (job.admin_user_id) {
    return `Admin #${job.admin_user_id}`
  }
  return job.audience === 'admin' ? 'Admin kullanıcıları' : 'Tüm çalışanlar'
}

function getNotificationDeliveryTarget(
  job: NotificationJob,
  logsByJobId: Map<number, NotificationDeliveryLog[]>,
): string {
  const relatedLogs = logsByJobId.get(job.id) ?? []
  const namedRecipient = relatedLogs.find((log) => log.recipient_name)
  if (namedRecipient?.recipient_name) {
    return `Alıcı: ${namedRecipient.recipient_name}`
  }
  return job.audience === 'admin' ? 'Alıcı: Adminler' : 'Alıcı: Çalışanlar'
}

function getNotificationDeliverySummary(
  job: NotificationJob,
  logsByJobId: Map<number, NotificationDeliveryLog[]>,
): string {
  const relatedLogs = logsByJobId.get(job.id) ?? []
  if (relatedLogs.length === 0) {
    if (job.status === 'PENDING' || job.status === 'SENDING') {
      return 'Teslim kaydı henüz oluşmadı.'
    }
    if (job.status === 'FAILED') {
      return job.last_error ?? 'Gönderim teslim kaydı oluşmadan başarısız oldu.'
    }
    return 'Teslim kaydı yok.'
  }

  const sent = relatedLogs.filter((log) => log.status === 'SENT').length
  const failed = relatedLogs.filter((log) => log.status === 'FAILED').length
  const pending = relatedLogs.filter((log) => log.status === 'PENDING').length
  return `${sent} gitti, ${failed} gitmedi, ${pending} bekliyor`
}

function formatNotificationBadgeCount(count: number): string {
  if (count > 99) {
    return '99+'
  }
  return String(count)
}

async function autoHealAdminPushClaim(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return
  }
  if (Notification.permission !== 'granted') {
    return
  }

  const pushConfig = await getAdminPushConfig()
  if (!pushConfig.enabled || !pushConfig.vapid_public_key) {
    return
  }

  const swUrl = `${import.meta.env.BASE_URL}admin-sw.js`
  const registration = await navigator.serviceWorker.register(swUrl, {
    scope: import.meta.env.BASE_URL,
  })

  let subscription = await registration.pushManager.getSubscription()
  const savedVapidKey = window.localStorage.getItem(PUSH_VAPID_KEY_STORAGE)
  if (
    subscription &&
    savedVapidKey &&
    savedVapidKey !== pushConfig.vapid_public_key
  ) {
    try {
      await subscription.unsubscribe()
    } catch {
      // best effort
    }
    subscription = null
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        pushConfig.vapid_public_key,
      ) as unknown as BufferSource,
    })
  }

  await healAdminDevice({
    subscription: subscription.toJSON() as Record<string, unknown>,
    send_test: false,
  })
  window.localStorage.setItem(
    PUSH_VAPID_KEY_STORAGE,
    pushConfig.vapid_public_key,
  )
  window.sessionStorage.setItem(ADMIN_AUTO_HEAL_TS_STORAGE, String(Date.now()))
}

function AdminNotificationDrawer({
  isOpen,
  onClose,
  summary,
  isLoading,
  isError,
  canLoadMore,
  isFetchingMore,
  onLoadMore,
  canOpenNotificationCenter,
}: {
  isOpen: boolean
  onClose: () => void
  summary: AdminNotificationDrawerSummary | undefined
  isLoading: boolean
  isError: boolean
  canLoadMore: boolean
  isFetchingMore: boolean
  onLoadMore: () => void
  canOpenNotificationCenter: boolean
}) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const loadMoreLockRef = useRef(false)
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null)
  const logsByJobId = useMemo(() => {
    const result = new Map<number, NotificationDeliveryLog[]>()
    for (const log of summary?.logs ?? []) {
      if (!log.notification_job_id) {
        continue
      }
      const current = result.get(log.notification_job_id) ?? []
      current.push(log)
      result.set(log.notification_job_id, current)
    }
    return result
  }, [summary?.logs])
  const employeeNameById = useMemo(() => {
    return new Map(
      (summary?.employees ?? []).map((employee) => [
        employee.id,
        employee.full_name,
      ]),
    )
  }, [summary?.employees])
  const jobs = summary?.jobs ?? []
  const totalJobs = summary?.totalJobs ?? 0
  const openCount = summary?.activeCount ?? 0
  const failedCount = summary?.failedCount ?? 0

  useEffect(() => {
    if (!isFetchingMore) {
      loadMoreLockRef.current = false
    }
  }, [isFetchingMore])

  const handleClose = useCallback(() => {
    setExpandedJobId(null)
    loadMoreLockRef.current = false
    onClose()
  }, [onClose])

  const handleDrawerScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (
      !container ||
      !canLoadMore ||
      isFetchingMore ||
      loadMoreLockRef.current
    ) {
      return
    }
    const remaining =
      container.scrollHeight - container.scrollTop - container.clientHeight
    if (remaining < 180) {
      loadMoreLockRef.current = true
      onLoadMore()
    }
  }, [canLoadMore, isFetchingMore, onLoadMore])

  if (!isOpen) {
    return null
  }

  return (
    <div className="admin-notif-overlay">
      <button
        type="button"
        aria-label="Bildirim çekmecesini kapat"
        className="admin-notif-overlay__scrim"
        onClick={handleClose}
      />
      <aside className="admin-notif-drawer" aria-label="Bildirim çekmecesi">
        <header className="admin-notif-drawer__head">
          <div className="admin-notif-drawer__title">
            <p className="admin-notif-kicker">
              <span className="admin-notif-kicker__dot" aria-hidden="true" />
              Admin bildirimleri
            </p>
            <h3>Gelen ve gitmeyen bildirimler</h3>
          </div>
          <button
            type="button"
            className="admin-notif-close"
            onClick={handleClose}
            aria-label="Bildirim çekmecesini kapat"
          >
            ✕
          </button>
        </header>
        <div className="admin-notif-stats">
          <article className="admin-notif-stat is-pending">
            <strong>{openCount}</strong>
            <span>Bekleyen</span>
          </article>
          <article className="admin-notif-stat is-failed">
            <strong>{failedCount}</strong>
            <span>Gitmedi</span>
          </article>
          <article className="admin-notif-stat">
            <strong>
              {jobs.length}/{totalJobs}
            </strong>
            <span>Gösterilen</span>
          </article>
        </div>

        <div
          ref={scrollContainerRef}
          className="admin-notif-body"
          onScroll={handleDrawerScroll}
        >
          {isLoading ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              Bildirimler yükleniyor...
            </p>
          ) : null}
          {isError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
              Bildirim özeti alınamadı.
            </p>
          ) : null}
          {!isLoading && !isError && jobs.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              Henüz bildirim işi yok.
            </p>
          ) : null}
          <div className="space-y-3">
            {jobs.map((job) => {
              const relatedLogs = logsByJobId.get(job.id) ?? []
              const previewLogs = relatedLogs.slice(0, 3)
              const isExpanded = expandedJobId === job.id
              const detailsId = `notification-job-${job.id}-details`

              return (
                <article
                  key={job.id}
                  className={`rounded-lg border p-3 shadow-sm transition ${
                    isExpanded
                      ? 'border-slate-300 bg-slate-50/70'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <button
                    type="button"
                    className="block w-full text-left"
                    aria-expanded={isExpanded}
                    aria-controls={detailsId}
                    onClick={() =>
                      setExpandedJobId((current) =>
                        current === job.id ? null : job.id,
                      )
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">
                          {getNotificationRecipient(job, employeeNameById)}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {formatNotificationDate(
                            job.event_ts_utc ?? job.created_at,
                          )}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${notificationStatusClass(
                          job.status,
                        )}`}
                      >
                        {notificationStatusLabel(job.status)}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-medium text-slate-800">
                      {job.title ?? job.notification_type ?? job.job_type}
                    </p>
                    {job.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                        {job.description}
                      </p>
                    ) : null}
                    <div className="mt-2 rounded-md bg-white px-2 py-1.5 text-xs text-slate-600 ring-1 ring-slate-200">
                      <p>{getNotificationDeliveryTarget(job, logsByJobId)}</p>
                      <p className="mt-0.5">
                        {getNotificationDeliverySummary(job, logsByJobId)}
                      </p>
                    </div>
                    {previewLogs.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {previewLogs.map((log) => (
                          <span
                            key={log.id}
                            className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${notificationDeliveryStatusClass(
                              log.status,
                            )}`}
                          >
                            <span className="truncate">
                              {formatNotificationDeliveryRecipient(log)}
                            </span>
                            <span className="shrink-0">
                              {notificationDeliveryStatusLabel(log.status)}
                            </span>
                          </span>
                        ))}
                        {relatedLogs.length > previewLogs.length ? (
                          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            +{relatedLogs.length - previewLogs.length}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <span className="mt-2 inline-flex text-xs font-semibold text-slate-700">
                      {isExpanded ? 'Küçült' : 'Detayı aç'}
                    </span>
                  </button>

                  {isExpanded ? (
                    <div
                      id={detailsId}
                      className="mt-3 border-t border-slate-200 pt-3"
                    >
                      <div className="grid gap-2 text-xs text-slate-600">
                        <div className="rounded-md bg-white px-2 py-1.5 ring-1 ring-slate-200">
                          <span className="font-semibold text-slate-800">
                            Tür:
                          </span>{' '}
                          {job.notification_type ?? job.job_type}
                        </div>
                        <div className="rounded-md bg-white px-2 py-1.5 ring-1 ring-slate-200">
                          <span className="font-semibold text-slate-800">
                            Risk:
                          </span>{' '}
                          {job.risk_level ?? '-'}
                        </div>
                        <div className="rounded-md bg-white px-2 py-1.5 ring-1 ring-slate-200">
                          <span className="font-semibold text-slate-800">
                            Gün:
                          </span>{' '}
                          {job.local_day ?? '-'}
                        </div>
                        <div className="rounded-md bg-white px-2 py-1.5 ring-1 ring-slate-200">
                          <span className="font-semibold text-slate-800">
                            Deneme:
                          </span>{' '}
                          {job.attempts}
                        </div>
                      </div>

                      {job.shift_summary ||
                      job.actual_time_summary ||
                      job.suggested_action ? (
                        <div className="mt-3 space-y-1.5 rounded-md bg-white px-2 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
                          {job.shift_summary ? (
                            <p>{job.shift_summary}</p>
                          ) : null}
                          {job.actual_time_summary ? (
                            <p>{job.actual_time_summary}</p>
                          ) : null}
                          {job.suggested_action ? (
                            <p className="font-medium text-slate-800">
                              {job.suggested_action}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {job.last_error ? (
                        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-2 py-2 text-xs text-rose-700">
                          {job.last_error}
                        </p>
                      ) : null}

                      <div className="mt-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Teslim sonuçları
                        </p>
                        {relatedLogs.length === 0 ? (
                          <p className="mt-2 rounded-md bg-white px-2 py-2 text-xs text-slate-500 ring-1 ring-slate-200">
                            Teslim kaydı henüz oluşmadı.
                          </p>
                        ) : (
                          <div className="mt-2 space-y-2">
                            {relatedLogs.map((log) => (
                              <div
                                key={log.id}
                                className="rounded-md bg-white px-2 py-2 text-xs ring-1 ring-slate-200"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate font-semibold text-slate-800">
                                      {formatNotificationDeliveryRecipient(log)}
                                    </p>
                                    <p className="mt-0.5 text-slate-500">
                                      {formatNotificationChannel(log.channel)} /{' '}
                                      {formatNotificationDate(log.sent_at_utc)}
                                    </p>
                                  </div>
                                  <span
                                    className={`shrink-0 rounded-full border px-2 py-0.5 font-semibold ${notificationDeliveryStatusClass(
                                      log.status,
                                    )}`}
                                  >
                                    {notificationDeliveryStatusLabel(
                                      log.status,
                                    )}
                                  </span>
                                </div>
                                {log.error ? (
                                  <p className="mt-1.5 break-words text-rose-700">
                                    {log.error}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>

          {!isLoading && !isError && jobs.length > 0 ? (
            <div className="mt-4">
              {canLoadMore ? (
                <button
                  type="button"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-wait disabled:opacity-70"
                  disabled={isFetchingMore}
                  onClick={onLoadMore}
                >
                  {isFetchingMore ? 'Yükleniyor...' : 'Daha fazla yükle'}
                </button>
              ) : (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
                  Tüm bildirimler yüklendi.
                </p>
              )}
            </div>
          ) : null}
        </div>

        {canOpenNotificationCenter ? (
          <div className="admin-notif-foot">
            <Link to="/notifications" className="admin-notif-foot__btn" onClick={handleClose}>
              Tüm bildirim merkezini aç
            </Link>
          </div>
        ) : null}
      </aside>
    </div>
  )
}

export function AppLayout() {
  const location = useLocation()
  const { user, logout, hasPermission } = useAuth()
  const sidebarRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const mobileNavPendingRef = useRef(false)
  const mobileLoaderTimerRef = useRef<number | null>(null)
  const [showMobileNavLoader, setShowMobileNavLoader] = useState(false)
  const [mobileLoaderMessage, setMobileLoaderMessage] = useState(
    'İçeriğe geçiliyor...',
  )
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] =
    useState(false)
  const [notificationJobLimit, setNotificationJobLimit] = useState(
    NOTIFICATION_DRAWER_PAGE_SIZE,
  )
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && window.localStorage.getItem('pf_admin_sidebar_collapsed') === '1',
  )
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((value) => {
      const next = !value
      window.localStorage.setItem('pf_admin_sidebar_collapsed', next ? '1' : '0')
      return next
    })
  }, [])
  const canViewNotifications = Boolean(user)
  const presenceKey = user ? String(user.admin_user_id ?? user.username ?? user.sub ?? 'admin') : null
  const canOpenNotificationCenter = hasPermission('notifications')
  const canWriteNotifications = hasPermission('notifications', 'write')
  const notificationDrawerQuery = useQuery({
    queryKey: [
      'admin-notification-drawer-summary',
      user?.admin_user_id,
      notificationJobLimit,
    ],
    enabled: canViewNotifications,
    refetchInterval: NOTIFICATION_DRAWER_REFRESH_MS,
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<AdminNotificationDrawerSummary> => {
      const deliveryLogLimit = Math.min(
        NOTIFICATION_DELIVERY_LOG_MAX_LIMIT,
        Math.max(
          NOTIFICATION_DELIVERY_LOG_BASE_LIMIT,
          notificationJobLimit * 8,
        ),
      )
      const [jobs, pending, sending, failed, logs, employees] =
        await Promise.all([
          getNotificationJobs({ limit: notificationJobLimit }),
          getNotificationJobs({ status: 'PENDING', limit: 1 }),
          getNotificationJobs({ status: 'SENDING', limit: 1 }),
          getNotificationJobs({ status: 'FAILED', limit: 1 }),
          getNotificationDeliveryLogs({ limit: deliveryLogLimit }),
          getEmployees({ include_inactive: true, status: 'all' }),
        ])

      return {
        jobs: jobs.items,
        logs: logs.items,
        employees,
        activeCount: pending.total + sending.total,
        failedCount: failed.total,
        totalJobs: jobs.total,
      }
    },
  })
  const handleLoadMoreNotifications = useCallback(() => {
    setNotificationJobLimit((current) => {
      const total = notificationDrawerQuery.data?.totalJobs
      if (typeof total === 'number' && current >= total) {
        return current
      }
      return current + NOTIFICATION_DRAWER_PAGE_SIZE
    })
  }, [notificationDrawerQuery.data?.totalJobs])

  const visibleNavSections = adminNavSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.permission || hasPermission(item.permission),
      ),
    }))
    .filter((section) => section.items.length > 0)
  const adminLogoUrl = `${import.meta.env.BASE_URL}admin-logo.svg`

  const title =
    adminPageTitles[location.pathname] ??
    (location.pathname.startsWith('/employees/')
      ? 'Çalışan Detayı'
      : 'Admin Panel')
  const notificationBadgeCount = notificationDrawerQuery.data?.activeCount ?? 0

  const isMobileViewport = () =>
    typeof window !== 'undefined' && window.innerWidth < 1024

  const isNavItemActive = (item: AdminNavItem) => {
    if (location.pathname === item.to) {
      return true
    }
    if (item.aliases?.includes(location.pathname)) {
      return true
    }
    return item.to !== '/' && location.pathname.startsWith(`${item.to}/`)
  }

  const getNavLinkClassName = (item: AdminNavItem) => {
    const isActive = isNavItemActive(item)
    return `admin-nav-link relative rounded-xl border px-3 py-2.5 text-sm font-medium tracking-tight transition duration-150 ${
      isActive
        ? 'border-transparent text-white'
        : 'border-transparent text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-white'
    }`
  }

  const clearMobileLoaderTimer = useCallback(() => {
    if (mobileLoaderTimerRef.current === null) {
      return
    }
    window.clearTimeout(mobileLoaderTimerRef.current)
    mobileLoaderTimerRef.current = null
  }, [])

  const runMobileTransition = useCallback(
    (target: 'content' | 'sidebar', label: string) => {
      setMobileLoaderMessage(label)
      setShowMobileNavLoader(true)
      if (target === 'content') {
        contentRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      } else {
        sidebarRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
      }
      clearMobileLoaderTimer()
      mobileLoaderTimerRef.current = window.setTimeout(() => {
        setShowMobileNavLoader(false)
      }, 1200)
    },
    [clearMobileLoaderTimer],
  )

  const handleMobileNavClick = (targetPath: string) => {
    if (!isMobileViewport()) {
      return
    }

    if (location.pathname === targetPath) {
      window.requestAnimationFrame(() => {
        runMobileTransition('content', 'İçeriğe geçiliyor...')
      })
      return
    }

    setMobileLoaderMessage('İçeriğe geçiliyor...')
    setShowMobileNavLoader(true)
    mobileNavPendingRef.current = true
  }

  const handleMobileSidebarJump = () => {
    if (!isMobileViewport()) {
      return
    }
    window.requestAnimationFrame(() => {
      runMobileTransition('sidebar', "Sidebar'a dönülüyor...")
    })
  }

  useEffect(() => {
    if (!isMobileViewport()) {
      return
    }
    window.scrollTo({ top: 0 })
  }, [])

  useEffect(() => {
    if (!canWriteNotifications) {
      return
    }
    const lastAttemptRaw = window.sessionStorage.getItem(
      ADMIN_AUTO_HEAL_TS_STORAGE,
    )
    const lastAttempt = lastAttemptRaw ? Number(lastAttemptRaw) : 0
    if (Number.isFinite(lastAttempt) && lastAttempt > 0) {
      const elapsedMs = Date.now() - lastAttempt
      if (elapsedMs < ADMIN_AUTO_HEAL_INTERVAL_MS) {
        return
      }
    }
    void autoHealAdminPushClaim().catch(() => {
      // silent fallback: explicit heal action is still available in notifications page
    })
  }, [canWriteNotifications, user?.admin_user_id, user?.username])

  useEffect(() => {
    if (!mobileNavPendingRef.current) {
      return
    }
    mobileNavPendingRef.current = false
    window.requestAnimationFrame(() => {
      runMobileTransition('content', 'İçeriğe geçiliyor...')
    })
  }, [location.pathname, runMobileTransition])

  useEffect(() => {
    return () => {
      clearMobileLoaderTimer()
    }
  }, [clearMobileLoaderTimer])

  return (
    <div
      className={`admin-shell min-h-screen bg-slate-100 lg:grid ${
        sidebarCollapsed ? 'lg:grid-cols-1' : 'lg:grid-cols-[228px_minmax(0,1fr)]'
      }`}
    >
      {showMobileNavLoader ? (
        <div
          className="mobile-nav-loader lg:hidden"
          role="status"
          aria-live="polite"
          aria-label="Sayfa geçişi"
        >
          <div className="mobile-nav-loader-logo" aria-hidden="true">
            <div className="mobile-nav-loader-halo" />
            <div className="mobile-nav-loader-ring" />
            <div className="mobile-nav-loader-spark" />
            <div className="mobile-nav-loader-core">
              <span className="mobile-nav-loader-brand">YABUJIN</span>
              <span className="mobile-nav-loader-sub">CONTROL CORE</span>
            </div>
          </div>
          <p className="mobile-nav-loader-text">{mobileLoaderMessage}</p>
        </div>
      ) : null}

      <aside
        ref={sidebarRef}
        className={`admin-sidebar flex flex-col px-3 py-6 text-slate-100 shadow-panel xl:px-4 ${
          sidebarCollapsed ? 'lg:hidden' : ''
        }`}
      >
        <BlurFade delay={0}>
          <div className="admin-brand px-2">
            <img
              src={adminLogoUrl}
              alt="Yabujin admin logosu"
              className="admin-brand__mark"
            />
            <div className="min-w-0">
              <h1 className="admin-brand__title">
                Puantaj<span className="admin-brand__title-sub">RW</span>
              </h1>
              <p className="admin-brand__subtitle">Yönetim Konsolu</p>
            </div>
          </div>
        </BlurFade>
        <nav className="admin-nav mt-6" aria-label="Admin navigation">
          {visibleNavSections.map((section, sectionIndex) => (
            <BlurFade
              key={section.key}
              delay={0.05 * (sectionIndex + 1)}
              offset={4}
              blur="4px"
              duration={0.35}
            >
              <section className="admin-nav-section" aria-label={section.label}>
                <p className="admin-nav-section__label">{section.label}</p>
                <div className="flex flex-col gap-1">
                  {section.items.map((item) => {
                    const isActive = isNavItemActive(item)
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => handleMobileNavClick(item.to)}
                        className={getNavLinkClassName(item)}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        {isActive ? (
                          <motion.span
                            layoutId="admin-nav-active-pill"
                            className="absolute inset-0 rounded-xl border border-white/10 bg-white/10 shadow-[0_10px_24px_rgba(2,16,28,0.24)]"
                            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                          />
                        ) : null}
                        <span className="relative z-10">{item.label}</span>
                      </NavLink>
                    )
                  })}
                </div>
              </section>
            </BlurFade>
          ))}
        </nav>
        {UI_BRANDING.showSignature ? (
          <div className="admin-signature">
            <p className="admin-signature-main">{UI_BRANDING.signatureText}</p>
            <p className="admin-signature-sub">
              {UI_BRANDING.signatureTagline}
            </p>
          </div>
        ) : null}
      </aside>

      <div ref={contentRef} className="flex min-h-screen min-w-0 flex-col">
        <header className="admin-topbar sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? 'Menüyü göster' : 'Menüyü gizle'}
              title={sidebarCollapsed ? 'Menüyü göster' : 'Menüyü gizle'}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-100 lg:inline-flex"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="9" y1="4" x2="9" y2="20" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold tracking-tight text-slate-900">
                {title}
              </h2>
              <p className="truncate text-xs text-slate-500">
                Oturum: {user?.username ?? user?.sub ?? 'admin'} / Rol:{' '}
                {user?.role ?? 'admin'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {canViewNotifications ? <AdminPresenceBar currentKey={presenceKey} /> : null}
              <button
                type="button"
                onClick={handleMobileSidebarJump}
                className="btn-animated rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 lg:hidden"
              >
                Sidebar'a Git
              </button>
              {canViewNotifications ? (
                <button
                  type="button"
                  onClick={() => setIsNotificationDrawerOpen(true)}
                  className="relative rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  aria-label={`Bildirim çekmecesini aç, ${notificationBadgeCount} aksiyon bekliyor`}
                >
                  Bildirimler
                  {notificationBadgeCount > 0 ? (
                    <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-rose-600 px-1.5 py-0.5 text-center text-[11px] font-bold leading-none text-white">
                      {formatNotificationBadgeCount(notificationBadgeCount)}
                    </span>
                  ) : null}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void runWithSystemTransition('exit', 'Çıkış yapılıyor...', () => logout())}
                className="btn-animated rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
              >
                Çıkış
              </button>
            </div>
          </div>
        </header>

        <main className="admin-main min-w-0 flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
        {UI_BRANDING.showSignature ? (
          <footer className="admin-footer-signature px-6 pb-4 pt-1 text-center text-xs tracking-wide text-slate-500">
            <span className="admin-footer-brand">
              {UI_BRANDING.signatureText}
            </span>
            <span className="admin-footer-sub">
              {UI_BRANDING.signatureTagline}
            </span>
            <span className="admin-footer-build">
              BUILD: {UI_BRANDING.buildVersion}
            </span>
          </footer>
        ) : null}
      </div>
      <AdminNotificationDrawer
        isOpen={isNotificationDrawerOpen}
        onClose={() => setIsNotificationDrawerOpen(false)}
        summary={notificationDrawerQuery.data}
        isLoading={notificationDrawerQuery.isLoading}
        isError={notificationDrawerQuery.isError}
        canLoadMore={
          (notificationDrawerQuery.data?.jobs.length ?? 0) <
          (notificationDrawerQuery.data?.totalJobs ?? 0)
        }
        isFetchingMore={
          notificationDrawerQuery.isFetching && Boolean(notificationDrawerQuery.data)
        }
        onLoadMore={handleLoadMoreNotifications}
        canOpenNotificationCenter={canOpenNotificationCenter}
      />
    </div>
  )
}
