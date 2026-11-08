# 项目级全局 AI 浮动抽屉 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在项目详情页新增一个右下角浮动的项目级 AI 抽屉，支持基于关键词检索整个项目的源码进行流式问答，并在回答中渲染 Mermaid 图和可点击的文件引用。

**Architecture:** 前端 `ProjectAIDrawer`（FAB + 面板）内嵌 `ProjectAIView`（对话），消息用 `ProjectAIMarkdown` 渲染。提问经新增服务端路由 `/api/projects/[id]/ai-project`：服务端用 `project-retrieval` 检索相关文件、拼 system prompt，再调用 DeepSeek 的 `stream:true`，将上游 SSE 直接 pipe 回客户端。

**Tech Stack:** Next.js 16 App Router、React 19、Zustand、react-markdown + remark-gfm、mermaid、DeepSeek OpenAI 兼容接口。

**测试说明:** 本项目没有测试框架（`package.json` 无 test 脚本）。因此每个任务的验证使用 `npm run lint` / `npm run build`（含类型检查）与手动验证，而非单元测试。提交粒度按任务。

---

### Task 1: 服务端检索模块

**Files:**
- Create: `app/lib/project-retrieval.ts`

- [ ] **Step 1: 创建检索模块**

```ts
import { getFileTree, getSymbols, getCalls } from '@/app/lib/db'

export interface RetrievedFile {
  path: string
  content: string
  score: number
}

export interface ProjectContext {
  files: RetrievedFile[]
  structureSummary: string
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'of', 'to', 'in', 'on', 'for',
  'and', 'or', 'not', 'how', 'what', 'why', 'where', 'when', 'which', 'who', 'does', 'do',
  'did', 'this', 'that', 'these', 'those', 'with', 'from', 'by', 'as', 'at', 'it', 'its',
  'can', 'could', 'should', 'would', 'will', 'you', 'your', 'we', 'file', 'files', 'function',
  'functions', 'code', 'please', 'explain', 'tell', 'about', 'project', 'module',
])

function extractKeywords(query: string): string[] {
  const tokens = query.match(/[A-Za-z_][A-Za-z0-9_]{1,}/g) || []
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of tokens) {
    const t = raw.toLowerCase()
    if (t.length < 2 || STOPWORDS.has(t) || seen.has(t)) continue
    seen.add(t)
    result.push(t)
  }
  return result.slice(0, 12)
}

function buildStructureSummary(files: any[], symbols: any[], calls: any[]): string {
  const dirs = new Set<string>()
  for (const f of files) {
    const parts = String(f.path).split('/')
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'))
  }
  const funcs = symbols.filter((s) => s.kind === 'function')
  const structs = symbols.filter((s) => s.kind === 'struct')
  const lines: string[] = []
  lines.push(`文件总数: ${files.length}，目录数: ${dirs.size}`)
  lines.push(`函数: ${funcs.length} 个，结构体: ${structs.length} 个，调用关系: ${calls.length} 条`)
  lines.push('文件列表（部分）:')
  for (const f of files.slice(0, 80)) lines.push(`- ${f.path}`)
  const fnList = funcs.slice(0, 60).map((s) => `${s.name} (${s.file}:${s.line ?? '?'})`)
  if (fnList.length) {
    lines.push('主要函数:')
    for (const x of fnList) lines.push(`- ${x}`)
  }
  const stList = structs.slice(0, 40).map((s) => `${s.name} (${s.file})`)
  if (stList.length) {
    lines.push('结构体:')
    for (const x of stList) lines.push(`- ${x}`)
  }
  return lines.join('\n')
}

export async function retrieveProjectContext(projectId: number, query: string): Promise<ProjectContext> {
  const [fileRows, symbols, calls] = await Promise.all([
    getFileTree(projectId),
    getSymbols(projectId),
    getCalls(projectId),
  ])

  const files = (fileRows as any[]).filter((f) => f.type === 'file')
  const keywords = extractKeywords(query)
  const scores = new Map<string, number>()
  const addScore = (filePath: string, n: number) => {
    if (!filePath) return
    scores.set(filePath, (scores.get(filePath) || 0) + n)
  }

  for (const f of files) {
    const p = String(f.path).toLowerCase()
    const name = String(f.name).toLowerCase()
    for (const kw of keywords) {
      if (p.includes(kw) || name.includes(kw)) addScore(f.path, 5)
    }
  }

  for (const s of symbols as any[]) {
    const sname = String(s.name).toLowerCase()
    if (keywords.some((kw) => sname.includes(kw))) addScore(s.file, 6)
  }

  for (const f of files) {
    const content = String(f.content || '').toLowerCase()
    if (!content) continue
    for (const kw of keywords) {
      if (content.includes(kw)) addScore(f.path, 1)
    }
  }

  const ranked = files
    .map((f) => ({ path: String(f.path), content: String(f.content || ''), score: scores.get(f.path) || 0 }))
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)

  let selected = ranked.slice(0, 6)
  if (selected.length === 0) {
    const fallback = files
      .map((f) => ({ path: String(f.path), content: String(f.content || ''), score: 0 }))
      .filter((f) => /(^|\/)(main|init|start|kernel)\.(c|h)$/i.test(f.path) || f.path.split('/').length === 1)
      .slice(0, 4)
    selected = fallback.length
      ? fallback
      : files.slice(0, 3).map((f) => ({ path: String(f.path), content: String(f.content || ''), score: 0 }))
  }

  const MAX_PER_FILE = 4000
  const MAX_TOTAL = 24000
  let total = 0
  const out: RetrievedFile[] = []
  for (const f of selected) {
    if (total >= MAX_TOTAL) break
    const capped = f.content.slice(0, Math.min(MAX_PER_FILE, MAX_TOTAL - total))
    total += capped.length
    out.push({ path: f.path, content: capped, score: f.score })
  }

  return { files: out, structureSummary: buildStructureSummary(files, symbols as any[], calls as any[]) }
}

export function buildProjectSystemPrompt(projectName: string, ctx: ProjectContext): string {
  const sources = ctx.files
    .map((f) => `### 文件: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n')
  return `你是一个资深软件工程师，正在帮助用户理解名为“${projectName}”的整个项目（一个 C 语言内核类项目）。

## 项目结构
${ctx.structureSummary}

## 相关文件源码（根据问题检索）
${sources || '（未检索到直接相关的源码，请基于项目结构回答，并说明上下文有限。）'}

## 回答要求
- 用中文、技术性、简洁地回答用户关于整个项目的问题。
- 优先基于上面的项目结构与源码回答；信息不足时明确说明，并指出可以查看哪些文件。
- 引用文件时使用格式：[路径:行号](codeatlas://file?path=<URL编码路径>&line=<行号>)，不要只写纯文本。
- 需要展示流程/调用关系时，输出 \`\`\`mermaid 代码块。
- 不要编造项目中不存在的文件或函数。`
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无与 `project-retrieval.ts` 相关的错误（项目其它既有错误若存在记录但不引入新的）。

- [ ] **Step 3: Commit**

```bash
git add app/lib/project-retrieval.ts
git commit -m "feat: add project retrieval for project-wide AI"
```

---

### Task 2: 流式 API 路由

**Files:**
- Create: `app/api/projects/[id]/ai-project/route.ts`

- [ ] **Step 1: 创建路由**

```ts
import { NextResponse } from 'next/server'
import { getProject } from '@/app/lib/db'
import { retrieveProjectContext, buildProjectSystemPrompt } from '@/app/lib/project-retrieval'

interface IncomingMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const projectId = Number(id)

  try {
    const body = await req.json()
    const { messages, apiKey, baseUrl, model } = body as {
      messages?: IncomingMessage[]
      apiKey?: string
      baseUrl?: string
      model?: string
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 })
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'apiKey required' }, { status: 400 })
    }

    const project = (await getProject(projectId)) as { name?: string } | undefined
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    const query = lastUser?.content || ''

    const ctx = await retrieveProjectContext(projectId, query)
    const systemPrompt = buildProjectSystemPrompt(project?.name || '当前项目', ctx)

    const upstream = await fetch(`${baseUrl || 'https://api.deepseek.com'}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.3,
        max_tokens: 4096,
        stream: true,
      }),
    })

    if (!upstream.ok || !upstream.body) {
      const err = await upstream.json().catch(() => ({}))
      const msg = (err as { error?: { message?: string } })?.error?.message || `AI API error: ${upstream.status}`
      return NextResponse.json({ error: msg }, { status: upstream.status || 502 })
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无与 `ai-project/route.ts` 相关的错误。

- [ ] **Step 3: Commit**

```bash
git add app/api/projects/[id]/ai-project/route.ts
git commit -m "feat: add streaming project-wide AI route"
```

---

### Task 3: 客户端流式调用

**Files:**
- Modify: `app/lib/ai-api.ts`（在文件末尾追加，不改动现有函数）

- [ ] **Step 1: 追加 `streamProjectAI`**

```ts
export async function streamProjectAI(
  projectId: number,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const { apiKey, baseUrl, model } = useSettings.getState()

  if (!apiKey) {
    throw new Error('API Key not configured')
  }

  const res = await fetch(`/api/projects/${projectId}/ai-project`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, apiKey, baseUrl, model }),
    signal,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `API error: ${res.status}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue
      try {
        const parsed = JSON.parse(data)
        const content = parsed.choices?.[0]?.delta?.content
        if (content) {
          fullText += content
          onChunk(content)
        }
      } catch {
        // skip unparseable chunks
      }
    }
  }

  return fullText
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无与 `ai-api.ts` 相关的错误。

- [ ] **Step 3: Commit**

```bash
git add app/lib/ai-api.ts
git commit -m "feat: add client stream helper for project AI"
```

---

### Task 4: 消息渲染组件（Mermaid + 可点击引用）

**Files:**
- Create: `app/components/ai-project/ProjectAIMarkdown.tsx`

- [ ] **Step 1: 创建组件**

```tsx
'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useStore } from '@/app/store'
import { MermaidDiagram } from '@/app/components/ai-panel/MermaidDiagram'

interface Props {
  content: string
}

function parseCodeatlasHref(href?: string): { path: string; line?: number } | null {
  if (!href || !href.startsWith('codeatlas://file')) return null
  try {
    const url = new URL(href)
    const path = url.searchParams.get('path')
    const lineStr = url.searchParams.get('line')
    if (!path) return null
    const line = lineStr ? Number(lineStr) : undefined
    return { path, line: Number.isFinite(line) ? line : undefined }
  } catch {
    return null
  }
}

export function ProjectAIMarkdown({ content }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="text-base font-bold text-[var(--foreground)] mt-3 mb-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-semibold text-[var(--foreground)] mt-3 mb-1.5">{children}</h2>,
        h3: ({ children }) => <h3 className="text-xs font-semibold text-[var(--foreground)] mt-2 mb-1">{children}</h3>,
        p: ({ children }) => <p className="text-xs text-[var(--foreground)] leading-relaxed mb-1.5">{children}</p>,
        ul: ({ children }) => <ul className="text-xs text-[var(--foreground)] list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="text-xs text-[var(--foreground)] list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-xs text-[var(--foreground)]">{children}</li>,
        code: ({ className, children, ...props }) => {
          const match = /language-(\w+)/.exec(className || '')
          if (match && match[1] === 'mermaid') {
            return <MermaidDiagram chart={String(children).replace(/\n$/, '')} />
          }
          if (!match) {
            return (
              <code className="text-[11px] font-mono bg-[var(--muted)] text-[var(--primary)] px-1 py-0.5 rounded" {...props}>
                {children}
              </code>
            )
          }
          return (
            <pre className="text-xs font-mono bg-[var(--background)] border border-[var(--border)] rounded-none p-3 my-2 overflow-x-auto whitespace-pre-wrap">
              <code className={className} {...props}>
                {children}
              </code>
            </pre>
          )
        },
        pre: ({ children }) => <>{children}</>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-[var(--primary)]/50 pl-3 my-2 text-xs text-[var(--muted-foreground)]">
            {children}
          </blockquote>
        ),
        strong: ({ children }) => <strong className="font-semibold text-[var(--foreground)]">{children}</strong>,
        em: ({ children }) => <em className="italic text-[var(--foreground)]">{children}</em>,
        a: ({ children, href }) => {
          const ref = parseCodeatlasHref(href)
          if (ref) {
            return (
              <button
                type="button"
                onClick={() => useStore.getState().selectFileWithLine(ref.path, ref.line)}
                className="text-[var(--primary)] underline text-xs cursor-pointer"
              >
                {children}
              </button>
            )
          }
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] underline text-xs">
              {children}
            </a>
          )
        },
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full text-xs border-collapse">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-[var(--border)] bg-[var(--muted)]/50 px-2 py-1 text-left text-[var(--foreground)] font-medium">{children}</th>
        ),
        td: ({ children }) => (
          <td className="border border-[var(--border)] px-2 py-1 text-[var(--muted-foreground)]">{children}</td>
        ),
        hr: () => <hr className="border-[var(--border)] my-2" />,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无与 `ProjectAIMarkdown.tsx` 相关的错误。

- [ ] **Step 3: Commit**

```bash
git add app/components/ai-project/ProjectAIMarkdown.tsx
git commit -m "feat: add project AI markdown renderer with mermaid and clickable refs"
```

---

### Task 5: 对话视图

**Files:**
- Create: `app/components/ai-project/ProjectAIView.tsx`

- [ ] **Step 1: 创建组件**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, Square, Loader2 } from 'lucide-react'
import { useSettings } from '@/app/store/settings'
import { streamProjectAI } from '@/app/lib/ai-api'
import { ProjectAIMarkdown } from './ProjectAIMarkdown'
import { cn } from '@/lib/utils'

interface Msg {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  '这个项目的整体架构是怎样的？',
  '项目的启动入口在哪，初始化流程是什么？',
  '各个模块之间是如何协作的？',
]

export function ProjectAIView({ projectId }: { projectId: number }) {
  const apiKey = useSettings((s) => s.apiKey)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, streaming])

  async function send(text: string) {
    const question = text.trim()
    if (!question || streaming) return
    if (!apiKey) {
      setError('请先在设置中配置 API Key')
      return
    }
    setError(null)
    setInput('')
    const userMsg: Msg = { role: 'user', content: question }
    const next = [...messages, userMsg]
    setMessages([...next, { role: 'assistant', content: '' }])
    setStreaming(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await streamProjectAI(
        projectId,
        next,
        (chunk) => {
          setMessages((prev) => {
            const copy = [...prev]
            const last = copy[copy.length - 1]
            copy[copy.length - 1] = { ...last, content: last.content + chunk }
            return copy
          })
        },
        controller.signal
      )
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return
      setError((e as Error)?.message || String(e))
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  function stop() {
    abortRef.current?.abort()
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-[var(--muted-foreground)]">就整个项目随便问，例如：</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="block w-full text-left text-xs border border-[var(--border)] px-2.5 py-2 text-[var(--foreground)] hover:bg-[var(--muted)]/50 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn('text-xs', m.role === 'user' ? 'text-right' : '')}>
            {m.role === 'user' ? (
              <span className="inline-block max-w-[85%] bg-[var(--primary)]/10 text-[var(--foreground)] px-2.5 py-1.5 whitespace-pre-wrap text-left">
                {m.content}
              </span>
            ) : (
              <div className="text-[var(--foreground)]">
                {m.content ? (
                  <ProjectAIMarkdown content={m.content} />
                ) : streaming && i === messages.length - 1 ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--muted-foreground)]" />
                ) : null}
              </div>
            )}
          </div>
        ))}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
      <div className="border-t border-[var(--border)] p-2">
        <div className="flex items-end gap-1.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            rows={2}
            placeholder="针对整个项目向 AI 提问..."
            className="flex-1 resize-none bg-[var(--muted)]/40 border border-[var(--border)] px-2 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/70 outline-none focus-visible:border-[var(--ring)]"
          />
          {streaming ? (
            <button
              onClick={stop}
              className="h-8 w-8 flex items-center justify-center bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--muted)]/70"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              onClick={() => send(input)}
              disabled={!input.trim()}
              className="h-8 w-8 flex items-center justify-center bg-[var(--primary)] text-[var(--primary-foreground)] disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无与 `ProjectAIView.tsx` 相关的错误。

- [ ] **Step 3: Commit**

```bash
git add app/components/ai-project/ProjectAIView.tsx
git commit -m "feat: add project AI conversation view"
```

---

### Task 6: 浮动抽屉

**Files:**
- Create: `app/components/ai-project/ProjectAIDrawer.tsx`

- [ ] **Step 1: 创建组件**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { ProjectAIView } from './ProjectAIView'

export function ProjectAIDrawer({ projectId }: { projectId: number }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end">
      {open && (
        <div className="mb-3 w-[min(92vw,420px)] h-[min(70vh,600px)] flex flex-col border border-[var(--border)] bg-[var(--card)] shadow-fabric animate-scale-in">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--primary)]" />
              项目 AI
            </div>
            <button
              onClick={() => setOpen(false)}
              className="h-6 w-6 flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ProjectAIView projectId={projectId} />
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        title="项目 AI (Cmd/Ctrl+Shift+A)"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] shadow-fabric hover:opacity-90 transition-opacity"
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无与 `ProjectAIDrawer.tsx` 相关的错误。

- [ ] **Step 3: Commit**

```bash
git add app/components/ai-project/ProjectAIDrawer.tsx
git commit -m "feat: add floating project AI drawer"
```

---

### Task 7: 挂载到 AppShell

**Files:**
- Modify: `app/components/layout/AppShell.tsx:10`（import）、Root div 内（状态栏之后）

- [ ] **Step 1: 添加 import**

在现有 import 区（第 13 行 `KeyboardShortcuts` 之后）加入：

```tsx
import { ProjectAIDrawer } from '@/app/components/ai-project/ProjectAIDrawer'
```

- [ ] **Step 2: 挂载组件**

在 `{/* Status bar */}` 的 `</div>` 之后、根 `<div>` 结束之前加入：

```tsx
      {projectId ? <ProjectAIDrawer projectId={projectId} /> : null}
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无与 `AppShell.tsx` 相关的错误。

- [ ] **Step 4: Commit**

```bash
git add app/components/layout/AppShell.tsx
git commit -m "feat: mount project AI drawer in app shell"
```

---

### Task 8: 设置弹窗监听 + 快捷键帮助

**Files:**
- Modify: `app/components/layout/SettingsDialog.tsx:3`（import）、组件内
- Modify: `app/components/layout/KeyboardShortcuts.tsx:36-39`（AI 分组）

- [ ] **Step 1: SettingsDialog 增加事件监听**

将第 3 行 `import { useState } from 'react'` 改为：

```tsx
import { useEffect, useState } from 'react'
```

在 `const testMsg...` 之后加入：

```tsx
  useEffect(() => {
    const handler = () => {
      setOpen(true)
      setTestStatus('idle')
      setTestMsg('')
    }
    window.addEventListener('codeatlas:open-settings', handler)
    return () => window.removeEventListener('codeatlas:open-settings', handler)
  }, [])
```

- [ ] **Step 2: 快捷键帮助加入条目**

在 `KeyboardShortcuts.tsx` 的 `AI` 分组 items 中追加：

```tsx
      { keys: 'Cmd+Shift+A', desc: '打开项目 AI' },
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无相关错误。

- [ ] **Step 4: Commit**

```bash
git add app/components/layout/SettingsDialog.tsx app/components/layout/KeyboardShortcuts.tsx
git commit -m "feat: wire settings open event and project AI shortcut"
```

---

### Task 9: 整体验证

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: 通过（如出现本次新增文件相关的报错则修复后重跑）。

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: 构建成功，类型检查通过。

- [ ] **Step 3: 手动验证（开发服务器）**

Run: `npm run dev` 后打开某个项目页：
- 右下角出现 AI 浮动按钮。
- 点击或 `Cmd/Ctrl+Shift+A` 打开/关闭抽屉。
- 未配置 Key 时提示前往设置（点击后设置弹窗打开）。
- 配置 Key 后提问，回答流式输出。
- 回答中的 Mermaid 代码块渲染为图。
- 点击 `文件:行号` 引用跳转到对应文件/行，抽屉保持打开。
- 发送过程中可点击停止。

- [ ] **Step 4: 最终提交（如手动验证有微调）**

```bash
git add -A
git commit -m "chore: polish project AI drawer"
```

---

## Self-Review

- **Spec coverage:** 检索（Task 1）、服务端流式路由（Task 2）、客户端流式（Task 3）、Mermaid + 可点击引用（Task 4）、对话视图（Task 5）、浮动抽屉（Task 6）、AppShell 挂载（Task 7）、设置事件与快捷键（Task 8）、验证（Task 9）——覆盖 spec 全部要求。
- **Placeholder scan:** 无 TBD/TODO；每个代码步骤含完整代码。
- **Type consistency:** `ChatMessage`/`Msg`、`streamProjectAI`、`retrieveProjectContext`、`buildProjectSystemPrompt`、`selectFileWithLine(path, line)` 在各任务中签名一致。
- **偏差说明:** 项目无测试框架，故用 `tsc --noEmit` / `lint` / `build` / 手动验证替代单元测试；未拆分 `ProjectAIView` 之外的多余文件（YAGNI）。
