import { AnimatePresence, motion } from 'framer-motion'
import { XCircle } from 'lucide-react'

export interface ActionErrorPayload {
  title: string
  message: string
  requestId?: string | null
}

interface ActionErrorFlashProps {
  payload: ActionErrorPayload | null
  onDismiss: () => void
}

export function ActionErrorFlash({ payload, onDismiss }: ActionErrorFlashProps) {
  return (
    <AnimatePresence>
      {payload && (
        <motion.div
          key="err-flash"
          className="fixed inset-0 z-[60] flex items-center justify-center p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          role="alertdialog"
          aria-modal="true"
          aria-label="İşlem onaylanmadı"
          onClick={onDismiss}
        >
          <motion.div
            className="absolute inset-0 bg-err/12"
            style={{ backdropFilter: 'blur(2px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            className="relative z-10 w-full max-w-[360px] rounded-lg border border-err/30 bg-paper px-6 py-7 text-center shadow-[0_24px_60px_-20px_rgba(0,0,0,0.4)]"
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.7, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 1.05, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          >
            <div className="relative mx-auto mb-4 grid h-20 w-20 place-items-center">
              <motion.span
                className="absolute inset-0 rounded-full bg-err"
                animate={{ scale: [1, 1.9], opacity: [0.3, 0] }}
                transition={{ duration: 0.7, repeat: 1, ease: 'easeOut' }}
              />
              <div className="relative grid h-20 w-20 place-items-center rounded-full bg-err shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
                <XCircle className="h-10 w-10 text-white" strokeWidth={2.2} />
              </div>
            </div>

            <p className="font-sans text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-err">
              Onaylanmadı
            </p>
            <h2 className="mt-1 font-display text-xl text-ink">{payload.title}</h2>
            <p className="mt-2 font-sans text-sm text-ink/70">{payload.message}</p>
            {payload.requestId && (
              <p className="mt-2 font-mono text-[0.65rem] text-ink/40">request_id: {payload.requestId}</p>
            )}

            <button
              type="button"
              onClick={onDismiss}
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-md border border-err bg-err font-sans text-sm font-semibold text-white hover:opacity-90"
            >
              Tamam, tekrar deneyeceğim
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
