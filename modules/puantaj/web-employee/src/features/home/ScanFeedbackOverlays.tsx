import { createPortal } from 'react-dom'

interface ScanSuccessOverlayProps {
  open: boolean
  brandLabel?: string
  statusLabel?: string
}

export function ScanSuccessOverlay({
  open,
  brandLabel = 'YABUJIN',
  statusLabel = 'ONAYLANDI',
}: ScanSuccessOverlayProps) {
  if (!open || typeof document === 'undefined') {
    return null
  }
  return createPortal(
    <div className="scan-success-overlay" role="status" aria-live="polite" aria-label="QR onaylandı">
      <div className="scan-success-logo" aria-hidden="true">
        <div className="scan-success-halo" />
        <div className="scan-success-ring" />
        <div className="scan-success-spark" />
        <div className="scan-success-core">
          <span className="scan-success-brand">{brandLabel}</span>
          <span className="scan-success-sub">{statusLabel}</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export interface ScanErrorPayload {
  title: string
  message: string
  requestId?: string | null
}

interface ScanErrorOverlayProps {
  payload: ScanErrorPayload | null
  onDismiss: () => void
}

export function ScanErrorOverlay({ payload, onDismiss }: ScanErrorOverlayProps) {
  if (!payload || typeof document === 'undefined') {
    return null
  }
  return createPortal(
    <div
      className="scan-error-overlay"
      role="alertdialog"
      aria-live="assertive"
      aria-modal="true"
      aria-label="QR onaylanmadi"
      onClick={onDismiss}
    >
      <div className="scan-error-card" onClick={(event) => event.stopPropagation()}>
        <div className="scan-error-logo" aria-hidden="true">
          <div className="scan-error-halo" />
          <div className="scan-error-ring" />
          <div className="scan-error-pulse" />
          <div className="scan-error-cross">
            <span className="scan-error-cross-bar scan-error-cross-bar--a" />
            <span className="scan-error-cross-bar scan-error-cross-bar--b" />
          </div>
        </div>
        <p className="scan-error-kicker">QR ONAYLANMADI</p>
        <h2 className="scan-error-title">{payload.title}</h2>
        <p className="scan-error-message">{payload.message}</p>
        {payload.requestId ? (
          <p className="scan-error-request-id">request_id: {payload.requestId}</p>
        ) : null}
        <button type="button" className="btn btn-danger scan-error-dismiss" onClick={onDismiss}>
          Tamam, tekrar deneyecegim
        </button>
      </div>
    </div>,
    document.body,
  )
}
