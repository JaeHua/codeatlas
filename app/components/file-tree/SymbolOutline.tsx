'use client'

import { useMemo } from 'react'
import { useStore } from '@/app/store'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { FunctionSquare, Box, Hash, ChevronRight } from 'lucide-react'

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  function: FunctionSquare,
  struct: Box,
  macro: Hash,
  typedef: Hash,
}

export function SymbolOutline() {
  const { symbols, selectedFile, selectFile, setSelectedEntity } = useStore()

  const fileSymbols = useMemo(() => {
    if (!selectedFile) return []
    return symbols
      .filter((s) => s.file === selectedFile)
      .sort((a, b) => {
        // Functions first, then structs, then macros
        const order: Record<string, number> = { function: 0, struct: 1, macro: 2, typedef: 3 }
        const oa = order[a.kind] ?? 4
        const ob = order[b.kind] ?? 4
        if (oa !== ob) return oa - ob
        // Then by line number
        return (a.line || 0) - (b.line || 0)
      })
  }, [symbols, selectedFile])

  if (!selectedFile || fileSymbols.length === 0) {
    return (
      <div className="p-3 text-[11px] text-[var(--muted-foreground)] text-center">
        当前文件无符号数据
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 px-3 py-2">
        <span className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase">Outline</span>
        <span className="text-[10px] text-[var(--muted-foreground)]/50">{fileSymbols.length}</span>
      </div>
      <ScrollArea className="max-h-[200px]">
        <div className="pb-2">
          {fileSymbols.map((sym) => {
            const Icon = ICONS[sym.kind] || Hash
            return (
              <button
                key={`${sym.kind}-${sym.name}-${sym.line}`}
                onClick={() => {
                  setSelectedEntity({ type: 'function', path: selectedFile, name: sym.name, line: sym.line })
                  selectFile(selectedFile)
                }}
                className="flex items-center gap-1.5 w-full text-left px-3 py-1 text-xs hover:bg-[var(--accent)] transition-colors group"
              >
                <Icon className={cn(
                  'h-3 w-3 flex-shrink-0',
                  sym.kind === 'function' ? 'text-green-400' : sym.kind === 'struct' ? 'text-purple-400' : 'text-amber-400'
                )} />
                <span className="font-mono truncate flex-1">{sym.name}</span>
                <span className="text-[10px] text-[var(--muted-foreground)]/50 opacity-0 group-hover:opacity-100">
                  L{sym.line}
                </span>
              </button>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
