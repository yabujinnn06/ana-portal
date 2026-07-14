import { useState } from 'react'
import { Loader2, RotateCcw, ScanLine, ShieldAlert } from 'lucide-react'

import { parseApiError, scanEmployeeQr, type ParsedApiError } from '../../../api/attendance'
import { QrScanner } from '../../../components/QrScanner'
import type { AttendanceActionResponse } from '../../../types/api'
import { playCheckinSuccessTone, playCheckoutSuccessTone, playQrErrorTone, vibrate, VIBRATE_ERROR } from '../../../utils/audio'
import { getCachedLocation, getCurrentLocation } from '../../../utils/location'
import { SheetModal } from './SheetModal'

interface QrScanModalProps {
  open: boolean
  onClose: () => void
  deviceFingerprint: string
  onScanned: (response: AttendanceActionResponse) => void
  onDeviceNotClaimed?: (parsed: ParsedApiError) => boolean
  onApprovalRequired?: () => void
}

export function QrScanModal({ open, onClose, deviceFingerprint, onScanned, onDeviceNotClaimed, onApprovalRequired }: QrScanModalProps) {
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [secondCheckin, setSecondCheckin] = useState<string | null>(null)
  const [manualValue, setManualValue] = useState('')

  async function processCode(rawValue: string) {
    if (isBusy) return
    const code = rawValue.trim()
    if (!code) {
      setError('QR kod değeri boş olamaz.')
      return
    }
    setIsBusy(true)
    setError(null)
    setSecondCheckin(null)
    let scanAccuracyM: number | null = null
    try {
      const loc = await getCurrentLocation()
      // Taze GPS gelmezse son bilinen konuma dus (isci sahada ama GPS yavas).
      const scanLocation = loc.location ?? getCachedLocation()
      if (!scanLocation) {
        setError(loc.warning ?? 'Konum alınamadı. Telefon konumunu (GPS) açıp tekrar deneyin.')
        return
      }
      scanAccuracyM = scanLocation.accuracy_m
      const response = await scanEmployeeQr({
        code_value: code,
        device_fingerprint: deviceFingerprint,
        lat: scanLocation.lat,
        lon: scanLocation.lon,
        accuracy_m: scanLocation.accuracy_m,
      })
      if (response.event_type === 'IN') playCheckinSuccessTone()
      else playCheckoutSuccessTone()
      onScanned(response)
      setManualValue('')
      onClose()
    } catch (err) {
      const parsed = parseApiError(err, 'QR işlemi tamamlanamadı.')
      if (onDeviceNotClaimed?.(parsed)) {
        onClose()
        return
      }
      playQrErrorTone()
      vibrate(VIBRATE_ERROR)
      if (parsed.code === 'SECOND_CHECKIN_APPROVAL_REQUIRED') {
        setSecondCheckin(
          parsed.message.trim() ||
            'Bugünkü ikinci giriş için admin onayı gerekiyor. Admin onayından sonra tekrar QR okutun.',
        )
        onApprovalRequired?.()
        return
      }
      if (parsed.code === 'QR_POINT_OUT_OF_RANGE' && scanAccuracyM !== null && scanAccuracyM > 100) {
        setError(
          `${parsed.message} Konum hassasiyetiniz düşük (±${Math.round(scanAccuracyM)}m). iPhone'da Ayarlar > Gizlilik ve Güvenlik > Konum Servisleri > Safari için "Tam Konum"u açıp açık alanda tekrar deneyin.`,
        )
        return
      }
      setError(parsed.message)
    } finally {
      setIsBusy(false)
    }
  }

  function retry() {
    setError(null)
    setSecondCheckin(null)
  }

  return (
    <SheetModal open={open} title="QR kod tara" subtitle="Giriş veya çıkış" onClose={onClose}>
      <div className="space-y-4">
        <div className="relative aspect-square w-full max-w-[420px] mx-auto overflow-hidden rounded-md border border-rule bg-ink">
          <QrScanner
            active={open && !isBusy && !error && !secondCheckin}
            onDetected={(v) => void processCode(v)}
            onError={(m) => setError(m)}
          />
          {(error || secondCheckin) && (
            <div className="absolute inset-0 grid place-items-center bg-ink/55 px-4 text-center">
              <div>
                <p className="font-sans text-sm text-paper/90">Kamera duraklatıldı</p>
                <button
                  type="button"
                  onClick={retry}
                  className="mt-2 inline-flex items-center gap-2 rounded-md border border-paper/40 bg-paper/15 px-4 py-2 font-sans text-sm font-semibold text-paper hover:bg-paper/25"
                >
                  <RotateCcw className="h-4 w-4" />
                  Tekrar dene
                </button>
              </div>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="h-2/3 w-2/3 rounded-md border-2 border-paper/70" />
          </div>
        </div>

        {isBusy && (
          <div className="flex items-center justify-center gap-2 font-sans text-sm text-ink/70">
            <Loader2 className="h-4 w-4 animate-spin" />
            İşleniyor...
          </div>
        )}

        {secondCheckin && (
          <div className="rounded-md border-2 border-warn/60 bg-warn/10 px-4 py-4">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-warn text-paper">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-display text-base text-ink">Admin onayı gerekiyor</h3>
                <p className="mt-1 font-sans text-sm text-ink/75">{secondCheckin}</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-err/40 bg-err/5 px-4 py-3 font-sans text-sm text-err">
            {error}
          </div>
        )}

        <details className="rounded-md border border-rule bg-cream/40 px-4 py-3">
          <summary className="cursor-pointer font-sans text-sm font-semibold text-ink/80">
            Manuel kod gir
          </summary>
          <form
            className="mt-3 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              void processCode(manualValue)
            }}
          >
            <input
              type="text"
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              placeholder="QR kod değeri"
              className="flex-1 rounded-md border border-rule bg-paper px-3 py-2 font-mono text-sm text-ink focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={isBusy || !manualValue.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 py-2 font-sans text-sm font-semibold text-paper hover:opacity-90 disabled:opacity-40"
            >
              <ScanLine className="h-4 w-4" />
              Gönder
            </button>
          </form>
        </details>

        <p className="font-sans text-xs text-ink/55">
          QR kodu kameraya gösterdiğinizde otomatik olarak okunur. Konum izni gerekir.
        </p>
      </div>
    </SheetModal>
  )
}
