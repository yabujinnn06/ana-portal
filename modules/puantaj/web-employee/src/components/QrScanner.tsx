import { useEffect, useRef, useState } from 'react'
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser'

function toCameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError' || error.name === 'SecurityError') {
      return 'Kamera izni verilmedi. Tarayıcı ayarlarından kamera izni verin.'
    }
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
      return 'Kamera bulunamadı. Bu cihazda kullanılabilir kamera olmayabilir.'
    }
    if (error.name === 'NotReadableError' || error.name === 'AbortError') {
      return 'Kamera açılamadı. Başka bir uygulama kamerayı kullanıyor olabilir.'
    }
  }
  return 'Kamera açılamadı. Lütfen tekrar deneyin veya QR metnini manuel girin.'
}

export function QrScanner({
  active,
  onDetected,
  onError,
}: {
  active: boolean
  onDetected: (rawValue: string) => void
  onError: (message: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  // Callback'ler ref'te: parent her render'da yeni fonksiyon versin, efekt
  // yeniden calismasin (kamera resetlenmesin / kilitlenmesin).
  const onDetectedRef = useRef(onDetected)
  const onErrorRef = useRef(onError)
  const [isPreparing, setIsPreparing] = useState(false)

  useEffect(() => {
    onDetectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    if (!active) {
      return
    }

    let cancelled = false
    let detected = false
    let controls: IScannerControls | null = null

    const stopStream = () => {
      const video = videoRef.current
      if (video?.srcObject) {
        const stream = video.srcObject as MediaStream
        stream.getTracks().forEach((track) => track.stop())
        video.srcObject = null
      }
    }

    const stop = () => {
      controls?.stop()
      controls = null
      stopStream()
      setIsPreparing(false)
    }

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        onErrorRef.current('Bu tarayıcıda kamera erişimi desteklenmiyor.')
        return
      }
      if (!videoRef.current) {
        onErrorRef.current('Kamera alanı hazır değil. Sayfayı yenileyip tekrar deneyin.')
        return
      }

      setIsPreparing(true)
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 200 })

      const onResult = (result: { getText: () => string } | undefined) => {
        if (!result || detected) return
        const rawValue = result.getText().trim()
        if (!rawValue) return
        detected = true
        stop()
        onDetectedRef.current(rawValue)
      }

      try {
        let next: IScannerControls
        try {
          next = await reader.decodeFromConstraints(
            { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
            videoRef.current,
            onResult,
          )
        } catch {
          next = await reader.decodeFromVideoDevice(undefined, videoRef.current, onResult)
        }
        // Bu sirada efekt temizlendiyse (modal kapandi / StrictMode remount)
        // sadece bu cagrinin kendi stream'ini durdur. stopStream() cagirma:
        // paylasilan video elementine bagli yeni (gecerli) stream'i oldurur.
        if (cancelled) {
          next.stop()
          return
        }
        controls = next
        setIsPreparing(false)
      } catch (error) {
        stop()
        if (!cancelled) onErrorRef.current(toCameraErrorMessage(error))
      }
    }

    // Start'i kucuk gecikmeyle ertele: React StrictMode (dev) efekti mount->
    // cleanup->mount seklinde iki kez calistirir. Gecikme sayesinde ilk (sahte)
    // calismanin cleanup'i timer'i iptal eder ve TEK getUserMedia kalir; aksi
    // halde iki kamera akisi ayni <video>'da yarisip birbirini oldurur.
    const startTimer = window.setTimeout(() => {
      void start()
    }, 80)

    return () => {
      cancelled = true
      window.clearTimeout(startTimer)
      stop()
    }
  }, [active])

  return (
    <div className="relative h-full w-full bg-ink">
      <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
      {isPreparing && (
        <div className="absolute inset-0 grid place-items-center bg-ink/40 font-sans text-sm text-paper/90">
          Kamera hazırlanıyor...
        </div>
      )}
    </div>
  )
}
