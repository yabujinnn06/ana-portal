import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  AssistantStreamStartError,
  getAssistantConfig,
  getAssistantUsage,
  sendAssistantMessage,
  streamAssistant,
  updateAssistantConfig,
} from '../api/admin'
import { getApiErrorMessage } from '../api/error'
import { PuantajBeyniMascot } from '../components/PuantajBeyniMascot'
import { ShineBorder } from '../components/magic/shine-border'
import { NumberTicker } from '../components/magic/number-ticker'
import { playSound } from '../utils/sound'
import type {
  AssistantChatMessage,
  AssistantConfigStatus,
  AssistantUsage,
} from '../types/api'
import './AssistantPage.css'

type ChatItem = AssistantChatMessage & { id: string; time: string; error?: boolean }

const SUGGESTIONS = [
  'Bugün kim gelmedi?',
  'Departmanlar ve çalışan sayıları neler?',
  'Bir çalışanın bu ayki günlük puantajını göster.',
  'Bu ay hangi departmanın fazla mesaisi en yüksek?',
]

// Araç çalışırken gösterilen kısa durum etiketi (akış sırasında).
const TOOL_LABELS: Record<string, string> = {
  anlama: 'Soru anlaşılıyor',
  calisan_ara: 'Çalışan aranıyor',
  kisi_aylik_ozet: 'Aylık özet hesaplanıyor',
  kisi_detay: 'Çalışan bilgisi getiriliyor',
  gunluk_puantaj: 'Günlük puantaj getiriliyor',
  eksik_gunler: 'Eksik günler taranıyor',
  departman_aylik_ozet: 'Departman özeti hesaplanıyor',
  departman_listesi: 'Departmanlar getiriliyor',
  departman_calisanlari: 'Departman çalışanları getiriliyor',
  vardiya_listesi: 'Vardiyalar getiriliyor',
  mesai_kurallari: 'Mesai kuralları getiriliyor',
  resmi_tatiller: 'Resmi tatiller getiriliyor',
  bugun_durumu: 'Bugünkü durum getiriliyor',
  sirket_ozeti: 'Şirket özeti hazırlanıyor',
  izin_listesi: 'İzinler getiriliyor',
}

function toolLabel(tool: string): string {
  return `${TOOL_LABELS[tool] ?? 'Veriler getiriliyor'}...`
}

// Groq ucretsiz katman, sohbet + tool destekli modeller (faturalandirma yok).
const GROQ_MODELS: { id: string; label: string }[] = [
  { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B - en hızlı + yüksek limit (önerilen)' },
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B - daha güçlü ama yavaş' },
  { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B - güçlü, yavaş, araç kullanımı kararsız' },
  { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B - dengeli' },
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B' },
  { id: 'qwen/qwen3-32b', label: 'Qwen3 32B' },
]
const GROQ_MODEL_IDS = GROQ_MODELS.map((m) => m.id)

function newId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function nowTime(): string {
  return new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

function UserAvatarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.4 0-8 2.7-8 6v2h16v-2c0-3.3-3.6-6-8-6z" />
    </svg>
  )
}

function SeenTicks() {
  return (
    <svg
      className="pb-msg__ticks"
      viewBox="0 0 18 11"
      width="16"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 6.2 3.7 9 9 2.2" />
      <path d="M7.2 9 12.5 2.2" />
    </svg>
  )
}

export function AssistantPage() {
  const [items, setItems] = useState<ChatItem[]>([])
  const [input, setInput] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const configQuery = useQuery({
    queryKey: ['assistant-config'],
    queryFn: getAssistantConfig,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  const usageQuery = useQuery({
    queryKey: ['assistant-usage'],
    queryFn: getAssistantUsage,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  const [isSending, setIsSending] = useState(false)
  const [statusTool, setStatusTool] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const node = scrollRef.current
    if (node) {
      node.scrollTop = node.scrollHeight
    }
  }, [items, isSending, statusTool])

  // Sayfadan ayrilinca devam eden akisi durdur (unmount sizintisi olmasin).
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  function handleSend(text?: string) {
    const content = (text ?? input).trim()
    if (!content || isSending) {
      return
    }
    const userItem: ChatItem = { id: newId(), role: 'user', content, time: nowTime() }
    const botId = newId()
    setItems((prev) => [
      ...prev,
      userItem,
      { id: botId, role: 'assistant', content: '', time: nowTime() },
    ])
    setInput('')
    playSound('send')
    setIsSending(true)
    setStatusTool(null)

    // Onceki akis hala sürüyorsa kes, yenisi icin denetleyici olustur.
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const history: AssistantChatMessage[] = [...items, userItem].map(({ role, content }) => ({
      role,
      content,
    }))

    let gotDelta = false
    let finished = false

    const appendDelta = (chunk: string) => {
      if (!chunk) {
        return
      }
      gotDelta = true
      setStatusTool(null)
      setItems((prev) =>
        prev.map((it) => (it.id === botId ? { ...it, content: it.content + chunk } : it)),
      )
    }

    // Arac turu canli akan on-metni temizler (nihai cevap degildi).
    const resetBubble = () => {
      gotDelta = false
      setItems((prev) => prev.map((it) => (it.id === botId ? { ...it, content: '' } : it)))
    }

    const finalize = (usage: AssistantUsage | null) => {
      if (finished) {
        return
      }
      finished = true
      setIsSending(false)
      setStatusTool(null)
      if (usage) {
        queryClient.setQueryData(['assistant-usage'], usage)
      }
      setItems((prev) => prev.map((it) => (it.id === botId ? { ...it, time: nowTime() } : it)))
      playSound('receive')
    }

    const fail = (message: string) => {
      if (finished) {
        return
      }
      finished = true
      setIsSending(false)
      setStatusTool(null)
      setItems((prev) =>
        prev.map((it) =>
          it.id === botId ? { ...it, content: message, error: true, time: nowTime() } : it,
        ),
      )
      playSound('receive')
    }

    streamAssistant(
      history,
      {
        onStatus: (tool) => setStatusTool(tool),
        onReset: resetBubble,
        onDelta: appendDelta,
        onDone: ({ reply, usage }) => {
          if (!gotDelta && reply) {
            appendDelta(reply)
          }
          finalize(usage)
        },
        // Kismi cevap akmissa hata ile ezme; eldeki metni koru.
        onError: (message) => (gotDelta ? finalize(null) : fail(message)),
      },
      controller.signal,
    ).catch(async (streamError) => {
      if (finished || controller.signal.aborted) {
        return
      }
      if (
        streamError instanceof AssistantStreamStartError &&
        streamError.hasStructuredError
      ) {
        fail(streamError.message)
        return
      }
      // Akis ortasinda koptuysa kismi cevap var: yeniden uretme, eldekini koru.
      if (gotDelta) {
        finalize(null)
        return
      }
      // Akis hic baslayamadi (401/proxy vb.) -> guvenli non-stream yedek (token yenileme dahil).
      finished = true
      try {
        const data = await sendAssistantMessage(history)
        setItems((prev) =>
          prev.map((it) => (it.id === botId ? { ...it, content: data.reply || '...', time: nowTime() } : it)),
        )
        if (data.usage) {
          queryClient.setQueryData(['assistant-usage'], data.usage)
        }
        setIsSending(false)
        setStatusTool(null)
        playSound('receive')
      } catch (fallbackError) {
        void streamError
        // fail() finished guard'ina takilmasin diye once sifirla.
        finished = false
        fail(getApiErrorMessage(fallbackError, 'Asistana ulaşılamadı.'))
      }
    })
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  const isEmpty = items.length === 0
  const config = configQuery.data
  const keyMissing = config != null && !config.has_key
  const usage = usageQuery.data
  const usageError = usageQuery.isError
  const usageQuota =
    usage && usage.daily_cap != null && usage.remaining != null && usage.daily_cap > 0
      ? (() => {
          const pct = Math.max(0, Math.min(100, Math.round((usage.remaining / usage.daily_cap) * 100)))
          const level = pct > 40 ? 'ok' : pct >= 15 ? 'warn' : 'low'
          return { pct, level }
        })()
      : null

  return (
    <div className="pb-assistant">
      <header className="pb-assistant__head">
        <span className="pb-assistant__avatar">
          <PuantajBeyniMascot size={40} />
        </span>
        <div className={`pb-assistant__title${keyMissing ? ' is-warn' : ''}`}>
          <h1>Puantaj Zeka</h1>
          <p>
            <span className="dot" />
            {keyMissing ? 'anahtar bekleniyor' : 'çevrimiçi'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="pb-assistant__gear"
          aria-label="Asistan ayarları"
          title="Asistan ayarları"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" className="pb-assistant__gear-icon fill-current">
            <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9.4 4c0-.6-.1-1.2-.2-1.8l2-1.5-2-3.4-2.3 1a7.5 7.5 0 0 0-3-1.8L15.5 1h-7l-.4 2.7a7.5 7.5 0 0 0-3 1.8l-2.3-1-2 3.4 2 1.5c-.1.6-.2 1.2-.2 1.8s.1 1.2.2 1.8l-2 1.5 2 3.4 2.3-1c.9.8 1.9 1.4 3 1.8l.4 2.7h7l.4-2.7c1.1-.4 2.1-1 3-1.8l2.3 1 2-3.4-2-1.5c.1-.6.2-1.2.2-1.8z" />
          </svg>
        </button>
      </header>

      <div ref={scrollRef} className="pb-assistant__feed">
        {isEmpty ? (
          <div className="pb-empty">
            <PuantajBeyniMascot size={120} />
            <div>
              <p className="pb-empty__title">Merhaba, ben Puantaj Zeka.</p>
              <p className="pb-empty__sub">
                Mesai ve fazla mesai, günlük puantaj, izin, departman, vardiya,
                resmi tatil ve "bugün kim içeride" gibi soruları yanıtlarım.
                Özlük (TC, maaş, banka...) ve konum bilgisi paylaşmam.
              </p>
            </div>
            <div className="pb-chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => handleSend(s)} className="pb-chip">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="pb-day">Bugün</div>
            {items.map((item) =>
              item.role === 'user' ? (
                <div key={item.id} className="pb-row pb-row--user">
                  <div className="pb-msg">
                    {item.content}
                    <span className="pb-msg__time">
                      {item.time}
                      <SeenTicks />
                    </span>
                  </div>
                  <span className="pb-row__avatar pb-row__avatar--user">
                    <UserAvatarIcon />
                  </span>
                </div>
              ) : (
                <div key={item.id} className="pb-row pb-row--bot">
                  <PuantajBeyniMascot size={40} calm className="pb-row__avatar" />
                  {item.content === '' && isSending && !item.error ? (
                    statusTool ? (
                      <div className="pb-activity" role="status" aria-live="polite">
                        <span className="pb-activity__spinner" aria-hidden="true" />
                        <span className="pb-activity__label">{toolLabel(statusTool)}</span>
                      </div>
                    ) : (
                      <div className="pb-typing">
                        <span />
                        <span />
                        <span />
                      </div>
                    )
                  ) : (
                    <div className={`pb-msg${item.error ? ' pb-msg--error' : ''}`}>
                      {item.content}
                      <span className="pb-msg__time">
                        {item.time}
                        <SeenTicks />
                      </span>
                    </div>
                  )}
                </div>
              ),
            )}
          </>
        )}
      </div>

      {keyMissing ? (
        <div className="pb-warn">
          <span>API anahtarı tanımlı değil. Asistanın çalışması için ayarlardan ekleyin.</span>
          <button type="button" onClick={() => setSettingsOpen(true)}>
            Ayarlar
          </button>
        </div>
      ) : null}

      <div className="pb-compose">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Bir soru yaz..."
          aria-label="Mesaj yaz"
        />
        <button
          type="button"
          onClick={() => handleSend()}
          disabled={!input.trim() || isSending}
          className={`pb-send${input.trim() && !isSending ? ' is-ready' : ''}`}
          aria-label="Gönder"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" className="fill-current">
            <path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>

      <div className="pb-usage">
        {usage ? (
          <>
            <div className="pb-usage__line">
              <span className="pb-usage__model">{usage.model}</span>
              <span className="pb-usage__used">
                bu panelden bugün ~<NumberTicker value={usage.used_today} /> token
              </span>
            </div>
            {usageQuota ? (
              <div className="pb-usage__quota">
                <span
                  className={`pb-usage__bar pb-usage__bar--${usageQuota.level}`}
                  role="progressbar"
                  aria-valuenow={usageQuota.pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Günlük token tahmini kalan oranı"
                >
                  <span style={{ width: `${usageQuota.pct}%` }} />
                </span>
                <span className={`pb-usage__left pb-usage__left--${usageQuota.level}`}>
                  tahmini kalan ~<NumberTicker value={usage.remaining ?? 0} /> /{' '}
                  {usage.daily_cap?.toLocaleString('tr-TR')} (%{usageQuota.pct})
                </span>
              </div>
            ) : (
              <span className="pb-usage__muted">bu model için günlük limit bilinmiyor</span>
            )}
          </>
        ) : usageError ? (
          <span className="pb-usage__muted">Kullanım bilgisi şu an alınamadı.</span>
        ) : (
          <span className="pb-usage__muted">Yanıtlar veritabanındaki puantaj kayıtlarından üretilir.</span>
        )}
      </div>

      {settingsOpen ? (
        <AssistantSettingsModal status={config ?? null} onClose={() => setSettingsOpen(false)} />
      ) : null}
    </div>
  )
}

function AssistantSettingsModal({
  status,
  onClose,
}: {
  status: AssistantConfigStatus | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(status?.model ?? '')
  const [customModel, setCustomModel] = useState(
    status?.model != null && !GROQ_MODEL_IDS.includes(status.model),
  )
  const [baseUrl, setBaseUrl] = useState(status?.base_url ?? '')
  const [enabled, setEnabled] = useState(status?.enabled ?? true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [success, setSuccess] = useState(false)
  const inited = useRef(false)

  useEffect(() => {
    if (inited.current || !status) {
      return
    }
    inited.current = true
    setModel(status.model ?? '')
    setBaseUrl(status.base_url ?? '')
    setEnabled(status.enabled ?? true)
    setCustomModel(status.model != null && !GROQ_MODEL_IDS.includes(status.model))
  }, [status])

  // Acikken Escape ile kapat + arka plan kaydirmasini kilitle (mobil dahil).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  const mutation = useMutation({
    mutationFn: updateAssistantConfig,
    onSuccess: (data) => {
      queryClient.setQueryData(['assistant-config'], data)
      // Model degisimi alttaki kullanim cubuguna (model adi + gunluk limit) aninda
      // yansisin diye usage'i yeniden cek; aksi halde sayfa yenilemek gerekiyordu.
      void queryClient.invalidateQueries({ queryKey: ['assistant-usage'] })
      setSuccess(true)
      setApiKey('')
      setPassword('')
    },
  })

  const changingKey = apiKey.trim().length > 0

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSuccess(false)
    mutation.mutate({
      username: changingKey ? username.trim() : undefined,
      password: changingKey ? password : undefined,
      api_key: changingKey ? apiKey.trim() : undefined,
      model: model.trim() || undefined,
      base_url: baseUrl.trim() || undefined,
      enabled,
    })
  }

  // API anahtari degistirilecekse kullanici adi + sifre sart; diger degisikliklerde degil.
  const canSubmit = !mutation.isPending && (!changingKey || (username.trim().length > 0 && password.length > 0))

  return createPortal(
    <div
      className="pb-modal-scrim"
      role="dialog"
      aria-modal="true"
      aria-label="Asistan ayarlari"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="pb-modal">
        <ShineBorder
          borderWidth={1.5}
          duration={12}
          shineColor={['#52b3d9', '#9be3ff', '#52b3d9']}
        />
        <div className="pb-modal__head">
          <span className="pb-assistant__avatar" style={{ width: 30, height: 30 }}>
            <PuantajBeyniMascot size={30} calm />
          </span>
          <h2>Asistan Ayarları</h2>
          <button type="button" onClick={onClose} className="pb-modal__close" aria-label="Kapat">
            <svg viewBox="0 0 24 24" width="16" height="16" className="fill-current">
              <path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 5.7 18.3 4.3 16.9 10.6 12 4.3 5.7 5.7 4.3 12 10.6l4.9-4.9z" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="pb-modal__body">
          {status ? (
            <div className="pb-info">
              <div className="pb-info__row">
                <span>Mevcut anahtar</span>
                <strong>
                  {status.has_key
                    ? `${status.key_masked} (${status.key_source === 'db' ? 'panelden' : 'env'})`
                    : 'tanımlı değil'}
                </strong>
              </div>
              {status.updated_by ? (
                <div className="pb-info__row">
                  <span>Son değişiklik</span>
                  <strong>{status.updated_by}</strong>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="pb-field">
            <label htmlFor="pb-apikey">Yeni API anahtarı</label>
            <input
              id="pb-apikey"
              type="password"
              className="pb-input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Boş bırak = değiştirme"
              autoComplete="new-password"
              autoFocus
            />
            <p className="pb-hint">
              Sadece anahtarı değiştirirken kullanıcı adı + şifre istenir. Model/ayar değişimi için gerekmez.
            </p>
          </div>

          <div className="pb-field">
            <label htmlFor="pb-model">Model (Groq ücretsiz)</label>
            <select
              id="pb-model"
              className="pb-input"
              value={customModel ? '__custom__' : model}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setCustomModel(true)
                } else {
                  setCustomModel(false)
                  setModel(e.target.value)
                }
              }}
            >
              {GROQ_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
              <option value="__custom__">Ozel (elle yaz)</option>
            </select>
            {customModel ? (
              <input
                type="text"
                className="pb-input"
                style={{ marginTop: '8px' }}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="model id (orn. llama-3.1-8b-instant)"
              />
            ) : null}
            <p className="pb-hint">
              Limit dolunca (günlük token) başka modele geç. Hepsi ücretsiz, faturalandırma yok.
            </p>
          </div>

          <label className="pb-check">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Asistan aktif
          </label>

          <div className="pb-field">
            <label htmlFor="pb-baseurl">Base URL</label>
            <input
              id="pb-baseurl"
              type="text"
              className="pb-input"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.groq.com/openai/v1"
            />
          </div>

          {changingKey ? (
            <div className="pb-fieldset">
              <p className="pb-fieldset__legend">Doğrulama (anahtar değişimi için zorunlu)</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  type="text"
                  className="pb-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Kullanıcı adı"
                  autoComplete="username"
                />
                <input
                  type="password"
                  className="pb-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Şifre"
                  autoComplete="current-password"
                />
              </div>
            </div>
          ) : null}

          {mutation.isError ? (
            <p className="pb-alert-err">{getApiErrorMessage(mutation.error, 'Kaydedilemedi.')}</p>
          ) : null}
          {success ? <p className="pb-alert-ok">Ayarlar kaydedildi.</p> : null}

          <div className="pb-modal__actions">
            <button type="button" onClick={onClose} className="pb-btn-ghost">
              Kapat
            </button>
            <button type="submit" disabled={!canSubmit} className="pb-btn-primary">
              {mutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
