// DEV/DEMO modu: ?demo=1 ile acilinca backend olmadan ornek calisan verisi
// uretir. Sadece gosterim/iterasyon icindir; production akisini etkilemez
// (flag yoksa adapter devreye girmez).
import { AxiosHeaders, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'

import type {
  AttendanceActionResponse,
  EmployeeConversationCategory,
  EmployeeConversationMessageRecord,
  EmployeeConversationRecord,
  EmployeeConversationThreadRecord,
  EmployeeDemoDayResponse,
  EmployeeLeaveMessageRecord,
  EmployeeLeaveRecord,
  EmployeeLeaveThreadRecord,
  EmployeeStatusResponse,
  RecoveryCodeStatusResponse,
} from '../types/api'
import { setStoredDeviceFingerprint } from './device'

const DEMO_KEY = 'pf_demo_mode'

function readDemoFlagFromUrl(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('demo') === '1') {
      window.sessionStorage.setItem(DEMO_KEY, '1')
      return true
    }
    if (params.get('demo') === '0') {
      window.sessionStorage.removeItem(DEMO_KEY)
      return false
    }
    return window.sessionStorage.getItem(DEMO_KEY) === '1'
  } catch {
    return false
  }
}

// Sadece dev modda: production build'de demo adapter ASLA gercek API'yi
// kesmesin (backend bypass riski olmasin).
const demoEnabled = import.meta.env.DEV && readDemoFlagFromUrl()

export function isDemoMode(): boolean {
  return demoEnabled
}

if (demoEnabled) {
  // Cihaz fingerprint yoksa demo cihaz ata ki /recover'a atmasin.
  setStoredDeviceFingerprint('demo-device-0001')
}

const iso = (offsetMinutes: number): string =>
  new Date(Date.now() - offsetMinutes * 60_000).toISOString()

const status: EmployeeStatusResponse = {
  employee_id: 1,
  employee_name: 'Ahmet Yilmaz',
  region_name: 'Istanbul Anadolu',
  department_name: 'Saha Operasyon',
  shift_name: 'Gunduz',
  shift_start_local: '08:00',
  shift_end_local: '17:00',
  today_status: 'IN_PROGRESS',
  last_in_ts: iso(157),
  last_out_ts: null,
  last_location_status: 'VERIFIED_HOME',
  last_flags: {},
  has_open_shift: true,
  suggested_action: null,
  last_checkin_time_utc: iso(157),
  home_location_required: false,
  passkey_registered: false,
  demo_active: false,
  last_demo_started_at_utc: iso(120),
  last_demo_ended_at_utc: iso(75),
}

const leaves: EmployeeLeaveRecord[] = [
  {
    id: 1, employee_id: 1, start_date: '2026-06-10', end_date: '2026-06-12',
    type: 'ANNUAL', status: 'PENDING', note: 'Aile ziyareti icin yillik izin',
    requested_by_employee: true, decision_note: null, decided_at: null,
    created_at: iso(2880), attachment_count: 1, message_count: 2,
    last_message_at: iso(1440), latest_message_preview: 'Tesekkurler',
  },
  {
    id: 2, employee_id: 1, start_date: '2026-05-20', end_date: '2026-05-20',
    type: 'EXCUSE', status: 'APPROVED', note: 'Doktor randevusu',
    requested_by_employee: true, decision_note: 'Onaylandi, gecmis olsun.',
    decided_at: iso(20160), created_at: iso(21600), attachment_count: 0, message_count: 1,
    last_message_at: iso(20160), latest_message_preview: null,
  },
  {
    id: 3, employee_id: 1, start_date: '2026-04-02', end_date: '2026-04-03',
    type: 'SICK', status: 'REJECTED', note: 'Rapor',
    requested_by_employee: true, decision_note: 'Belge eksik, tekrar yukleyin.',
    decided_at: iso(86400), created_at: iso(88000), attachment_count: 0, message_count: 0,
    last_message_at: null, latest_message_preview: null,
  },
  {
    id: 4, employee_id: 1, start_date: '2026-03-10', end_date: '2026-03-11', type: 'ANNUAL',
    status: 'APPROVED', note: 'Kısa tatil', requested_by_employee: true,
    decision_note: 'Onaylandı.', decided_at: iso(120000), created_at: iso(122000),
    attachment_count: 0, message_count: 0, last_message_at: null, latest_message_preview: null,
  },
  {
    id: 5, employee_id: 1, start_date: '2026-02-18', end_date: '2026-02-18', type: 'EXCUSE',
    status: 'APPROVED', note: 'Resmi işlem', requested_by_employee: true,
    decision_note: null, decided_at: iso(160000), created_at: iso(162000),
    attachment_count: 0, message_count: 0, last_message_at: null, latest_message_preview: null,
  },
  {
    id: 6, employee_id: 1, start_date: '2026-01-05', end_date: '2026-01-09', type: 'ANNUAL',
    status: 'APPROVED', note: 'Yılbaşı izni', requested_by_employee: true,
    decision_note: 'Onaylandı.', decided_at: iso(200000), created_at: iso(202000),
    attachment_count: 0, message_count: 0, last_message_at: null, latest_message_preview: null,
  },
  {
    id: 7, employee_id: 1, start_date: '2025-12-01', end_date: '2025-12-01', type: 'UNPAID',
    status: 'REJECTED', note: 'Ücretsiz', requested_by_employee: true,
    decision_note: 'Yoğunluk nedeniyle.', decided_at: iso(240000), created_at: iso(242000),
    attachment_count: 0, message_count: 0, last_message_at: null, latest_message_preview: null,
  },
]

const threadMessages: Record<number, EmployeeLeaveMessageRecord[]> = {
  1: [
    { id: 1, leave_id: 1, employee_id: 1, sender_actor: 'EMPLOYEE', sender_label: 'Ahmet Yilmaz', message: 'Aile ziyareti icin 3 gun izin istiyorum.', created_at: iso(2880) },
    { id: 2, leave_id: 1, employee_id: 1, sender_actor: 'ADMIN', sender_label: 'IK Birimi', message: 'Talebiniz degerlendiriliyor, en kisa surede donus yapilacak.', created_at: iso(1440) },
  ],
  2: [
    { id: 3, leave_id: 2, employee_id: 1, sender_actor: 'ADMIN', sender_label: 'IK Birimi', message: 'Onaylandi, gecmis olsun.', created_at: iso(20160) },
  ],
}

const attachments: Record<number, EmployeeLeaveThreadRecord['attachments']> = {
  1: [
    { id: 10, leave_id: 1, employee_id: 1, uploaded_by_actor: 'EMPLOYEE', uploaded_by_label: 'Ahmet Yilmaz', file_name: 'izin-dilekce.pdf', content_type: 'application/pdf', file_size_bytes: 234567, created_at: iso(2880) },
  ],
}

const demoHistory: EmployeeDemoDayResponse = {
  employee_id: 1,
  day_local: new Date().toISOString().slice(0, 10),
  session_count: 5,
  active_session_count: 0,
  total_minutes: 165,
  sessions: [
    { started_at_utc: iso(360), ended_at_utc: iso(330), duration_minutes: 30, is_active: false },
    { started_at_utc: iso(300), ended_at_utc: iso(280), duration_minutes: 20, is_active: false },
    { started_at_utc: iso(240), ended_at_utc: iso(215), duration_minutes: 25, is_active: false },
    { started_at_utc: iso(120), ended_at_utc: iso(75), duration_minutes: 45, is_active: false },
    { started_at_utc: iso(50), ended_at_utc: iso(20), duration_minutes: 45, is_active: false },
  ],
}

const recoveryStatus: RecoveryCodeStatusResponse = {
  employee_id: 1, device_id: 1, recovery_ready: false, active_code_count: 0, expires_at: null,
}

const conversations: EmployeeConversationRecord[] = [
  {
    id: 1, employee_id: 1, employee_name: 'Ahmet Yilmaz', category: 'SHIFT',
    subject: 'Vardiya değişikliği', status: 'OPEN', created_at: iso(2880), updated_at: iso(120),
    closed_at: null, last_message_at: iso(120), message_count: 2, latest_message_preview: 'Talebinizi inceliyoruz.',
  },
  {
    id: 2, employee_id: 1, employee_name: 'Ahmet Yilmaz', category: 'DOCUMENT',
    subject: 'Bordro talebi', status: 'CLOSED', created_at: iso(20000), updated_at: iso(18000),
    closed_at: iso(18000), last_message_at: iso(18000), message_count: 2, latest_message_preview: 'E-posta ile gönderildi.',
  },
]

const conversationMessages: Record<number, EmployeeConversationMessageRecord[]> = {
  1: [
    { id: 101, conversation_id: 1, employee_id: 1, sender_actor: 'EMPLOYEE', sender_label: 'Ahmet Yilmaz', message: 'Cuma günü vardiyamı değiştirebilir miyiz?', created_at: iso(2880) },
    { id: 102, conversation_id: 1, employee_id: 1, sender_actor: 'ADMIN', sender_label: 'İK Birimi', message: 'Talebinizi inceliyoruz, en kısa sürede dönüş yapacağız.', created_at: iso(120) },
  ],
  2: [
    { id: 103, conversation_id: 2, employee_id: 1, sender_actor: 'EMPLOYEE', sender_label: 'Ahmet Yilmaz', message: 'Son 3 ayın bordrosunu rica ediyorum.', created_at: iso(20000) },
    { id: 104, conversation_id: 2, employee_id: 1, sender_actor: 'ADMIN', sender_label: 'İK Birimi', message: 'E-posta ile gönderildi.', created_at: iso(18000) },
  ],
}

function buildConversationThread(id: number): EmployeeConversationThreadRecord {
  const conversation = conversations.find((c) => c.id === id) ?? conversations[0]
  return { conversation, messages: conversationMessages[id] ?? [] }
}

let seq = 500
// 2. giris onay akisini simule et (admin yokken): PENDING -> sonraki status'te APPROVED.
let demoApproval: 'NONE' | 'PENDING' | 'APPROVED' = 'NONE'

function res<T>(config: InternalAxiosRequestConfig, data: T, statusCode = 200): AxiosResponse<T> {
  return { data, status: statusCode, statusText: 'OK', headers: new AxiosHeaders(), config }
}

function parseBody(config: InternalAxiosRequestConfig): Record<string, unknown> {
  if (typeof config.data === 'string') {
    try {
      return JSON.parse(config.data) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return {}
}

export const demoAdapter: AxiosAdapter = async (config) => {
  const method = (config.method ?? 'get').toLowerCase()
  const url = config.url ?? ''

  // GET
  if (method === 'get') {
    if (url.includes('/api/employee/status')) {
      const current = demoApproval
      if (demoApproval === 'PENDING') demoApproval = 'APPROVED' // admin onayini simule et
      return res(config, { ...status, extra_checkin_approval: current })
    }
    const commThread = /\/api\/employee\/communications\/(\d+)\/thread/.exec(url)
    if (commThread) return res(config, buildConversationThread(Number(commThread[1])))
    if (url.includes('/api/employee/communications')) return res(config, conversations)
    const thread = /\/api\/employee\/leaves\/(\d+)\/thread/.exec(url)
    if (thread) {
      const id = Number(thread[1])
      const leave = leaves.find((l) => l.id === id) ?? leaves[0]
      const data: EmployeeLeaveThreadRecord = {
        leave,
        attachments: attachments[id] ?? [],
        messages: threadMessages[id] ?? [],
      }
      return res(config, data)
    }
    if (url.includes('/api/employee/leaves')) return res(config, leaves)
    if (url.includes('/api/employee/demo-history')) return res(config, demoHistory)
    if (url.includes('/api/device/recovery-codes/status')) return res(config, recoveryStatus)
    return res(config, {})
  }

  // POST
  if (method === 'post') {
    if (url.includes('/api/employee/qr/scan')) {
      // Mesai bitmisken tekrar okutma = 2. giris -> admin onayi gerekir.
      if (status.today_status === 'FINISHED') {
        if (demoApproval === 'APPROVED') {
          demoApproval = 'NONE'
          status.today_status = 'IN_PROGRESS'
          status.has_open_shift = true
          status.last_in_ts = new Date().toISOString()
          const ok: AttendanceActionResponse = {
            ok: true, employee_id: 1, event_id: seq++, event_type: 'IN',
            ts_utc: new Date().toISOString(), location_status: 'VERIFIED_HOME', flags: {},
          }
          return res(config, ok)
        }
        demoApproval = 'PENDING'
        return res(config, {
          error: {
            code: 'SECOND_CHECKIN_APPROVAL_REQUIRED',
            message: 'Bugünkü ikinci giriş için admin onayı gerekiyor. Admin onayından sonra tekrar QR okutun.',
          },
        }, 409)
      }
      const isIn = status.today_status !== 'IN_PROGRESS'
      status.today_status = isIn ? 'IN_PROGRESS' : 'FINISHED'
      status.has_open_shift = isIn
      if (isIn) status.last_in_ts = new Date().toISOString()
      else status.last_out_ts = new Date().toISOString()
      const action: AttendanceActionResponse = {
        ok: true, employee_id: 1, event_id: seq++,
        event_type: isIn ? 'IN' : 'OUT', ts_utc: new Date().toISOString(),
        location_status: 'VERIFIED_HOME', flags: {},
      }
      return res(config, action)
    }
    if (url.includes('/api/attendance/checkout')) {
      status.today_status = 'FINISHED'
      status.has_open_shift = false
      status.last_out_ts = new Date().toISOString()
      const action: AttendanceActionResponse = {
        ok: true, employee_id: 1, event_id: seq++, event_type: 'OUT',
        ts_utc: new Date().toISOString(), location_status: 'VERIFIED_HOME', flags: {},
      }
      return res(config, action)
    }
    if (url.includes('/api/employee/app-presence/ping')) {
      const body = parseBody(config)
      if (body.source === 'DEMO_START') status.demo_active = true
      if (body.source === 'DEMO_END') status.demo_active = false
      return res(config, { ok: true, employee_id: 1, logged_at: new Date().toISOString() })
    }
    const msg = /\/api\/employee\/leaves\/(\d+)\/messages/.exec(url)
    if (msg) {
      const id = Number(msg[1])
      const body = parseBody(config)
      const list = threadMessages[id] ?? (threadMessages[id] = [])
      list.push({
        id: seq++, leave_id: id, employee_id: 1, sender_actor: 'EMPLOYEE',
        sender_label: 'Ahmet Yilmaz', message: String(body.message ?? ''),
        created_at: new Date().toISOString(),
      })
      const leave = leaves.find((l) => l.id === id) ?? leaves[0]
      leave.message_count = (leave.message_count ?? 0) + 1
      const data: EmployeeLeaveThreadRecord = { leave, attachments: attachments[id] ?? [], messages: list }
      return res(config, data)
    }
    if (url.includes('/api/employee/leaves/submit')) {
      const fd = config.data as FormData
      const record: EmployeeLeaveRecord = {
        id: seq++, employee_id: 1,
        start_date: String(fd.get('start_date') ?? ''),
        end_date: String(fd.get('end_date') ?? ''),
        type: (String(fd.get('type') ?? 'ANNUAL')) as EmployeeLeaveRecord['type'],
        status: 'PENDING', note: String(fd.get('note') ?? ''),
        requested_by_employee: true, decision_note: null, decided_at: null,
        created_at: new Date().toISOString(),
        attachment_count: fd.get('attachment') ? 1 : 0, message_count: 0,
        last_message_at: null, latest_message_preview: null,
      }
      leaves.unshift(record)
      return res(config, record)
    }
    const commMsg = /\/api\/employee\/communications\/(\d+)\/messages/.exec(url)
    if (commMsg) {
      const id = Number(commMsg[1])
      const body = parseBody(config)
      const list = conversationMessages[id] ?? (conversationMessages[id] = [])
      list.push({
        id: seq++, conversation_id: id, employee_id: 1, sender_actor: 'EMPLOYEE',
        sender_label: 'Ahmet Yilmaz', message: String(body.message ?? ''), created_at: new Date().toISOString(),
      })
      const conv = conversations.find((c) => c.id === id)
      if (conv) {
        conv.message_count += 1
        conv.last_message_at = new Date().toISOString()
        conv.latest_message_preview = String(body.message ?? '')
      }
      return res(config, buildConversationThread(id))
    }
    if (url.includes('/api/employee/communications')) {
      const body = parseBody(config)
      const id = seq++
      const nowIso = new Date().toISOString()
      conversations.unshift({
        id, employee_id: 1, employee_name: 'Ahmet Yilmaz',
        category: String(body.category ?? 'OTHER') as EmployeeConversationCategory,
        subject: String(body.subject ?? ''), status: 'OPEN', created_at: nowIso, updated_at: nowIso,
        closed_at: null, last_message_at: nowIso, message_count: 1, latest_message_preview: String(body.message ?? ''),
      })
      conversationMessages[id] = [{
        id: seq++, conversation_id: id, employee_id: 1, sender_actor: 'EMPLOYEE',
        sender_label: 'Ahmet Yilmaz', message: String(body.message ?? ''), created_at: nowIso,
      }]
      return res(config, buildConversationThread(id))
    }
    if (url.includes('/api/employee/install-funnel-event')) {
      return res(config, { ok: true })
    }
    // Passkey/recovery issue vb. demo'da desteklenmiyor -> nazik hata
    return res(config, { error: { code: 'DEMO_UNSUPPORTED', message: 'Demo modunda bu islem yok.' } }, 400)
  }

  return res(config, {})
}
