import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Fingerprint, KeyRound, Loader2, ShieldCheck } from 'lucide-react'

import {
  getPasskeyRegisterOptions,
  getRecoveryCodeStatus,
  issueRecoveryCodes,
  parseApiError,
  revealRecoveryCodes,
  verifyPasskeyRegistration,
} from '../../../api/attendance'
import { SheetModal } from './SheetModal'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  deviceFingerprint: string
  passkeyRegistered: boolean
  onPasskeyRegistered: () => void
}

function formatExpiry(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fingerprintShort(value: string): string {
  if (value.length <= 12) return value
  return `${value.slice(0, 6)}...${value.slice(-6)}`
}

export function SettingsModal({
  open,
  onClose,
  deviceFingerprint,
  passkeyRegistered,
  onPasskeyRegistered,
}: SettingsModalProps) {
  const [recoveryReady, setRecoveryReady] = useState(false)
  const [recoveryCount, setRecoveryCount] = useState(0)
  const [recoveryExpiresAt, setRecoveryExpiresAt] = useState<string | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [revealPin, setRevealPin] = useState('')
  const [isStatusLoading, setIsStatusLoading] = useState(false)
  const [isIssueBusy, setIsIssueBusy] = useState(false)
  const [isRevealBusy, setIsRevealBusy] = useState(false)
  const [isPasskeyBusy, setIsPasskeyBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [fpCopied, setFpCopied] = useState(false)

  const loadStatus = useCallback(async () => {
    setIsStatusLoading(true)
    setError(null)
    try {
      const status = await getRecoveryCodeStatus(deviceFingerprint)
      setRecoveryReady(status.recovery_ready)
      setRecoveryCount(status.active_code_count)
      setRecoveryExpiresAt(status.expires_at)
    } catch (err) {
      setError(parseApiError(err, 'Recovery durumu alınamadı.').message)
    } finally {
      setIsStatusLoading(false)
    }
  }, [deviceFingerprint])

  useEffect(() => {
    if (!open) return
    setRecoveryCodes(null)
    setRevealPin('')
    setError(null)
    setNotice(null)
    setFpCopied(false)
    void loadStatus()
  }, [open, loadStatus])

  async function handleIssue() {
    if (isIssueBusy) return
    const pin = window.prompt('Yeni recovery PIN belirleyin (6-12 rakam):', '')
    if (pin === null) return
    const confirm = window.prompt('Recovery PIN tekrar:', '')
    if (confirm === null) return
    const normalized = pin.trim()
    if (normalized.length < 6 || normalized.length > 12 || !/^\d+$/.test(normalized)) {
      setError('PIN 6-12 rakam olmalı.')
      return
    }
    if (normalized !== confirm.trim()) {
      setError('PIN doğrulaması eşleşmedi.')
      return
    }

    setIsIssueBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await issueRecoveryCodes({ device_fingerprint: deviceFingerprint, recovery_pin: normalized })
      setRecoveryReady(true)
      setRecoveryCount(result.code_count)
      setRecoveryExpiresAt(result.expires_at)
      setRecoveryCodes(result.recovery_codes)
      setNotice('Yeni kodlar oluşturuldu. Güvenli bir yere kaydedin.')
    } catch (err) {
      setError(parseApiError(err, 'Recovery kodları oluşturulamadı.').message)
    } finally {
      setIsIssueBusy(false)
    }
  }

  async function handleReveal(e: React.FormEvent) {
    e.preventDefault()
    if (isRevealBusy) return
    const normalized = revealPin.trim()
    if (normalized.length < 6 || normalized.length > 12 || !/^\d+$/.test(normalized)) {
      setError('PIN 6-12 rakam olmalı.')
      return
    }
    setIsRevealBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await revealRecoveryCodes({ device_fingerprint: deviceFingerprint, recovery_pin: normalized })
      setRecoveryCount(result.active_code_count)
      setRecoveryExpiresAt(result.expires_at)
      setRecoveryCodes(result.recovery_codes)
      setRevealPin('')
      setNotice('Mevcut kodlar açıldı.')
    } catch (err) {
      setError(parseApiError(err, 'Recovery kodları açılamadı.').message)
    } finally {
      setIsRevealBusy(false)
    }
  }

  async function handlePasskeyRegister() {
    if (isPasskeyBusy) return
    setIsPasskeyBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (!window.PublicKeyCredential) {
        throw new Error('Bu tarayıcı passkey (WebAuthn) desteklemiyor.')
      }
      const options = await getPasskeyRegisterOptions({ device_fingerprint: deviceFingerprint })
      const { startRegistration } = await import('@simplewebauthn/browser')
      const credential = await startRegistration({
        optionsJSON: options.options as unknown as Parameters<typeof startRegistration>[0]['optionsJSON'],
      })
      await verifyPasskeyRegistration({
        challenge_id: options.challenge_id,
        credential: credential as unknown as Record<string, unknown>,
      })
      onPasskeyRegistered()
      setNotice('Passkey bu cihaza kaydedildi.')
    } catch (err) {
      setError(parseApiError(err, 'Passkey kaydı başarısız.').message)
    } finally {
      setIsPasskeyBusy(false)
    }
  }

  async function copyFingerprint() {
    try {
      await navigator.clipboard.writeText(deviceFingerprint)
      setFpCopied(true)
      window.setTimeout(() => setFpCopied(false), 1800)
    } catch {
      setError('Panoya kopyalanamadı.')
    }
  }

  async function copyCodes() {
    if (!recoveryCodes) return
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'))
      setNotice('Kodlar panoya kopyalandı.')
    } catch {
      setError('Panoya kopyalanamadı.')
    }
  }

  return (
    <SheetModal open={open} title="Ayarlar" subtitle="Güvenlik ve cihaz" onClose={onClose}>
      <div className="space-y-5">
        {error && (
          <div className="rounded-md border border-err/40 bg-err/5 px-4 py-3 font-sans text-sm text-err">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-md border border-ok/40 bg-ok/5 px-4 py-3 font-sans text-sm text-ok">
            {notice}
          </div>
        )}

        <section className="rounded-md border border-rule bg-paper px-4 py-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-soft text-accent">
              <Fingerprint className="h-5 w-5" />
            </span>
            <div className="flex-1 min-w-0">
              <h3 className="font-display text-base text-ink">Cihaz Fingerprint</h3>
              <p className="mt-0.5 font-sans text-xs text-ink/55">Bu cihazı sisteme bağlayan kimlik</p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 truncate rounded-sm bg-cream px-2 py-1.5 font-mono text-xs text-ink">
                  {fingerprintShort(deviceFingerprint)}
                </code>
                <button
                  type="button"
                  onClick={() => void copyFingerprint()}
                  className="inline-flex items-center gap-1 rounded-md border border-rule bg-paper px-3 py-1.5 font-sans text-xs font-semibold text-ink hover:border-ink transition-colors"
                >
                  {fpCopied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
                  {fpCopied ? 'Kopyalandı' : 'Kopyala'}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-md border border-rule bg-paper px-4 py-4">
          <div className="flex items-start gap-3">
            <span
              className={
                'grid h-9 w-9 place-items-center rounded-full ' +
                (passkeyRegistered ? 'bg-ok/15 text-ok' : 'bg-cream text-ink/55')
              }
            >
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-base text-ink">Passkey</h3>
                <span
                  className={
                    'font-sans text-[0.7rem] uppercase tracking-wider ' +
                    (passkeyRegistered ? 'text-ok' : 'text-ink/55')
                  }
                >
                  {passkeyRegistered ? 'Aktif' : 'Yok'}
                </span>
              </div>
              <p className="mt-0.5 font-sans text-xs text-ink/55">
                Cihaz sıfırlanırsa parmak izi / Face ID ile geri yüklenir.
              </p>
              <button
                type="button"
                onClick={() => void handlePasskeyRegister()}
                disabled={isPasskeyBusy}
                className="mt-3 inline-flex items-center gap-2 rounded-md border border-accent bg-accent px-3 py-2 font-sans text-sm font-semibold text-paper hover:opacity-90 disabled:opacity-40"
              >
                {isPasskeyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                {passkeyRegistered ? 'Yeniden Kaydet' : 'Passkey Kaydet'}
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-md border border-rule bg-paper px-4 py-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-soft text-accent">
              <KeyRound className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-display text-base text-ink">Recovery Kodlar</h3>
                <span className="font-sans text-[0.7rem] uppercase tracking-wider text-ink/55">
                  {isStatusLoading ? '...' : recoveryReady ? `${recoveryCount} aktif` : 'Yok'}
                </span>
              </div>
              <p className="mt-0.5 font-sans text-xs text-ink/55">
                {recoveryReady
                  ? `Son geçerlilik: ${formatExpiry(recoveryExpiresAt)}`
                  : 'Cihazı geri yüklemek için tek kullanımlık kodlar.'}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleIssue()}
                  disabled={isIssueBusy}
                  className="inline-flex items-center gap-2 rounded-md border border-accent bg-accent px-3 py-2 font-sans text-sm font-semibold text-paper hover:opacity-90 disabled:opacity-40"
                >
                  {isIssueBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  {recoveryReady ? 'Yenile' : 'Oluştur'}
                </button>
              </div>

              {recoveryReady && (
                <form onSubmit={handleReveal} className="mt-4 border-t border-rule pt-3 space-y-2">
                  <label htmlFor="recovery-pin" className="font-sans text-xs uppercase tracking-wider text-ink/55">
                    Mevcut kodları görmek için PIN
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="recovery-pin"
                      type="password"
                      inputMode="numeric"
                      pattern="\d*"
                      value={revealPin}
                      onChange={(e) => setRevealPin(e.target.value)}
                      placeholder="6-12 rakam"
                      className="flex-1 rounded-md border border-rule bg-paper px-3 py-2 font-mono text-sm text-ink focus:outline-none focus:border-accent"
                    />
                    <button
                      type="submit"
                      disabled={isRevealBusy || !revealPin.trim()}
                      className="inline-flex items-center gap-1 rounded-md border border-rule bg-paper px-3 py-2 font-sans text-sm font-semibold text-ink hover:border-ink disabled:opacity-40"
                    >
                      {isRevealBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Göster'}
                    </button>
                  </div>
                </form>
              )}

              {recoveryCodes && recoveryCodes.length > 0 && (
                <div className="mt-4 border-t border-rule pt-3">
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="font-sans text-xs uppercase tracking-wider text-ink/55">Kodlar</p>
                    <button
                      type="button"
                      onClick={() => void copyCodes()}
                      className="inline-flex items-center gap-1 font-sans text-xs text-accent hover:underline"
                    >
                      <Copy className="h-3 w-3" />
                      Tümünü kopyala
                    </button>
                  </div>
                  <ul className="grid grid-cols-2 gap-1.5">
                    {recoveryCodes.map((code) => (
                      <li
                        key={code}
                        className="rounded-sm border border-rule bg-cream px-2 py-1.5 font-mono text-xs text-ink text-center tracking-wider"
                      >
                        {code}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 font-sans text-[0.7rem] text-ink/55">
                    Her kod tek kullanımlıktır. Bu kodları ekrandan kapattıktan sonra tekrar görmek için PIN gerekir.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </SheetModal>
  )
}
