import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Loader2, MessageSquare, Paperclip, Send } from 'lucide-react'

import {
  createEmployeeLeaveMessage,
  downloadEmployeeLeaveAttachment,
  getEmployeeLeaveThread,
  parseApiError,
  type ParsedApiError,
} from '../../../api/attendance'
import type { EmployeeLeaveThreadRecord, LeaveStatus, LeaveType } from '../../../types/api'
import { SheetModal } from './SheetModal'

interface LeaveThreadModalProps {
  open: boolean
  leaveId: number | null
  deviceFingerprint: string
  onClose: () => void
  onChanged?: () => void
  onDeviceNotClaimed?: (parsed: ParsedApiError) => boolean
}

const TYPE_LABEL: Record<LeaveType, string> = {
  ANNUAL: 'Yıllık izin',
  SICK: 'Rapor / hastalık',
  UNPAID: 'Ücretsiz izin',
  EXCUSE: 'Mazeret izni',
  PUBLIC_HOLIDAY: 'Resmi tatil',
}

const STATUS: Record<LeaveStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Onay bekliyor', cls: 'border-warn/40 bg-warn/10 text-warn' },
  APPROVED: { label: 'Onaylandı', cls: 'border-ok/40 bg-ok/10 text-ok' },
  REJECTED: { label: 'Reddedildi', cls: 'border-err/40 bg-err/10 text-err' },
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTs(utc: string): string {
  return new Date(utc).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function LeaveThreadModal({
  open,
  leaveId,
  deviceFingerprint,
  onClose,
  onChanged,
  onDeviceNotClaimed,
}: LeaveThreadModalProps) {
  const [thread, setThread] = useState<EmployeeLeaveThreadRecord | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)

  // Callback'leri ref'te tut ki load stabil kalsin (parent her saniye render
  // olunca yeniden yuklenme loop'u olmasin).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onDeviceNotClaimedRef = useRef(onDeviceNotClaimed)
  onDeviceNotClaimedRef.current = onDeviceNotClaimed

  const load = useCallback(async () => {
    if (leaveId === null) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await getEmployeeLeaveThread(leaveId, deviceFingerprint)
      setThread(data)
    } catch (err) {
      const parsed = parseApiError(err, 'İzin detayı alınamadı.')
      if (onDeviceNotClaimedRef.current?.(parsed)) {
        onCloseRef.current()
        return
      }
      setError(parsed.message)
    } finally {
      setIsLoading(false)
    }
  }, [leaveId, deviceFingerprint])

  useEffect(() => {
    if (!open || leaveId === null) {
      setThread(null)
      setDraft('')
      setError(null)
      return
    }
    void load()
  }, [open, leaveId, load])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (isSending || leaveId === null) return
    const message = draft.trim()
    if (message.length < 2) {
      setError('Mesaj en az 2 karakter olmalı.')
      return
    }
    setIsSending(true)
    setError(null)
    try {
      const updated = await createEmployeeLeaveMessage(leaveId, { device_fingerprint: deviceFingerprint, message })
      setThread(updated)
      setDraft('')
      onChanged?.()
    } catch (err) {
      const parsed = parseApiError(err, 'Mesaj gönderilemedi.')
      if (onDeviceNotClaimed?.(parsed)) {
        onClose()
        return
      }
      setError(parsed.message)
    } finally {
      setIsSending(false)
    }
  }

  async function handleDownload(attachmentId: number, fallbackName: string) {
    if (leaveId === null || downloadingId !== null) return
    setDownloadingId(attachmentId)
    try {
      const result = await downloadEmployeeLeaveAttachment(leaveId, attachmentId, deviceFingerprint)
      triggerDownload(result.blob, result.fileName ?? fallbackName)
    } catch (err) {
      setError(parseApiError(err, 'Belge indirilemedi.').message)
    } finally {
      setDownloadingId(null)
    }
  }

  const leave = thread?.leave
  const title = leave ? TYPE_LABEL[leave.type] : 'İzin detayı'
  const subtitle = leave
    ? leave.start_date === leave.end_date
      ? leave.start_date
      : `${leave.start_date} – ${leave.end_date}`
    : undefined

  return (
    <SheetModal open={open} title={title} subtitle={subtitle} onClose={onClose}>
      <div className="space-y-5">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-8 font-sans text-sm text-ink/60">
            <Loader2 className="h-4 w-4 animate-spin" />
            Yükleniyor...
          </div>
        )}

        {error && (
          <div className="rounded-md border border-err/40 bg-err/5 px-4 py-3 font-sans text-sm text-err">{error}</div>
        )}

        {leave && (
          <>
            <section className="rounded-md border border-rule bg-paper px-4 py-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-base text-ink">{TYPE_LABEL[leave.type]}</span>
                <span
                  className={
                    'rounded-full border px-2.5 py-0.5 font-sans text-[0.65rem] uppercase tracking-wider ' +
                    STATUS[leave.status].cls
                  }
                >
                  {STATUS[leave.status].label}
                </span>
              </div>
              {leave.note && <p className="font-sans text-sm text-ink/75">{leave.note}</p>}
              {leave.decision_note && (
                <div className="rounded-md border border-rule bg-cream/50 px-3 py-2">
                  <p className="font-sans text-[0.7rem] uppercase tracking-wider text-ink/45">Yönetici notu</p>
                  <p className="mt-0.5 font-sans text-sm text-ink/80">{leave.decision_note}</p>
                </div>
              )}
            </section>

            {thread.attachments.length > 0 && (
              <section>
                <p className="mb-2 px-1 font-sans text-xs uppercase tracking-wider text-ink/55">Belgeler</p>
                <ul className="space-y-2">
                  {thread.attachments.map((att) => (
                    <li
                      key={att.id}
                      className="flex items-center gap-3 rounded-md border border-rule bg-paper px-3 py-2.5"
                    >
                      <Paperclip className="h-4 w-4 shrink-0 text-ink/45" />
                      <div className="min-w-0 flex-1">
                        <p className="font-sans text-sm text-ink truncate">{att.file_name}</p>
                        <p className="font-sans text-[0.7rem] text-ink/45">
                          {formatBytes(att.file_size_bytes)} · {att.uploaded_by_label}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDownload(att.id, att.file_name)}
                        disabled={downloadingId !== null}
                        className="inline-flex items-center gap-1 rounded-md border border-rule bg-paper px-2.5 py-1.5 font-sans text-xs font-semibold text-ink hover:border-ink disabled:opacity-40"
                      >
                        {downloadingId === att.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                        İndir
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <p className="mb-2 px-1 font-sans text-xs uppercase tracking-wider text-ink/55">Yazışmalar</p>
              {thread.messages.length === 0 ? (
                <div className="rounded-md border border-rule bg-cream/40 px-4 py-7 text-center">
                  <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-accent">
                    <MessageSquare className="h-5 w-5" />
                  </span>
                  <p className="mt-2 font-sans text-sm text-ink/55">Henüz yazışma yok</p>
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {thread.messages.map((msg) => {
                    const own = msg.sender_actor.toUpperCase().includes('EMPLOYEE')
                    return (
                      <li key={msg.id} className={own ? 'flex justify-end' : 'flex justify-start'}>
                        <div
                          className={
                            'max-w-[82%] rounded-md border px-3 py-2 ' +
                            (own ? 'border-accent/30 bg-accent-soft' : 'border-rule bg-paper')
                          }
                        >
                          <p className="font-sans text-[0.7rem] text-ink/45">
                            {msg.sender_label} · {formatTs(msg.created_at)}
                          </p>
                          <p className="mt-0.5 font-sans text-sm text-ink whitespace-pre-wrap break-words">
                            {msg.message}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <form onSubmit={handleSend} className="flex items-end gap-2 border-t border-rule pt-3">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Mesaj yazın..."
                rows={2}
                maxLength={1000}
                className="flex-1 resize-none rounded-md border border-rule bg-paper px-3 py-2 font-sans text-sm text-ink focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={isSending || draft.trim().length < 2}
                className="inline-flex h-10 items-center justify-center gap-1 rounded-md border border-accent bg-accent px-4 font-sans text-sm font-semibold text-paper hover:opacity-90 disabled:opacity-40"
              >
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
          </>
        )}
      </div>
    </SheetModal>
  )
}
