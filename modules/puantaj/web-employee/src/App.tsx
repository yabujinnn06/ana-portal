import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { postEmployeeAppPresencePing, postEmployeeAppPresencePingKeepalive } from './api/attendance'
import { BrandSignature } from './components/BrandSignature'
import { HomePageV2 } from './features/home-v2/HomePageV2'
import { PushNotificationPopup } from './features/home-v2/components/PushNotificationPopup'
import { ClaimPage } from './pages/ClaimPage'
import { HomePage } from './pages/HomePage'
import { RecoverPage } from './pages/RecoverPage'
import { getPendingClaimToken } from './utils/claimToken'
import { getStoredDeviceFingerprint, setStoredDeviceFingerprint } from './utils/device'
import {
  getCachedLocation,
  getCurrentLocation,
  getDeviceTelemetry,
  getWatchedLocationOnce,
} from './utils/location'

const EMPLOYEE_BOOT_LOADER_SESSION_KEY = 'pf_employee_boot_loader_seen_v5'
const EMPLOYEE_BOOT_LOADER_MIN_MS = 2600

function shouldShowEmployeeBootLoader(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  try {
    return window.sessionStorage.getItem(EMPLOYEE_BOOT_LOADER_SESSION_KEY) !== '1'
  } catch {
    return false
  }
}

function markEmployeeBootLoaderSeen(): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.sessionStorage.setItem(EMPLOYEE_BOOT_LOADER_SESSION_KEY, '1')
  } catch {
    // best effort
  }
}

function EmployeeRouteGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()

  // Dev modunda mock fingerprint - production'da calismaz
  if (import.meta.env.DEV && !getStoredDeviceFingerprint()) {
    setStoredDeviceFingerprint('dev-mock-fp-001')
  }

  const hasDeviceFingerprint = Boolean(getStoredDeviceFingerprint())
  const queryToken = useMemo(
    () => (new URLSearchParams(location.search).get('token') ?? '').trim(),
    [location.search],
  )
  const pendingClaimToken = useMemo(() => getPendingClaimToken(), [location.key])

  useEffect(() => {
    if (queryToken) {
      navigate(`/claim?token=${encodeURIComponent(queryToken)}`, { replace: true })
      return
    }

    if (pendingClaimToken) {
      navigate('/claim', { replace: true })
      return
    }

    if (hasDeviceFingerprint) {
      return
    }

    const recoverTimer = window.setTimeout(() => {
      navigate('/recover', {
        replace: true,
        state: { from: `${location.pathname}${location.search}` },
      })
    }, 150)

    return () => {
      window.clearTimeout(recoverTimer)
    }
  }, [hasDeviceFingerprint, location.pathname, location.search, navigate, pendingClaimToken, queryToken])

  if (hasDeviceFingerprint) {
    return <>{children}</>
  }

  return (
    <main className="phone-shell">
      <section className="phone-card">
        <div className="card-topbar">
          <div>
            <p className="chip chip-warn">Uyarı</p>
            <h1>Cihaz Bağlantısı Gerekli</h1>
          </div>
          <Link className="topbar-link" to="/recover">
            Kurtarma
          </Link>
        </div>
        <div className="warn-box banner-warning">
          <p>
            <span className="banner-icon" aria-hidden="true">
              !
            </span>
            Cihaz bagli degil. Once passkey veya recovery code ile kurtarma deneyin, olmazsa aktivasyon linki kullanin.
          </p>
        </div>
        <p className="muted">Kurtarma ekranina yonlendiriliyorsunuz...</p>
        <div className="footer-link">
          <Link className="inline-link" to="/recover">
            Kurtarma ekranına git
          </Link>
        </div>
        <BrandSignature />
      </section>
    </main>
  )
}

function NotFoundPage() {
  return (
    <main className="phone-shell">
      <section className="phone-card">
        <div className="card-topbar">
          <div>
            <p className="chip chip-warn">Hata</p>
            <h1>Sayfa Bulunamadı</h1>
          </div>
          <Link className="topbar-link" to="/">
            Ana Sayfa
          </Link>
        </div>
        <p className="muted">Aradığınız ekran bu sürümde mevcut değil.</p>
        <BrandSignature />
      </section>
    </main>
  )
}

function EmployeePresenceTracker() {
  useEffect(() => {
    const deviceFingerprint = getStoredDeviceFingerprint()
    if (!deviceFingerprint) {
      return
    }

    const sessionKey = 'employee_app_presence_last_ping_at'
    const lastPingAtRaw = window.sessionStorage.getItem(sessionKey)
    if (lastPingAtRaw) {
      const lastPingAt = Number(lastPingAtRaw)
      if (Number.isFinite(lastPingAt) && Date.now() - lastPingAt < 15 * 60 * 1000) {
        return
      }
    }

    let cancelled = false
    void (async () => {
      const locationResult = await getCurrentLocation(5000)
      if (cancelled) {
        return
      }
      await postEmployeeAppPresencePing({
        device_fingerprint: deviceFingerprint,
        source: 'APP_OPEN',
        lat: locationResult.location?.lat,
        lon: locationResult.location?.lon,
        accuracy_m: locationResult.location?.accuracy_m ?? null,
      }).catch(() => undefined)
      if (!cancelled) {
        window.sessionStorage.setItem(sessionKey, String(Date.now()))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const deviceFingerprint = getStoredDeviceFingerprint()
    if (!deviceFingerprint || typeof window === 'undefined') {
      return
    }

    // Surekli watchPosition yerine 60 sn'de bir tek atimlik konum okumasi:
    // iOS'ta acik kalan GPS isinma + termal kisitlama (kasma/donma) yapiyordu.
    const intervalMs = 60 * 1000
    let intervalId: number | null = null
    let cancelled = false
    let inFlight = false

    const sendLocationPing = () => {
      if (inFlight) {
        return
      }
      inFlight = true
      void (async () => {
        try {
          const loc = await getWatchedLocationOnce()
          if (cancelled || !loc) {
            return
          }
          const telemetry = await getDeviceTelemetry()
          await postEmployeeAppPresencePing({
            device_fingerprint: deviceFingerprint,
            source: 'LOCATION_PING',
            lat: loc.lat,
            lon: loc.lon,
            accuracy_m: loc.accuracy_m,
            speed_mps: loc.speed_mps,
            heading_deg: loc.heading_deg,
            altitude_m: loc.altitude_m,
            provider: 'gps',
            battery_level: telemetry.battery_level,
            network_type: telemetry.network_type,
          }).catch(() => undefined)
        } finally {
          inFlight = false
        }
      })()
    }

    const stopPinging = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId)
        intervalId = null
      }
    }

    const startPinging = () => {
      if (intervalId !== null) {
        return
      }
      sendLocationPing()
      intervalId = window.setInterval(sendLocationPing, intervalMs)
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPinging()
      } else {
        startPinging()
      }
    }

    if (!document.hidden) {
      startPinging()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      stopPinging()
    }
  }, [])

  useEffect(() => {
    const deviceFingerprint = getStoredDeviceFingerprint()
    if (!deviceFingerprint || typeof window === 'undefined') {
      return
    }

    const handlePageHide = () => {
      const cachedLocation = getCachedLocation()
      void postEmployeeAppPresencePingKeepalive({
        device_fingerprint: deviceFingerprint,
        source: 'APP_CLOSE',
        lat: cachedLocation?.lat,
        lon: cachedLocation?.lon,
        accuracy_m: cachedLocation?.accuracy_m ?? null,
      })
    }

    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [])

  return null
}

export default function App() {
  const isV1 = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('v1') === '1'
  const [showBootLoader, setShowBootLoader] = useState(() => isV1 && shouldShowEmployeeBootLoader())

  useEffect(() => {
    if (!showBootLoader) {
      return
    }
    markEmployeeBootLoaderSeen()
    const timer = window.setTimeout(() => {
      setShowBootLoader(false)
    }, EMPLOYEE_BOOT_LOADER_MIN_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [showBootLoader])

  return (
    <>
      <EmployeePresenceTracker />
      <PushNotificationPopup />

      {showBootLoader ? (
        <div
          className="employee-boot-loader"
          role="status"
          aria-live="polite"
          aria-label="Uygulama açılıyor"
        >
          <div className="employee-boot-loader-center">
            <div className="employee-boot-loader-stage" aria-hidden="true">
              <div className="employee-boot-loader-shadow" />
              <div className="employee-boot-loader-nebula employee-boot-loader-nebula--back" />
              <div className="employee-boot-loader-nebula employee-boot-loader-nebula--front" />
              <div className="employee-boot-loader-aura" />
              <div className="employee-boot-loader-orbit employee-boot-loader-orbit--outer" />
              <div className="employee-boot-loader-orbit employee-boot-loader-orbit--mid" />
              <div className="employee-boot-loader-orbit employee-boot-loader-orbit--inner" />
              <div className="employee-boot-loader-orbit employee-boot-loader-orbit--polar" />
              <div className="employee-boot-loader-satellite employee-boot-loader-satellite--outer">
                <div className="employee-boot-loader-satellite-core" />
              </div>
              <div className="employee-boot-loader-satellite employee-boot-loader-satellite--mid">
                <div className="employee-boot-loader-satellite-core" />
              </div>
              <div className="employee-boot-loader-satellite employee-boot-loader-satellite--inner">
                <div className="employee-boot-loader-satellite-core" />
              </div>
              <div className="employee-boot-loader-logo">
                <div className="employee-boot-loader-logo-depth" />
                <div className="employee-boot-loader-logo-halo" />
                <div className="employee-boot-loader-ring employee-boot-loader-ring--back" />
                <div className="employee-boot-loader-core">
                  <span className="employee-boot-loader-monogram">Y</span>
                  <span className="employee-boot-loader-brand">YABUJIN</span>
                  <span className="employee-boot-loader-sub">EMPLOYEE CORE</span>
                </div>
                <div className="employee-boot-loader-ring employee-boot-loader-ring--front" />
                <div className="employee-boot-loader-spark employee-boot-loader-spark--a" />
                <div className="employee-boot-loader-spark employee-boot-loader-spark--b" />
              </div>
            </div>
            <p className="employee-boot-loader-text">Sistem hazırlanıyor...</p>
            <p className="employee-boot-loader-caption">Güvenli çalışma katmanı yükleniyor</p>
          </div>
        </div>
      ) : null}

      <Routes>
        <Route
          index
          element={
            new URLSearchParams(window.location.search).get('v1') === '1' ? (
              <EmployeeRouteGuard>
                <HomePage />
              </EmployeeRouteGuard>
            ) : (
              <EmployeeRouteGuard>
                <HomePageV2 />
              </EmployeeRouteGuard>
            )
          }
        />
        <Route path="claim" element={<ClaimPage />} />
        <Route path="recover" element={<RecoverPage />} />
        <Route path="settings" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  )
}
