import type { LocationMonitorPointSource } from '../../types/api'

export function SourceFilterBar({
  options,
  enabled,
  allSelected,
  onSelectAll,
  onToggle,
}: {
  options: Array<{ value: LocationMonitorPointSource; label: string }>
  enabled: LocationMonitorPointSource[]
  allSelected: boolean
  onSelectAll: () => void
  onToggle: (source: LocationMonitorPointSource) => void
}) {
  return (
    <div className="cr-source-bar">
      <span className="cr-source-bar__label">Kaynak</span>
      <button
        type="button"
        className={`cr-source-chip ${allSelected ? 'is-active' : ''}`}
        aria-pressed={allSelected}
        onClick={onSelectAll}
      >
        Tümü
      </button>
      {options.map((option) => {
        const active = enabled.includes(option.value)
        return (
          <button
            key={option.value}
            type="button"
            className={`cr-source-chip ${active ? 'is-active' : ''}`}
            aria-pressed={active}
            onClick={() => onToggle(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
