import type { ReactNode } from 'react'

type Tone = 'neutral' | 'positive' | 'warning' | 'danger' | 'accent'

const TONE: Record<Tone, { card: string; label: string; value: string }> = {
  neutral: { card: 'border-slate-200 bg-white', label: 'text-slate-500', value: 'text-slate-900' },
  accent: { card: 'border-sky-200 bg-sky-50/60', label: 'text-sky-700', value: 'text-sky-900' },
  positive: { card: 'border-emerald-200 bg-emerald-50/70', label: 'text-emerald-700', value: 'text-emerald-900' },
  warning: { card: 'border-amber-200 bg-amber-50/70', label: 'text-amber-700', value: 'text-amber-900' },
  danger: { card: 'border-rose-200 bg-rose-50/70', label: 'text-rose-700', value: 'text-rose-900' },
}

interface StatCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: Tone
  icon?: ReactNode
}

export function StatCard({ label, value, hint, tone = 'neutral', icon }: StatCardProps) {
  const t = TONE[tone]
  return (
    <article className={`rounded-xl border p-3.5 ${t.card}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${t.label}`}>{label}</span>
        {icon ? <span className={t.label}>{icon}</span> : null}
      </div>
      <div className={`mt-1.5 text-2xl font-semibold leading-tight tabular-nums ${t.value}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs leading-snug text-slate-500">{hint}</div> : null}
    </article>
  )
}
