import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'

import {
  cancelNotificationJob,
  createAdminDeviceInvite,
  downloadDailyReportArchive,
  getAdminDailyReportHealth,
  getAdminNotificationSubscriptions,
  getAdminPushConfig,
  getAdminPushSelfCheck,
  getAttendanceEvents,
  getAdminUsers,
  getDailyReportArchives,
  getEmployees,
  healAdminDevice,
  getNotificationDeliveryLogs,
  getNotificationJobs,
  getNotificationSubscriptions,
  notifyDailyReportArchive,
  sendAdminPushSelfTest,
  sendManualNotification,
  updateNotificationJobNote,
} from '../api/admin'
import { parseApiError } from '../api/error'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { PageHeader } from '../components/PageHeader'
import { Panel } from '../components/Panel'
import { Button } from '../components/Button'
import { StatCard } from '../components/StatCard'
import { DefinitionList } from '../components/DefinitionList'
import { UI_BRANDING } from '../config/ui'
import { NotificationTaskManager } from '../components/notifications/NotificationTaskManager'
import { TableSearchInput } from '../components/TableSearchInput'
import { useAuth } from '../hooks/useAuth'
import { usePageVisibility } from '../hooks/usePageVisibility'
import { useToast } from '../hooks/useToast'
import type {
  AdminDailyReportJobHealth,
  AdminDeviceHealResponse,
  AdminDeviceInviteCreateResponse,
  AttendanceEvent,
  NotificationDeliveryLog,
  NotificationJob,
  NotificationJobStatus,
} from '../types/api'
import { urlBase64ToUint8Array } from '../utils/push'

function dt(value: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value))
}

function statusClass(status: NotificationJobStatus): string {
  if (status === 'SENT') return 'bg-emerald-100 text-emerald-700'
  if (status === 'FAILED') return 'bg-rose-100 text-rose-700'
  if (status === 'CANCELED') return 'bg-slate-200 text-slate-700'
  if (status === 'SENDING') return 'bg-amber-100 text-amber-700'
  return 'bg-sky-100 text-sky-700'
}

function deliveryStatusClass(status: 'PENDING' | 'SENT' | 'FAILED'): string {
  if (status === 'SENT') return 'bg-emerald-100 text-emerald-700'
  if (status === 'FAILED') return 'bg-rose-100 text-rose-700'
  return 'bg-amber-100 text-amber-700'
}

function audienceLabel(value: string | null | undefined): string {
  if (value === 'admin') return 'ADMIN'
  if (value === 'employee') return 'CALISAN'
  return '-'
}

function riskBadgeClass(value: string | null | undefined): string {
  if (value === 'Kritik') return 'bg-rose-100 text-rose-700'
  if (value === 'Uyari') return 'bg-amber-100 text-amber-700'
  return 'bg-sky-100 text-sky-700'
}

function payloadString(
  payload: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = payload?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function payloadNumber(
  payload: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  const value = payload?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function timelineEventLabel(event: AttendanceEvent): string {
  const rawShiftName =
    typeof event.flags?.SHIFT_NAME === 'string' ? event.flags.SHIFT_NAME : null
  const source =
    event.source === 'MANUAL' || event.created_by_admin ? 'Manuel' : 'Cihaz'
  const typeLabel = event.type === 'IN' ? 'Giriş' : 'Çıkış'
  return rawShiftName
    ? `${typeLabel} • ${source} • ${rawShiftName}`
    : `${typeLabel} • ${source}`
}

function dailyReportAlarmLabel(value: string): string {
  if (value === 'DAILY_REPORT_JOB_MISSING') return 'Job olusmamis'
  if (value === 'DAILY_REPORT_ARCHIVE_MISSING') return 'Arşiv olusmamis'
  if (value === 'DAILY_REPORT_JOB_STUCK') return 'Job takilmis'
  if (value === 'DAILY_REPORT_JOB_FAILED') return 'Job hatali'
  if (value === 'DAILY_REPORT_DELIVERY_EMPTY') return 'Teslimat boş'
  if (value === 'DAILY_REPORT_TARGET_ZERO') return 'Hedef 0'
  if (value === 'DAILY_REPORT_ARCHIVE_MISMATCH') return 'Arşiv eslesmiyor'
  if (value === 'DAILY_REPORT_HEALTH_QUERY_FAILED')
    return 'Health sorgusu hatali'
  return value
}

function dailyReportStatusClass(
  health: AdminDailyReportJobHealth | undefined,
): string {
  if (!health) return 'border-slate-200 bg-slate-50 text-slate-700'
  if ((health.alarms ?? []).length > 0)
    return 'border-rose-200 bg-rose-50 text-rose-800'
  if (!health.job_exists || !health.archive_exists)
    return 'border-amber-200 bg-amber-50 text-amber-800'
  if (health.status === 'SENT' && health.delivery_succeeded)
    return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (health.status === 'FAILED')
    return 'border-rose-200 bg-rose-50 text-rose-800'
  return 'border-sky-200 bg-sky-50 text-sky-800'
}

function downloadBlob(blob: Blob, name: string): void {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

const LIST_PAGE_SIZE = 35
const PUSH_VAPID_KEY_STORAGE = 'pf_admin_push_vapid_public_key'
type HealAdminDeviceResult = AdminDeviceHealResponse & {
  recreatedSubscription: boolean
}
type NotificationSectionKey =
  | 'overview'
  | 'send'
  | 'tasks'
  | 'jobs'
  | 'delivery'
  | 'admin-push'
  | 'archives'

const NOTIFICATION_SECTION_ORDER: NotificationSectionKey[] = [
  'overview',
  'send',
  'tasks',
  'jobs',
  'delivery',
  'admin-push',
  'archives',
]

const BADGE_TONE: Record<'neutral' | 'danger' | 'positive' | 'warning', string> = {
  neutral: 'bg-slate-100 text-slate-600',
  danger: 'bg-rose-100 text-rose-700',
  positive: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
}

function isNotificationSectionKey(
  value: string | null,
): value is NotificationSectionKey {
  return (
    value !== null &&
    NOTIFICATION_SECTION_ORDER.includes(value as NotificationSectionKey)
  )
}

async function ensureAdminPushSubscription(
  vapidPublicKey: string,
  options: { forceNew?: boolean } = {},
): Promise<PushSubscription> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Bu tarayıcı push bildirimlerini desteklemiyor.')
  }

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Bildirim izni verilmedi.')
  }

  const swUrl = `${import.meta.env.BASE_URL}admin-sw.js`
  const registration = await navigator.serviceWorker.register(swUrl, {
    scope: import.meta.env.BASE_URL,
  })

  let subscription = await registration.pushManager.getSubscription()
  const savedVapidKey = window.localStorage.getItem(PUSH_VAPID_KEY_STORAGE)
  if (
    subscription &&
    (options.forceNew ||
      (savedVapidKey !== null && savedVapidKey !== vapidPublicKey))
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
        vapidPublicKey,
      ) as unknown as BufferSource,
    })
  }

  return subscription
}

function isExpiredPushSubscriptionStatus(
  statusCode: number | null | undefined,
): boolean {
  return statusCode === 404 || statusCode === 410
}

export function NotificationsPage() {
  const isPageVisible = usePageVisibility()
  const queryClient = useQueryClient()
  const { pushToast } = useToast()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [title, setTitle] = useState('Puantaj Bildirimi')
  const [message, setMessage] = useState('')
  const [password, setPassword] = useState('')
  const [target, setTarget] = useState<'employees' | 'admins' | 'both'>(
    'employees',
  )
  const [expiresIn, setExpiresIn] = useState(15)
  const [jobsStatus, setJobsStatus] = useState<'' | NotificationJobStatus>('')
  const [jobNotificationType, setJobNotificationType] = useState('')
  const [jobRiskLevel, setJobRiskLevel] = useState<
    '' | 'Bilgi' | 'Uyari' | 'Kritik'
  >('')
  const [jobAudience, setJobAudience] = useState<'' | 'employee' | 'admin'>('')
  const [jobEmployeeId, setJobEmployeeId] = useState('')
  const [jobStartDate, setJobStartDate] = useState('')
  const [jobEndDate, setJobEndDate] = useState('')
  const [jobsPage, setJobsPage] = useState(1)
  const [deliveryPage, setDeliveryPage] = useState(1)
  const [searchEmployee, setSearchEmployee] = useState('')
  const [searchAdmin, setSearchAdmin] = useState('')
  const [selectedEmployees, setSelectedEmployees] = useState<number[]>([])
  const [selectedAdmins, setSelectedAdmins] = useState<number[]>([])
  const [createdInvite, setCreatedInvite] =
    useState<AdminDeviceInviteCreateResponse | null>(null)
  const [archiveStartDate, setArchiveStartDate] = useState('')
  const [archiveEndDate, setArchiveEndDate] = useState('')
  const [archiveEmployeeQuery, setArchiveEmployeeQuery] = useState('')
  const [archivePage, setArchivePage] = useState(1)
  const [deliverySearch, setDeliverySearch] = useState('')
  const [selectedDeliveryLogId, setSelectedDeliveryLogId] = useState<
    number | null
  >(null)
  const [jobNoteDraft, setJobNoteDraft] = useState('')
  const [jobNoteDraftJobId, setJobNoteDraftJobId] = useState<number | null>(
    null,
  )
  const archiveAutoHandledRef = useRef<string | null>(null)
  const requestedJobId = parsePositiveInt(searchParams.get('job_id'))
  const requestedArchiveId = parsePositiveInt(searchParams.get('archive_id'))

  const employeesQuery = useQuery({
    queryKey: ['employees', 'notify'],
    queryFn: () => getEmployees({ status: 'active' }),
  })
  const adminsQuery = useQuery({
    queryKey: ['admin-users', 'notify'],
    queryFn: getAdminUsers,
  })
  const pushConfigQuery = useQuery({
    queryKey: ['admin-push-config'],
    queryFn: getAdminPushConfig,
  })
  const dailyReportHealthQuery = useQuery({
    queryKey: ['admin-daily-report-health'],
    queryFn: getAdminDailyReportHealth,
    refetchInterval: isPageVisible ? 60_000 : false,
    retry: false,
  })
  const adminSelfCheckQuery = useQuery({
    queryKey: ['admin-push-self-check'],
    queryFn: getAdminPushSelfCheck,
    refetchInterval: isPageVisible ? 45_000 : false,
    retry: false,
  })
  const jobsQuery = useQuery({
    queryKey: [
      'notification-jobs',
      jobsStatus,
      jobNotificationType,
      jobRiskLevel,
      jobAudience,
      jobEmployeeId,
      jobStartDate,
      jobEndDate,
      jobsPage,
    ],
    queryFn: () =>
      getNotificationJobs({
        status: jobsStatus || undefined,
        notification_type: jobNotificationType.trim() || undefined,
        risk_level: jobRiskLevel || undefined,
        audience: jobAudience || undefined,
        employee_id:
          Number(jobEmployeeId) > 0 ? Number(jobEmployeeId) : undefined,
        start_date: jobStartDate || undefined,
        end_date: jobEndDate || undefined,
        offset: (jobsPage - 1) * LIST_PAGE_SIZE,
        limit: LIST_PAGE_SIZE,
      }),
    refetchInterval: isPageVisible ? 20_000 : false,
  })
  const deliveryLogsQuery = useQuery({
    queryKey: ['notification-delivery-logs', deliveryPage],
    queryFn: () =>
      getNotificationDeliveryLogs({
        offset: (deliveryPage - 1) * LIST_PAGE_SIZE,
        limit: LIST_PAGE_SIZE,
      }),
    refetchInterval: isPageVisible ? 30_000 : false,
  })
  const employeeSubsQuery = useQuery({
    queryKey: ['notify-subs-emp'],
    queryFn: () => getNotificationSubscriptions({}),
    refetchInterval: isPageVisible ? 45_000 : false,
  })
  const adminSubsQuery = useQuery({
    queryKey: ['notify-subs-admin'],
    queryFn: () => getAdminNotificationSubscriptions({}),
    refetchInterval: isPageVisible ? 45_000 : false,
  })

  const selectedJob: NotificationJob | null = (() => {
    const rows = jobsQuery.data?.items ?? []
    if (requestedJobId !== null) {
      return rows.find((row) => row.id === requestedJobId) ?? rows[0] ?? null
    }
    return rows[0] ?? null
  })()
  const selectedJobTimelineQuery = useQuery({
    queryKey: [
      'notification-job-timeline',
      selectedJob?.id,
      selectedJob?.employee_id,
      selectedJob?.local_day,
    ],
    queryFn: () =>
      getAttendanceEvents({
        employee_id: selectedJob?.employee_id ?? undefined,
        start_date: selectedJob?.local_day ?? undefined,
        end_date: selectedJob?.local_day ?? undefined,
        limit: 50,
      }),
    enabled:
      selectedJob !== null &&
      typeof selectedJob.employee_id === 'number' &&
      selectedJob.employee_id > 0 &&
      typeof selectedJob.local_day === 'string' &&
      selectedJob.local_day.length > 0,
    refetchInterval: isPageVisible ? 30_000 : false,
  })
  const archivesQuery = useQuery({
    queryKey: [
      'daily-archives',
      archiveStartDate,
      archiveEndDate,
      archiveEmployeeQuery,
      archivePage,
    ],
    queryFn: () =>
      getDailyReportArchives({
        offset: (archivePage - 1) * LIST_PAGE_SIZE,
        limit: LIST_PAGE_SIZE,
        start_date: archiveStartDate || undefined,
        end_date: archiveEndDate || undefined,
        employee_query: archiveEmployeeQuery.trim() || undefined,
      }),
  })

  const filteredEmployees = useMemo(() => {
    const q = searchEmployee.trim().toLowerCase()
    if (!q) return employeesQuery.data ?? []
    return (employeesQuery.data ?? []).filter((x) =>
      `${x.id} ${x.full_name}`.toLowerCase().includes(q),
    )
  }, [employeesQuery.data, searchEmployee])

  const filteredAdmins = useMemo(() => {
    const q = searchAdmin.trim().toLowerCase()
    if (!q) return adminsQuery.data ?? []
    return (adminsQuery.data ?? []).filter((x) =>
      `${x.id} ${x.username}`.toLowerCase().includes(q),
    )
  }, [adminsQuery.data, searchAdmin])

  const filteredDeliveryLogs = useMemo(() => {
    const q = deliverySearch.trim().toLowerCase()
    const rows = deliveryLogsQuery.data?.items ?? []
    if (!q) return rows
    return rows.filter((row) => {
      const parts = [
        row.recipient_name ?? '',
        row.recipient_address ?? '',
        String(row.recipient_id ?? ''),
        String(row.device_id ?? ''),
        row.ip ?? '',
        row.status,
        row.channel,
        row.notification_type ?? '',
        row.audience ?? '',
        row.event_id,
        row.title ?? '',
      ]
      return parts.join(' ').toLowerCase().includes(q)
    })
  }, [deliveryLogsQuery.data, deliverySearch])

  const deliverySentCount = useMemo(
    () => filteredDeliveryLogs.filter((row) => row.status === 'SENT').length,
    [filteredDeliveryLogs],
  )
  const deliveryFailedCount = useMemo(
    () => filteredDeliveryLogs.filter((row) => row.status === 'FAILED').length,
    [filteredDeliveryLogs],
  )
  const selectedDeliveryLog = useMemo<NotificationDeliveryLog | null>(
    () => {
      const rows = filteredDeliveryLogs
      if (selectedDeliveryLogId !== null) {
        return rows.find((row) => row.id === selectedDeliveryLogId) ?? rows[0] ?? null
      }
      return rows[0] ?? null
    },
    [filteredDeliveryLogs, selectedDeliveryLogId],
  )

  const jobsRows = jobsQuery.data?.items ?? []
  const jobsTotal = jobsQuery.data?.total ?? 0
  const jobsTotalPages = Math.max(1, Math.ceil(jobsTotal / LIST_PAGE_SIZE))
  const jobsRangeStart =
    jobsTotal === 0 ? 0 : (jobsPage - 1) * LIST_PAGE_SIZE + 1
  const jobsRangeEnd =
    jobsRows.length === 0 ? 0 : jobsRangeStart + jobsRows.length - 1

  const deliveryTotal = deliveryLogsQuery.data?.total ?? 0
  const deliveryTotalPages = Math.max(
    1,
    Math.ceil(deliveryTotal / LIST_PAGE_SIZE),
  )
  const deliveryRangeStart =
    deliveryTotal === 0 ? 0 : (deliveryPage - 1) * LIST_PAGE_SIZE + 1
  const deliveryRangeEnd =
    filteredDeliveryLogs.length === 0
      ? 0
      : deliveryRangeStart + filteredDeliveryLogs.length - 1

  const archiveRows = archivesQuery.data?.items ?? []
  const archiveTotal = archivesQuery.data?.total ?? 0
  const archiveTotalPages = Math.max(
    1,
    Math.ceil(archiveTotal / LIST_PAGE_SIZE),
  )
  const archiveRangeStart =
    archiveTotal === 0 ? 0 : (archivePage - 1) * LIST_PAGE_SIZE + 1
  const archiveRangeEnd =
    archiveRows.length === 0 ? 0 : archiveRangeStart + archiveRows.length - 1
  const activeAdminSubscriptionCount = (adminSubsQuery.data ?? []).length
  const canNotifyAdmins = activeAdminSubscriptionCount > 0
  const currentAdminUsername = (user?.username ?? '').trim().toLowerCase()
  const currentAdminUserId =
    typeof user?.admin_user_id === 'number' && user.admin_user_id > 0
      ? user.admin_user_id
      : null
  const fallbackCurrentAdminClaimBreakdown = useMemo(() => {
    const rows = adminSubsQuery.data ?? []
    let byId = 0
    let byUsername = 0
    let total = 0
    for (const item of rows) {
      const matchesById =
        currentAdminUserId !== null && item.admin_user_id === currentAdminUserId
      const matchesByUsername =
        currentAdminUsername.length > 0 &&
        (item.admin_username || '').trim().toLowerCase() ===
          currentAdminUsername
      if (matchesById) byId += 1
      if (matchesByUsername) byUsername += 1
      if (matchesById || matchesByUsername) total += 1
    }
    return { total, byId, byUsername }
  }, [adminSubsQuery.data, currentAdminUserId, currentAdminUsername])
  const selfCheckData = adminSelfCheckQuery.data
  const selfCheckOk = selfCheckData?.self_check_ok !== false
  const effectiveSelfCheckData = selfCheckOk ? selfCheckData : undefined
  const currentAdminClaimCount =
    effectiveSelfCheckData?.active_claims_for_actor ??
    fallbackCurrentAdminClaimBreakdown.total
  const currentAdminClaimCountById =
    effectiveSelfCheckData?.active_claims_for_actor_by_id ??
    fallbackCurrentAdminClaimBreakdown.byId
  const currentAdminClaimCountByUsername =
    effectiveSelfCheckData?.active_claims_for_actor_by_username ??
    fallbackCurrentAdminClaimBreakdown.byUsername
  const currentAdminHasActiveClaim = currentAdminClaimCount > 0
  const dailyReportHealth = dailyReportHealthQuery.data
  const dailyReportAlarmCount = dailyReportHealth?.alarms?.length ?? 0
  const dailyReportStatusText =
    dailyReportHealth?.status ??
    (dailyReportHealth?.job_exists ? 'BILINMIYOR' : 'YOK')
  const dailyReportIsHealthy =
    dailyReportAlarmCount === 0 &&
    !!dailyReportHealth?.job_exists &&
    !!dailyReportHealth?.archive_exists &&
    dailyReportHealth?.status === 'SENT' &&
    !!dailyReportHealth?.delivery_succeeded
  const requestedSection = searchParams.get('section')
  const activeSection: NotificationSectionKey = isNotificationSectionKey(
    requestedSection,
  )
    ? requestedSection
    : requestedJobId !== null
      ? 'jobs'
      : requestedArchiveId !== null
        ? 'archives'
        : 'overview'
  const notificationSections = useMemo(
    () => [
      {
        key: 'overview' as const,
        label: 'Genel Durum',
        description: 'Sağlık özeti, abonelik ve hızlı yönlendirmeler',
        meta: `${dailyReportAlarmCount > 0 ? `${dailyReportAlarmCount} alarm` : 'Sistem sakin'}`,
      },
      {
        key: 'send' as const,
        label: 'Gönder',
        description: 'Manuel push akışları',
        meta: `${target === 'both' ? 'Çift hedef' : target === 'admins' ? 'Admin hedefi' : 'Çalışan hedefi'}`,
      },
      {
        key: 'tasks' as const,
        label: 'Planlı Görevler',
        description: 'Tekrarlayan ve tek seferlik zamanlayıcı',
        meta: `${employeesQuery.data?.length ?? 0} çalışan / ${adminsQuery.data?.length ?? 0} admin havuzu`,
      },
      {
        key: 'jobs' as const,
        label: 'İş Kuyruğu',
        description: 'Bildirim işi listesi ve detayları',
        meta: `${jobsTotal} kayıt`,
      },
      {
        key: 'delivery' as const,
        label: 'Teslimat',
        description: 'Push teslimat izi',
        meta: `${deliveryFailedCount > 0 ? `${deliveryFailedCount} hata` : 'Hata yok'}`,
      },
      {
        key: 'admin-push' as const,
        label: 'Admin Push',
        description: 'Claim, self-check ve cihaz iyileştirme',
        meta: `${activeAdminSubscriptionCount} aktif claim`,
      },
      {
        key: 'archives' as const,
        label: 'Arşivler',
        description: 'Günlük Excel arşivi ve gece job sağlığı',
        meta: `${archiveTotal} arşiv`,
      },
    ],
    [
      activeAdminSubscriptionCount,
      adminsQuery.data?.length,
      archiveTotal,
      dailyReportAlarmCount,
      deliveryFailedCount,
      employeesQuery.data?.length,
      jobsTotal,
      target,
    ],
  )
  const tabBadge = (
    key: NotificationSectionKey,
  ): { text: string; tone: keyof typeof BADGE_TONE } | null => {
    switch (key) {
      case 'overview':
        return dailyReportAlarmCount > 0 ? { text: String(dailyReportAlarmCount), tone: 'danger' } : null
      case 'jobs':
        return jobsTotal > 0 ? { text: String(jobsTotal), tone: 'neutral' } : null
      case 'delivery':
        return deliveryFailedCount > 0 ? { text: String(deliveryFailedCount), tone: 'danger' } : null
      case 'admin-push':
        return {
          text: String(activeAdminSubscriptionCount),
          tone: activeAdminSubscriptionCount > 0 ? 'positive' : 'warning',
        }
      case 'archives':
        return archiveTotal > 0 ? { text: String(archiveTotal), tone: 'neutral' } : null
      default:
        return null
    }
  }
  const jobNoteDraftValue =
    selectedJob !== null && jobNoteDraftJobId === selectedJob.id
      ? jobNoteDraft
      : selectedJob?.admin_note ?? ''

  const inviteMutation = useMutation({
    mutationFn: createAdminDeviceInvite,
    onSuccess: (res) => {
      setCreatedInvite(res)
      pushToast({
        variant: 'success',
        title: 'Davet hazır',
        description: 'Link admin cihaza gönderildi.',
      })
      void navigator.clipboard.writeText(res.invite_url)
    },
    onError: (e) =>
      pushToast({
        variant: 'error',
        title: 'Davet hatası',
        description: parseApiError(e, 'Davet oluşturulamadı').message,
      }),
  })

  const selfTestMutation = useMutation({
    mutationFn: sendAdminPushSelfTest,
    onSuccess: (result) => {
      if (result.total_targets <= 0 || result.sent <= 0) {
        pushToast({
          variant: 'error',
          title: 'Self-test başarısız',
          description: `Hedef: ${result.total_targets} | Gönderilen: ${result.sent} | Hata: ${result.failed}`,
        })
      } else {
        pushToast({
          variant: 'success',
          title: 'Self-test bildirimi gönderildi',
          description: `Hedef: ${result.total_targets} | Gönderilen: ${result.sent}`,
        })
      }
      void queryClient.invalidateQueries({
        queryKey: ['admin-push-self-check'],
      })
      void queryClient.invalidateQueries({
        queryKey: ['notification-delivery-logs'],
      })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Self-test bildirimi gönderilemedi.')
      pushToast({
        variant: 'error',
        title: 'Self-test hatası',
        description: parsed.message,
      })
    },
  })

  const healMutation = useMutation({
    mutationFn: async (): Promise<HealAdminDeviceResult> => {
      const pushConfig = await getAdminPushConfig()
      if (!pushConfig.enabled || !pushConfig.vapid_public_key) {
        throw new Error('Push bildirim servisi yapilandirilmamis.')
      }
      let subscription = await ensureAdminPushSubscription(
        pushConfig.vapid_public_key,
      )
      let result = await healAdminDevice({
        subscription: subscription.toJSON() as Record<string, unknown>,
        send_test: true,
      })
      let recreatedSubscription = false

      if (
        result.test_push_ok === false &&
        isExpiredPushSubscriptionStatus(result.test_push_status_code)
      ) {
        subscription = await ensureAdminPushSubscription(
          pushConfig.vapid_public_key,
          { forceNew: true },
        )
        result = await healAdminDevice({
          subscription: subscription.toJSON() as Record<string, unknown>,
          send_test: true,
        })
        recreatedSubscription = true
      }

      window.localStorage.setItem(
        PUSH_VAPID_KEY_STORAGE,
        pushConfig.vapid_public_key,
      )
      return { ...result, recreatedSubscription }
    },
    onSuccess: (result) => {
      pushToast({
        variant: result.test_push_ok ? 'success' : 'error',
        title: result.test_push_ok
          ? 'Heal tamamlandi'
          : 'Heal tamamlandi ama test hatali',
        description: result.test_push_ok
          ? result.recreatedSubscription
            ? `Eski abonelik suresi doldugu icin yenisi olusturuldu (#${result.subscription_id}) ve test bildirimi gönderildi.`
            : `Abonelik yenilendi (#${result.subscription_id}) ve test bildirimi gönderildi.`
          : result.recreatedSubscription
            ? `Eski abonelik yenisiyle degistirildi (#${result.subscription_id}) ancak test bildirimi hala hatali.`
            : `Abonelik yenilendi (#${result.subscription_id}) ancak test bildirimi hatali.`,
      })
      void queryClient.invalidateQueries({
        queryKey: ['admin-push-self-check'],
      })
      void queryClient.invalidateQueries({ queryKey: ['notify-subs-admin'] })
      void queryClient.invalidateQueries({
        queryKey: ['notification-delivery-logs'],
      })
    },
    onError: (error) => {
      if (error instanceof Error && !('response' in error)) {
        pushToast({
          variant: 'error',
          title: 'Heal hatası',
          description: error.message,
        })
        return
      }
      const parsed = parseApiError(error, 'Cihaz heal işlemi başarısız oldu.')
      pushToast({
        variant: 'error',
        title: 'Heal hatası',
        description: parsed.message,
      })
    },
  })

  const sendMutation = useMutation({
    mutationFn: sendManualNotification,
    onSuccess: (res, payload) => {
      const adminTargetRequested =
        payload.target === 'admins' || payload.target === 'both'
      if (res.total_targets <= 0) {
        pushToast({
          variant: 'error',
          title: 'Bildirim gönderilemedi',
          description: 'Hedef 0. Aktif abonelik yok; önce cihaz claim edin.',
        })
      } else if (res.sent <= 0) {
        pushToast({
          variant: 'error',
          title: 'Bildirim gönderilemedi',
          description: `Hedef: ${res.total_targets} / Gönderilen: ${res.sent} / Hata: ${res.failed}`,
        })
      } else {
        pushToast({
          variant: 'success',
          title: 'Bildirim gönderildi',
          description: `Hedef: ${res.total_targets} / Gönderilen: ${res.sent}`,
        })
        if (adminTargetRequested && !currentAdminHasActiveClaim) {
          pushToast({
            variant: 'error',
            title: 'Bu hesapta claim eksik',
            description:
              'Admin hedefli gönderim yapildi ancak bu hesapta aktif claim olmadığı için sana dusmeyebilir.',
          })
        }
      }
      if (adminTargetRequested && res.admin_target_missing) {
        pushToast({
          variant: 'error',
          title: 'Admin hedefi 0',
          description:
            'Çalışan bildirimi gitmiş olabilir ama admin hedefinde aktif abonelik yok. Admin claim zorunlu.',
        })
      }
      void queryClient.invalidateQueries({ queryKey: ['notification-jobs'] })
      void queryClient.invalidateQueries({
        queryKey: ['notification-delivery-logs'],
      })
      void queryClient.invalidateQueries({
        queryKey: ['admin-push-self-check'],
      })
    },
    onError: (e) =>
      pushToast({
        variant: 'error',
        title: 'Gönderim hatası',
        description: parseApiError(e, 'Bildirim gönderilemedi').message,
      }),
  })

  const cancelMutation = useMutation({
    mutationFn: cancelNotificationJob,
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['notification-jobs'] }),
  })

  const updateJobNoteMutation = useMutation({
    mutationFn: ({ jobId, note }: { jobId: number; note: string | null }) =>
      updateNotificationJobNote(jobId, note),
    onSuccess: () => {
      pushToast({
        variant: 'success',
        title: 'Bildirim notu kaydedildi',
        description: 'Admin açıklaması güncellendi.',
      })
      void queryClient.invalidateQueries({ queryKey: ['notification-jobs'] })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Bildirim notu kaydedilemedi.')
      pushToast({
        variant: 'error',
        title: 'Not kayıt hatası',
        description: parsed.message,
      })
    },
  })

  const downloadMutation = useMutation({
    mutationFn: downloadDailyReportArchive,
    onSuccess: (blob, id) => {
      const item = (archivesQuery.data?.items ?? []).find((x) => x.id === id)
      downloadBlob(blob, item?.file_name ?? `arşiv-${id}.xlsx`)
    },
  })

  const notifyArchiveMutation = useMutation({
    mutationFn: (archiveId: number) => notifyDailyReportArchive(archiveId),
    onSuccess: (result) => {
      if (result.total_targets <= 0 || result.sent <= 0) {
        pushToast({
          variant: 'error',
          title: 'Arşiv bildirimi gönderilemedi',
          description: `Hedef: ${result.total_targets} | Gönderilen: ${result.sent} | Hata: ${result.failed}. Aktif admin cihazi claim edilmeli.`,
        })
      } else {
        pushToast({
          variant: 'success',
          title: 'Arşiv bildirimi gönderildi',
          description: `Hedef: ${result.total_targets} | Gönderilen: ${result.sent} | Hata: ${result.failed}`,
        })
        if (!currentAdminHasActiveClaim) {
          pushToast({
            variant: 'error',
            title: 'Bu hesapta claim eksik',
            description:
              'Bildirim gitti ama bu admin hesabinda aktif cihaz claim olmadığı için sana dusmeyebilir.',
          })
        }
      }
      void queryClient.invalidateQueries({ queryKey: ['notification-jobs'] })
      void queryClient.invalidateQueries({
        queryKey: ['admin-daily-report-health'],
      })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Arşiv bildirimi gönderilemedi.')
      if (parsed.code === 'ADMIN_PUSH_SUBSCRIPTION_REQUIRED') {
        pushToast({
          variant: 'error',
          title: 'Admin hedefi 0',
          description:
            'Aktif admin push aboneligi yok. Önce admin cihazini claim edip tekrar deneyin.',
        })
      } else {
        pushToast({
          variant: 'error',
          title: 'Arşiv bildirimi başarısız',
          description: parsed.message,
        })
      }
      void queryClient.invalidateQueries({
        queryKey: ['admin-daily-report-health'],
      })
    },
  })

  const setActiveSection = (section: NotificationSectionKey) => {
    const next = new URLSearchParams(searchParams)
    next.set('section', section)
    if (section !== 'jobs') {
      next.delete('job_id')
    }
    if (section !== 'archives') {
      next.delete('archive_id')
    }
    setSearchParams(next, { replace: true })
  }

  const setSelectedJobId = (jobId: number | null) => {
    const next = new URLSearchParams(searchParams)
    next.set('section', 'jobs')
    if (jobId === null) {
      next.delete('job_id')
    } else {
      next.set('job_id', String(jobId))
    }
    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    const rawArchiveId = searchParams.get('archive_id')
    if (!rawArchiveId) return
    if (archiveAutoHandledRef.current === rawArchiveId) return
    const archiveId = Number(rawArchiveId)
    if (!Number.isInteger(archiveId) || archiveId <= 0) {
      archiveAutoHandledRef.current = rawArchiveId
      const next = new URLSearchParams(searchParams)
      next.delete('archive_id')
      setSearchParams(next, { replace: true })
      return
    }
    const archiveRow = (archivesQuery.data?.items ?? []).find(
      (x) => x.id === archiveId,
    )
    if (!archiveRow) return

    archiveAutoHandledRef.current = rawArchiveId
    downloadMutation.mutate(archiveId)
    const next = new URLSearchParams(searchParams)
    next.delete('archive_id')
    setSearchParams(next, { replace: true })
  }, [
    archivesQuery.data,
    downloadMutation,
    searchParams,
    setSearchParams,
  ])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bildirim Merkezi"
        description="Push, claim daveti, job yönetimi ve günlük Excel arşivi."
      />

      <Panel>
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-2 right-0 select-none text-4xl font-black uppercase tracking-[0.3em] text-slate-100 sm:text-5xl"
          >
            {UI_BRANDING.signatureText}
          </span>

          <nav
            className="relative flex items-center gap-0.5 overflow-x-auto border-b border-slate-200"
            aria-label="Bildirim bölümleri"
          >
            {notificationSections.map((section) => {
              const isActive = section.key === activeSection
              const isSecondary = section.key === 'admin-push' || section.key === 'archives'
              const badge = tabBadge(section.key)
              return (
                <Fragment key={section.key}>
                  {section.key === 'admin-push' ? (
                    <span aria-hidden="true" className="mx-1.5 h-5 w-px shrink-0 self-center bg-slate-200" />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setActiveSection(section.key)}
                    aria-current={isActive ? 'page' : undefined}
                    title={section.description}
                    className={`relative flex shrink-0 items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-sm transition-colors ${
                      isActive
                        ? 'font-semibold text-slate-900'
                        : `font-medium ${isSecondary ? 'text-slate-400' : 'text-slate-500'} hover:text-slate-800`
                    }`}
                  >
                    <span>{section.label}</span>
                    {badge ? (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${BADGE_TONE[badge.tone]}`}
                      >
                        {badge.text}
                      </span>
                    ) : null}
                    <span
                      aria-hidden="true"
                      className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-sky-500 transition-opacity ${
                        isActive ? 'opacity-100' : 'opacity-0'
                      }`}
                    />
                  </button>
                </Fragment>
              )
            })}
          </nav>
        </div>

        {activeSection === 'overview' ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Gece sağlığı"
              tone={dailyReportAlarmCount > 0 ? 'danger' : dailyReportIsHealthy ? 'positive' : 'warning'}
              value={dailyReportAlarmCount > 0 ? `${dailyReportAlarmCount} alarm` : 'Sağlıklı'}
              hint={`Durum: ${dailyReportStatusText}`}
            />
            <StatCard label="İş kuyruğu" value={jobsTotal} hint={`Teslimat logu: ${deliveryTotal}`} />
            <StatCard
              label="Admin claim"
              tone={currentAdminHasActiveClaim ? 'positive' : 'warning'}
              value={activeAdminSubscriptionCount}
              hint={currentAdminHasActiveClaim ? 'Bu hesap aktif claim görüyor' : 'Bu hesap için claim eksik'}
            />
            <StatCard label="Arşiv dosyası" value={archiveTotal} hint="Günlük Excel arşivleri" />
          </div>
        ) : null}
      </Panel>

      {activeSection === 'admin-push' ? (
        <Panel>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm text-slate-700">
              Admin davet süresi (dk)
              <input
                type="number"
                min={1}
                max={1440}
                value={expiresIn}
                onChange={(e) => setExpiresIn(Number(e.target.value || 15))}
                className="mt-1 w-40 rounded border border-slate-300 px-3 py-2"
              />
            </label>
            <button
              type="button"
              onClick={() =>
                inviteMutation.mutate({ expires_in_minutes: expiresIn })
              }
              className="rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Admin cihaz claim linki üret
            </button>
            <span className="text-xs text-slate-500">
              Push: {pushConfigQuery.data?.enabled ? 'Aktif' : 'Pasif'}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Link otomatik kopyalanır. Guvenlik için kisa sure önerilir (ornegin
            10-30 dk). Ekran: /admin-panel/device-claim?token=...
          </p>
          {createdInvite ? (
            <div className="mt-2 rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
              <p>Token: {createdInvite.token}</p>
              <p className="break-all">Link: {createdInvite.invite_url}</p>
              <p>Bitis: {dt(createdInvite.expires_at)}</p>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {activeSection === 'send' ? (
        <Panel>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              sendMutation.mutate({
                title: title.trim(),
                message: message.trim(),
                password: password.trim(),
                target,
                employee_ids:
                  target !== 'admins' && selectedEmployees.length > 0
                    ? selectedEmployees
                    : undefined,
                admin_user_ids:
                  target !== 'employees' && selectedAdmins.length > 0
                    ? selectedAdmins
                    : undefined,
              })
            }}
          >
            <h4 className="text-base font-semibold text-slate-900">
              Manuel Push Gönder
            </h4>
            <div className="grid gap-3 md:grid-cols-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2"
                placeholder="Başlık"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2"
                placeholder="Admin şifresi"
              />
              <select
                value={target}
                onChange={(e) =>
                  setTarget(e.target.value as 'employees' | 'admins' | 'both')
                }
                className="rounded border border-slate-300 px-3 py-2"
              >
                <option value="employees">Çalışanlara</option>
                <option value="admins">Adminlere</option>
                <option value="both">Her ikisine</option>
              </select>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full rounded border border-slate-300 px-3 py-2"
              placeholder="Mesaj"
            />

            {target !== 'admins' ? (
              <div>
                <TableSearchInput
                  value={searchEmployee}
                  onChange={setSearchEmployee}
                  placeholder="Çalışan filtrele..."
                />
                <div className="mt-2 max-h-36 overflow-y-auto rounded border border-slate-200 p-2 text-sm">
                  {filteredEmployees.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-center justify-between py-1"
                    >
                      <span>
                        #{item.id} - {item.full_name}
                      </span>
                      <input
                        type="checkbox"
                        checked={selectedEmployees.includes(item.id)}
                        onChange={() =>
                          setSelectedEmployees((prev) =>
                            prev.includes(item.id)
                              ? prev.filter((x) => x !== item.id)
                              : [...prev, item.id],
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
                {selectedEmployees.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Calisan secmezsen bildirim tum calisanlara gider.
                  </p>
                ) : null}
              </div>
            ) : null}

            {target !== 'employees' ? (
              <div>
                <TableSearchInput
                  value={searchAdmin}
                  onChange={setSearchAdmin}
                  placeholder="Admin filtrele..."
                />
                <div className="mt-2 max-h-36 overflow-y-auto rounded border border-slate-200 p-2 text-sm">
                  {filteredAdmins.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-center justify-between py-1"
                    >
                      <span>
                        #{item.id} - {item.username}
                      </span>
                      <input
                        type="checkbox"
                        checked={selectedAdmins.includes(item.id)}
                        onChange={() =>
                          setSelectedAdmins((prev) =>
                            prev.includes(item.id)
                              ? prev.filter((x) => x !== item.id)
                              : [...prev, item.id],
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <button
              type="submit"
              className="rounded bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Bildirimi gönder
            </button>
          </form>
        </Panel>
      ) : null}

      {activeSection === 'tasks' ? (
        <NotificationTaskManager
          employees={employeesQuery.data ?? []}
          admins={adminsQuery.data ?? []}
        />
      ) : null}

      {activeSection === 'jobs' ? (
        <Panel>
          <h4 className="text-base font-semibold text-slate-900">
            Bildirim İşleri
          </h4>
          <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
            <select
              value={jobsStatus}
              onChange={(e) => {
                setJobsStatus(e.target.value as '' | NotificationJobStatus)
                setJobsPage(1)
              }}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Durum: Tümü</option>
              <option value="PENDING">PENDING</option>
              <option value="SENDING">SENDING</option>
              <option value="SENT">SENT</option>
              <option value="FAILED">FAILED</option>
              <option value="CANCELED">CANCELED</option>
            </select>
            <input
              value={jobNotificationType}
              onChange={(e) => {
                setJobNotificationType(e.target.value)
                setJobsPage(1)
              }}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="Tür ör. erken_cikis"
            />
            <select
              value={jobRiskLevel}
              onChange={(e) => {
                setJobRiskLevel(
                  e.target.value as '' | 'Bilgi' | 'Uyari' | 'Kritik',
                )
                setJobsPage(1)
              }}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Risk: Tümü</option>
              <option value="Bilgi">Bilgi</option>
              <option value="Uyari">Uyari</option>
              <option value="Kritik">Kritik</option>
            </select>
            <select
              value={jobAudience}
              onChange={(e) => {
                setJobAudience(e.target.value as '' | 'employee' | 'admin')
                setJobsPage(1)
              }}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Hedef: Tümü</option>
              <option value="employee">Çalışan</option>
              <option value="admin">Admin</option>
            </select>
            <input
              value={jobEmployeeId}
              onChange={(e) => {
                setJobEmployeeId(e.target.value)
                setJobsPage(1)
              }}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="Personel ID"
            />
            <button
              type="button"
              onClick={() => void jobsQuery.refetch()}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              Listeyi yenile
            </button>
            <input
              type="date"
              value={jobStartDate}
              onChange={(e) => {
                setJobStartDate(e.target.value)
                setJobsPage(1)
              }}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={jobEndDate}
              onChange={(e) => {
                setJobEndDate(e.target.value)
                setJobsPage(1)
              }}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          {jobsQuery.isLoading ? <LoadingBlock label="Yükleniyor..." /> : null}
          {jobsQuery.isError ? (
            <ErrorBlock message="Job listesi alınamadı." />
          ) : null}
          {!jobsQuery.isLoading && !jobsQuery.isError ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span>
                Gösterilen satir: {jobsRangeStart}-{jobsRangeEnd} / {jobsTotal}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setJobsPage((prev) => Math.max(1, prev - 1))}
                  disabled={jobsPage <= 1}
                  className="rounded border border-slate-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Önceki
                </button>
                <span>
                  Sayfa {jobsPage} / {jobsTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setJobsPage((prev) => Math.min(jobsTotalPages, prev + 1))
                  }
                  disabled={jobsPage >= jobsTotalPages}
                  className="rounded border border-slate-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Sonraki
                </button>
              </div>
            </div>
          ) : null}
          <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="max-h-[620px] overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 z-[1] bg-slate-50/95 backdrop-blur">
                  <tr className="text-xs uppercase text-slate-500">
                    <th className="px-3 py-2.5">Sıra</th>
                    <th className="px-3 py-2.5">Tür</th>
                    <th className="px-3 py-2.5">Risk</th>
                    <th className="px-3 py-2.5">Hedef</th>
                    <th className="px-3 py-2.5">Personel</th>
                    <th className="px-3 py-2.5">Başlık</th>
                    <th className="px-3 py-2.5">Durum</th>
                    <th className="px-3 py-2.5">Olay</th>
                  </tr>
                </thead>
                <tbody>
                  {jobsRows.map((job, index) => {
                    const isSelected = job.id === selectedJob?.id
                    const employeeFullName = payloadString(
                      job.payload,
                      'employee_full_name',
                    )
                    const regionName = payloadString(job.payload, 'region_name')
                    const departmentName = payloadString(
                      job.payload,
                      'department_name',
                    )
                    return (
                      <tr
                        key={job.id}
                        className={`cursor-pointer border-t border-slate-100 transition-colors ${isSelected ? 'bg-sky-50' : 'odd:bg-white even:bg-slate-50/50 hover:bg-sky-50/60'}`}
                        onClick={() => setSelectedJobId(job.id)}
                      >
                        <td className="px-3 py-2.5 text-slate-500">
                          {jobsRangeStart + index}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-slate-700">
                          {job.notification_type ?? job.job_type}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`rounded px-2 py-1 text-xs ${riskBadgeClass(job.risk_level)}`}
                          >
                            {job.risk_level ?? '-'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {audienceLabel(job.audience)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-800">
                              {employeeFullName ?? `#${job.employee_id ?? '-'}`}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              #{job.employee_id ?? '-'}
                              {regionName ? ` · ${regionName}` : ''}
                              {departmentName ? ` · ${departmentName}` : ''}
                            </p>
                          </div>
                        </td>
                        <td
                          className="px-3 py-2.5 max-w-56 truncate"
                          title={job.title ?? ''}
                        >
                          {job.title ?? '-'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`rounded px-2 py-1 text-xs ${statusClass(job.status)}`}
                          >
                            {job.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {job.event_ts_utc
                            ? dt(job.event_ts_utc)
                            : dt(job.scheduled_at_utc)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <aside className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <h5 className="text-sm font-semibold text-slate-900">
                Seçili bildirim detayı
              </h5>
              {selectedJob === null ? (
                <p className="mt-3 text-sm text-slate-600">
                  Listeden bir bildirim seçin.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                    <DefinitionList
                      items={[
                        {
                          label: 'Personel',
                          value: `${payloadString(selectedJob.payload, 'employee_full_name') ?? '-'} · #${
                            selectedJob.employee_id ?? '-'
                          }`,
                        },
                        { label: 'Bölge', value: payloadString(selectedJob.payload, 'region_name') ?? '-' },
                        { label: 'Departman', value: payloadString(selectedJob.payload, 'department_name') ?? '-' },
                        { label: 'Başlık', value: selectedJob.title ?? '-' },
                        { label: 'Olay zamanı', value: selectedJob.event_ts_utc ? dt(selectedJob.event_ts_utc) : '-' },
                        { label: 'Vardiya', value: selectedJob.shift_summary ?? '-' },
                        { label: 'Gerçekleşen', value: selectedJob.actual_time_summary ?? '-' },
                        {
                          label: 'Risk',
                          value: selectedJob.risk_level ? (
                            <span className={`rounded px-2 py-0.5 text-xs ${riskBadgeClass(selectedJob.risk_level)}`}>
                              {selectedJob.risk_level}
                            </span>
                          ) : (
                            '-'
                          ),
                        },
                        ...(payloadNumber(selectedJob.payload, 'late_minutes') !== null
                          ? [{ label: 'Gecikme', value: `${payloadNumber(selectedJob.payload, 'late_minutes')} dk` }]
                          : []),
                        ...(payloadNumber(selectedJob.payload, 'late_streak_days') !== null
                          ? [
                              {
                                label: 'Geç kalma serisi',
                                value: `${payloadNumber(selectedJob.payload, 'late_streak_days')} gün`,
                              },
                            ]
                          : []),
                        { label: 'İşlem önerisi', value: selectedJob.suggested_action ?? '-' },
                        { label: 'Event ID', value: selectedJob.event_id ?? '-' },
                        { label: 'Hedef', value: audienceLabel(selectedJob.audience) },
                      ]}
                    />
                    {selectedJob.description ? (
                      <div className="mt-2 border-t border-slate-100 pt-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Açıklama</p>
                        <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{selectedJob.description}</p>
                      </div>
                    ) : null}
                    {selectedJob.status === 'PENDING' || selectedJob.status === 'SENDING' ? (
                      <Button
                        variant="danger"
                        size="sm"
                        className="mt-3"
                        onClick={() => cancelMutation.mutate(selectedJob.id)}
                      >
                        Bildirimi iptal et
                      </Button>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <h6 className="text-sm font-semibold text-slate-900">Gün zaman çizelgesi</h6>
                      {selectedJob.employee_id && selectedJob.local_day ? (
                        <Link
                          to={`/attendance-events?employee_id=${selectedJob.employee_id}&start_date=${selectedJob.local_day}&end_date=${selectedJob.local_day}`}
                          className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Manuel düzeltmeyi aç
                        </Link>
                      ) : null}
                    </div>
                    {selectedJobTimelineQuery.isLoading ? (
                      <LoadingBlock label="Timeline yükleniyor..." />
                    ) : null}
                    {selectedJobTimelineQuery.isError ? (
                      <ErrorBlock message="Timeline alınamadı." />
                    ) : null}
                    {!selectedJobTimelineQuery.isLoading &&
                    !selectedJobTimelineQuery.isError ? (
                      <div className="mt-2 space-y-2">
                        {(selectedJobTimelineQuery.data ?? []).length === 0 ? (
                          <p className="text-sm text-slate-500">
                            Bu gün için timeline kaydı bulunamadı.
                          </p>
                        ) : (
                          (selectedJobTimelineQuery.data ?? []).map((event) => (
                            <div
                              key={event.id}
                              className="rounded border border-slate-200 bg-slate-50 p-2 text-sm text-slate-700"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <strong>{timelineEventLabel(event)}</strong>
                                <span>{dt(event.ts_utc)}</span>
                              </div>
                              {event.note ? (
                                <p className="mt-1 text-xs text-slate-600">
                                  Not: {event.note}
                                </p>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                    <h6 className="text-sm font-semibold text-slate-900">Admin açıklaması</h6>
                    <textarea
                      value={jobNoteDraftValue}
                      onChange={(e) => {
                        if (selectedJob === null) return
                        setJobNoteDraftJobId(selectedJob.id)
                        setJobNoteDraft(e.target.value)
                      }}
                      rows={4}
                      className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                      placeholder="Bildirimle ilgili operasyon notu ekleyin"
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      className="mt-2"
                      onClick={() =>
                        updateJobNoteMutation.mutate({
                          jobId: selectedJob.id,
                          note: jobNoteDraftValue.trim() || null,
                        })
                      }
                      disabled={updateJobNoteMutation.isPending}
                    >
                      {updateJobNoteMutation.isPending ? 'Kaydediliyor...' : 'Açıklamayı kaydet'}
                    </Button>
                  </div>
                </div>
              )}
            </aside>
          </div>
          {!jobsQuery.isLoading && !jobsQuery.isError && jobsTotal === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              Filtreye uygun bildirim işi bulunamadı.
            </p>
          ) : null}
        </Panel>
      ) : null}

      {activeSection === 'overview' ? (
        <Panel>
          <h4 className="text-base font-semibold text-slate-900">Abonelik Özeti</h4>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <StatCard label="Çalışan abonelik" value={(employeeSubsQuery.data ?? []).length} />
            <StatCard
              label="Admin abonelik"
              tone={(adminSubsQuery.data ?? []).length > 0 ? 'positive' : 'warning'}
              value={(adminSubsQuery.data ?? []).length}
            />
            <StatCard label="Arşiv dosyası" value={archiveTotal} />
            <StatCard label="Teslimat log satırı" value={deliveryTotal} />
          </div>
          {!canNotifyAdmins ? (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              Aktif admin push aboneliği yok. "Admin cihaz claim linki üret" adımını tamamlamadan bildirim gönderilemez.
            </p>
          ) : null}
        </Panel>
      ) : null}

      {activeSection === 'admin-push' ? (
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-base font-semibold text-slate-900">Admin Push Self-Check</h4>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => selfTestMutation.mutate()}
                disabled={selfTestMutation.isPending || healMutation.isPending}
              >
                {selfTestMutation.isPending ? 'Gönderiliyor...' : 'Kendime test gönder'}
              </Button>
              <Button
                variant="success"
                size="sm"
                onClick={() => healMutation.mutate()}
                disabled={healMutation.isPending || selfTestMutation.isPending}
              >
                {healMutation.isPending ? 'Heal çalışıyor...' : 'Bu cihazı heal et'}
              </Button>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Oturum admini"
              value={user?.username ?? '-'}
              hint={`ID: ${user?.admin_user_id ?? '-'}`}
            />
            <StatCard
              label="Bu hesap claim"
              tone={currentAdminHasActiveClaim ? 'positive' : 'danger'}
              value={currentAdminClaimCount}
              hint={`ID eşleşen: ${currentAdminClaimCountById} · kullanıcı eşleşen: ${currentAdminClaimCountByUsername}`}
            />
            <StatCard
              label="Push servisi"
              tone={(effectiveSelfCheckData?.push_enabled ?? pushConfigQuery.data?.enabled) ? 'positive' : 'danger'}
              value={(effectiveSelfCheckData?.push_enabled ?? pushConfigQuery.data?.enabled) ? 'Aktif' : 'Pasif'}
            />
            <StatCard
              label="Toplam aktif claim"
              value={effectiveSelfCheckData?.active_total_subscriptions ?? activeAdminSubscriptionCount}
              hint={
                effectiveSelfCheckData?.latest_claim_seen_at
                  ? `Son görülme: ${dt(effectiveSelfCheckData.latest_claim_seen_at)}`
                  : 'Son görülme: -'
              }
            />
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <StatCard
              label="Claim sağlığı"
              tone={(effectiveSelfCheckData?.active_claims_with_error ?? 0) > 0 ? 'warning' : 'positive'}
              value={`${effectiveSelfCheckData?.active_claims_healthy ?? 0} sağlıklı`}
              hint={`${effectiveSelfCheckData?.active_claims_with_error ?? 0} hatalı · ${effectiveSelfCheckData?.active_claims_stale ?? 0} bayat`}
            />
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Son self-test</p>
              <div className="mt-1.5">
                <DefinitionList
                  columns={2}
                  items={[
                    {
                      label: 'Zaman',
                      value: effectiveSelfCheckData?.last_self_test_at
                        ? dt(effectiveSelfCheckData.last_self_test_at)
                        : '-',
                    },
                    {
                      label: 'Durum',
                      value:
                        effectiveSelfCheckData?.last_self_test_success == null ? (
                          '-'
                        ) : effectiveSelfCheckData.last_self_test_success ? (
                          <span className="font-semibold text-emerald-700">Başarılı</span>
                        ) : (
                          <span className="font-semibold text-rose-700">Hatalı</span>
                        ),
                    },
                    { label: 'Hedef', value: effectiveSelfCheckData?.last_self_test_total_targets ?? '-' },
                    { label: 'Gönderilen', value: effectiveSelfCheckData?.last_self_test_sent ?? '-' },
                    { label: 'Hata', value: effectiveSelfCheckData?.last_self_test_failed ?? '-' },
                  ]}
                />
              </div>
            </div>
          </div>

          {adminSelfCheckQuery.isError ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Self-check verisi alınamadı. Fallback olarak abonelik listesi kullanılıyor.
            </p>
          ) : null}
          {adminSelfCheckQuery.data?.self_check_ok === false ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Self-check degradasyona düştü: {adminSelfCheckQuery.data.self_check_error || 'bilinmeyen hata'}. Fallback
              olarak abonelik listesi kullanılıyor.
            </p>
          ) : null}
          {!currentAdminHasActiveClaim ? (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              Bu admin hesabında aktif cihaz claim görünmüyor. Bildirim almak için telefonda claim linkini açıp izin
              adımını tamamla.
            </p>
          ) : null}
          {effectiveSelfCheckData?.latest_claim_error ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Son claim hatası: {effectiveSelfCheckData.latest_claim_error}
            </p>
          ) : null}
        </Panel>
      ) : null}


      {activeSection === 'delivery' ? (
        <Panel>
          <h4 className="text-base font-semibold text-slate-900">
            Bildirim Teslimat Logu
          </h4>
          <p className="mt-1 text-xs text-slate-500">
            Kime gitti / gitmedi, isim-ID, cihaz, IP ve hata bilgisini izleyin.
          </p>

          <div className="mt-3 grid items-center gap-3 md:grid-cols-4">
            <StatCard label="Toplam satır" value={deliveryTotal} />
            <StatCard label="Gönderildi" tone="positive" value={deliverySentCount} />
            <StatCard label="Gönderilemedi" tone={deliveryFailedCount > 0 ? 'danger' : 'neutral'} value={deliveryFailedCount} />
            <Button onClick={() => void deliveryLogsQuery.refetch()}>Logu yenile</Button>
          </div>

          <div className="mt-3">
            <TableSearchInput
              value={deliverySearch}
              onChange={(value) => {
                setDeliverySearch(value)
                setDeliveryPage(1)
              }}
              placeholder="Isim, ID, cihaz, IP, baslik, durum ara..."
            />
          </div>

          {!deliveryLogsQuery.isLoading && !deliveryLogsQuery.isError ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span>
                Gösterilen satir: {deliveryRangeStart}-{deliveryRangeEnd} /{' '}
                {deliveryTotal}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setDeliveryPage((prev) => Math.max(1, prev - 1))
                  }
                  disabled={deliveryPage <= 1}
                  className="rounded border border-slate-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Önceki
                </button>
                <span>
                  Sayfa {deliveryPage} / {deliveryTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setDeliveryPage((prev) =>
                      Math.min(deliveryTotalPages, prev + 1),
                    )
                  }
                  disabled={deliveryPage >= deliveryTotalPages}
                  className="rounded border border-slate-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Sonraki
                </button>
              </div>
            </div>
          ) : null}

          {deliveryLogsQuery.isLoading ? (
            <LoadingBlock label="Teslimat logu yükleniyor..." />
          ) : null}
          {deliveryLogsQuery.isError ? (
            <ErrorBlock message="Teslimat logu alınamadı." />
          ) : null}
          {!deliveryLogsQuery.isLoading && !deliveryLogsQuery.isError ? (
            <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="overflow-hidden rounded-xl border border-slate-900 bg-[#09131d] text-slate-200 shadow-inner">
                <div className="flex items-center justify-between border-b border-slate-700 bg-slate-900/70 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    <span className="ml-2 text-xs font-semibold text-slate-300">
                      delivery-terminal
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {deliveryRangeStart}-{deliveryRangeEnd} / {deliveryTotal}
                  </span>
                </div>

                <div className="max-h-[520px] overflow-auto">
                  <table className="min-w-full table-fixed text-left text-xs">
                    <thead className="sticky top-0 bg-slate-900/95 text-[11px] uppercase text-slate-400">
                      <tr>
                        <th className="w-36 px-3 py-2.5">Zaman</th>
                        <th className="w-24 px-3 py-2.5">Durum</th>
                        <th className="w-24 px-3 py-2.5">Kanal</th>
                        <th className="w-24 px-3 py-2.5">Kitle</th>
                        <th className="w-56 px-3 py-2.5">Kisi</th>
                        <th className="w-40 px-3 py-2.5">Tür</th>
                        <th className="w-48 px-3 py-2.5">Başlık</th>
                        <th className="w-64 px-3 py-2.5">Hata</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDeliveryLogs.map((row, index) => {
                        const isSelected = row.id === selectedDeliveryLog?.id
                        return (
                          <tr
                            key={`${row.id}-${row.recipient_type}-${row.recipient_id ?? 0}-${row.device_id ?? 0}-${index}`}
                            onClick={() => setSelectedDeliveryLogId(row.id)}
                            className={`cursor-pointer border-t border-slate-800 ${
                              isSelected
                                ? 'bg-cyan-900/35'
                                : 'hover:bg-slate-800/55'
                            }`}
                          >
                            <td className="px-3 py-2.5 text-slate-300">
                              {dt(row.sent_at_utc)}
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`rounded px-2 py-0.5 text-[11px] font-semibold ${deliveryStatusClass(row.status)}`}
                              >
                                {row.status}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-slate-300 uppercase">
                              {row.channel}
                            </td>
                            <td className="px-3 py-2.5 text-slate-300">
                              {audienceLabel(row.audience)}
                            </td>
                            <td
                              className="px-3 py-2.5 text-slate-300 truncate"
                              title={`#${row.recipient_id ?? '-'} - ${row.recipient_name ?? '-'}`}
                            >
                              #{row.recipient_id ?? '-'} -{' '}
                              {row.recipient_name ?? '-'}
                            </td>
                            <td
                              className="px-3 py-2.5 text-slate-300 truncate"
                              title={row.notification_type ?? '-'}
                            >
                              {row.notification_type ?? '-'}
                            </td>
                            <td
                              className="px-3 py-2.5 text-slate-300 truncate"
                              title={row.title ?? '-'}
                            >
                              {row.title ?? '-'}
                            </td>
                            <td
                              className="px-3 py-2.5 text-slate-300 truncate"
                              title={row.error ?? '-'}
                            >
                              {row.error ?? '-'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {filteredDeliveryLogs.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-amber-300">
                      Filtreye uygun teslimat kaydı bulunamadı.
                    </p>
                  ) : null}
                </div>
              </section>

              <aside className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h5 className="text-sm font-semibold text-slate-900">
                  Seçili teslimat detayı
                </h5>
                {selectedDeliveryLog === null ? (
                  <p className="mt-3 text-sm text-slate-600">
                    Listeden bir kayıt seçin.
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-700">
                      <p>
                        <span className="font-semibold">Zaman:</span>{' '}
                        {dt(selectedDeliveryLog.sent_at_utc)}
                      </p>
                      <p>
                        <span className="font-semibold">Durum:</span>{' '}
                        {selectedDeliveryLog.status}
                      </p>
                      <p>
                        <span className="font-semibold">Hedef tipi:</span>{' '}
                        {selectedDeliveryLog.recipient_type === 'employee'
                          ? 'CALISAN'
                          : 'ADMIN'}
                      </p>
                      <p>
                        <span className="font-semibold">Kitle:</span>{' '}
                        {audienceLabel(selectedDeliveryLog.audience)}
                      </p>
                      <p>
                        <span className="font-semibold">Kisi:</span> #
                        {selectedDeliveryLog.recipient_id ?? '-'} -{' '}
                        {selectedDeliveryLog.recipient_name ?? '-'}
                      </p>
                      <p>
                        <span className="font-semibold">E-posta:</span>{' '}
                        {selectedDeliveryLog.recipient_address ?? '-'}
                      </p>
                      <p>
                        <span className="font-semibold">Tur:</span>{' '}
                        {selectedDeliveryLog.notification_type ?? '-'}
                      </p>
                      <p>
                        <span className="font-semibold">Kanal:</span>{' '}
                        {selectedDeliveryLog.channel.toUpperCase()}
                      </p>
                      <p>
                        <span className="font-semibold">Cihaz:</span>{' '}
                        {selectedDeliveryLog.device_id ?? '-'}
                      </p>
                      <p>
                        <span className="font-semibold">IP:</span>{' '}
                        {selectedDeliveryLog.ip ?? '-'}
                      </p>
                      <p className="break-words">
                        <span className="font-semibold">Başlık:</span>{' '}
                        {selectedDeliveryLog.title ?? '-'}
                      </p>
                      <p>
                        <span className="font-semibold">Event ID:</span>{' '}
                        {selectedDeliveryLog.event_id}
                      </p>
                      <p className="break-all">
                        <span className="font-semibold">Endpoint:</span>{' '}
                        {selectedDeliveryLog.endpoint ?? '-'}
                      </p>
                      <p className="break-all">
                        <span className="font-semibold">Hata:</span>{' '}
                        {selectedDeliveryLog.error ?? '-'}
                      </p>
                    </div>

                    <div>
                      <p className="mb-1 text-xs font-semibold text-slate-600">
                        JSON detay
                      </p>
                      <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-2 text-[11px] text-slate-100">
                        {JSON.stringify(selectedDeliveryLog, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </aside>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {activeSection === 'archives' ? (
        <Panel>
          <h4 className="text-base font-semibold text-slate-900">
            Günlük Excel Arşivi
          </h4>
          <div className="mt-2 grid gap-2 md:grid-cols-4">
            <div
              className={`rounded border p-3 text-sm ${dailyReportStatusClass(dailyReportHealth)}`}
            >
              Gece job durumu: <strong>{dailyReportStatusText}</strong>
              <div className="mt-1 text-xs">
                Alarm: <strong>{dailyReportAlarmCount}</strong>
              </div>
            </div>
            <div className="rounded border border-slate-200 p-3 text-sm">
              Rapor tarihi:{' '}
              <strong>{dailyReportHealth?.report_date ?? '-'}</strong>
              <div className="mt-1 text-xs text-slate-600">
                Son kontrol:{' '}
                {dailyReportHealth?.evaluated_at_utc
                  ? dt(dailyReportHealth.evaluated_at_utc)
                  : '-'}
              </div>
            </div>
            <div className="rounded border border-slate-200 p-3 text-sm">
              Teslimat: <strong>{dailyReportHealth?.push_sent ?? 0}</strong> /{' '}
              {dailyReportHealth?.push_total_targets ?? 0}
              <div className="mt-1 text-xs text-slate-600">
                Push hatası: {dailyReportHealth?.push_failed ?? 0}
              </div>
            </div>
            <div className="rounded border border-slate-200 p-3 text-sm">
              Arşiv:{' '}
              <strong>
                {dailyReportHealth?.archive_exists
                  ? `#${dailyReportHealth.archive_id}`
                  : 'YOK'}
              </strong>
              <div className="mt-1 text-xs text-slate-600">
                Çalışan: {dailyReportHealth?.archive_employee_count ?? 0} |
                Boyut:{' '}
                {(
                  (dailyReportHealth?.archive_file_size_bytes ?? 0) / 1024
                ).toFixed(1)}{' '}
                KB
              </div>
            </div>
          </div>
          {dailyReportHealthQuery.isError ? (
            <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Gece 00:00 job health verisi alınamadı.
            </p>
          ) : null}
          {!dailyReportHealthQuery.isError && dailyReportHealth ? (
            <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              {dailyReportAlarmCount > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {dailyReportHealth.alarms.map((alarm) => (
                    <span
                      key={alarm}
                      className="rounded border border-rose-300 bg-rose-100 px-2 py-0.5 text-rose-800"
                    >
                      {dailyReportAlarmLabel(alarm)}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-emerald-700">
                  Alarm yok. Gece arşiv job durumu sağlıklı.
                </span>
              )}
            </div>
          ) : null}
          {dailyReportHealth?.target_zero ? (
            <p className="mt-2 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              Gece job hedefi 0 görünüyor. Push claim listesi boş olabilir.
            </p>
          ) : null}
          {dailyReportHealth?.last_error ? (
            <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Son job hatası: {dailyReportHealth.last_error}
            </p>
          ) : null}
          {dailyReportHealth && dailyReportIsHealthy ? (
            <p className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Gece 00:00 job oluştu, teslimat yapildi ve alarm bulunmuyor.
            </p>
          ) : null}
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            <label className="text-xs text-slate-600">
              Baslangic
              <input
                type="date"
                value={archiveStartDate}
                onChange={(event) => {
                  setArchiveStartDate(event.target.value)
                  setArchivePage(1)
                }}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-slate-600">
              Bitis
              <input
                type="date"
                value={archiveEndDate}
                onChange={(event) => {
                  setArchiveEndDate(event.target.value)
                  setArchivePage(1)
                }}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-slate-600">
              Çalışan icerigi
              <input
                value={archiveEmployeeQuery}
                onChange={(event) => {
                  setArchiveEmployeeQuery(event.target.value)
                  setArchivePage(1)
                }}
                placeholder="ad veya ID"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void archivesQuery.refetch()}
                className="rounded border border-slate-300 px-3 py-2 text-sm"
              >
                Arşivi yenile
              </button>
            </div>
          </div>

          {archivesQuery.isLoading ? (
            <LoadingBlock label="Arşiv yükleniyor..." />
          ) : null}
          {archivesQuery.isError ? (
            <ErrorBlock message="Arşiv listesi alınamadı." />
          ) : null}
          {!archivesQuery.isLoading && !archivesQuery.isError ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span>
                Gösterilen satir: {archiveRangeStart}-{archiveRangeEnd} /{' '}
                {archiveTotal}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setArchivePage((prev) => Math.max(1, prev - 1))
                  }
                  disabled={archivePage <= 1}
                  className="rounded border border-slate-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Önceki
                </button>
                <span>
                  Sayfa {archivePage} / {archiveTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setArchivePage((prev) =>
                      Math.min(archiveTotalPages, prev + 1),
                    )
                  }
                  disabled={archivePage >= archiveTotalPages}
                  className="rounded border border-slate-300 px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Sonraki
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-2 max-h-[520px] overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-xs uppercase text-slate-500">
                  <th className="px-3 py-2.5">Sıra</th>
                  <th className="px-3 py-2.5">ID</th>
                  <th className="px-3 py-2.5">Tarih</th>
                  <th className="px-3 py-2.5">Dosya</th>
                  <th className="px-3 py-2.5">Çalışan</th>
                  <th className="px-3 py-2.5">Boyut</th>
                  <th className="px-3 py-2.5">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {archiveRows.map((item, index) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-3 py-2.5 text-slate-500">
                      {archiveRangeStart + index}
                    </td>
                    <td className="px-3 py-2.5">{item.id}</td>
                    <td className="px-3 py-2.5">{item.report_date}</td>
                    <td className="px-3 py-2.5">{item.file_name}</td>
                    <td className="px-3 py-2.5">{item.employee_count}</td>
                    <td className="px-3 py-2.5">
                      {(item.file_size_bytes / 1024).toFixed(1)} KB
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="rounded border border-brand-300 px-2 py-1 text-xs text-brand-700"
                          onClick={() => downloadMutation.mutate(item.id)}
                        >
                          Excel indir
                        </button>
                        <button
                          type="button"
                          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
                          title={
                            !canNotifyAdmins
                              ? 'Aktif admin push aboneligi yok'
                              : undefined
                          }
                          onClick={() => notifyArchiveMutation.mutate(item.id)}
                          disabled={
                            notifyArchiveMutation.isPending || !canNotifyAdmins
                          }
                        >
                          Adminlere bildir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!archivesQuery.isLoading &&
          !archivesQuery.isError &&
          archiveTotal === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              Filtreye uygun arşiv kaydı bulunamadı.
            </p>
          ) : null}
        </Panel>
      ) : null}
    </div>
  )
}
