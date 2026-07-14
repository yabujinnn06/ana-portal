import type { ReactNode } from 'react'

export interface DefinitionItem {
  label: string
  value: ReactNode
  span?: boolean
}

export function DefinitionList({ items, columns = 1 }: { items: DefinitionItem[]; columns?: 1 | 2 }) {
  return (
    <dl className={columns === 2 ? 'grid grid-cols-1 gap-x-6 gap-y-0 sm:grid-cols-2' : ''}>
      {items.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className={`flex items-baseline justify-between gap-3 border-b border-slate-100 py-2 last:border-0 ${
            item.span ? 'sm:col-span-2' : ''
          }`}
        >
          <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{item.label}</dt>
          <dd className="min-w-0 text-right text-sm text-slate-700">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
