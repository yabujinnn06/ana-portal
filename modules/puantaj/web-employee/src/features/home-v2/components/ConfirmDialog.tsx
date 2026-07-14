import { AnimatePresence, motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Evet',
  cancelLabel = 'Hayır',
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="confirm-dialog"
          className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-ink/40"
          style={{ backdropFilter: 'blur(2px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          onClick={busy ? undefined : onCancel}
        >
          <motion.div
            className="w-full max-w-[360px] rounded-lg border border-rule bg-paper px-6 py-6 text-center shadow-[0_24px_60px_-20px_rgba(0,0,0,0.4)]"
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.92, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 1.03, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
          >
            <h2 className="font-display text-xl text-ink">{title}</h2>
            {message && <p className="mt-2 font-sans text-sm text-ink/65">{message}</p>}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="flex-1 rounded-md border border-rule bg-paper px-4 py-2.5 font-sans text-sm font-semibold text-ink hover:border-ink disabled:opacity-40"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 py-2.5 font-sans text-sm font-semibold text-paper hover:opacity-90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
