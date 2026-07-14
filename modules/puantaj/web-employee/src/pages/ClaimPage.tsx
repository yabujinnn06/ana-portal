import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Fingerprint, KeyRound, Loader2, Smartphone } from 'lucide-react'

import { claimDevice, parseApiError } from '../api/attendance'
import { EmployeeAuthShell } from '../components/EmployeeAuthShell'
import {
  clearPendingClaimToken,
  getPendingClaimToken,
  setPendingClaimToken,
} from '../utils/claimToken'
import {
  getOrCreateDeviceFingerprint,
  getStoredDeviceFingerprint,
} from '../utils/device'

type ClaimState = 'idle' | 'loading' | 'success' | 'error'

const LABEL_CLASS = 'font-sans text-xs font-semibold uppercase tracking-wider text-ink/50'
const PRIMARY_BTN_CLASS =
  'inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-accent bg-accent font-sans text-[0.95rem] font-semibold text-paper shadow-[0_6px_20px_-10px_rgba(14,124,155,0.6)] transition-shadow duration-200 hover:shadow-[0_14px_28px_-12px_rgba(14,124,155,0.7)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2'

export function ClaimPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryToken = (searchParams.get('token') ?? '').trim()

  const [claimState, setClaimState] = useState<ClaimState>('idle')
  const [tokenInput, setTokenInput] = useState<string>(() => queryToken || getPendingClaimToken())
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const autoAttemptedTokenRef = useRef<string>('')

  useEffect(() => {
    if (!queryToken) {
      return
    }
    setPendingClaimToken(queryToken)
    setTokenInput((prev) => (prev.trim() ? prev : queryToken))
  }, [queryToken])

  const activeToken = tokenInput.trim()

  const deviceFingerprint = useMemo(() => {
    const existing = getStoredDeviceFingerprint()
    if (existing) {
      return existing
    }
    if (!activeToken) {
      return ''
    }
    return getOrCreateDeviceFingerprint()
  }, [activeToken])

  const runClaim = useCallback(
    async (rawToken?: string) => {
      const token = (rawToken ?? tokenInput).trim()
      if (!token) {
        setClaimState('error')
        setErrorMessage('Claim token bulunamadi. Linkteki tokeni elle girin.')
        setRequestId(null)
        return
      }

      setPendingClaimToken(token)

      const fingerprint = deviceFingerprint || getOrCreateDeviceFingerprint()

      setClaimState('loading')
      setErrorMessage(null)
      setRequestId(null)

      try {
        await claimDevice({
          token,
          device_fingerprint: fingerprint,
        })

        clearPendingClaimToken()

        setClaimState('success')
        window.setTimeout(() => {
          navigate('/', { replace: true })
        }, 900)
      } catch (error) {
        const parsed = parseApiError(error, 'Cihaz baglama islemi basarisiz oldu.')
        setClaimState('error')
        setErrorMessage(parsed.message)
        setRequestId(parsed.requestId ?? null)
      }
    },
    [deviceFingerprint, navigate, tokenInput],
  )

  useEffect(() => {
    const autoToken = queryToken || getPendingClaimToken()
    if (!autoToken) {
      setClaimState('idle')
      return
    }
    if (autoAttemptedTokenRef.current === autoToken) {
      return
    }
    autoAttemptedTokenRef.current = autoToken
    setTokenInput(autoToken)
    void runClaim(autoToken)
  }, [queryToken, runClaim])

  return (
    <EmployeeAuthShell>
      <section className="relative overflow-hidden rounded-md border border-rule bg-paper shadow-[0_1px_0_rgba(16,42,58,0.04),0_22px_50px_-32px_rgba(14,124,155,0.45)]">
        <div className="relative px-6 py-7 sm:px-8 sm:py-9">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-md border border-accent/30 bg-accent/10 text-accent">
                <Smartphone className="h-4 w-4" aria-hidden />
              </span>
              <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-accent">
                Cihaz Bağlama
              </p>
            </div>
            <Link to="/" className="font-sans text-xs font-medium text-ink/50 transition hover:text-ink">
              Ana sayfa
            </Link>
          </div>

          <div className="mt-5">
            <h1 className="font-display text-2xl leading-tight text-ink">Cihaz Aktivasyonu</h1>
            <p className="mt-1.5 font-sans text-sm leading-relaxed text-ink/60">
              Cihaz bu çalışana bağlanarak puantaj için hazırlanıyor.
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className={LABEL_CLASS}>Claim Token</span>
              <div className="relative mt-1.5">
                <KeyRound
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35"
                  aria-hidden
                />
                <input
                  value={tokenInput}
                  onChange={(event) => setTokenInput(event.target.value)}
                  placeholder="Linkteki token otomatik gelir"
                  className="w-full rounded-md border border-rule bg-cream/60 py-3 pl-9 pr-3.5 font-mono text-sm text-ink placeholder:font-sans placeholder:text-ink/35 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-paper"
                />
              </div>
            </label>

            <label className="block">
              <span className={LABEL_CLASS}>Cihaz Parmak İzi</span>
              <div className="relative mt-1.5">
                <Fingerprint
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35"
                  aria-hidden
                />
                <input
                  value={deviceFingerprint || '-'}
                  readOnly
                  className="w-full rounded-md border border-rule bg-cream/40 py-3 pl-9 pr-3.5 font-mono text-xs text-ink/55"
                />
              </div>
            </label>

            <button
              type="button"
              disabled={claimState === 'loading' || !activeToken}
              onClick={() => void runClaim(activeToken)}
              className={PRIMARY_BTN_CLASS}
            >
              {claimState === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Smartphone className="h-4 w-4" aria-hidden />
              )}
              {claimState === 'loading' ? 'Bağlanıyor...' : 'Cihazı Aktive Et'}
            </button>
          </div>

          {claimState === 'success' ? (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-ok/30 bg-ok/10 px-3.5 py-3 font-sans text-sm text-ok">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">Cihaz başarıyla bağlandı</p>
                <p className="text-ok/80">Ana ekrana yönlendiriliyorsunuz...</p>
              </div>
            </div>
          ) : null}

          {claimState === 'error' ? (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-err/30 bg-err/10 px-3.5 py-3 font-sans text-sm text-err">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                <p>{errorMessage ?? 'Cihaz bağlama işlemi başarısız oldu.'}</p>
                {requestId ? <p className="mt-1 font-mono text-xs text-err/70">request_id: {requestId}</p> : null}
              </div>
            </div>
          ) : null}

          <div className="mt-6 border-t border-rule pt-4 text-center">
            <Link
              to="/recover"
              className="font-sans text-sm font-medium text-accent transition hover:text-accent/80"
            >
              Passkey veya recovery code ile kurtarma dene
            </Link>
          </div>
        </div>
      </section>

      <p className="mt-8 text-center font-mono text-[0.62rem] uppercase tracking-widest text-ink/30">
        Yabujin · Calisan Portali
      </p>
    </EmployeeAuthShell>
  )
}
