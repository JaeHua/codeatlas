'use client'

import { useTheme } from '@/app/store/theme'
import { cn } from '@/lib/utils'

export function ThemePicker() {
  const theme = useTheme.getState().getTheme()

  return (
    <div>
      <div className="flex items-center gap-2 p-3 border border-[var(--border)] bg-[var(--card)]">
        <div
          className="w-5 h-5 flex-shrink-0"
          style={{ backgroundColor: theme.variables['--primary'] }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-[var(--foreground)]">{theme.label}</div>
          <div className="text-[10px] text-[var(--muted-foreground)] font-mono truncate">
            {theme.variables['--background']} · 暖白纸张 / 工程网格
          </div>
        </div>
        <span className={cn('text-[10px] text-[var(--muted-foreground)]')}>当前</span>
      </div>
      <p className="mt-2 text-[10px] text-[var(--muted-foreground)] leading-relaxed">
        CodeAtlas 采用单一「工程图纸」主题：暖白纸张底色、极浅淡黄网格、黑白灰主色与柔和黄色强调。
      </p>
    </div>
  )
}
