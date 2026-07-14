import { useState } from 'react'
import { Loader2, Paperclip, Send } from 'lucide-react'

import { parseApiError, submitEmployeeLeaveRequest } from '../../../api/attendance'
import type { LeaveType } from '../../../types/api'
import { SheetModal } from './SheetModal'

interface LeaveRequestModalProps {
  open: boolean
  onClose: () => void
  deviceFingerprint: string
  onSubmitted: () => void
}

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: 'ANNUAL', label: 'Yıllık izin' },
  { value: 'SICK', label: 'Rapor / hastalık' },
  { value: 'UNPAID', label: 'Ücretsiz izin' },
  { value: 'EXCUSE', label: 'Mazeret izni' },
]

const MAX_ATTACHMENT_MB = 8
// Backend (_ALLOWED_LEAVE_ATTACHMENT_TYPES) ile birebir ayni olmali, yoksa 422.
const ALLOWED_ATTACHMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]
const ATTACHMENT_ACCEPT = ALLOWED_ATTACHMENT_TYPES.join(',')

export function LeaveRequestModal({ open, onClose, deviceFingerprint, onSubmitted }: LeaveRequestModalProps) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [leaveType, setLeaveType] = useState<LeaveType>('ANNUAL')
  const [note, setNote] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setStartDate('')
    setEndDate('')
    setLeaveType('ANNUAL')
    setNote('')
    setAttachment(null)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isBusy) return

    const s = startDate.trim()
    const eDate = endDate.trim()
    const n = note.trim()

    if (!s || !eDate) {
      setError('Başlangıç ve bitiş tarihini seçin.')
      return
    }
    if (eDate < s) {
      setError('Bitiş tarihi başlangıçtan önce olamaz.')
      return
    }
    if (n.length < 3) {
      setError('İzin gerekçesi en az 3 karakter olmalı.')
      return
    }
    if (attachment && attachment.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
      setError(`Belge boyutu ${MAX_ATTACHMENT_MB} MB sınırını aşamaz.`)
      return
    }
    if (attachment && attachment.type && !ALLOWED_ATTACHMENT_TYPES.includes(attachment.type)) {
      setError('Yalnızca PDF, JPG, PNG, WEBP veya Word belgesi yükleyebilirsiniz.')
      return
    }

    setIsBusy(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('device_fingerprint', deviceFingerprint)
      formData.append('start_date', s)
      formData.append('end_date', eDate)
      formData.append('type', leaveType)
      formData.append('note', n)
      if (attachment) formData.append('attachment', attachment)

      await submitEmployeeLeaveRequest(formData)
      onSubmitted()
      reset()
      onClose()
    } catch (err) {
      const parsed = parseApiError(err, 'İzin talebi gönderilemedi.')
      setError(parsed.message)
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <SheetModal open={open} title="İzin talebi" subtitle="Yıllık / mazeret / rapor" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="font-sans text-xs uppercase tracking-wider text-ink/55">Tür</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {LEAVE_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setLeaveType(t.value)}
                className={
                  'rounded-md border px-3 py-2.5 font-sans text-sm font-medium transition-colors ' +
                  (leaveType === t.value
                    ? 'border-accent bg-accent text-paper'
                    : 'border-rule bg-paper text-ink hover:border-ink')
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="leave-start" className="font-sans text-xs uppercase tracking-wider text-ink/55">
              Başlangıç
            </label>
            <input
              id="leave-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-rule bg-paper px-3 py-2.5 font-mono text-sm text-ink focus:outline-none focus:border-accent"
              required
            />
          </div>
          <div>
            <label htmlFor="leave-end" className="font-sans text-xs uppercase tracking-wider text-ink/55">
              Bitiş
            </label>
            <input
              id="leave-end"
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-rule bg-paper px-3 py-2.5 font-mono text-sm text-ink focus:outline-none focus:border-accent"
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="leave-note" className="font-sans text-xs uppercase tracking-wider text-ink/55">
            Gerekçe
          </label>
          <textarea
            id="leave-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Sebebinizi kısaca açıklayın..."
            rows={3}
            className="mt-1 w-full rounded-md border border-rule bg-paper px-3 py-2 font-sans text-sm text-ink focus:outline-none focus:border-accent resize-none"
            required
            minLength={3}
            maxLength={500}
          />
          <p className="mt-1 font-sans text-[0.7rem] text-ink/45 text-right">{note.length}/500</p>
        </div>

        <div>
          <label className="font-sans text-xs uppercase tracking-wider text-ink/55">Ek belge (opsiyonel)</label>
          <label className="mt-2 flex cursor-pointer items-center justify-between rounded-md border border-dashed border-rule bg-cream/40 px-3 py-3 hover:border-accent transition-colors">
            <span className="flex items-center gap-2 font-sans text-sm text-ink/70">
              <Paperclip className="h-4 w-4" />
              {attachment ? attachment.name : `PDF / JPG / PNG / WEBP / Word (max ${MAX_ATTACHMENT_MB} MB)`}
            </span>
            <input
              type="file"
              accept={ATTACHMENT_ACCEPT}
              onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
          </label>
          {attachment && (
            <button
              type="button"
              onClick={() => setAttachment(null)}
              className="mt-1 font-sans text-xs text-ink/55 hover:text-err"
            >
              Belgeyi kaldır
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-err/40 bg-err/5 px-4 py-3 font-sans text-sm text-err">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => { reset(); onClose() }}
            className="flex-1 rounded-md border border-rule bg-paper px-4 py-2.5 font-sans text-sm font-semibold text-ink hover:border-ink transition-colors"
          >
            İptal
          </button>
          <button
            type="submit"
            disabled={isBusy}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 py-2.5 font-sans text-sm font-semibold text-paper hover:opacity-90 disabled:opacity-40"
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {isBusy ? 'Gönderiliyor...' : 'Gönder'}
          </button>
        </div>
      </form>
    </SheetModal>
  )
}
