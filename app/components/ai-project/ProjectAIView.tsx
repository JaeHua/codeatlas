'use client'

import { useEffect, useRef, useState } from 'react'
import { Send, Square, Loader2 } from 'lucide-react'
import { useSettings } from '@/app/store/settings'
import { streamProjectAI } from '@/app/lib/ai-api'
import { isImeComposing } from '@/app/lib/keyboard'
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
              if (isImeComposing(e)) return
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
