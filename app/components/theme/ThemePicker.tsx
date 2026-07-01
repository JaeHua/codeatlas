'use client'

import { useTheme } from '@/app/store/theme'
import { PRESETS } from '@/app/lib/themes'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Paintbrush, Check } from 'lucide-react'

const COLOR_KEYS: { key: keyof typeof PRESETS[0]['variables']; label: string }[] = [
  { key: '--background', label: '背景色' },
  { key: '--foreground', label: '前景色' },
  { key: '--primary', label: '强调色' },
  { key: '--muted-foreground', label: '辅助文字' },
  { key: '--border', label: '边框色' },
  { key: '--card', label: '面板色' },
]

export function ThemePicker() {
  const { currentTheme, customColors, setTheme, setCustomColor } = useTheme()
  const theme = useTheme.getState().getTheme()

  return (
    <div className="space-y-4">
      {/* Presets */}
      <div>
        <label className="text-xs text-[var(--muted-foreground)] mb-2 block">预设主题</label>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((preset) => {
            const v = preset.variables
            const active = currentTheme === preset.name
            return (
              <button
                key={preset.name}
                onClick={() => setTheme(preset.name)}
                className={cn(
                  'flex flex-col gap-1 p-2 rounded-lg border-2 transition-all duration-200',
                  active ? 'border-[var(--primary)]' : 'border-[var(--border)] hover:border-[var(--primary)]/50'
                )}
              >
                <div className="flex gap-0.5">
                  <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: v['--primary'] }} />
                  <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: v['--background'] }} />
                  <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: v['--border'] }} />
                </div>
                <span className="text-[10px] text-[var(--muted-foreground)]">{preset.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Custom colors */}
      <div>
        <label className="text-xs text-[var(--muted-foreground)] mb-2 flex items-center gap-1">
          <Paintbrush className="h-3 w-3" />
          自定义颜色
        </label>
        <div className="space-y-2">
          {COLOR_KEYS.map(({ key, label }) => {
            const value = (customColors as Record<string, string>)[key] || theme.variables[key]
            return (
              <div key={key} className="flex items-center gap-2">
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-[10px] text-[var(--muted-foreground)] w-14">{label}</span>
                  <div className="flex items-center gap-1.5 flex-1">
                    <input
                      type="color"
                      value={value}
                      onChange={(e) => setCustomColor(key, e.target.value)}
                      className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                    />
                    <Input
                      value={value}
                      onChange={(e) => setCustomColor(key, e.target.value)}
                      className="h-6 text-[10px] font-mono bg-[var(--muted)]/50 border-[var(--border)] text-[var(--foreground)] flex-1"
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
