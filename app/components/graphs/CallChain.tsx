'use client'

import { useState, useMemo, useCallback } from 'react'
import { useStore } from '@/app/store'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  ChevronRight,
  ChevronDown,
  Search,
  ArrowUp,
  ArrowDown,
  GitBranch,
} from 'lucide-react'
import type { CallEdge, Symbol } from '@/app/lib/types'

function CallerTree({
  funcName,
  calls,
  symbols,
  depth,
  onJump,
  expanded,
  toggleExpand,
}: {
  funcName: string
  calls: CallEdge[]
  symbols: Symbol[]
  depth: number
  onJump: (name: string, file: string) => void
  expanded: Set<string>
  toggleExpand: (name: string) => void
}) {
  const callers = calls
    .filter((c) => c.callee === funcName)
    .map((c) => c.caller)
    .filter((n, i, a) => n && a.indexOf(n) === i)

  const sym = symbols.find((s) => s.name === funcName)
  const isExpanded = expanded.has(funcName)

  return (
    <div>
      <button
        onClick={() => {
          toggleExpand(funcName)
          if (sym) onJump(funcName, sym.file)
        }}
        className="flex items-center gap-1.5 w-full text-left py-1 hover:bg-[var(--accent)]/50 rounded group"
        style={{ paddingLeft: `${depth * 20 + 4}px` }}
      >
        {callers.length > 0 && (
          isExpanded ? (
            <ChevronDown className="h-3 w-3 text-[var(--muted-foreground)] flex-shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-[var(--muted-foreground)] flex-shrink-0" />
          )
        )}
        <span className="text-xs font-mono text-[var(--primary)]">{funcName}</span>
        {sym && (
          <span className="text-[10px] text-[var(--muted-foreground)]/70 group-hover:text-[var(--muted-foreground)] ml-1">
            {sym.file}:{sym.line}
          </span>
        )}
        <span className="text-[10px] text-[var(--muted-foreground)]/70 ml-auto opacity-0 group-hover:opacity-100">
          跳转
        </span>
      </button>
      {isExpanded && callers.map((c) => (
        <CallerTree
          key={`caller-${c}-${depth}`}
          funcName={c}
          calls={calls}
          symbols={symbols}
          depth={depth + 1}
          onJump={onJump}
          expanded={expanded}
          toggleExpand={toggleExpand}
        />
      ))}
    </div>
  )
}

function CalleeTree({
  funcName,
  calls,
  symbols,
  depth,
  onJump,
  expanded,
  toggleExpand,
}: {
  funcName: string
  calls: CallEdge[]
  symbols: Symbol[]
  depth: number
  onJump: (name: string, file: string) => void
  expanded: Set<string>
  toggleExpand: (name: string) => void
}) {
  const callees = calls
    .filter((c) => c.caller === funcName)
    .map((c) => c.callee)
    .filter((n, i, a) => n && a.indexOf(n) === i)

  const sym = symbols.find((s) => s.name === funcName)
  const isExpanded = expanded.has(funcName)

  return (
    <div>
      <button
        onClick={() => {
          toggleExpand(funcName)
          if (sym) onJump(funcName, sym.file)
        }}
        className="flex items-center gap-1.5 w-full text-left py-1 hover:bg-[var(--accent)]/50 rounded group"
        style={{ paddingLeft: `${depth * 20 + 4}px` }}
      >
        {callees.length > 0 && (
          isExpanded ? (
            <ChevronDown className="h-3 w-3 text-[var(--muted-foreground)] flex-shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-[var(--muted-foreground)] flex-shrink-0" />
          )
        )}
        <span className="text-xs font-mono text-[var(--foreground)]">{funcName}</span>
        {sym && (
          <span className="text-[10px] text-[var(--muted-foreground)]/70 group-hover:text-[var(--muted-foreground)] ml-1">
            {sym.file}:{sym.line}
          </span>
        )}
        <span className="text-[10px] text-[var(--muted-foreground)]/70 ml-auto opacity-0 group-hover:opacity-100">
          跳转
        </span>
      </button>
      {isExpanded && callees.map((c) => (
        <CalleeTree
          key={`callee-${c}-${depth}`}
          funcName={c}
          calls={calls}
          symbols={symbols}
          depth={depth + 1}
          onJump={onJump}
          expanded={expanded}
          toggleExpand={toggleExpand}
        />
      ))}
    </div>
  )
}

export function CallChain() {
  const { symbols, calls, selectFile, setSelectedEntity } = useStore()
  const [selectedFunc, setSelectedFunc] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const functionSymbols = useMemo(
    () => symbols.filter((s) => s.kind === 'function'),
    [symbols]
  )

  const allFunctionNames = useMemo(
    () => [...new Set(functionSymbols.map((s) => s.name))].sort(),
    [functionSymbols]
  )

  const filtered = search.trim()
    ? allFunctionNames.filter((f) => f.toLowerCase().includes(search.toLowerCase()))
    : allFunctionNames

  const toggleExpand = useCallback((name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  const handleJump = useCallback(
    (name: string, file: string) => {
      selectFile(file)
      setSelectedEntity({ type: 'function', path: file, name })
    },
    [selectFile, setSelectedEntity]
  )

  const selectedSym = selectedFunc
    ? functionSymbols.find((s) => s.name === selectedFunc)
    : null

  return (
    <div className="flex h-full">
      {/* Function list sidebar */}
      <div className="w-60 border-r border-[var(--border)] flex flex-col flex-shrink-0">
        <div className="p-2 border-b border-[var(--border)]">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--muted-foreground)]" />
            <Input
              placeholder="搜索函数..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 pl-7 text-xs bg-[var(--muted)]/50 border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/70"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          {filtered.map((f) => {
            const callCount = calls.filter(
              (c) => c.caller === f || c.callee === f
            ).length
            return (
              <button
                key={f}
                onClick={() => {
                  setSelectedFunc(f)
                  setExpanded((prev) => new Set([...prev, f]))
                }}
                className={cn(
                  'w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-[var(--accent)] transition-colors',
                  f === selectedFunc
                    ? 'bg-[var(--primary)]/10 text-[var(--primary)] border-r-2 border-[var(--primary)]'
                    : 'text-[var(--muted-foreground)] text-xs font-mono'
                )}
              >
                <span className="truncate">{f}</span>
                {callCount > 0 && (
                  <Badge
                    variant="outline"
                    className="text-[9px] h-4 border-[var(--border)] text-[var(--muted-foreground)] flex-shrink-0"
                  >
                    {callCount}
                  </Badge>
                )}
              </button>
            )
          })}
        </ScrollArea>
      </div>

      {/* Call tree */}
      <div className="flex-1 overflow-hidden">
        {!selectedFunc ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] text-sm gap-2">
            <GitBranch className="h-8 w-8 text-[var(--muted-foreground)]/50" />
            <p>从左侧列表选择一个函数</p>
            <p className="text-xs text-[var(--muted-foreground)]/70">查看其完整的调用链</p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="p-4">
              {/* Selected function header */}
              <div className="mb-4 p-3 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/30">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px] bg-[var(--primary)]/20 border-[var(--primary)]/30 text-[var(--primary)]">
                    当前函数
                  </Badge>
                </div>
                <code className="text-sm font-mono text-[var(--primary)]">{selectedFunc}</code>
                {selectedSym && (
                  <>
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">{selectedSym.signature}</p>
                    <p className="text-xs text-[var(--muted-foreground)]/70 mt-0.5">
                      {selectedSym.file}:{selectedSym.line}
                    </p>
                  </>
                )}
              </div>

              {/* Callers section */}
              {calls.filter((c) => c.callee === selectedFunc).length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowUp className="h-4 w-4 text-[var(--muted-foreground)]" />
                    <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase">
                      调用者 <span className="text-[var(--muted-foreground)]/70 font-normal">（谁调用了它）</span>
                    </h3>
                    <Badge variant="outline" className="text-[9px] border-[var(--muted-foreground)]/30 text-[var(--muted-foreground)]">
                      {calls.filter((c) => c.callee === selectedFunc).length}
                    </Badge>
                  </div>
                  <div className="border-l-2 border-[var(--muted-foreground)]/30 ml-1">
                    <CallerTree
                      funcName={selectedFunc}
                      calls={calls}
                      symbols={functionSymbols}
                      depth={0}
                      onJump={handleJump}
                      expanded={expanded}
                      toggleExpand={toggleExpand}
                    />
                  </div>
                </div>
              )}

              {/* Callees section */}
              {calls.filter((c) => c.caller === selectedFunc).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowDown className="h-4 w-4 text-[var(--foreground)]" />
                    <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase">
                      被调用函数 <span className="text-[var(--muted-foreground)]/70 font-normal">（它调用了谁）</span>
                    </h3>
                    <Badge variant="outline" className="text-[9px] border-[var(--foreground)]/30 text-[var(--foreground)]">
                      {calls.filter((c) => c.caller === selectedFunc).length}
                    </Badge>
                  </div>
                  <div className="border-l-2 border-[var(--foreground)]/30 ml-1">
                    <CalleeTree
                      funcName={selectedFunc}
                      calls={calls}
                      symbols={functionSymbols}
                      depth={0}
                      onJump={handleJump}
                      expanded={expanded}
                      toggleExpand={toggleExpand}
                    />
                  </div>
                </div>
              )}

              {calls.filter((c) => c.callee === selectedFunc || c.caller === selectedFunc).length === 0 && (
                <p className="text-xs text-[var(--muted-foreground)]/70 text-center py-8">
                  该函数无调用链数据
                </p>
              )}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
