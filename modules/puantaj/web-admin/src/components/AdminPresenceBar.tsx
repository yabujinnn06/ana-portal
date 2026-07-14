import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { sendAdminPresenceHeartbeat } from '../api/admin'
import { useAuth } from '../hooks/useAuth'
import type { AdminPresenceRosterEntry } from '../types/api'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase('tr')
  return (parts[0][0] + parts[parts.length - 1][0]).toLocaleUpperCase('tr')
}

function displayName(entry: AdminPresenceRosterEntry): string {
  return entry.full_name?.trim() || entry.username
}

function relativeSeen(value: string | null): string {
  if (!value) return 'Hiç görülmedi'
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return '-'
  const diff = Math.round((Date.now() - then) / 1000)
  if (diff < 60) return 'az önce'
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`
  if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`
  if (diff < 604800) return `${Math.floor(diff / 86400)} gün önce`
  return new Date(value).toLocaleDateString('tr-TR')
}

function PresenceRow({ entry, isSelf }: { entry: AdminPresenceRosterEntry; isSelf: boolean }) {
  const name = displayName(entry)
  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-slate-50">
      <span className="relative flex-none">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white ${
            entry.is_online ? 'from-emerald-500 to-teal-600' : 'from-slate-400 to-slate-500'
          }`}
        >
          {initials(name)}
        </span>
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${
            entry.is_online ? 'bg-emerald-500' : 'bg-slate-300'
          }`}
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-slate-800">{name}</p>
          {isSelf ? (
            <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-700">
              siz
            </span>
          ) : null}
        </div>
        <p className="truncate text-xs text-slate-400">{entry.role || 'Admin'}</p>
      </div>
      <span
        className={`flex-none text-xs font-semibold ${
          entry.is_online ? 'text-emerald-600' : 'text-slate-400'
        }`}
      >
        {entry.is_online ? 'şimdi' : relativeSeen(entry.last_seen_utc)}
      </span>
    </div>
  )
}

export function AdminPresenceBar({ currentKey }: { currentKey: string | null }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  const query = useQuery({
    queryKey: ['admin-presence'],
    queryFn: sendAdminPresenceHeartbeat,
    refetchInterval: 25_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  })

  const roster = useMemo(() => query.data?.roster ?? [], [query.data?.roster])
  const online = useMemo(() => roster.filter((entry) => entry.is_online), [roster])
  const offline = useMemo(() => roster.filter((entry) => !entry.is_online), [roster])
  const selfUsername = (user?.username ?? '').trim().toLocaleLowerCase('tr')

  const isSelf = (entry: AdminPresenceRosterEntry) =>
    entry.username.trim().toLocaleLowerCase('tr') === selfUsername ||
    (currentKey != null && entry.username === currentKey)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!roster.length) {
    return null
  }

  const onlineCount = online.length
  const stack = online.slice(0, 3)
  const extra = onlineCount - stack.length

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label={`Ekip durumu, ${onlineCount} çevrimiçi`}
        className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition ${
          onlineCount > 0
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
        }`}
      >
        {onlineCount > 0 ? (
          <span className="relative flex h-2 w-2 flex-none">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        ) : (
          <span className="h-2 w-2 flex-none rounded-full bg-slate-300" />
        )}
        <span className="hidden sm:inline">Çevrimiçi</span>
        <span
          className={`flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[11px] font-bold ${
            onlineCount > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
          }`}
        >
          {onlineCount}
        </span>
        {stack.length > 0 ? (
          <span className="ml-0.5 hidden items-center md:flex">
            {stack.map((entry, index) => (
              <span
                key={entry.username}
                className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-emerald-500 to-teal-600 text-[10px] font-bold text-white ${
                  index > 0 ? '-ml-2' : ''
                }`}
                title={displayName(entry)}
              >
                {initials(displayName(entry))}
              </span>
            ))}
            {extra > 0 ? (
              <span className="-ml-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-200 text-[10px] font-bold text-slate-600">
                +{extra}
              </span>
            ) : null}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl max-sm:fixed max-sm:inset-x-3 max-sm:top-[4.75rem] max-sm:mt-0 max-sm:w-auto">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-slate-900">Ekip Durumu</p>
              <p className="text-xs text-slate-400">
                {onlineCount} çevrimiçi · {roster.length} kişi
              </p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {onlineCount}
            </span>
          </div>

          <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
            {online.length > 0 ? (
              <>
                <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                  Şimdi aktif
                </p>
                {online.map((entry) => (
                  <PresenceRow key={`on-${entry.username}`} entry={entry} isSelf={isSelf(entry)} />
                ))}
              </>
            ) : null}

            {offline.length > 0 ? (
              <>
                <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Son görülenler
                </p>
                {offline.map((entry) => (
                  <PresenceRow key={`off-${entry.username}`} entry={entry} isSelf={isSelf(entry)} />
                ))}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
