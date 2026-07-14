import { type ReactNode, type RefObject, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'

import { eventTypeLabel, flagLabel, formatTs, prettyFlagValue } from '../../utils/attendance'
import type { LastAction, LastActionSummaryContent } from './types'

interface EmployeeFocusModalProps {
  title: string
  titleId: string
  children: ReactNode
  kicker?: string
  descriptionId?: string
  onClose?: () => void
  panelClassName?: string
}

export function EmployeeFocusModal({
  title,
  titleId,
  children,
  kicker,
  descriptionId,
  onClose,
  panelClassName,
}: EmployeeFocusModalProps) {
  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      className="modal-backdrop checkout-confirm-backdrop employee-focus-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClick={onClose}
    >
      <div className="checkout-confirm-lights" aria-hidden="true">
        <span className="checkout-confirm-light checkout-confirm-light-left" />
        <span className="checkout-confirm-light checkout-confirm-light-center" />
        <span className="checkout-confirm-light checkout-confirm-light-right" />
      </div>
      <div
        className={`help-modal checkout-confirm-modal employee-focus-modal ${panelClassName ?? ''}`.trim()}
        onClick={(event) => event.stopPropagation()}
      >
        {kicker ? <p className="checkout-confirm-kicker">{kicker}</p> : null}
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  )
}

interface EmployeeHeaderSectionProps {
  employeeDisplayName: string
  contextLine: string
  todayStatusClass: string
  todayStatusLabel: string
  chips: string[]
}

export function EmployeeHeaderSection({
  employeeDisplayName,
  contextLine,
  todayStatusClass,
  todayStatusLabel,
  chips,
}: EmployeeHeaderSectionProps) {
  return (
    <section className="employee-home-header" aria-label="Calisan ozeti">
      <div className="employee-home-header-top">
        <div className="employee-home-header-copy">
          <p className="employee-home-kicker">CALISAN</p>
          <h2 className="employee-home-title">{employeeDisplayName}</h2>
          <p className="employee-home-subtitle">{contextLine}</p>
        </div>
        <span className={`status-pill ${todayStatusClass} employee-home-status`}>{todayStatusLabel}</span>
      </div>
      {chips.length > 0 ? (
        <div className="employee-home-chip-row">
          {chips.map((chip) => (
            <span key={chip} className="employee-home-chip">
              {chip}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  )
}

interface MainActionCardProps {
  panelRef: RefObject<HTMLElement | null>
  todayStatusClass: string
  todayStatusLabel: string
  todayStatusHintText: string
  shiftSummary: string
  activityMeta: string
  focusText: string
  canQrScan: boolean
  canCheckout: boolean
  isSubmitting: boolean
  pendingAction: 'checkin' | 'checkout' | 'demo' | null
  pushGateRequired: boolean
  onOpenScanner: () => void
  onOpenCheckout: () => void
}

export function MainActionCard({
  panelRef,
  todayStatusClass,
  todayStatusLabel,
  todayStatusHintText,
  shiftSummary,
  activityMeta,
  focusText,
  canQrScan,
  canCheckout,
  isSubmitting,
  pendingAction,
  pushGateRequired,
  onOpenScanner,
  onOpenCheckout,
}: MainActionCardProps) {
  return (
    <section className="action-panel employee-main-action-card" ref={panelRef}>
      <div className="employee-main-action-head">
        <div className="employee-main-action-copy">
          <p className="employee-home-kicker">ANA ISLEMLER</p>
          <h2 className="employee-main-action-title">Bugunku puantaj islemleri</h2>
          <p className="employee-main-action-text">{todayStatusHintText}</p>
        </div>
        <span className={`status-pill ${todayStatusClass}`}>{todayStatusLabel}</span>
      </div>

      <div className="employee-main-action-meta">
        <div className="employee-main-action-meta-item">
          <span className="employee-main-action-meta-label">Atanan vardiya</span>
          <strong className="employee-main-action-meta-value">{shiftSummary}</strong>
        </div>
        <div className="employee-main-action-meta-item">
          <span className="employee-main-action-meta-label">Bugunku durum</span>
          <strong className="employee-main-action-meta-value">{activityMeta}</strong>
        </div>
      </div>

      <div className="employee-main-action-buttons">
        <button
          type="button"
          className="btn btn-primary action-cta-btn"
          disabled={!canQrScan}
          onClick={onOpenScanner}
        >
          {isSubmitting && pendingAction === 'checkin' ? (
            <>
              <span className="inline-spinner" aria-hidden="true" />
              Islem yapiliyor...
            </>
          ) : (
            <span className="action-cta-copy">QR Kod Oku</span>
          )}
        </button>

        <button
          type="button"
          className="btn btn-outline action-cta-btn"
          disabled={!canCheckout}
          onClick={onOpenCheckout}
        >
          {isSubmitting && pendingAction === 'checkout' ? (
            <>
              <span className="inline-spinner inline-spinner-dark" aria-hidden="true" />
              Islem yapiliyor...
            </>
          ) : (
            <span className="action-cta-copy">Mesaiyi Guvenli Bitir</span>
          )}
        </button>
      </div>

      <p className="employee-main-action-note">
        {pushGateRequired
          ? 'QR islemi oncesinde bildirim adimi zorunlu olarak acilir.'
          : focusText}
      </p>
    </section>
  )
}

interface LastActionSummarySectionProps {
  summary: LastActionSummaryContent | null
  lastAction: LastAction | null
  duplicateDetected: boolean
  manualCheckout: boolean
  visibleFlags: Array<[string, unknown]>
}

export function LastActionSummarySection({
  summary,
  lastAction,
  duplicateDetected,
  manualCheckout,
  visibleFlags,
}: LastActionSummarySectionProps) {
  const toneClassName =
    summary?.tone === 'success'
      ? 'is-success'
      : summary?.tone === 'warning'
        ? 'is-warning'
        : 'is-neutral'

  return (
    <section className={`result-box employee-last-action-card ${toneClassName}`} aria-label="Son islem ozeti">
      <div className="employee-last-action-head">
        <div className="employee-last-action-copy">
          <p className="small-title">Son islem</p>
          <h2 className="employee-last-action-title">{summary?.title ?? 'Henuz bir islem gorunmuyor'}</h2>
        </div>
        {summary ? <p className="employee-last-action-time">{summary.detail}</p> : null}
      </div>

      <p className="employee-last-action-note">
        {summary?.note ?? 'Ilk QR okuma veya guvenli cikis sonrasinda ozet burada gorunur.'}
      </p>

      {duplicateDetected || manualCheckout ? (
        <div className="chips">
          {duplicateDetected ? <span className="status-pill state-warn">Mukerrer kayit</span> : null}
          {manualCheckout ? <span className="manual-badge">Manuel cikis yapildi</span> : null}
        </div>
      ) : null}

      {lastAction ? (
        <details className="employee-last-action-details">
          <summary>Teknik detaylari goster</summary>
          <div className="employee-last-action-technical">
            <ul className="employee-technical-list">
              <li>
                <span>Islem turu</span>
                <strong>{eventTypeLabel(lastAction.response.event_type)}</strong>
              </li>
              <li>
                <span>Kayit zamani</span>
                <strong>{formatTs(lastAction.response.ts_utc)}</strong>
              </li>
              {lastAction.codeValue ? (
                <li>
                  <span>Okutulan kod</span>
                  <strong>{lastAction.codeValue}</strong>
                </li>
              ) : null}
            </ul>

            {visibleFlags.length > 0 ? (
              <div className="stack-tight">
                <p className="small-title">Sistem notlari</p>
                <ul className="flag-list">
                  {visibleFlags.map(([key, value]) => (
                    <li key={key}>
                      <strong>{flagLabel(key, value)}</strong>: {prettyFlagValue(value)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  )
}

interface CriticalAlertsSectionProps {
  deviceFingerprint: string | null
  hasOpenShift: boolean
  openShiftCheckinTime: string | null
  locationWarning: string | null
  scannerError: string | null
  errorMessage: string | null
  requestId: string | null
}

export function CriticalAlertsSection({
  deviceFingerprint,
  hasOpenShift,
  openShiftCheckinTime,
  locationWarning,
  scannerError,
  errorMessage,
  requestId,
}: CriticalAlertsSectionProps) {
  if (!deviceFingerprint && !hasOpenShift && !locationWarning && !scannerError && !errorMessage) {
    return null
  }

  return (
    <section className="employee-alerts" aria-label="Onemli uyarilar">
      <div className="employee-secondary-head">
        <p className="employee-home-kicker">ONEMLI UYARILAR</p>
        <h2 className="employee-secondary-title">Sadece hemen ilgilenmeniz gereken konular</h2>
      </div>

      {!deviceFingerprint ? (
        <div className="warn-box">
          <p>Cihaz bagli degil. Davet linki ile kurulumu tamamlayin veya kurtarma akisini kullanin.</p>
          <div className="employee-inline-links">
            <Link className="inline-link" to="/claim">
              /claim ekranina git
            </Link>
            <Link className="inline-link" to="/recover">
              /recover ekranina git
            </Link>
          </div>
        </div>
      ) : null}

      {hasOpenShift ? (
        <div className="notice-box notice-box-warning">
          <p>
            <span className="banner-icon" aria-hidden="true">
              !
            </span>
            Acik vardiya var, cikis kaydi bekleniyor.
          </p>
          {openShiftCheckinTime ? <p className="small-text">Son giris: {formatTs(openShiftCheckinTime)}</p> : null}
        </div>
      ) : null}

      {locationWarning ? (
        <div className="warn-box banner-warning">
          <p>
            <span className="banner-icon" aria-hidden="true">
              !
            </span>
            {locationWarning}
          </p>
        </div>
      ) : null}

      {scannerError ? (
        <div className="warn-box banner-warning">
          <p>
            <span className="banner-icon" aria-hidden="true">
              !
            </span>
            {scannerError}
          </p>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="error-box banner-error">
          <p>
            <span className="banner-icon" aria-hidden="true">
              !
            </span>
            {errorMessage}
          </p>
          {requestId ? <p className="request-id">request_id: {requestId}</p> : null}
        </div>
      ) : null}
    </section>
  )
}

interface SecondaryDisclosureProps {
  title: string
  description: string
  badge?: string
  defaultOpen?: boolean
  lazyMount?: boolean
  onToggleOpen?: (isOpen: boolean) => void
  children: ReactNode
}

export function SecondaryDisclosure({
  title,
  description,
  badge,
  defaultOpen = false,
  lazyMount = false,
  onToggleOpen,
  children,
}: SecondaryDisclosureProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [hasBeenOpened, setHasBeenOpened] = useState(defaultOpen)

  useEffect(() => {
    if (defaultOpen) {
      setIsOpen(true)
      setHasBeenOpened(true)
      onToggleOpen?.(true)
    }
  }, [defaultOpen, onToggleOpen])

  const shouldRenderBody = !lazyMount || hasBeenOpened || isOpen

  return (
    <details
      className="employee-secondary-disclosure"
      open={isOpen || undefined}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open
        setIsOpen(nextOpen)
        if (nextOpen) {
          setHasBeenOpened(true)
        }
        onToggleOpen?.(nextOpen)
      }}
    >
      <summary>
        <div className="employee-secondary-disclosure-copy">
          <span className="employee-secondary-disclosure-title">{title}</span>
          <p className="employee-secondary-disclosure-text">{description}</p>
        </div>
        {badge ? <span className="employee-secondary-disclosure-badge">{badge}</span> : null}
      </summary>
      {shouldRenderBody ? <div className="employee-secondary-disclosure-body">{children}</div> : null}
    </details>
  )
}
