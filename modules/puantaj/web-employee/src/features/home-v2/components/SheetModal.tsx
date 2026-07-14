import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect } from 'react'

interface SheetModalProps {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
}

export function SheetModal({ open, title, subtitle, onClose, children }: SheetModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="sheet-root"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={onClose}
        >
          <motion.div
            key="sheet-body"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="relative flex max-h-[92vh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-2xl border border-rule bg-paper shadow-[0_24px_60px_-20px_rgba(0,0,0,0.4)] sm:rounded-lg"
          >
            <header className="border-b border-rule bg-paper px-5 pb-4 pt-3">
              {/* Mobil bottom-sheet tutamaci */}
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink/15 sm:hidden" aria-hidden="true" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-xl leading-tight text-ink">{title}</h2>
                  {subtitle && (
                    <p className="mt-0.5 font-sans text-xs uppercase tracking-[0.14em] text-ink/55">{subtitle}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Kapat"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-rule text-ink/60 transition-colors hover:border-ink hover:text-ink active:scale-95"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-6">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
