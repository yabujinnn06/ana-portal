import { createPortal } from 'react-dom'

import { EmployeeFocusModal } from './HomeSections'

export function CheckoutConfirmModal({
  isOpen,
  onClose,
  onConfirm,
}: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  if (!isOpen || typeof document === 'undefined') return null
  return createPortal(
    <div
      className="modal-backdrop checkout-confirm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-confirm-title"
      aria-describedby="checkout-confirm-description"
      onClick={onClose}
    >
      <div className="checkout-confirm-lights" aria-hidden="true">
        <span className="checkout-confirm-light checkout-confirm-light-left" />
        <span className="checkout-confirm-light checkout-confirm-light-center" />
        <span className="checkout-confirm-light checkout-confirm-light-right" />
      </div>
      <div className="help-modal checkout-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <p className="checkout-confirm-kicker">GUVENLI CIKIS ONAYI</p>
        <h2 id="checkout-confirm-title">Mesaiyi bitirmek istediğinize emin misiniz?</h2>
        <p id="checkout-confirm-description">
          "Mesaiyi Güvenli Bitir" işlemi bugünkü çıkışı kaydeder. Devam etmek istiyor musunuz?
        </p>
        <div className="stack">
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            Evet, mesaiyi bitir
          </button>
          <button type="button" className="btn btn-soft" onClick={onClose}>
            Hayır
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function DemoConfirmModal({
  isOpen,
  isDemoActive,
  onClose,
  onConfirm,
}: {
  isOpen: boolean
  isDemoActive: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  if (!isOpen || typeof document === 'undefined') return null
  return createPortal(
    <div
      className="modal-backdrop checkout-confirm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-confirm-title"
      aria-describedby="demo-confirm-description"
      onClick={onClose}
    >
      <div className="checkout-confirm-lights" aria-hidden="true">
        <span className="checkout-confirm-light checkout-confirm-light-left" />
        <span className="checkout-confirm-light checkout-confirm-light-center" />
        <span className="checkout-confirm-light checkout-confirm-light-right" />
      </div>
      <div className="help-modal checkout-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <p className="checkout-confirm-kicker">DEMO KAYDI ONAYI</p>
        <h2 id="demo-confirm-title">
          {isDemoActive ? 'Demo bitisini kaydetmek istiyor musunuz?' : 'Demo baslangicini kaydetmek istiyor musunuz?'}
        </h2>
        <p id="demo-confirm-description">
          {isDemoActive
            ? 'Bu işlem aktif demo kaydını kapatır. Devam etmek istiyor musunuz?'
            : 'Bu işlem gün içindeki demo başlangıç kaydını oluşturur. Devam etmek istiyor musunuz?'}
        </p>
        <div className="stack">
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            {isDemoActive ? 'Evet, demo bitti' : 'Evet, demo basladi'}
          </button>
          <button type="button" className="btn btn-soft" onClick={onClose}>
            Hayir
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function DemoLocationPromptModal({
  isOpen,
  onClose,
  onRetry,
}: {
  isOpen: boolean
  onClose: () => void
  onRetry: () => void
}) {
  if (!isOpen) return null
  return (
    <EmployeeFocusModal
      titleId="demo-location-prompt-title"
      descriptionId="demo-location-prompt-description"
      title="Konumu Açın"
      kicker="DEMO KONUMU"
      onClose={onClose}
    >
      <p id="demo-location-prompt-description">
        Demo kaydini tamamlamak icin cihazinizda konum acik olmali. Konumu actiktan sonra tekrar deneyin.
      </p>
      <div className="stack">
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          Tekrar dene
        </button>
        <button type="button" className="btn btn-soft" onClick={onClose}>
          Kapat
        </button>
      </div>
    </EmployeeFocusModal>
  )
}
