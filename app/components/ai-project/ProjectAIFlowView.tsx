'use client'

import { useState } from 'react'
import { useStore } from '@/app/store'
import { useSettings } from '@/app/store/settings'
import { generateFlowWalkthrough } from '@/app/lib/ai-api'
import { MermaidDiagram } from '@/app/components/ai-panel/MermaidDiagram'
import type { FlowCard, FlowEntry } from '@/app/lib/types'
import { Loader2, Sparkles, RefreshCw, AlertCircle, ArrowRight, Database, Search } from 'lucide-react'

type FlowSource = { entry?: FlowEntry; query?: string }

export function ProjectAIFlowView({ projectId }: { projectId: number }) {
  const selectedEntity = useStore((s) => s.selectedEntity)
  const apiKey = useSettings((s) => s.apiKey)
  const [queryInput, setQueryInput] = useState('')
  const [card, setCard] = useState<FlowCard | null>(null)
  const [cardEntry, setCardEntry] = useState<FlowEntry | null>(null)
  const [lastSource, setLastSource] = useState<FlowSource | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cached, setCached] = useState(false)

  const selectedFn: FlowEntry | null = selectedEntity?.type === 'function'
    ? { name: selectedEntity.name, file: selectedEntity.path, line: selectedEntity.line }
    : null

  async function generate(source: FlowSource, force = false) {
    if (!apiKey) {
      setError('请先在设置中配置 API Key')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await generateFlowWalkthrough(projectId, source, force)
      setCard(result.card)
      setCardEntry(result.entry || source.entry || { name: source.query || '', file: '' })
      setCached(result.cached)
      setLastSource(source)
    } catch (e) {
      setError((e as Error)?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  function generateFromInput() {
    const q = queryInput.trim()
    if (q) {
      generate({ query: q })
      return
    }
    if (selectedFn) {
      generate({ entry: selectedFn })
      return
    }
    setError('请输入要了解的流程，或先在代码/符号树中选中一个函数')
  }

  const headerName = cardEntry?.name || selectedFn?.name || '未指定入口'
  const headerFile = cardEntry?.file || selectedFn?.file || ''
  const headerLine = cardEntry?.line ?? selectedFn?.line

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--primary)]" />
            流程向导
          </div>
          <p className="truncate text-[10px] text-[var(--muted-foreground)]">
            {headerName}{headerFile ? ` · ${headerFile}${headerLine ? `:${headerLine}` : ''}` : ''}
          </p>
        </div>
        <button
          onClick={() => (card && lastSource ? generate(lastSource, true) : generateFromInput())}
          disabled={loading}
          className="flex flex-shrink-0 items-center gap-1 border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--foreground)] hover:bg-[var(--muted)]/50 disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {card ? '重新生成' : '生成'}
        </button>
      </div>

      <div className="border-b border-[var(--border)] px-3 py-2">
        <div className="flex items-center gap-1.5">
          <input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                generateFromInput()
              }
            }}
            placeholder="直接描述流程，如：路由查找 / 进程调度"
            className="min-w-0 flex-1 border border-[var(--border)] bg-[var(--muted)]/40 px-2 py-1 text-[11px] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/70 outline-none focus-visible:border-[var(--ring)]"
          />
          <button
            onClick={generateFromInput}
            disabled={loading}
            className="flex flex-shrink-0 items-center gap-1 border border-[var(--primary)] bg-[var(--primary)]/10 px-2 py-1 text-[11px] text-[var(--primary)] hover:bg-[var(--primary)]/20 disabled:opacity-40"
          >
            <Search className="h-3 w-3" />
            生成
          </button>
        </div>
        <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
          {selectedFn ? `留空则使用当前选中函数：${selectedFn.name}` : '没选函数时，在这里输入想了解的流程'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-[var(--muted-foreground)]">
            <Loader2 className="h-4 w-4 animate-spin" /> 正在分析调用图并生成流程...
          </div>
        )}

        {error && !loading && (
          <div className="space-y-2 py-4">
            <div className="flex items-start gap-1.5 text-xs text-red-400">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => (lastSource ? generate(lastSource, true) : generateFromInput())}
              className="border border-[var(--border)] px-2 py-1 text-[11px] hover:bg-[var(--muted)]/50"
            >
              重试
            </button>
          </div>
        )}

        {!loading && !error && !card && (
          <div className="space-y-2 py-4">
            <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
              输入一个流程或选中一个函数，生成一条包含前因、调用分步、数据结构与后果的主路径。
            </p>
          </div>
        )}

        {!loading && card && (
          <div className="space-y-4 pb-4">
            {cached && (
              <span className="inline-block border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">已缓存</span>
            )}

            {card.summary && (
              <p className="border-l-2 border-[var(--primary)]/50 bg-[var(--primary)]/5 px-2 py-1.5 text-xs leading-relaxed text-[var(--foreground)]">
                {card.summary}
              </p>
            )}

            {card.trigger && (
              <section>
                <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">触发条件与前因</h4>
                <p className="text-xs leading-relaxed text-[var(--foreground)]">{card.trigger}</p>
              </section>
            )}

            {card.steps.length > 0 && (
              <section>
                <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">分步主线</h4>
                <ol className="space-y-1.5">
                  {card.steps.map((s, i) => (
                    <li key={`${s.name}-${i}`}>
                      <button
                        onClick={() => useStore.getState().selectFileWithLine(s.file, s.line)}
                        className="group flex w-full items-start gap-2 border border-[var(--border)] px-2 py-1.5 text-left hover:bg-[var(--muted)]/40"
                      >
                        <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/15 text-[10px] text-[var(--primary)]">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-[11px] text-[var(--foreground)]">{s.name}</span>
                            {s.confidence === 'inferred' && (
                              <span className="border border-[var(--border)] px-1 text-[9px] text-[var(--muted-foreground)]">推断</span>
                            )}
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] text-[var(--muted-foreground)]">
                            {s.file}{s.line ? `:${s.line}` : ''}
                          </span>
                          {s.role && <span className="mt-0.5 block text-[11px] text-[var(--foreground)]">{s.role}</span>}
                        </span>
                        <ArrowRight className="mt-1 h-3 w-3 flex-shrink-0 text-[var(--muted-foreground)] opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {card.dataFlow.length > 0 && (
              <section>
                <h4 className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                  <Database className="h-3 w-3" /> 数据结构与字段
                </h4>
                <div className="space-y-1.5">
                  {card.dataFlow.map((d, i) => (
                    <div key={`${d.struct}-${i}`} className="border border-[var(--border)] px-2 py-1.5">
                      <div className="font-mono text-[11px] text-[var(--foreground)]">{d.struct}</div>
                      {d.role && <p className="mt-0.5 text-[11px] text-[var(--foreground)]">{d.role}</p>}
                      {d.fields.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {d.fields.map((f) => (
                            <span key={f} className="bg-[var(--muted)] px-1 py-0.5 text-[10px] text-[var(--muted-foreground)]">{f}</span>
                          ))}
                        </div>
                      )}
                      {d.lifecycle && <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">生命周期：{d.lifecycle}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {card.effects.length > 0 && (
              <section>
                <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">副作用与后果</h4>
                <ul className="list-disc space-y-0.5 pl-4 text-xs text-[var(--foreground)]">
                  {card.effects.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </section>
            )}

            {card.mermaid && (
              <section>
                <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">流程图</h4>
                <MermaidDiagram chart={card.mermaid} />
              </section>
            )}

            <p className="text-[10px] leading-relaxed text-[var(--muted-foreground)]">
              基于静态调用图与源码生成；函数指针/间接调用可能未被捕获，标“推断”的步骤请结合代码核实。
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
