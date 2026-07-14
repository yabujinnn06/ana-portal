import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'

import {
  clearAdminConversationMessages,
  createAdminConversation,
  createAdminConversationMessage,
  getAdminConversationThread,
  getAdminConversations,
  getEmployees,
  updateAdminConversationStatus,
} from '../api/admin'
import { parseApiError } from '../api/error'
import { EmployeeAutocompleteField } from '../components/EmployeeAutocompleteField'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { UI_BRANDING } from '../config/ui'
import { useToast } from '../hooks/useToast'
import { usePageVisibility } from '../hooks/usePageVisibility'
import type { EmployeeConversationCategory, EmployeeConversationStatus } from '../types/api'

const categoryLabels: Record<EmployeeConversationCategory, string> = {
  ATTENDANCE: 'Puantaj',
  SHIFT: 'Vardiya',
  DEVICE: 'Cihaz',
  DOCUMENT: 'Belge',
  OTHER: 'Genel',
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) {
    return null
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null
  }
  return parsed
}

function formatListTime(value: string | null | undefined): string {
  if (!value) {
    return ''
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }
  const now = new Date()
  const sameDay =
    parsed.getDate() === now.getDate() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getFullYear() === now.getFullYear()
  if (sameDay) {
    return parsed.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  }
  return parsed.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })
}

function formatMessageTime(value: string | null | undefined): string {
  if (!value) {
    return ''
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }
  return parsed.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusLabel(status: EmployeeConversationStatus): string {
  return status === 'CLOSED' ? 'Kapalı' : 'Açık'
}

function statusClassName(status: EmployeeConversationStatus): string {
  return status === 'CLOSED'
    ? 'border-slate-200 bg-slate-100 text-slate-700'
    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
}

function initials(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) {
    return '?'
  }
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toLocaleUpperCase('tr-TR')
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toLocaleUpperCase('tr-TR')
}

export function CommunicationsPage() {
  const queryClient = useQueryClient()
  const { pushToast } = useToast()
  const isPageVisible = usePageVisibility()
  const [searchParams, setSearchParams] = useSearchParams()
  const [statusFilter, setStatusFilter] = useState<'' | EmployeeConversationStatus>('OPEN')
  const [searchText, setSearchText] = useState('')
  const [replyDraft, setReplyDraft] = useState('')
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  const [newOpen, setNewOpen] = useState(false)
  const [newEmployeeId, setNewEmployeeId] = useState('')
  const [newCategory, setNewCategory] = useState<EmployeeConversationCategory>('OTHER')
  const [newSubject, setNewSubject] = useState('')
  const [newMessage, setNewMessage] = useState('')

  const focusedConversationId = useMemo(() => parsePositiveInt(searchParams.get('conversation_id')), [searchParams])

  const conversationsQuery = useQuery({
    queryKey: ['admin-conversations', statusFilter || 'all'],
    queryFn: () => getAdminConversations({ status: statusFilter || undefined }),
    refetchInterval: isPageVisible && isOnline ? 15_000 : false,
    retry: 2,
    placeholderData: (previous) => previous,
  })

  const threadQuery = useQuery({
    queryKey: ['admin-conversation-thread', focusedConversationId ?? 'none'],
    queryFn: () => getAdminConversationThread(focusedConversationId as number),
    enabled: focusedConversationId !== null,
    refetchInterval: isPageVisible && isOnline && focusedConversationId !== null ? 10_000 : false,
    retry: 2,
    placeholderData: (previous) => previous,
  })

  const employeesQuery = useQuery({
    queryKey: ['employees', 'communications'],
    queryFn: () => getEmployees({ status: 'active' }),
    enabled: newOpen,
  })

  const messageMutation = useMutation({
    mutationFn: ({ conversationId, message }: { conversationId: number; message: string }) =>
      createAdminConversationMessage(conversationId, { message }),
    onSuccess: (thread) => {
      setReplyDraft('')
      queryClient.setQueryData(['admin-conversation-thread', thread.conversation.id], thread)
      void queryClient.invalidateQueries({ queryKey: ['admin-conversations'] })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Yanıt gönderilemedi.')
      pushToast({
        variant: 'error',
        title: 'Yanıt gönderilemedi',
        description: parsed.message,
      })
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ conversationId, status }: { conversationId: number; status: EmployeeConversationStatus }) =>
      updateAdminConversationStatus(conversationId, { status }),
    onSuccess: (conversation) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-conversations'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-conversation-thread', conversation.id] })
      pushToast({
        variant: 'success',
        title: conversation.status === 'CLOSED' ? 'Yazışma kapatıldı' : 'Yazışma yeniden açıldı',
        description: `${conversation.subject} başlıklı kayıt güncellendi.`,
      })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Yazışma durumu güncellenemedi.')
      pushToast({
        variant: 'error',
        title: 'Durum güncellenemedi',
        description: parsed.message,
      })
    },
  })

  const clearMessagesMutation = useMutation({
    mutationFn: (conversationId: number) => clearAdminConversationMessages(conversationId),
    onSuccess: (thread) => {
      setReplyDraft('')
      queryClient.setQueryData(['admin-conversation-thread', thread.conversation.id], thread)
      void queryClient.invalidateQueries({ queryKey: ['admin-conversations'] })
      pushToast({
        variant: 'success',
        title: 'Sohbet temizlendi',
        description: `İletişim #${thread.conversation.id} içindeki mesajlar kaldırıldı.`,
      })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Sohbet temizlenemedi.')
      pushToast({
        variant: 'error',
        title: 'Sohbet temizlenemedi',
        description: parsed.message,
      })
    },
  })

  const createConversationMutation = useMutation({
    mutationFn: createAdminConversation,
    onSuccess: (thread) => {
      queryClient.setQueryData(['admin-conversation-thread', thread.conversation.id], thread)
      void queryClient.invalidateQueries({ queryKey: ['admin-conversations'] })
      setNewOpen(false)
      setNewEmployeeId('')
      setNewSubject('')
      setNewMessage('')
      setNewCategory('OTHER')
      openConversation(thread.conversation.id)
      pushToast({
        variant: 'success',
        title: 'Sohbet başlatıldı',
        description: `${thread.conversation.employee_name} ile yeni yazışma açıldı.`,
      })
    },
    onError: (error) => {
      const parsed = parseApiError(error, 'Sohbet başlatılamadı.')
      pushToast({ variant: 'error', title: 'Sohbet başlatılamadı', description: parsed.message })
    },
  })

  const submitNewConversation = () => {
    const employeeId = Number(newEmployeeId)
    const subject = newSubject.trim()
    const message = newMessage.trim()
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      pushToast({ variant: 'info', title: 'Çalışan seçin', description: 'Mesaj göndermek için bir çalışan seçin.' })
      return
    }
    if (subject.length < 6) {
      pushToast({ variant: 'info', title: 'Konu kısa', description: 'Konu en az 6 karakter olmalı.' })
      return
    }
    if (message.length < 3) {
      pushToast({ variant: 'info', title: 'Mesaj kısa', description: 'Mesaj en az 3 karakter olmalı.' })
      return
    }
    createConversationMutation.mutate({ employee_id: employeeId, category: newCategory, subject, message })
  }

  const allConversations = conversationsQuery.data ?? []
  const filteredConversations = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase('tr-TR')
    if (!query) {
      return allConversations
    }
    return allConversations.filter((conversation) => {
      const haystack = `${conversation.employee_name} ${conversation.subject} ${conversation.latest_message_preview ?? ''}`
        .toLocaleLowerCase('tr-TR')
      return haystack.includes(query)
    })
  }, [allConversations, searchText])

  const openConversation = (conversationId: number) => {
    const next = new URLSearchParams(searchParams)
    next.set('conversation_id', String(conversationId))
    next.set('thread', '1')
    setSearchParams(next, { replace: true })
    setReplyDraft('')
  }

  const closeThread = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('conversation_id')
    next.delete('thread')
    setSearchParams(next, { replace: true })
    setReplyDraft('')
  }

  const activeThread = threadQuery.data
  const activeConversation = activeThread?.conversation ?? null
  const messages = activeThread?.messages ?? []

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
  }, [messages.length, focusedConversationId])

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const submitReply = () => {
    const message = replyDraft.trim()
    if (!focusedConversationId) {
      return
    }
    if (message.length < 3) {
      pushToast({
        variant: 'info',
        title: 'Mesaj kısa',
        description: 'Yanıt göndermek için en az 3 karakter yazın.',
      })
      return
    }
    messageMutation.mutate({ conversationId: focusedConversationId, message })
  }

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submitReply()
    }
  }

  const handleClearMessages = () => {
    if (!focusedConversationId || !activeConversation) {
      return
    }
    const confirmed = window.confirm(
      `"${activeConversation.subject}" yazışmasının tüm mesajları temizlensin mi? Bu işlem geri alınamaz.`,
    )
    if (!confirmed) {
      return
    }
    clearMessagesMutation.mutate(focusedConversationId)
  }

  const statusFilters: Array<{ value: '' | EmployeeConversationStatus; label: string }> = [
    { value: 'OPEN', label: 'Açık' },
    { value: 'CLOSED', label: 'Kapalı' },
    { value: '', label: 'Tümü' },
  ]

  return (
    <div className="flex h-[calc(100dvh-9.5rem)] min-h-[34rem] flex-col gap-4">
      <PageHeader
        title="Mesajlar"
        description="Çalışanlarla kurumsal yazışmaları tek ekrandan yönetin, yanıtlayın ve gerektiğinde kapatın."
      />

      {!isOnline || conversationsQuery.isError || threadQuery.isError ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          <span>
            {!isOnline
              ? 'Çevrimdışısınız. Bağlantı gelince mesajlar otomatik güncellenir.'
              : 'Bağlantı sorunu yaşanıyor. Mevcut veriler gösteriliyor, yeniden denenecek.'}
          </span>
          <button
            type="button"
            onClick={() => {
              void conversationsQuery.refetch()
              if (focusedConversationId !== null) {
                void threadQuery.refetch()
              }
            }}
            className="shrink-0 rounded-lg border border-amber-400 bg-white/70 px-2.5 py-1 font-semibold text-amber-800 hover:bg-white"
          >
            Tekrar dene
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_16px_42px_rgba(15,44,61,0.08)]">
        <div className="grid min-h-0 w-full grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)]">
          {/* Konuşma listesi */}
          <aside
            className={`min-h-0 flex-col border-slate-200 lg:flex lg:border-r ${
              focusedConversationId ? 'hidden' : 'flex'
            }`}
          >
            <div className="border-b border-slate-200 p-3">
              <button
                type="button"
                onClick={() => setNewOpen(true)}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-400"
              >
                <span className="text-base leading-none">+</span> Yeni sohbet başlat
              </button>
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Çalışan, başlık veya mesaj ara"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
              />
              <div className="mt-3 flex gap-1 rounded-xl bg-slate-100 p-1">
                {statusFilters.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setStatusFilter(item.value)}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                      statusFilter === item.value
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {conversationsQuery.isLoading ? (
                <div className="p-4">
                  <LoadingBlock />
                </div>
              ) : conversationsQuery.isError && allConversations.length === 0 ? (
                <div className="p-4">
                  <ErrorBlock message="İletişim listesi alınamadı." />
                </div>
              ) : filteredConversations.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">Gösterilecek kurumsal mesaj kaydı yok.</p>
              ) : (
                <ul>
                  {filteredConversations.map((conversation) => {
                    const isActive = focusedConversationId === conversation.id
                    return (
                      <li key={conversation.id}>
                        <button
                          type="button"
                          onClick={() => openConversation(conversation.id)}
                          className={`flex w-full items-start gap-3 border-b border-slate-100 px-3 py-3 text-left transition ${
                            isActive ? 'bg-sky-50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                              conversation.status === 'OPEN'
                                ? 'bg-sky-100 text-sky-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {initials(conversation.employee_name)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-semibold text-slate-900">
                                {conversation.employee_name}
                              </span>
                              <span className="shrink-0 text-[11px] text-slate-400">
                                {formatListTime(conversation.last_message_at)}
                              </span>
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5">
                              {conversation.status === 'OPEN' ? (
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                              ) : null}
                              <span className="truncate text-xs font-medium text-slate-600">{conversation.subject}</span>
                            </span>
                            <span className="mt-1 line-clamp-1 block text-xs text-slate-500">
                              {conversation.latest_message_preview ?? 'Henüz mesaj yok'}
                            </span>
                            <span className="mt-1.5 flex items-center gap-1.5">
                              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                {categoryLabels[conversation.category]}
                              </span>
                              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                                {conversation.message_count} mesaj
                              </span>
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </aside>

          {/* Sohbet akışı */}
          <section
            className={`min-h-0 flex-col bg-gradient-to-b from-slate-50 to-slate-100/70 lg:flex ${
              focusedConversationId ? 'flex' : 'hidden'
            }`}
          >
            {!focusedConversationId ? (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
                  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8 10h8M8 14h5m7-2c0 4.418-4.03 8-9 8a9.8 9.8 0 01-4-.84L3 21l1.34-3.5A7.9 7.9 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-900">Bir konuşma seçin</h3>
                <p className="mt-1 max-w-sm text-sm text-slate-500">
                  Soldaki listeden bir çalışanın mesajını açın. Admin bildiriminden gelindiğinde ilgili konuşma otomatik
                  açılır.
                </p>
              </div>
            ) : threadQuery.isLoading ? (
              <div className="p-6">
                <LoadingBlock />
              </div>
            ) : threadQuery.isError && !activeThread ? (
              <div className="p-6">
                <ErrorBlock message="İletişim thread'i yüklenemedi." />
              </div>
            ) : activeConversation ? (
              <>
                <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
                  <button
                    type="button"
                    onClick={closeThread}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 lg:hidden"
                    aria-label="Listeye dön"
                  >
                    ‹ Geri
                  </button>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-700">
                    {initials(activeConversation.employee_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{activeConversation.employee_name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {activeConversation.subject} · {categoryLabels[activeConversation.category]}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClassName(
                      activeConversation.status,
                    )}`}
                  >
                    {statusLabel(activeConversation.status)}
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleClearMessages}
                      disabled={clearMessagesMutation.isPending || activeConversation.message_count === 0}
                      title="Sohbeti temizle"
                      className="rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {clearMessagesMutation.isPending ? '...' : 'Temizle'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        statusMutation.mutate({
                          conversationId: activeConversation.id,
                          status: activeConversation.status === 'OPEN' ? 'CLOSED' : 'OPEN',
                        })
                      }
                      disabled={statusMutation.isPending}
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {activeConversation.status === 'OPEN' ? 'Kapat' : 'Yeniden Aç'}
                    </button>
                  </div>
                </header>

                <div className="relative min-h-0 flex-1">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 flex select-none flex-col items-center justify-center"
                  >
                    <span className="text-5xl font-black uppercase tracking-[0.35em] text-slate-300/30 sm:text-6xl">
                      {UI_BRANDING.signatureText}
                    </span>
                    <span className="mt-2 text-[10px] font-semibold uppercase tracking-[0.45em] text-slate-300/40">
                      {UI_BRANDING.signatureTagline}
                    </span>
                  </div>
                  <div className="absolute inset-0 space-y-3 overflow-y-auto px-4 py-4">
                    {messages.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-4 text-center text-sm text-slate-500">
                        Bu yazışmada görüntülenecek mesaj yok.
                      </p>
                    ) : (
                      messages.map((message) => {
                        const isAdmin = message.sender_actor === 'ADMIN'
                        return (
                          <div key={message.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                            <div
                              className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                                isAdmin
                                  ? 'rounded-br-md bg-sky-500 text-white'
                                  : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'
                              }`}
                            >
                              <p
                                className={`mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${
                                  isAdmin ? 'text-white/80' : 'text-sky-600'
                                }`}
                              >
                                {message.sender_label}
                              </p>
                              <p className="whitespace-pre-wrap text-sm leading-6">{message.message}</p>
                              <p className={`mt-1 text-right text-[10px] ${isAdmin ? 'text-white/70' : 'text-slate-400'}`}>
                                {formatMessageTime(message.created_at)}
                              </p>
                            </div>
                          </div>
                        )
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {activeConversation.status === 'OPEN' ? (
                  <div className="border-t border-slate-200 bg-white p-3">
                    <div className="flex items-end gap-2">
                      <textarea
                        value={replyDraft}
                        onChange={(event) => setReplyDraft(event.target.value)}
                        onKeyDown={handleComposerKeyDown}
                        rows={2}
                        placeholder="Çalışana kurumsal yanıt yazın... (Enter ile gönder, Shift+Enter ile satır)"
                        className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                      />
                      <button
                        type="button"
                        onClick={submitReply}
                        disabled={messageMutation.isPending || clearMessagesMutation.isPending || replyDraft.trim().length < 3}
                        className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {messageMutation.isPending ? 'Gönderiliyor...' : 'Gönder'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                    Bu yazışma kapalı. Yanıt vermek için önce yazışmayı yeniden açın.
                  </div>
                )}
              </>
            ) : null}
          </section>
        </div>
      </div>

      <Modal open={newOpen} title="Yeni sohbet başlat" onClose={() => setNewOpen(false)} maxWidthClass="max-w-lg">
        <div className="space-y-4">
          <EmployeeAutocompleteField
            label="Çalışan"
            employees={employeesQuery.data ?? []}
            value={newEmployeeId}
            onChange={setNewEmployeeId}
            placeholder="Çalışan adı veya ID yazın..."
            helperText={employeesQuery.isLoading ? 'Çalışan listesi yükleniyor...' : undefined}
          />

          <div>
            <p className="text-sm text-slate-700">Konu türü</p>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(Object.entries(categoryLabels) as Array<[EmployeeConversationCategory, string]>).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setNewCategory(value)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    newCategory === value
                      ? 'border-sky-400 bg-sky-50 text-sky-700'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <label className="block text-sm text-slate-700">
            Konu
            <input
              value={newSubject}
              onChange={(event) => setNewSubject(event.target.value)}
              placeholder="En az 6 karakter"
              maxLength={160}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <label className="block text-sm text-slate-700">
            Mesaj
            <textarea
              value={newMessage}
              onChange={(event) => setNewMessage(event.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Çalışana iletmek istediğiniz mesaj..."
              className="mt-1 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setNewOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={submitNewConversation}
              disabled={createConversationMutation.isPending}
              className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createConversationMutation.isPending ? 'Gönderiliyor...' : 'Sohbeti Başlat'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
