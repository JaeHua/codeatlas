'use client'

import { useMemo } from 'react'
import { useStore } from '@/app/store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { FunctionSquare, Box, Hash, ChevronRight } from 'lucide-react'

const GROUPS: { kind: string; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { kind: 'function', label: '函数', icon: FunctionSquare, color: 'text-green-400' },
  { kind: 'struct', label: '结构体', icon: Box, color: 'text-purple-400' },
  { kind: 'macro', label: '宏定义', icon: Hash, color: 'text-amber-400' },
  { kind: 'typedef', label: '类型定义', icon: Hash, color: 'text-cyan-400' },
]

export function SymbolOutline({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { symbols, selectedFile, selectFile } = useStore()

  const grouped = useMemo(() => {
    if (!selectedFile) return []
    const fileSymbols = symbols.filter((s) => s.file === selectedFile)
    return GROUPS.map((g) => ({
      ...g,
      items: fileSymbols.filter((s) => s.kind === g.kind).sort((a, b) => (a.line || 0) - (b.line || 0)),
    })).filter((g) => g.items.length > 0)
  }, [symbols, selectedFile])

  return (
    <div className="flex flex-col">
      <button onClick={onToggle}
        className="flex items-center gap-1.5 px-3 py-2 hover:bg-[var(--accent)]/50 transition-colors w-full text-left">
        <ChevronRight className={cn('h-3 w-3 text-[var(--muted-foreground)] transition-transform', !collapsed && 'rotate-90')} />
        <span className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase">Outline</span>
      </button>
      {!collapsed && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="pb-2">
              {grouped.length === 0 && (
                <div className="px-3 py-2 text-[11px] text-[var(--muted-foreground)] text-center">无符号数据</div>
              )}
              {grouped.map((group) => (
                <div key={group.kind} className="mb-1">
                  <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-semibold text-[var(--muted-foreground)]/60 uppercase">
                    <group.icon className={cn('h-3 w-3', group.color)} />
                    {group.label}
                    <span className="text-[var(--muted-foreground)]/40 ml-auto">{group.items.length}</span>
                  </div>
                  {group.items.map((sym) => (
                    <button key={`${sym.kind}-${sym.name}-${sym.line}`}
                      onClick={() => {
                        if (!selectedFile) return
                      selectFile(selectedFile)
                      window.dispatchEvent(new CustomEvent('codeatlas:reveal-line', { detail: { line: sym.line + 1 } }))
                      }}
                      className="flex items-center gap-1.5 w-full text-left px-5 py-1 text-xs hover:bg-[var(--accent)] transition-colors group">
                      <span className={cn('font-mono truncate flex-1', group.color.replace('text-', 'text-') + '/80')}>{sym.name}</span>
                      <span className="text-[10px] text-[var(--muted-foreground)]/50 opacity-0 group-hover:opacity-100 flex-shrink-0">:{sym.line}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
