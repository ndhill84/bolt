import { presetLabels } from '../lib/constants'
import type { FilterPresetId } from '../lib/types'

type Props = {
  activePreset: FilterPresetId
  onSelectPreset: (preset: FilterPresetId) => void
}

const order: FilterPresetId[] = ['all', 'my_work', 'blocked', 'urgent', 'ready_to_ship']

export function FilterPresets({ activePreset, onSelectPreset }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {order.map((preset) => {
        const active = preset === activePreset
        return (
          <button
            key={preset}
            type="button"
            onClick={() => onSelectPreset(preset)}
            className="rounded-full border px-3 py-1 text-xs font-semibold transition"
            style={{
              borderColor: active ? 'var(--color-accent)' : 'var(--color-border-soft)',
              color: active ? 'var(--color-accent)' : 'var(--color-text-subtle)',
              backgroundColor: active ? 'color-mix(in oklab, var(--color-accent) 16%, transparent)' : 'var(--color-surface)'
            }}
          >
            {presetLabels[preset]}
          </button>
        )
      })}
    </div>
  )
}
