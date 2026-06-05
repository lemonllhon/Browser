import { Sliders } from 'lucide-react'
import { PROFILE_COLUMN_OPTIONS } from '../../config/browserListTable'

interface BrowserColumnVisibilityMenuProps {
  visibleColumnKeys: string[]
  onToggleColumn: (key: string) => void
}

export function BrowserColumnVisibilityMenu({ visibleColumnKeys, onToggleColumn }: BrowserColumnVisibilityMenuProps) {
  return (
    <details className="relative shrink-0">
      <summary className="list-none p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)] cursor-pointer" title="选择显示列">
        <Sliders className="w-4 h-4" />
      </summary>
      <div className="absolute right-0 top-9 z-20 w-56 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] shadow-lg p-2">
        <div className="text-xs font-medium text-[var(--color-text-muted)] px-2 py-1">显示列</div>
        {PROFILE_COLUMN_OPTIONS.map(option => (
          <label key={option.key} className="flex items-center gap-2 px-2 py-1.5 text-sm text-[var(--color-text-primary)] rounded hover:bg-[var(--color-bg-secondary)] cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-[var(--color-accent)]"
              checked={visibleColumnKeys.includes(option.key)}
              disabled={option.locked}
              onChange={() => onToggleColumn(option.key)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </details>
  )
}
