import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { checkout, parseApiError, postEmployeeAppPresencePing, type ParsedApiError } from '../../api/attendance'
import { BrandSignature } from '../../components/BrandSignature'
import { useDepoOzet } from '../../hooks/useDepoOzet'
import { useEmployeeDemoHistory } from '../../hooks/useEmployeeDemoHistory'
import { useEmployeeLeaves } from '../../hooks/useEmployeeLeaves'
import { useEmployeeStatus } from '../../hooks/useEmployeeStatus'
import type { AttendanceActionResponse, EmployeeLeaveRecord } from '../../types/api'
import {
  playCheckinSuccessTone,
  playCheckoutSuccessTone,
  playQrErrorTone,
  vibrate,
  VIBRATE_CONFIRM,
  VIBRATE_ERROR,
  VIBRATE_SUCCESS,
} from '../../utils/audio'
import { clearStoredDeviceFingerprint, getStoredDeviceFingerprint } from '../../utils/device'
import { getCurrentLocation } from '../../utils/location'
import { ActionErrorFlash, type ActionErrorPayload } from './components/ActionErrorFlash'
import { ActionSuccessFlash } from './components/ActionSuccessFlash'
import { AlertRibbon } from './components/AlertRibbon'
import { CommunicationsModal } from './components/CommunicationsModal'
import { ConfirmDialog } from './components/ConfirmDialog'
import { DemoLedger } from './components/DemoLedger'
import { HeroStatus } from './components/HeroStatus'
import { InstallNotifyBar } from './components/InstallNotifyBar'
import { LeaveLedger } from './components/LeaveLedger'
import { LeaveRequestModal } from './components/LeaveRequestModal'
import { LeaveThreadModal } from './components/LeaveThreadModal'
import { Masthead } from './components/Masthead'
import { BreakControl } from './components/BreakControl'
import { REQUEST_CHECKOUT_EVENT } from './components/PushNotificationPopup'
import { QrScanModal } from './components/QrScanModal'
import { QuickActions } from './components/QuickActions'
import { RecentLedger, type RecentEntry } from './components/RecentLedger'
import { SettingsModal } from './components/SettingsModal'
import { HomePageV2Skeleton } from './components/Skeleton'

function formatLocalTime(utcStr: string | null | undefined): string {
  if (!utcStr) return '--:--'
  return new Date(utcStr).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

function buildLeaveAlerts(leaves: EmployeeLeaveRecord[]) {
  return leaves
    .filter((l) => l.status === 'PENDING')
    .slice(0, 3)
    .map((l) => ({
      id: String(l.id),
      tone: 'warn' as const,
      text: `İzin talebiniz onay bekliyor (${l.start_date} – ${l.end_date})`,
    }))
}

function buildRecentEntries(
  lastInTs: string | null | undefined,
  lastOutTs: string | null | undefined,
): RecentEntry[] {
  const entries: RecentEntry[] = []
  if (lastOutTs) {
    entries.push({ id: 'out', type: 'CHECKOUT', label: 'Mesai bitişi', timestamp: formatLocalTime(lastOutTs) })
  }
  if (lastInTs) {
    entries.push({ id: 'in', type: 'CHECKIN', label: 'Mesai başlangıcı', timestamp: formatLocalTime(lastInTs) })
  }
  return entries
}

export function HomePageV2() {
  const navigate = useNavigate()
  // Cihaz parmak izini mount aninda oku; modul seviyesinde okunursa claim
  // sonrasi (ayni oturumda) eski deger kalir ve haksiz yere recover'a atar.
  const [deviceFingerprint] = useState(() => getStoredDeviceFingerprint())
  const [isBusy, setIsBusy] = useState(false)
  const [isDemoBusy, setIsDemoBusy] = useState(false)
  const [flash, setFlash] = useState<
    'checkin' | 'checkout' | 'demo-start' | 'demo-end' | null
  >(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [actionError, setActionError] = useState<ActionErrorPayload | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const [isQrOpen, setIsQrOpen] = useState(false)
  const [isLeaveOpen, setIsLeaveOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isCommsOpen, setIsCommsOpen] = useState(false)
  const [confirmCheckout, setConfirmCheckout] = useState(false)
  const [activeLeaveId, setActiveLeaveId] = useState<number | null>(null)
  const [locationWarning, setLocationWarning] = useState<string | null>(null)

  // Cihaz baglantisi dustuyse (DEVICE_NOT_CLAIMED) fingerprint temizle ve
  // recover'a yonlendir. true donerse cagiran taraf islemi durdurur.
  const handleDeviceNotClaimed = useCallback(
    (parsed: ParsedApiError): boolean => {
      if (parsed.code !== 'DEVICE_NOT_CLAIMED') return false
      clearStoredDeviceFingerprint()
      navigate('/recover', { replace: true })
      return true
    },
    [navigate],
  )

  useEffect(() => {
    if (!deviceFingerprint) {
      navigate('/recover', { replace: true })
    }
  }, [navigate])

  const [isPageLoading, setIsPageLoading] = useState(true)

  const { todayStatus, statusSnapshot, setTodayStatus, setStatusSnapshot } = useEmployeeStatus({
    deviceFingerprint,
    refreshToken,
    onAuthFailure: handleDeviceNotClaimed,
  })

  const { leaveHistory } = useEmployeeLeaves({
    deviceFingerprint,
    enabled: true,
    refreshToken,
    onAuthFailure: handleDeviceNotClaimed,
  })

  const { demoHistory } = useEmployeeDemoHistory({
    deviceFingerprint,
    enabled: true,
    lastStartedAtUtc: statusSnapshot?.last_demo_started_at_utc,
    lastEndedAtUtc: statusSnapshot?.last_demo_ended_at_utc,
    onAuthFailure: handleDeviceNotClaimed,
  })

  // Depo modulu izne tabi: ozet cekilip izin=true donerse QuickActions'ta gorunur.
  const { izinli: depoIzinli } = useDepoOzet({
    deviceFingerprint,
    enabled: true,
    refreshToken,
    onAuthFailure: handleDeviceNotClaimed,
  })

  useEffect(() => {
    if (statusSnapshot !== null) { setIsPageLoading(false); return }
    const t = window.setTimeout(() => setIsPageLoading(false), 1500)
    return () => window.clearTimeout(t)
  }, [statusSnapshot])

  // 2. giris onayi beklenirken durumu yokla -> admin onaylayinca "okutabilirsiniz" gozuksun.
  useEffect(() => {
    if (statusSnapshot?.extra_checkin_approval !== 'PENDING') return
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      setRefreshToken((t) => t + 1)
    }, 15000)
    return () => window.clearInterval(id)
  }, [statusSnapshot?.extra_checkin_approval])

  const workState = todayStatus === 'IN_PROGRESS' ? 'WORKING' : todayStatus

  const checkInTime = statusSnapshot?.last_in_ts ? formatLocalTime(statusSnapshot.last_in_ts) : null
  const checkOutTime = statusSnapshot?.last_out_ts ? formatLocalTime(statusSnapshot.last_out_ts) : null
  const isDemoActive = Boolean(statusSnapshot?.demo_active)
  const approvalState = statusSnapshot?.extra_checkin_approval ?? 'NONE'

  const alertItems = buildLeaveAlerts(leaveHistory)
  const recentEntries = buildRecentEntries(statusSnapshot?.last_in_ts, statusSnapshot?.last_out_ts)

  const primaryLabel =
    workState === 'NOT_STARTED'
      ? 'Mesai başlat (QR)'
      : workState === 'WORKING'
        ? 'Çıkış yap'
        : 'Mesai tamamlandı'

  const statusRef = useRef(workState)
  statusRef.current = workState

  function showError(msg: string, ms = 4000) {
    setErrorMsg(msg)
    window.setTimeout(() => setErrorMsg(null), ms)
  }

  function showNotice(msg: string, ms = 3000) {
    setNotice(msg)
    window.setTimeout(() => setNotice(null), ms)
  }

  function triggerActionError(payload: ActionErrorPayload) {
    setActionError(payload)
    playQrErrorTone()
    vibrate(VIBRATE_ERROR)
  }

  function handlePrimaryAction() {
    if (isBusy) return
    if (statusRef.current !== 'WORKING') {
      setIsQrOpen(true)
      return
    }
    setConfirmCheckout(true)
  }

  async function doCheckout() {
    if (isBusy) return
    setIsBusy(true)
    setErrorMsg(null)
    setLocationWarning(null)
    try {
      const locResult = await getCurrentLocation()
      // v1 ile ayni: GPS yoksa cikis yine yapilir ama uyari gosterilir.
      setLocationWarning(locResult.warning)
      await checkout({
        device_fingerprint: deviceFingerprint!,
        lat: locResult.location?.lat,
        lon: locResult.location?.lon,
        accuracy_m: locResult.location?.accuracy_m,
        manual: true,
      })
      setTodayStatus('FINISHED')
      setRefreshToken((t) => t + 1)
      playCheckoutSuccessTone()
      vibrate(VIBRATE_SUCCESS)
      setConfirmCheckout(false)
      setFlash('checkout')
      window.setTimeout(() => setFlash(null), 1_800)
    } catch (err) {
      const parsed = parseApiError(err, 'Çıkış işlemi başarısız oldu.')
      setConfirmCheckout(false)
      if (handleDeviceNotClaimed(parsed)) return
      triggerActionError({ title: 'Çıkış yapılamadı', message: parsed.message, requestId: parsed.requestId })
    } finally {
      setIsBusy(false)
    }
  }

  // In-app hero popup "Evet, bitir" onayindan sonra gercek cikisi burada calistir.
  // (Onay popup'ta verildigi icin ConfirmDialog tekrar acilmaz.)
  const doCheckoutRef = useRef(doCheckout)
  doCheckoutRef.current = doCheckout
  useEffect(() => {
    const handler = () => {
      if (statusRef.current === 'WORKING') {
        void doCheckoutRef.current()
      }
    }
    window.addEventListener(REQUEST_CHECKOUT_EVENT, handler)
    return () => window.removeEventListener(REQUEST_CHECKOUT_EVENT, handler)
  }, [])

  function handleQrScanned(response: AttendanceActionResponse) {
    const nextStatus = response.event_type === 'IN' ? 'IN_PROGRESS' : 'FINISHED'
    setTodayStatus(nextStatus)
    setStatusSnapshot((prev) =>
      prev
        ? {
            ...prev,
            today_status: nextStatus,
            has_open_shift: response.event_type === 'IN',
            last_in_ts: response.event_type === 'IN' ? response.ts_utc : prev.last_in_ts,
            last_out_ts: response.event_type === 'OUT' ? response.ts_utc : prev.last_out_ts,
            last_location_status: response.location_status,
            last_flags: response.flags,
          }
        : prev,
    )
    vibrate(response.event_type === 'IN' ? VIBRATE_CONFIRM : VIBRATE_SUCCESS)
    setFlash(response.event_type === 'IN' ? 'checkin' : 'checkout')
    window.setTimeout(() => setFlash(null), 1_800)
    setRefreshToken((t) => t + 1)
  }

  async function handleDemoToggle() {
    if (!deviceFingerprint || isDemoBusy) return
    if (workState !== 'WORKING') {
      showError('Demo kaydı için önce mesai başlatmalısınız.')
      return
    }
    setIsDemoBusy(true)
    setErrorMsg(null)
    try {
      const locResult = await getCurrentLocation()
      if (!locResult.location) {
        showError('Demo konum bilgisi için GPS izni gerekli. Açıp tekrar deneyin.')
        return
      }
      const nextSource = isDemoActive ? 'DEMO_END' : 'DEMO_START'
      const loggedAt = new Date().toISOString()
      await postEmployeeAppPresencePing({
        device_fingerprint: deviceFingerprint,
        source: nextSource,
        lat: locResult.location.lat,
        lon: locResult.location.lon,
        accuracy_m: locResult.location.accuracy_m,
      })
      if (isDemoActive) playCheckoutSuccessTone()
      else playCheckinSuccessTone()
      vibrate(VIBRATE_SUCCESS)
      // Layout'u kaydiran notice yerine sabit overlay flash (demo logosuyla).
      setFlash(isDemoActive ? 'demo-end' : 'demo-start')
      window.setTimeout(() => setFlash(null), 1_800)
      setStatusSnapshot((prev) =>
        prev
          ? {
              ...prev,
              demo_active: !isDemoActive,
              last_demo_started_at_utc: isDemoActive
                ? prev.last_demo_started_at_utc ?? null
                : loggedAt,
              last_demo_ended_at_utc: isDemoActive ? loggedAt : prev.last_demo_ended_at_utc ?? null,
            }
          : prev,
      )
      setRefreshToken((t) => t + 1)
    } catch (err) {
      const parsed = parseApiError(err, 'Demo kaydı alınamadı.')
      if (handleDeviceNotClaimed(parsed)) return
      vibrate(VIBRATE_ERROR)
      showError(parsed.message)
    } finally {
      setIsDemoBusy(false)
    }
  }

  if (!deviceFingerprint) return null

  return (
    <div className="relative min-h-screen bg-cream font-sans text-ink antialiased overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.08]"
        style={{
          backgroundImage: 'repeating-linear-gradient(78deg, rgba(14,124,155,0.45) 0 1px, transparent 1px 26px)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% -10%, rgba(14,124,155,0.10) 0%, transparent 55%), radial-gradient(ellipse at 100% 100%, rgba(245,158,11,0.05) 0%, transparent 50%)',
        }}
      />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        {[8, 18, 31, 47, 62, 76, 89].map((left, i) => (
          <span
            key={left}
            className="absolute top-0 h-4 w-px bg-gradient-to-b from-transparent via-accent/25 to-transparent animate-rain-drop"
            style={{ left: `${left}%`, animationDelay: `${i * 0.6}s`, animationDuration: `${4.5 + (i % 4) * 0.8}s` }}
          />
        ))}
      </div>

      <ActionSuccessFlash visible={flash !== null} type={flash ?? 'checkin'} />
      <ActionErrorFlash payload={actionError} onDismiss={() => setActionError(null)} />

      <div className="relative z-10 mx-auto max-w-[640px] px-5 py-7 sm:px-8 sm:py-10">
        <AnimatePresence mode="wait">
          {isPageLoading ? (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <HomePageV2Skeleton />
            </motion.div>
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <Masthead />

              <div className="space-y-6">
                {errorMsg && (
                  <AlertRibbon items={[{ id: 'err', tone: 'err', text: errorMsg }]} />
                )}

                {locationWarning && (
                  <AlertRibbon items={[{ id: 'locwarn', tone: 'warn', text: locationWarning }]} />
                )}

                {notice && (
                  <AlertRibbon items={[{ id: 'notice', tone: 'info', text: notice }]} />
                )}

                {approvalState === 'PENDING' && (
                  <AlertRibbon
                    items={[{
                      id: 'extra-pending',
                      tone: 'warn',
                      text: 'İkinci giriş için admin onayı bekleniyor. Onaylandığında QR okutabilirsiniz.',
                    }]}
                  />
                )}

                {approvalState === 'APPROVED' && (
                  <button type="button" onClick={() => setIsQrOpen(true)} className="w-full text-left">
                    <AlertRibbon
                      items={[{
                        id: 'extra-approved',
                        tone: 'info',
                        text: 'Admin onayı verildi. QR okutarak mesaiye devam edebilirsiniz.',
                      }]}
                    />
                  </button>
                )}

                <HeroStatus
                  state={workState}
                  employeeName={statusSnapshot?.employee_name}
                  departmentName={statusSnapshot?.department_name}
                  regionName={statusSnapshot?.region_name}
                  checkInTime={checkInTime}
                  checkOutTime={checkOutTime}
                  primaryActionLabel={primaryLabel}
                  onPrimaryAction={() => void handlePrimaryAction()}
                  isLoading={isBusy}
                  disabled={workState === 'FINISHED'}
                />

                <InstallNotifyBar deviceFingerprint={deviceFingerprint} onInfo={showNotice} />

                {alertItems.length > 0 && <AlertRibbon items={alertItems} />}

                <QuickActions
                  onScanQr={() => setIsQrOpen(true)}
                  onDemoToggle={() => void handleDemoToggle()}
                  onLeave={() => setIsLeaveOpen(true)}
                  onSettings={() => setIsSettingsOpen(true)}
                  onMessages={() => setIsCommsOpen(true)}
                  onDepo={() => window.open('/depo', '_blank', 'noopener,noreferrer')}
                  showDepo={depoIzinli}
                  isDemoActive={isDemoActive}
                  isDemoDisabled={workState !== 'WORKING' || isDemoBusy}
                  isDemoBusy={isDemoBusy}
                />

                <BreakControl
                  deviceFingerprint={deviceFingerprint}
                  workState={workState}
                />

                {recentEntries.length > 0 && <RecentLedger entries={recentEntries} />}

                <DemoLedger demo={demoHistory} />

                <LeaveLedger leaves={leaveHistory} onOpen={(id) => setActiveLeaveId(id)} />

                <footer className="pt-5 mt-10 border-t border-rule flex items-center justify-between font-sans text-xs text-ink/50">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-ok animate-breath" />
                    <span>Senkron tamam</span>
                    <span className="font-mono text-ink/30">· {__BUILD_TS__}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const params = new URLSearchParams(window.location.search)
                      params.delete('v2')
                      window.location.search = params.toString()
                    }}
                    className="text-ink/55 hover:text-accent transition-colors"
                  >
                    eski sürüme dön
                  </button>
                </footer>

                <BrandSignature />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <QrScanModal
        open={isQrOpen}
        onClose={() => setIsQrOpen(false)}
        deviceFingerprint={deviceFingerprint}
        onScanned={handleQrScanned}
        onDeviceNotClaimed={handleDeviceNotClaimed}
        onApprovalRequired={() => setRefreshToken((t) => t + 1)}
      />

      <LeaveRequestModal
        open={isLeaveOpen}
        onClose={() => setIsLeaveOpen(false)}
        deviceFingerprint={deviceFingerprint}
        onSubmitted={() => setRefreshToken((t) => t + 1)}
      />

      <SettingsModal
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        deviceFingerprint={deviceFingerprint}
        passkeyRegistered={Boolean(statusSnapshot?.passkey_registered)}
        onPasskeyRegistered={() =>
          setStatusSnapshot((prev) => (prev ? { ...prev, passkey_registered: true } : prev))
        }
      />

      <CommunicationsModal
        open={isCommsOpen}
        onClose={() => setIsCommsOpen(false)}
        deviceFingerprint={deviceFingerprint}
        onDeviceNotClaimed={handleDeviceNotClaimed}
      />

      <ConfirmDialog
        open={confirmCheckout}
        title="Çıkış yapmak istediğinize emin misiniz?"
        message="Bugünkü mesainiz kapatılacak."
        confirmLabel="Evet, çıkış yap"
        cancelLabel="Hayır"
        busy={isBusy}
        onConfirm={() => void doCheckout()}
        onCancel={() => setConfirmCheckout(false)}
      />

      <LeaveThreadModal
        open={activeLeaveId !== null}
        leaveId={activeLeaveId}
        deviceFingerprint={deviceFingerprint}
        onClose={() => setActiveLeaveId(null)}
        onChanged={() => setRefreshToken((t) => t + 1)}
        onDeviceNotClaimed={handleDeviceNotClaimed}
      />
    </div>
  )
}
