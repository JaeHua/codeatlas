# 流程向导学习卡 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 从选中函数生成一张端到端流程学习卡（前因/分步/数据结构/后果/时序图），步骤可点击跳转，结果按项目缓存。

**Architecture:** 新路由 `/api/projects/[id]/ai-flow` 用 `flow-context` 构建子图、调 DeepSeek 输出固定 JSON、`parseFlowCard` 规范化并写入 `flow_cache`。前端在项目 AI 抽屉新增「流程向导」Tab，用 `ProjectAIFlowView` 渲染卡片。

**Tech Stack:** Next.js 16 App Router、React 19、Zustand、react-markdown、mermaid、DeepSeek OpenAI 兼容接口、sql.js。

**测试说明:** 无测试框架；用 `tsx` 运行时验证纯函数 + `tsc/eslint/build`。

---

### Task 1: 类型

**Files:** Modify `app/lib/types.ts`

- [ ] 在文件末尾追加：

```ts
export interface FlowEntry {
  name: string
  file: string
  line?: number
}

export interface FlowStep {
  name: string
  file: string
  line?: number
  role: string
  confidence: 'graph' | 'inferred'
}

export interface FlowDataStruct {
  struct: string
  role: string
  fields: string[]
  lifecycle: string
}

export interface FlowCard {
  trigger: string
  steps: FlowStep[]
  dataFlow: FlowDataStruct[]
  effects: string[]
  mermaid?: string
}
```

- [ ] Commit: `git add app/lib/types.ts && git commit -m "feat: add flow walkthrough types"`

---

### Task 2: DB 缓存

**Files:** Modify `app/lib/db.ts`

- [ ] `initSchema` 的 `stmts` 数组追加：

```ts
`CREATE TABLE IF NOT EXISTS flow_cache (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, entry_key TEXT NOT NULL, data TEXT, generated_at TEXT, UNIQUE(project_id, entry_key))`,
```

- [ ] `deleteProject` 中追加：

```ts
  exec(database, 'DELETE FROM flow_cache WHERE project_id = ?', [id])
```

- [ ] 文件末尾追加：

```ts
export async function getFlowCache(projectId: number, entryKey: string) {
  return queryOne(await getDb(), 'SELECT * FROM flow_cache WHERE project_id = ? AND entry_key = ?', [projectId, entryKey])
}

export async function setFlowCache(projectId: number, entryKey: string, data: string) {
  exec(await getDb(),
    `INSERT OR REPLACE INTO flow_cache (project_id, entry_key, data, generated_at)
     VALUES (?, ?, ?, ?)`,
    [projectId, entryKey, data, new Date().toISOString()]
  )
}
```

- [ ] Commit: `git add app/lib/db.ts && git commit -m "feat: add flow cache table"`

---

### Task 3: 卡片解析（纯函数）

**Files:** Create `app/lib/flow-card.ts`

- [ ] 创建：

```ts
import type { FlowCard, FlowStep, FlowDataStruct } from '@/app/lib/types'

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function parseFlowCard(raw: string): FlowCard {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
  let obj: Record<string, unknown>
  try {
    obj = asRecord(JSON.parse(cleaned))
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('AI 返回的流程数据无法解析')
    obj = asRecord(JSON.parse(m[0]))
  }

  const steps: FlowStep[] = (Array.isArray(obj.steps) ? obj.steps : [])
    .map((item) => {
      const s = asRecord(item)
      const confidence: FlowStep['confidence'] = s.confidence === 'inferred' ? 'inferred' : 'graph'
      return {
        name: asString(s.name),
        file: asString(s.file),
        line: typeof s.line === 'number' ? s.line : undefined,
        role: asString(s.role),
        confidence,
      }
    })
    .filter((s) => s.name)

  const dataFlow: FlowDataStruct[] = (Array.isArray(obj.dataFlow) ? obj.dataFlow : [])
    .map((item) => {
      const d = asRecord(item)
      return {
        struct: asString(d.struct),
        role: asString(d.role),
        fields: asStringArray(d.fields),
        lifecycle: asString(d.lifecycle),
      }
    })
    .filter((d) => d.struct)

  const mermaid = typeof obj.mermaid === 'string' && obj.mermaid.trim() ? obj.mermaid : undefined

  return {
    trigger: asString(obj.trigger),
    steps,
    dataFlow,
    effects: asStringArray(obj.effects),
    mermaid,
  }
}
```

- [ ] Commit: `git add app/lib/flow-card.ts && git commit -m "feat: add flow card parser"`

---

### Task 4: 子图上下文与提示词

**Files:** Create `app/lib/flow-context.ts`

- [ ] 创建：

```ts
import { getFileTree, getSymbols, getCalls } from '@/app/lib/db'
import type { FlowEntry } from '@/app/lib/types'

interface FileRow { path: string; name: string; type: string; content?: string | null }
interface SymbolRow { name: string; kind: string; file: string; line?: number | null }
interface CallRow { caller: string; callee: string; caller_file?: string | null; callee_file?: string | null }

export interface FlowCandidate { name: string; file: string; line?: number }

export interface FlowContext {
  entry: FlowEntry
  callers: FlowCandidate[]
  functions: FlowCandidate[]
  edges: { caller: string; callee: string }[]
  sources: { path: string; content: string }[]
  degraded: boolean
}

const MAX_NODES = 40
const MAX_DEPTH = 3
const MAX_SOURCE_FILES = 8
const MAX_PER_FILE = 3000
const MAX_TOTAL = 18000

export async function buildFlowContext(projectId: number, entry: FlowEntry): Promise<FlowContext> {
  const [fileRows, symbolRows, callRows] = await Promise.all([
    getFileTree(projectId),
    getSymbols(projectId),
    getCalls(projectId),
  ])
  const files = (fileRows as FileRow[]).filter((f) => f.type === 'file')
  const symbols = symbolRows as SymbolRow[]
  const calls = callRows as CallRow[]

  const defByName = new Map<string, FlowCandidate>()
  for (const s of symbols) {
    if (s.kind === 'function' && !defByName.has(s.name)) {
      defByName.set(s.name, { name: s.name, file: s.file, line: s.line ?? undefined })
    }
  }

  const callees = new Map<string, CallRow[]>()
  const callers = new Map<string, CallRow[]>()
  for (const c of calls) {
    if (!callees.has(c.caller)) callees.set(c.caller, [])
    callees.get(c.caller)!.push(c)
    if (!callers.has(c.callee)) callers.set(c.callee, [])
    callers.get(c.callee)!.push(c)
  }

  const visited = new Set<string>([entry.name])
  const edgeList: { caller: string; callee: string }[] = []
  let queue: string[] = [entry.name]
  for (let depth = 0; depth < MAX_DEPTH && queue.length; depth++) {
    const next: string[] = []
    for (const fn of queue) {
      for (const c of callees.get(fn) || []) {
        edgeList.push({ caller: c.caller, callee: c.callee })
        if (!visited.has(c.callee) && visited.size < MAX_NODES) {
          visited.add(c.callee)
          next.push(c.callee)
        }
      }
    }
    queue = next
  }

  const upstream = (callers.get(entry.name) || []).map((c) => {
    const d = defByName.get(c.caller)
    return d || { name: c.caller, file: c.caller_file || '', line: undefined }
  }).slice(0, 10)

  const functions: FlowCandidate[] = []
  const pushFn = (name: string, file?: string) => {
    if (functions.some((f) => f.name === name)) return
    const d = defByName.get(name)
    functions.push(d || { name, file: file || '', line: undefined })
  }
  pushFn(entry.name)
  for (const name of visited) pushFn(name)

  const fileMap = new Map(files.map((f) => [f.path, f]))
  const sources: { path: string; content: string }[] = []
  let total = 0
  for (const f of functions) {
    if (sources.length >= MAX_SOURCE_FILES || total >= MAX_TOTAL) break
    const row = fileMap.get(f.file)
    if (!row) continue
    if (sources.some((s) => s.path === f.file)) continue
    const capped = String(row.content || '').slice(0, Math.min(MAX_PER_FILE, MAX_TOTAL - total))
    total += capped.length
    sources.push({ path: f.file, content: capped })
  }

  return {
    entry,
    callers: upstream,
    functions,
    edges: edgeList.slice(0, 120),
    sources,
    degraded: edgeList.length === 0,
  }
}

export function buildFlowPrompt(projectName: string, ctx: FlowContext): string {
  const fnList = ctx.functions.map((f) => `- ${f.name} (${f.file || '?'}:${f.line ?? '?'})`).join('\n')
  const edgeList = ctx.edges.map((e) => `- ${e.caller} -> ${e.callee}`).join('\n')
  const callerList = ctx.callers.map((f) => `- ${f.name} (${f.file || '?'})`).join('\n')
  const sources = ctx.sources.map((s) => `### 文件: ${s.path}\n\`\`\`c\n${s.content}\n\`\`\``).join('\n\n')

  return `你是资深 Linux 内核工程师，正在为一个新手讲解一个“流程”。

项目: ${projectName}
入口函数: ${entryLine(ctx.entry)}

## 谁调用了入口（前因线索）
${callerList || '（无）'}

## 本次分析涉及的函数（来自静态调用图）
${fnList}

## 静态调用边
${edgeList || '（无静态调用边，可能全是函数指针/间接调用）'}

## 相关源码
${sources || '（无源码）'}

## 任务
围绕入口函数，提炼一条 **5–10 步的精选主路径**，讲清楚“前因 → 调用流转 → 数据结构 → 后果”。

## 严格要求
- 只输出 JSON，不要 markdown 代码围栏，不要解释文字。
- steps 里若某步来自上面的“静态调用边/函数列表”，confidence 填 "graph"；若你根据内核知识补充但其调用关系未被静态图捕获（函数指针、间接调用等），填 "inferred"。
- 文件路径尽量用上面出现的真实路径；行号不确定可省略 line。
- dataFlow 描述关键结构体（如 task_struct、sk_buff、fib_result、rtable、dst_entry 等）的作用、涉及字段、生命周期。
- mermaid 用 sequenceDiagram 或 flowchart，只画主路径。
- 全部用中文。

## 输出 JSON 格式
{
  "trigger": "触发条件与前因（什么场景进入这条流程）",
  "steps": [
    { "name": "函数名", "file": "路径", "line": 123, "role": "该步一句话职责", "confidence": "graph" | "inferred" }
  ],
  "dataFlow": [
    { "struct": "结构体名", "role": "作用", "fields": ["字段1", "字段2"], "lifecycle": "创建→填充→消费→释放" }
  ],
  "effects": ["返回值/状态变化/对系统的后果"],
  "mermaid": "sequenceDiagram\\n A->>B: ..."
}`
}

function entryLine(entry: FlowEntry): string {
  return `${entry.name} (${entry.file || '?'}:${entry.line ?? '?'})`
}
```

- [ ] Commit: `git add app/lib/flow-context.ts && git commit -m "feat: add flow subgraph context builder"`

---

### Task 5: AI 路由

**Files:** Create `app/api/projects/[id]/ai-flow/route.ts`

- [ ] 创建：

```ts
import { NextResponse } from 'next/server'
import { getProject, getFlowCache, setFlowCache } from '@/app/lib/db'
import { buildFlowContext, buildFlowPrompt } from '@/app/lib/flow-context'
import { parseFlowCard } from '@/app/lib/flow-card'
import type { FlowEntry } from '@/app/lib/types'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const projectId = Number(id)

  try {
    const body = await req.json()
    const { entry, apiKey, baseUrl, model, force } = body as {
      entry?: FlowEntry
      apiKey?: string
      baseUrl?: string
      model?: string
      force?: boolean
    }

    if (!entry?.name) return NextResponse.json({ error: 'entry.name required' }, { status: 400 })
    if (!apiKey) return NextResponse.json({ error: 'apiKey required' }, { status: 400 })

    const entryKey = `${entry.file || ''}::${entry.name}`

    if (!force) {
      const cached = await getFlowCache(projectId, entryKey)
      if (cached?.data) {
        try {
          const card = JSON.parse(String(cached.data))
          return NextResponse.json({ entry, card, cached: true })
        } catch {
          // 缓存损坏则继续重新生成
        }
      }
    }

    const project = (await getProject(projectId)) as { name?: string } | undefined
    const ctx = await buildFlowContext(projectId, entry)
    const prompt = buildFlowPrompt(project?.name || '当前项目', ctx)

    const res = await fetch(`${baseUrl || 'https://api.deepseek.com'}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 3000,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const msg = (err as { error?: { message?: string } })?.error?.message || `AI API error: ${res.status}`
      return NextResponse.json({ error: msg }, { status: res.status || 502 })
    }

    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content || ''
    const card = parseFlowCard(raw)
    await setFlowCache(projectId, entryKey, JSON.stringify(card))

    return NextResponse.json({ entry, card, cached: false })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] Commit: `git add "app/api/projects/[id]/ai-flow/route.ts" && git commit -m "feat: add flow walkthrough route"`

---

### Task 6: 客户端调用

**Files:** Modify `app/lib/ai-api.ts`

- [ ] 顶部加 `import type { FlowCard, FlowEntry } from '@/app/lib/types'`，末尾追加：

```ts
export async function generateFlowWalkthrough(
  projectId: number,
  entry: FlowEntry,
  force = false
): Promise<{ card: FlowCard; cached: boolean }> {
  const { apiKey, baseUrl, model } = useSettings.getState()

  if (!apiKey) {
    throw new Error('请先在设置中配置 API Key')
  }

  const res = await fetch(`/api/projects/${projectId}/ai-flow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry, apiKey, baseUrl, model, force }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `API error: ${res.status}`)
  return { card: data.card as FlowCard, cached: Boolean(data.cached) }
}
```

- [ ] Commit: `git add app/lib/ai-api.ts && git commit -m "feat: add flow walkthrough client helper"`

---

### Task 7: 流程向导视图

**Files:** Create `app/components/ai-project/ProjectAIFlowView.tsx`

- [ ] 创建：

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useStore } from '@/app/store'
import { useSettings } from '@/app/store/settings'
import { generateFlowWalkthrough } from '@/app/lib/ai-api'
import { MermaidDiagram } from '@/app/components/ai-panel/MermaidDiagram'
import type { FlowCard, FlowStep } from '@/app/lib/types'
import { Loader2, Sparkles, RefreshCw, AlertCircle, ArrowRight, Database } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ProjectAIFlowView({ projectId }: { projectId: number }) {
  const selectedEntity = useStore((s) => s.selectedEntity)
  const apiKey = useSettings((s) => s.apiKey)
  const [card, setCard] = useState<FlowCard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cached, setCached] = useState(false)

  const entry = selectedEntity?.type === 'function'
    ? { name: selectedEntity.name, file: selectedEntity.path, line: selectedEntity.line }
    : null
  const entryKey = entry ? `${entry.file}::${entry.name}` : ''

  useEffect(() => {
    setCard(null)
    setError(null)
    setCached(false)
  }, [entryKey])

  async function generate(force = false) {
    if (!entry) return
    if (!apiKey) {
      setError('请先在设置中配置 API Key')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await generateFlowWalkthrough(projectId, entry, force)
      setCard(result.card)
      setCached(result.cached)
    } catch (e) {
      setError((e as Error)?.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  if (!entry) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <p className="text-xs text-[var(--muted-foreground)]">
          请先在代码视图或左侧符号树中选中一个函数，<br />然后生成它的流程向导。
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--primary)]" />
            流程向导
          </div>
          <p className="truncate text-[10px] text-[var(--muted-foreground)]">
            {entry.name} · {entry.file}{entry.line ? `:${entry.line}` : ''}
          </p>
        </div>
        <button
          onClick={() => generate(!!card)}
          disabled={loading}
          className="flex items-center gap-1 border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--foreground)] hover:bg-[var(--muted)]/50 disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {card ? '重新生成' : '生成'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {loading && (
          <div className="flex items-center gap-2 py-8 justify-center text-xs text-[var(--muted-foreground)]">
            <Loader2 className="h-4 w-4 animate-spin" /> 正在分析调用图并生成流程...
          </div>
        )}

        {error && !loading && (
          <div className="space-y-2 py-4">
            <div className="flex items-start gap-1.5 text-xs text-red-400">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => generate(true)} className="border border-[var(--border)] px-2 py-1 text-[11px] hover:bg-[var(--muted)]/50">
              重试
            </button>
          </div>
        )}

        {!loading && !error && !card && (
          <div className="space-y-3 py-4">
            <p className="text-xs text-[var(--muted-foreground)]">
              将以 <span className="font-mono text-[var(--foreground)]">{entry.name}</span> 为入口，
              生成一条带前因、调用分步、数据结构与后果的主路径。
            </p>
            <button onClick={() => generate(false)} className="border border-[var(--primary)] bg-[var(--primary)]/10 px-3 py-1.5 text-xs text-[var(--primary)] hover:bg-[var(--primary)]/20">
              生成流程向导
            </button>
          </div>
        )}

        {!loading && card && (
          <div className="space-y-4 pb-4">
            {cached && <span className="inline-block border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">已缓存</span>}

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
                          <span className="mt-0.5 block truncate text-[10px] text-[var(--muted-foreground)]">{s.file}{s.line ? `:${s.line}` : ''}</span>
                          <span className="mt-0.5 block text-[11px] text-[var(--foreground)]">{s.role}</span>
                        </span>
                        <ArrowRight className="mt-1 h-3 w-3 flex-shrink-0 text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100" />
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
```

- [ ] Commit: `git add app/components/ai-project/ProjectAIFlowView.tsx && git commit -m "feat: add flow walkthrough view"`

---

### Task 8: 抽屉 Tab 与尺寸

**Files:** Modify `app/components/ai-project/ProjectAIDrawer.tsx`

- [ ] 引入 `ProjectAIFlowView`，加 `tab` 状态，头部加 Tab，两视图都挂载用 hidden 切换，调整面板尺寸。

- [ ] Commit: `git add app/components/ai-project/ProjectAIDrawer.tsx && git commit -m "feat: add flow walkthrough tab to AI drawer"`

---

### Task 9: 验证

- [ ] 纯函数运行时验证（临时脚本，验证后删除）：普通 JSON / ```json 围栏 / 夹带散文 / 缺字段 / `inferred`。
- [ ] `npx tsc --noEmit`
- [ ] `npx eslint app/lib/flow-card.ts app/lib/flow-context.ts app/lib/ai-api.ts app/api/projects/[id]/ai-flow/route.ts app/components/ai-project/ProjectAIFlowView.tsx app/components/ai-project/ProjectAIDrawer.tsx app/lib/db.ts app/lib/types.ts`
- [ ] `npm run build`
- [ ] 手动：选中函数 → 生成 → 点击步骤跳转 → 图渲染/放大 → 重新生成。

---

## Self-Review

- **Spec coverage:** 类型(1)、缓存(2)、解析(3)、子图/提示词(4)、路由(5)、客户端(6)、视图(7)、抽屉 Tab(8)、验证(9) 覆盖 spec 全部。
- **Placeholder scan:** 无 TBD；代码完整。
- **Type consistency:** `FlowEntry/FlowStep/FlowDataStruct/FlowCard`、`buildFlowContext/buildFlowPrompt`、`parseFlowCard`、`generateFlowWalkthrough`、`selectFileWithLine` 签名一致。
