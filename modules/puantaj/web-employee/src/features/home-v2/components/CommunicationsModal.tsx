import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2, MessageSquarePlus, Send } from 'lucide-react'

import {
  createEmployeeConversation,
  createEmployeeConversationMessage,
  getEmployeeConversations,
  getEmployeeConversationThread,
  parseApiError,
  type ParsedApiError,
} from '../../../api/attendance'
import type {
  EmployeeConversationCategory,
  EmployeeConversationRecord,
  EmployeeConversationThreadRecord,
} from '../../../types/api'
import { SheetModal } from './SheetModal'

interface CommunicationsModalProps {
  open: boolean
  onClose: () => void
  deviceFingerprint: string
  onDeviceNotClaimed?: (parsed: ParsedApiError) => boolean
}

const CATEGORIES: { value: EmployeeConversationCategory; label: string }[] = [
  { value: 'ATTENDANCE', label: 'Mesai / Devam' },
  { value: 'SHIFT', label: 'Vardiya' },
  { value: 'DEVICE', label: 'Cihaz' },
  { value: 'DOCUMENT', label: 'Belge' },
  { value: 'OTHER', label: 'Diğer' },
]

const CATEGORY_LABEL: Record<EmployeeConversationCategory, string> = {
  ATTENDANCE: 'Mesai / Devam',
  SHIFT: 'Vardiya',
  DEVICE: 'Cihaz',
  DOCUMENT: 'Belge',
  OTHER: 'Diğer',
}

function formatTs(utc: string): string {
  return new Date(utc).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function CommunicationsModal({ open, onClose, deviceFingerprint, onDeviceNotClaimed }: CommunicationsModalProps) {
  const [view, setView] = useState<'list' | 'thread' | 'new'>('list')
  const [conversations, setConversations] = useState<EmployeeConversationRecord[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [thread, setThread] = useState<EmployeeConversationThreadRecord | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [newCategory, setNewCategory] = useState<EmployeeConversationCategory>('ATTENDANCE')
  const [newSubject, setNewSubject] = useState('')
  const [newMessage, setNewMessage] = useState('')
  const [creating, setCreating] = useState(false)

  // Callback'leri ref'te tut: parent (HomePageV2) saat yuzunden her saniye
  // render olunca inline onClose degisip loadList'i degistiriyordu -> liste
  // her saniye yeniden yukleniyordu. Ref ile loadList stabil kalir.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onDeviceNotClaimedRef = useRef(onDeviceNotClaimed)
  onDeviceNotClaimedRef.current = onDeviceNotClaimed
  // Polling sirasinda gonderim/olusturma varsa tazelemeyi atla.
  const busyRef = useRef(false)
  busyRef.current = sending || creating

  const handleAuth = useCallback((parsed: ParsedApiError): boolean => {
    if (onDeviceNotClaimedRef.current?.(parsed)) {
      onCloseRef.current()
      return true
    }
    return false
  }, [])

  const loadList = useCallback(async () => {
    setListLoading(true)
    setError(null)
    try {
      const rows = await getEmployeeConversations(deviceFingerprint)
      setConversations(rows)
    } catch (err) {
      const parsed = parseApiError(err, 'Mesajlar alınamadı.')
      if (!handleAuth(parsed)) setError(parsed.message)
    } finally {
      setListLoading(false)
    }
  }, [deviceFingerprint, handleAuth])

  useEffect(() => {
    if (!open) {
      setView('list')
      setThread(null)
      setDraft('')
      setError(null)
      setNewSubject('')
      setNewMessage('')
      return
    }
    void loadList()
  }, [open, loadList])

  // Sessiz tazeleme: loading spinner'i tetiklemeden veriyi gunceller.
  const refreshListSilently = useCallback(async () => {
    try {
      const rows = await getEmployeeConversations(deviceFingerprint)
      setConversations(rows)
    } catch {
      // sessiz: mevcut listeyi koru
    }
  }, [deviceFingerprint])

  const refreshThreadSilently = useCallback(
    async (conversationId: number) => {
      try {
        const data = await getEmployeeConversationThread(conversationId, deviceFingerprint)
        setThread(data)
      } catch {
        // sessiz: mevcut thread'i koru
      }
    },
    [deviceFingerprint],
  )

  // Admin yaniti anlik dussun diye modal acikken periyodik poll.
  const threadConversationId = thread?.conversation.id ?? null
  useEffect(() => {
    if (!open) return
    const tick = () => {
      if (typeof document !== 'undefined' && document.hidden) return
      if (busyRef.current) return
      if (view === 'thread' && threadConversationId !== null) {
        void refreshThreadSilently(threadConversationId)
      } else if (view === 'list') {
        void refreshListSilently()
      }
    }
    const intervalId = window.setInterval(tick, 6000)
    return () => window.clearInterval(intervalId)
  }, [open, view, threadConversationId, refreshThreadSilently, refreshListSilently])

  async function openThread(conversationId: number) {
    setThreadLoading(true)
    setError(null)
    setView('thread')
    try {
      const data = await getEmployeeConversationThread(conversationId, deviceFingerprint)
      setThread(data)
    } catch (err) {
      const parsed = parseApiError(err, 'Konuşma açılamadı.')
      if (!handleAuth(parsed)) setError(parsed.message)
    } finally {
      setThreadLoading(false)
    }
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault()
    if (sending || !thread) return
    const message = draft.trim()
    if (message.length < 3) {
      setError('Mesaj en az 3 karakter olmalı.')
      return
    }
    setSending(true)
    setError(null)
    try {
      const updated = await createEmployeeConversationMessage(thread.conversation.id, {
        device_fingerprint: deviceFingerprint,
        message,
      })
      setThread(updated)
      setDraft('')
    } catch (err) {
      const parsed = parseApiError(err, 'Mesaj gönderilemedi.')
      if (!handleAuth(parsed)) setError(parsed.message)
    } finally {
      setSending(false)
    }
  }

  async function submitNew(e: React.FormEvent) {
    e.preventDefault()
    if (creating) return
    const subject = newSubject.trim()
    const message = newMessage.trim()
    if (subject.length < 6) {
      setError('Konu en az 6 karakter olmalı.')
      return
    }
    if (message.length < 3) {
      setError('Mesaj en az 3 karakter olmalı.')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const created = await createEmployeeConversation({
        device_fingerprint: deviceFingerprint,
        category: newCategory,
        subject,
        message,
      })
      setThread(created)
      setNewSubject('')
      setNewMessage('')
      setView('thread')
    } catch (err) {
      const parsed = parseApiError(err, 'Konuşma oluşturulamadı.')
      if (!handleAuth(parsed)) setError(parsed.message)
    } finally {
      setCreating(false)
    }
  }

  const title = view === 'new' ? 'Yeni mesaj' : view === 'thread' ? (thread?.conversation.subject ?? 'Konuşma') : 'Mesajlar'
  const subtitle = view === 'thread' && thread ? CATEGORY_LABEL[thread.conversation.category] : 'İK ile iletişim'

  const errorBox = error && (
    <div className="rounded-md border border-err/40 bg-err/5 px-4 py-3 font-sans text-sm text-err">{error}</div>
  )

  const fieldBase =
    'w-full rounded-md border border-rule bg-paper px-3 py-2 font-sans text-sm text-ink focus:outline-none focus:border-accent'

  return (
    <SheetModal open={open} title={title} subtitle={subtitle} onClose={onClose}>
      {view === 'list' && (
        <div className="space-y-4">
          {errorBox}
          <button
            type="button"
            onClick={() => { setError(null); setView('new') }}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 py-2.5 font-sans text-sm font-semibold text-paper hover:opacity-90"
          >
            <MessageSquarePlus className="h-4 w-4" />
            Yeni mesaj
          </button>

          {listLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 font-sans text-sm text-ink/60">
              <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor...
            </div>
          ) : conversations.length === 0 ? (
            <div className="rounded-md border border-rule bg-cream/40 px-4 py-8 text-center">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-accent-soft text-accent">
                <MessageSquarePlus className="h-5 w-5" />
              </span>
              <p className="mt-2 font-sans text-sm text-ink/55">Henüz mesajınız yok</p>
              <p className="mt-0.5 font-sans text-xs text-ink/40">Yukarıdan yeni bir mesaj başlatın.</p>
            </div>
          ) : (
            <ul className="rounded-md border border-rule bg-paper divide-y divide-rule overflow-hidden">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => void openThread(c.id)}
                    className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent-soft/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-sans text-sm font-semibold text-ink truncate">{c.subject}</span>
                        <span className="shrink-0 rounded-full border border-rule bg-cream px-2 py-0.5 font-sans text-[0.62rem] uppercase tracking-wider text-ink/55">
                          {CATEGORY_LABEL[c.category]}
                        </span>
                      </div>
                      {c.latest_message_preview && (
                        <p className="mt-0.5 font-sans text-xs text-ink/55 truncate">{c.latest_message_preview}</p>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-[0.7rem] text-ink/40">{formatTs(c.last_message_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {view === 'thread' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => { setView('list'); void loadList() }}
            className="inline-flex items-center gap-1 font-sans text-sm text-accent hover:underline"
          >
            <ArrowLeft className="h-4 w-4" /> Mesajlar
          </button>
          {errorBox}
          {threadLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 font-sans text-sm text-ink/60">
              <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor...
            </div>
          ) : thread ? (
            <>
              <ul className="space-y-2.5">
                {thread.messages.map((m) => {
                  const own = m.sender_actor.toUpperCase().includes('EMPLOYEE')
                  return (
                    <li key={m.id} className={own ? 'flex justify-end' : 'flex justify-start'}>
                      <div className={'max-w-[82%] rounded-md border px-3 py-2 ' + (own ? 'border-accent/30 bg-accent-soft' : 'border-rule bg-paper')}>
                        <p className="font-sans text-[0.7rem] text-ink/45">{m.sender_label} · {formatTs(m.created_at)}</p>
                        <p className="mt-0.5 font-sans text-sm text-ink whitespace-pre-wrap break-words">{m.message}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
              {thread.conversation.status === 'CLOSED' ? (
                <p className="rounded-md border border-rule bg-cream/40 px-4 py-3 text-center font-sans text-sm text-ink/50">
                  Bu konuşma kapatıldı.
                </p>
              ) : (
                <form onSubmit={sendReply} className="flex items-end gap-2 border-t border-rule pt-3">
                  <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Mesaj yazın..." rows={2} maxLength={1000} className={`${fieldBase} resize-none flex-1`} />
                  <button type="submit" disabled={sending || draft.trim().length < 3} className="inline-flex h-10 items-center justify-center rounded-md border border-accent bg-accent px-4 font-sans text-sm font-semibold text-paper hover:opacity-90 disabled:opacity-40">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </form>
              )}
            </>
          ) : null}
        </div>
      )}

      {view === 'new' && (
        <form onSubmit={submitNew} className="space-y-4">
          <button type="button" onClick={() => { setError(null); setView('list') }} className="inline-flex items-center gap-1 font-sans text-sm text-accent hover:underline">
            <ArrowLeft className="h-4 w-4" /> Mesajlar
          </button>
          {errorBox}
          <div>
            <label className="font-sans text-xs uppercase tracking-wider text-ink/55">Konu başlığı</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {CATEGORIES.map((cat) => (
                <button key={cat.value} type="button" onClick={() => setNewCategory(cat.value)} className={'rounded-md border px-3 py-2 font-sans text-sm transition-colors ' + (newCategory === cat.value ? 'border-accent bg-accent text-paper' : 'border-rule bg-paper text-ink hover:border-ink')}>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="comm-subject" className="font-sans text-xs uppercase tracking-wider text-ink/55">Konu</label>
            <input id="comm-subject" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="En az 6 karakter" maxLength={150} className={`${fieldBase} mt-1`} />
          </div>
          <div>
            <label htmlFor="comm-message" className="font-sans text-xs uppercase tracking-wider text-ink/55">Mesaj</label>
            <textarea id="comm-message" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Mesajınızı yazın..." rows={4} maxLength={2000} className={`${fieldBase} mt-1 resize-none`} />
            <p className="mt-1 font-sans text-[0.7rem] text-ink/45">Resmi dil kullanın; emoji ve günlük ifadeler kabul edilmez.</p>
          </div>
          <button type="submit" disabled={creating} className="flex w-full items-center justify-center gap-2 rounded-md border border-accent bg-accent px-4 py-2.5 font-sans text-sm font-semibold text-paper hover:opacity-90 disabled:opacity-40">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {creating ? 'Gönderiliyor...' : 'Gönder'}
          </button>
        </form>
      )}
    </SheetModal>
  )
}
