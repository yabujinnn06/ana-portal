import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { startAuthentication } from '@simplewebauthn/browser'
import { AlertCircle, CheckCircle2, Fingerprint, Hash, KeyRound, Loader2, ShieldCheck } from 'lucide-react'

import {
  getPasskeyRecoverOptions,
  parseApiError,
  recoverDeviceWithCode,
  verifyPasskeyRecover,
} from '../api/attendance'
import { EmployeeAuthShell } from '../components/EmployeeAuthShell'

const LABEL_CLASS = 'font-sans text-xs font-semibold uppercase tracking-wider text-ink/50'
const FIELD_CLASS =
  'w-full rounded-md border border-rule bg-cream/60 py-3 pl-9 pr-3.5 font-sans text-[0.95rem] text-ink placeholder:text-ink/35 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-paper'
const FIELD_ICON_CLASS = 'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35'
const PRIMARY_BTN_CLASS =
  'inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-accent bg-accent font-sans text-[0.95rem] font-semibold text-paper shadow-[0_6px_20px_-10px_rgba(14,124,155,0.6)] transition-shadow duration-200 hover:shadow-[0_14px_28px_-12px_rgba(14,124,155,0.7)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2'
const SOFT_BTN_CLASS =
  'inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-rule bg-cream/60 font-sans text-[0.95rem] font-semibold text-ink transition hover:bg-cream disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2'

export function RecoverPage() {
  const navigate = useNavigate()
  const [isPasskeyBusy, setIsPasskeyBusy] = useState(false)
  const [isCodeBusy, setIsCodeBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [employeeId, setEmployeeId] = useState('')
  const [recoveryPin, setRecoveryPin] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')

  const applyRecoveredDevice = (successText: string) => {
    setSuccessMessage(successText)
    window.setTimeout(() => {
      navigate('/', { replace: true })
    }, 700)
  }

  const runPasskeyRecover = async () => {
    setIsPasskeyBusy(true)
    setErrorMessage(null)
    setRequestId(null)
    setSuccessMessage(null)

    try {
      if (!window.PublicKeyCredential) {
        throw new Error('Bu tarayici passkey (WebAuthn) desteklemiyor.')
      }

      const optionsData = await getPasskeyRecoverOptions()
      const assertion = await startAuthentication({
        optionsJSON: optionsData.options as unknown as Parameters<typeof startAuthentication>[0]['optionsJSON'],
      })

      await verifyPasskeyRecover({
        challenge_id: optionsData.challenge_id,
        credential: assertion as unknown as Record<string, unknown>,
      })

      applyRecoveredDevice('Cihaz kimligi passkey ile geri yuklendi. Yonlendiriliyorsunuz...')
    } catch (error) {
      const parsed = parseApiError(error, 'Passkey kurtarma islemi basarisiz oldu.')
      setErrorMessage(parsed.message)
      setRequestId(parsed.requestId ?? null)
    } finally {
      setIsPasskeyBusy(false)
    }
  }

  const runRecoveryCodeRecover = async () => {
    setIsCodeBusy(true)
    setErrorMessage(null)
    setRequestId(null)
    setSuccessMessage(null)

    try {
      const parsedEmployeeId = Number(employeeId)
      if (!Number.isInteger(parsedEmployeeId) || parsedEmployeeId <= 0) {
        throw new Error('Gecerli bir calisan ID girin.')
      }
      if (recoveryPin.trim().length < 6) {
        throw new Error('Recovery PIN en az 6 haneli olmali.')
      }
      if (recoveryCode.trim().length < 4) {
        throw new Error('Recovery code girin.')
      }

      await recoverDeviceWithCode({
        employee_id: parsedEmployeeId,
        recovery_pin: recoveryPin.trim(),
        recovery_code: recoveryCode.trim(),
      })

      applyRecoveredDevice('Cihaz kimligi recovery code ile geri yuklendi. Yonlendiriliyorsunuz...')
    } catch (error) {
      const parsed = parseApiError(error, 'Recovery code ile kurtarma basarisiz oldu.')
      setErrorMessage(parsed.message)
      setRequestId(parsed.requestId ?? null)
    } finally {
      setIsCodeBusy(false)
    }
  }

  return (
    <EmployeeAuthShell>
      <section className="relative overflow-hidden rounded-md border border-rule bg-paper shadow-[0_1px_0_rgba(16,42,58,0.04),0_22px_50px_-32px_rgba(14,124,155,0.45)]">
        <div className="relative px-6 py-7 sm:px-8 sm:py-9">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-md border border-accent/30 bg-accent/10 text-accent">
                <ShieldCheck className="h-4 w-4" aria-hidden />
              </span>
              <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-accent">
                Cihaz Kurtarma
              </p>
            </div>
            <Link to="/claim" className="font-sans text-xs font-medium text-ink/50 transition hover:text-ink">
              Aktivasyon
            </Link>
          </div>

          <div className="mt-5">
            <h1 className="font-display text-2xl leading-tight text-ink">Cihazını Geri Yükle</h1>
            <p className="mt-1.5 font-sans text-sm leading-relaxed text-ink/60">
              Tarayıcı verisi temizlendiyse cihaz parmak izi kaybolabilir. Passkey ile veya daha önce aldığınız{' '}
              <span className="font-semibold text-ink/75">Recovery Code + PIN</span> ile geri yükleyin.
            </p>
          </div>

          {successMessage ? (
            <div className="mt-5 flex items-start gap-2 rounded-md border border-ok/30 bg-ok/10 px-3.5 py-3 font-sans text-sm text-ok">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>{successMessage}</p>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-5 flex items-start gap-2 rounded-md border border-err/30 bg-err/10 px-3.5 py-3 font-sans text-sm text-err">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                <p>{errorMessage}</p>
                {requestId ? <p className="mt-1 font-mono text-xs text-err/70">request_id: {requestId}</p> : null}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            disabled={isPasskeyBusy || isCodeBusy}
            onClick={() => void runPasskeyRecover()}
            className={`mt-6 ${PRIMARY_BTN_CLASS}`}
          >
            {isPasskeyBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Fingerprint className="h-4 w-4" aria-hidden />
            )}
            {isPasskeyBusy ? 'Doğrulanıyor...' : 'Passkey ile Kurtar'}
          </button>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-rule" />
            <span className="font-sans text-[0.62rem] uppercase tracking-widest text-ink/35">veya kod ile</span>
            <span className="h-px flex-1 bg-rule" />
          </div>

          <div className="space-y-4">
            <label className="block" htmlFor="employeeIdInput">
              <span className={LABEL_CLASS}>Çalışan ID</span>
              <div className="relative mt-1.5">
                <Hash className={FIELD_ICON_CLASS} aria-hidden />
                <input
                  id="employeeIdInput"
                  inputMode="numeric"
                  value={employeeId}
                  onChange={(event) => setEmployeeId(event.target.value)}
                  placeholder="Örn: 42"
                  className={FIELD_CLASS}
                />
              </div>
            </label>

            <label className="block" htmlFor="recoveryPinInput">
              <span className={LABEL_CLASS}>Recovery PIN</span>
              <div className="relative mt-1.5">
                <KeyRound className={FIELD_ICON_CLASS} aria-hidden />
                <input
                  id="recoveryPinInput"
                  type="password"
                  inputMode="numeric"
                  value={recoveryPin}
                  onChange={(event) => setRecoveryPin(event.target.value)}
                  placeholder="6+ hane"
                  className={FIELD_CLASS}
                />
              </div>
            </label>

            <label className="block" htmlFor="recoveryCodeInput">
              <span className={LABEL_CLASS}>Recovery Code</span>
              <div className="relative mt-1.5">
                <ShieldCheck className={FIELD_ICON_CLASS} aria-hidden />
                <input
                  id="recoveryCodeInput"
                  value={recoveryCode}
                  onChange={(event) => setRecoveryCode(event.target.value)}
                  placeholder="Örn: AB3D-9K2M"
                  className={`${FIELD_CLASS} font-mono`}
                />
              </div>
            </label>

            <button
              type="button"
              disabled={isCodeBusy || isPasskeyBusy}
              onClick={() => void runRecoveryCodeRecover()}
              className={SOFT_BTN_CLASS}
            >
              {isCodeBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {isCodeBusy ? 'Doğrulanıyor...' : 'Recovery Code ile Kurtar'}
            </button>
          </div>

          <div className="mt-6 border-t border-rule pt-4 text-center">
            <Link to="/claim" className="font-sans text-sm font-medium text-accent transition hover:text-accent/80">
              Davet linki ile devam et
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
