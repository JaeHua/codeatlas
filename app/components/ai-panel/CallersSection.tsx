'use client'

import { useMemo } from 'react'
import { useStore } from '@/app/store'
import { GitBranch, CornerDownRight } from 'lucide-react'

interface CallerInfo {
  caller: string
  file: string
  line?: number
}

/** 反向调用链：列出所有调用了 functionName 的函数，点击跳转到调用者定义 */
export function CallersSection({ functionName }: { functionName: string }) {
  const calls = useStore((s) => s.calls)
  const symbols = useStore((s) => s.symbols)

  const callers = useMemo(() => {
    const map = new Map<string, CallerInfo>()
    for (const edge of calls) {
      if (edge.callee !== functionName) continue
      if (map.has(edge.caller)) continue
      const def = symbols.find((s) => s.name === edge.caller && s.kind === 'function')
      map.set(edge.caller, {
        caller: edge.caller,
        file: edge.caller_file || def?.file || '',
        line: def ? (def.kind === 'function' ? def.line + 1 : def.line) : undefined,
      })
    }
    return Array.from(map.values())
  }, [calls, symbols, functionName])

  if (callers.length === 0) return null

  const jump = (info: CallerInfo) => {
    if (!info.file) return
    const state = useStore.getState()
    state.selectFileWithLine(info.file, info.line)
  }

  return (
    <section>
      <div className="flex items-center gap-1.5 mb-1.5">
        <GitBranch className="h-3.5 w-3.5 text-[var(--primary)]" />
        <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase">
          谁调用了 {functionName}
        </h3>
      </div>
      <div className="space-y-1">
        {callers.map((c) => (
          <button
            key={c.caller}
            onClick={() => jump(c)}
            className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-xs bg-[var(--card)] rounded-none border border-[var(--border)] hover:border-[var(--primary)] transition-colors group"
          >
            <CornerDownRight className="h-3 w-3 text-[var(--muted-foreground)] flex-shrink-0" />
            <code className="font-mono text-[var(--primary)] flex-shrink-0">{c.caller}</code>
            <span className="text-[10px] text-[var(--muted-foreground)] font-mono truncate">
              {c.file}
              {c.line ? `:${c.line}` : ''}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
