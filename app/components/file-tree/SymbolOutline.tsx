'use client'

import { useMemo } from 'react'
import { useStore } from '@/app/store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { FunctionSquare, Box, Hash, ChevronRight } from 'lucide-react'

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  function: FunctionSquare, struct: Box, macro: Hash, typedef: Hash,
}

export function SymbolOutline({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { symbols, selectedFile, selectFile } = useStore()

  const fileSymbols = useMemo(() => {
    if (!selectedFile) return []
    return symbols.filter((s) => s.file === selectedFile).sort((a, b) => {
      const order: Record<string, number> = { function: 0, struct: 1, macro: 2, typedef: 3 }
      return (order[a.kind] ?? 4) - (order[b.kind] ?? 4) || (a.line || 0) - (b.line || 0)
    })
  }, [symbols, selectedFile])

  return (
    <div className="flex flex-col">
      <button onClick={onToggle}
        className="flex items-center gap-1.5 px-3 py-2 hover:bg-[var(--accent)]/50 transition-colors w-full text-left">
        <ChevronRight className={cn('h-3 w-3 text-[var(--muted-foreground)] transition-transform', !collapsed && 'rotate-90')} />
        <span className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase">Outline</span>
        <span className="text-[10px] text-[var(--muted-foreground)]/50 ml-auto">{fileSymbols.length}</span>
      </button>
      {!collapsed && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="pb-2">
              {fileSymbols.length === 0 && (
                <div className="px-3 py-2 text-[11px] text-[var(--muted-foreground)] text-center">无符号数据</div>
              )}
              {fileSymbols.map((sym) => {
                const Icon = ICONS[sym.kind] || Hash
                return (
                  <button key={`${sym.kind}-${sym.name}-${sym.line}`}
                    onClick={() => {
                      if (!selectedFile) return
                      selectFile(selectedFile)
                      window.dispatchEvent(new CustomEvent('codeatlas:reveal-line', { detail: { line: sym.line + 1 } }))
                    }}
                    className="flex items-center gap-1.5 w-full text-left px-3 py-1 text-xs hover:bg-[var(--accent)] transition-colors group">
                    <Icon className={cn('h-3 w-3 flex-shrink-0',
                      sym.kind === 'function' ? 'text-green-400' : sym.kind === 'struct' ? 'text-purple-400' : 'text-amber-400'
                    )} />
                    <span className="font-mono truncate flex-1">{sym.name}</span>
                    <span className="text-[10px] text-[var(--muted-foreground)]/50 opacity-0 group-hover:opacity-100 flex-shrink-0">L{sym.line}</span>
                  </button>
                )
              })}
            </div>
            </ScrollArea>
        </div>
      )}
    </div>
  )
}
