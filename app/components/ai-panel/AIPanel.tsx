'use client'

import { useState, useEffect, useRef } from 'react'
import { useStore } from '@/app/store'
import { loadAIMock } from '@/app/lib/data-api'
import { chatCompletion, chatCompletionStream } from '@/app/lib/ai-api'
import { useSettings } from '@/app/store/settings'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Loader2, FileText, Hash, BookOpen, GitBranch, MessageCircle, ExternalLink, Send, Sparkles, AlertTriangle, X, Settings } from 'lucide-react'
import { MermaidDiagram } from './MermaidDiagram'
import { MarkdownRenderer } from './MarkdownRenderer'
import { CallersSection } from './CallersSection'
import type { MockAI } from '@/app/lib/types'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function AIPanel() {
  const { selectedEntity, projectId } = useStore()
  const { isConfigured } = useSettings()
  const [data, setData] = useState<MockAI | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [query, setQuery] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Selection explain state
  const [explainMode, setExplainMode] = useState(false)
  const [explainCode, setExplainCode] = useState('')
  const [explainText, setExplainText] = useState('')
  const [explainStreaming, setExplainStreaming] = useState(false)
  const [explainFollowUp, setExplainFollowUp] = useState<{ q: string; a: string }[]>([])
  const [followUpQuery, setFollowUpQuery] = useState('')
  const [followUpSending, setFollowUpSending] = useState(false)

  // Function explain state
  const [fnMode, setFnMode] = useState(false)
  const [fnInfo, setFnInfo] = useState<{ filePath: string; functionName: string; source: string; callers: string[]; callees: string[] } | null>(null)
  const [fnText, setFnText] = useState('')
  const [fnStreaming, setFnStreaming] = useState(false)
  const [fnFollowUp, setFnFollowUp] = useState<{ q: string; a: string }[]>([])
  const [fnFollowUpQuery, setFnFollowUpQuery] = useState('')
  const [fnFollowUpSending, setFnFollowUpSending] = useState(false)

  useEffect(() => {
    const path = selectedEntity?.path || null

    if (!path) {
      setData(null)
      setLoading(false)
      setError(null)
      setChatMessages([])
      setQuery('')
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setChatMessages([])
    setQuery('')

    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        setLoading(false)
        setError('AI 数据加载超时（超过 10 秒），请检查网络后重试。')
      }
    }, 10000)

    loadAIMock(projectId || 0, path)
      .then((d) => {
        if (!cancelled) {
          clearTimeout(timeoutId)
          setData(d)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearTimeout(timeoutId)
          setData(null)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [selectedEntity?.path, selectedEntity?.type, projectId, reloadKey])

  // Listen for selection explain events from CodeViewer
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        filePath: string
        fileName: string
        selectedText: string
        context: string
      }

    setExplainMode(true)
    setExplainCode(detail.selectedText)
    setExplainText('')
    setExplainStreaming(true)
    setExplainFollowUp([])
    setFollowUpQuery('')

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      if (!isConfigured()) {
        setExplainText('请先在设置中配置 DeepSeek API Key（右上角齿轮图标）')
        setExplainStreaming(false)
        return
      }

      let fullText = ''
      try {
        await chatCompletionStream(
          [
            {
              role: 'system',
              content: `你是 Linux 内核代码分析助手。用户选中了一段 Linux Kernel 0.21 的 C 代码。
请用中文解释这段代码的作用、逻辑，以及与内核其他部分的关联。
保持简洁，用专业术语。`,
            },
            {
              role: 'user',
              content: `文件: ${detail.filePath}\n\n上下文代码:\n\`\`\`c\n${detail.context.slice(0, 4000)}\n\`\`\`\n\n选中的代码:\n\`\`\`c\n${detail.selectedText}\n\`\`\``,
            },
          ],
          (chunk) => {
            fullText += chunk
            setExplainText(fullText)
          },
          controller.signal
        )
      } catch {
        if (fullText) return
        setExplainText('解释生成失败，请重试')
      } finally {
        setExplainStreaming(false)
      }
    }

    window.addEventListener('codeatlas:explain', handler)
    return () => window.removeEventListener('codeatlas:explain', handler)
  }, [isConfigured])

  // Listen for function explain events from CodeViewer
  useEffect(() => {
    const handler = async (e: Event) => {
      const d = (e as CustomEvent).detail as {
        filePath: string
        functionName: string
        source: string
        callers: string[]
        callees: string[]
      }
      setFnMode(true)
      setFnInfo(d)
      setFnText('')
      setFnStreaming(true)
      setFnFollowUp([])
      setFnFollowUpQuery('')

      if (!isConfigured()) {
        setFnText('请先在设置中配置 DeepSeek API Key（右上角齿轮图标）')
        setFnStreaming(false)
        return
      }

      let full = ''
      try {
        await chatCompletionStream(
          [
            {
              role: 'system',
              content: '你是 Linux 内核代码分析助手。用户选中了一个 C 函数，请用中文解释它的作用、关键逻辑、以及与调用者/被调用者的关系。简洁专业。',
            },
            {
              role: 'user',
              content: `文件: ${d.filePath}\n函数: ${d.functionName}\n\n调用它的函数: ${d.callers.join(', ') || '（无）'}\n它调用的函数: ${d.callees.join(', ') || '（无）'}\n\n函数源码:\n\`\`\`c\n${d.source.slice(0, 4000)}\n\`\`\``,
            },
          ],
          (chunk) => { full += chunk; setFnText(full) },
          undefined
        )
      } catch {
        if (!full) setFnText('解释生成失败，请重试')
      } finally {
        setFnStreaming(false)
      }
    }
    window.addEventListener('codeatlas:explain-function', handler)
    return () => window.removeEventListener('codeatlas:explain-function', handler)
  }, [isConfigured])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chatMessages])

  const handleSend = async () => {
    const trimmed = query.trim()
    if (!trimmed || sending || !data) return

    if (!isConfigured()) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '请先在设置中配置 DeepSeek API Key（右上角齿轮图标）' },
      ])
      setQuery('')
      return
    }

    const userMsg: ChatMessage = { role: 'user', content: trimmed }
    setChatMessages((prev) => [...prev, userMsg])
    setQuery('')
    setSending(true)

    try {
      const reply = await chatCompletion([
        { role: 'system', content: `你正在帮助分析 Linux Kernel 0.21 或其他 C 语言项目的源代码。当前分析的文件是 ${data.filePath}。\n\n文件概要: ${data.summary}\n通俗解释: ${data.plainExplanation}\n\n请用中文回答用户问题，简洁专业。` },
        { role: 'user', content: trimmed },
      ])

      setChatMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: err instanceof Error ? err.message : '请求失败，请检查 API 配置',
        },
      ])
    } finally {
      setSending(false)
    }
  }

  // Explain mode overlay
  const handleFollowUp = async () => {
    if (!followUpQuery.trim() || followUpSending) return
    const q = followUpQuery.trim()
    setFollowUpQuery('')
    setExplainFollowUp((prev) => [...prev, { q, a: '' }])
    setFollowUpSending(true)
    const s = JSON.parse(localStorage.getItem('codeatlas-settings') || '{}')
    if (!s?.state?.apiKey) { setExplainFollowUp((prev) => prev.map((it, i) => i === prev.length - 1 ? { ...it, a: '请先配置 API Key' } : it)); setFollowUpSending(false); return }
    try {
      const res = await fetch(`${s.state.baseUrl || 'https://api.deepseek.com'}/v1/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.state.apiKey}` },
        body: JSON.stringify({ model: s.state.model || 'deepseek-chat', messages: [{ role: 'system', content: `之前解释的代码:\n\`\`\`\n${explainCode}\n\`\`\`\n\n解释: ${explainText.slice(0, 1000)}\n\n用户有后续问题。用中文简洁回答。` }, { role: 'user', content: q }], temperature: 0.3, max_tokens: 1024 }),
      })
      const d = await res.json()
      setExplainFollowUp((prev) => prev.map((it, i) => i === prev.length - 1 ? { ...it, a: d.choices?.[0]?.message?.content || '无响应' } : it))
    } catch { setExplainFollowUp((prev) => prev.map((it, i) => i === prev.length - 1 ? { ...it, a: '请求失败' } : it)) }
    setFollowUpSending(false)
  }

  const handleFnFollowUp = async () => {
    if (!fnFollowUpQuery.trim() || fnFollowUpSending) return
    const q = fnFollowUpQuery.trim()
    setFnFollowUpQuery('')
    setFnFollowUp((prev) => [...prev, { q, a: '' }])
    setFnFollowUpSending(true)
    const s = JSON.parse(localStorage.getItem('codeatlas-settings') || '{}')
    if (!s?.state?.apiKey) { setFnFollowUp((prev) => prev.map((it, i) => i === prev.length - 1 ? { ...it, a: '请先配置 API Key' } : it)); setFnFollowUpSending(false); return }
    try {
      const res = await fetch(`${s.state.baseUrl || 'https://api.deepseek.com'}/v1/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.state.apiKey}` },
        body: JSON.stringify({ model: s.state.model || 'deepseek-chat', messages: [{ role: 'system', content: `之前解释的函数 ${fnInfo?.functionName} 源码:\n\`\`\`c\n${(fnInfo?.source || '').slice(0, 2000)}\n\`\`\`\n\n解释: ${fnText.slice(0, 1000)}\n\n用户有后续问题。用中文简洁回答。` }, { role: 'user', content: q }], temperature: 0.3, max_tokens: 1024 }),
      })
      const d = await res.json()
      setFnFollowUp((prev) => prev.map((it, i) => i === prev.length - 1 ? { ...it, a: d.choices?.[0]?.message?.content || '无响应' } : it))
    } catch { setFnFollowUp((prev) => prev.map((it, i) => i === prev.length - 1 ? { ...it, a: '请求失败' } : it)) }
    setFnFollowUpSending(false)
  }

  if (fnMode) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
          <span className="text-xs font-semibold text-[var(--primary)] uppercase flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            AI 函数解释
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            onClick={() => { setFnMode(false); setFnText('') }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono font-semibold text-[var(--foreground)]">{fnInfo?.functionName}</code>
                <span className="text-[10px] text-[var(--muted-foreground)] font-mono truncate">{fnInfo?.filePath}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)]">
                  调用者:
                </span>
                {fnInfo?.callers.length ? fnInfo.callers.map((c) => (
                  <Badge key={c} variant="outline" className="text-[10px] border-[var(--border)] text-[var(--primary)] font-mono">{c}</Badge>
                )) : <span className="text-[10px] text-[var(--muted-foreground)]/60">无</span>}
                <span className="flex items-center gap-1 text-[10px] text-[var(--muted-foreground)] ml-2">
                  被调用者:
                </span>
                {fnInfo?.callees.length ? fnInfo.callees.map((c) => (
                  <Badge key={c} variant="outline" className="text-[10px] border-[var(--border)] text-[var(--muted-foreground)] font-mono">{c}</Badge>
                )) : <span className="text-[10px] text-[var(--muted-foreground)]/60">无</span>}
              </div>
              <div className="bg-[var(--card)] rounded-none border border-[var(--border)] overflow-hidden">
                <div className="px-3 py-1.5 border-b border-[var(--border)] text-[10px] text-[var(--muted-foreground)] flex items-center justify-between">
                  <span>函数源码</span>
                  <span className="text-[var(--muted-foreground)]/50">{fnInfo?.source.split('\n').length} 行</span>
                </div>
                <pre className="p-3 text-xs font-mono text-[var(--foreground)] whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto">
                  {fnInfo?.source}
                </pre>
              </div>
              <div className="bg-[var(--card)] rounded-none border border-[var(--border)] overflow-hidden">
                <div className="px-3 py-1.5 border-b border-[var(--border)] text-[10px] text-[var(--muted-foreground)] flex items-center justify-between">
                  <span>AI 解释</span>
                  {fnStreaming && (
                    <span className="flex items-center gap-1 text-[var(--primary)]">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      生成中...
                    </span>
                  )}
                </div>
                <div className="p-3 text-[var(--foreground)] leading-relaxed prose-sm prose-invert max-w-none">
                  {fnText ? <MarkdownRenderer content={fnText} /> : <span className="text-xs">等待解释...</span>}
                </div>
              </div>

              {fnFollowUp.map((item, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="bg-[var(--primary)]/10 rounded-none p-2.5 border border-[var(--primary)]/20">
                    <div className="text-[10px] text-[var(--muted-foreground)] mb-1">追问</div>
                    <p className="text-xs text-[var(--foreground)]">{item.q}</p>
                  </div>
                  {item.a ? (
                    <div className="bg-[var(--card)] rounded-none p-2.5 border border-[var(--border)]">
                      <MarkdownRenderer content={item.a} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] px-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> 生成中...
                    </div>
                  )}
                </div>
              ))}

              <div className="flex gap-1.5">
                <Textarea value={fnFollowUpQuery} onChange={(e) => setFnFollowUpQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleFnFollowUp() } }}
                  placeholder="针对这个函数继续追问... (Shift+Enter 换行)" disabled={fnFollowUpSending}
                  className="min-h-[32px] max-h-[100px] text-xs resize-none bg-[var(--muted)]/50 border-[var(--border)]" rows={1} />
                <Button size="icon" className="h-8 w-8 flex-shrink-0" onClick={handleFnFollowUp} disabled={fnFollowUpSending || !fnFollowUpQuery.trim()}>
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    )
  }

  if (explainMode) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
          <span className="text-xs font-semibold text-[var(--primary)] uppercase flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            AI 代码解释
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            onClick={() => {
              abortRef.current?.abort()
              setExplainMode(false)
              setExplainText('')
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-3">
              <div className="bg-[var(--card)] rounded-none border border-[var(--border)] overflow-hidden">
                <div className="px-3 py-1.5 border-b border-[var(--border)] text-[10px] text-[var(--muted-foreground)]">
                  选中的代码
                </div>
                <pre className="p-3 text-xs font-mono text-[var(--foreground)] whitespace-pre-wrap overflow-x-auto">
                  {explainCode}
                </pre>
              </div>
              <div className="bg-[var(--card)] rounded-none border border-[var(--border)] overflow-hidden">
                <div className="px-3 py-1.5 border-b border-[var(--border)] text-[10px] text-[var(--muted-foreground)] flex items-center justify-between">
                  <span>AI 解释</span>
                  {explainStreaming && (
                    <span className="flex items-center gap-1 text-[var(--primary)]">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      生成中...
                    </span>
                  )}
                </div>
                <div className="p-3 text-[var(--foreground)] leading-relaxed prose-sm prose-invert max-w-none">
                  {explainText ? (
                    <MarkdownRenderer content={explainText} />
                  ) : (
                    <span className="text-xs">等待解释...</span>
                  )}
                </div>
            </div>

            {/* Follow-up Q&A */}
            {explainFollowUp.map((item, i) => (
              <div key={i} className="space-y-1.5">
                <div className="bg-[var(--primary)]/10 rounded-none p-2.5 border border-[var(--primary)]/20">
                  <div className="text-[10px] text-[var(--muted-foreground)] mb-1">追问</div>
                  <p className="text-xs text-[var(--foreground)]">{item.q}</p>
                </div>
                {item.a ? (
                  <div className="bg-[var(--card)] rounded-none p-2.5 border border-[var(--border)]">
                    <MarkdownRenderer content={item.a} />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] px-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> 生成中...
                  </div>
                )}
              </div>
            ))}

            {/* Follow-up input */}
            <div className="flex gap-1.5">
              <Textarea value={followUpQuery} onChange={(e) => setFollowUpQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleFollowUp() } }}
                placeholder="继续追问... (Shift+Enter 换行)" disabled={followUpSending}
                className="min-h-[32px] max-h-[100px] text-xs resize-none bg-[var(--muted)]/50 border-[var(--border)]" rows={1} />
              <Button size="icon" className="h-8 w-8 flex-shrink-0" onClick={handleFollowUp} disabled={followUpSending || !followUpQuery.trim()}>
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </ScrollArea>
        </div>
      </div>
    )
  }

  if (!selectedEntity) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--muted-foreground)] text-sm px-4 text-center">
        <FileText className="h-8 w-8 text-[var(--muted-foreground)]/50" />
        <p>选择文件或函数查看 AI 解析</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] text-sm px-6 text-center gap-3">
        <AlertTriangle className="h-7 w-7 text-[var(--primary)]" />
        <p>{error}</p>
        <button
          onClick={() => { setError(null); setReloadKey((k) => k + 1) }}
          className="px-3 py-1.5 text-xs border border-[var(--border)] rounded-none hover:bg-[var(--accent)] transition-colors"
        >
          重试
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-4 space-y-5 animate-fabric-in">
        <div className="space-y-1.5">
          <div className="h-3 w-16 bg-[var(--muted)] animate-shimmer" />
          <div className="h-3 w-full bg-[var(--muted)] animate-shimmer" />
          <div className="h-3 w-4/5 bg-[var(--muted)] animate-shimmer" />
        </div>
        <div className="space-y-1.5">
          <div className="h-3 w-20 bg-[var(--muted)] animate-shimmer" />
          <div className="h-3 w-full bg-[var(--muted)] animate-shimmer" />
          <div className="h-3 w-2/3 bg-[var(--muted)] animate-shimmer" />
        </div>
        <div className="space-y-1.5">
          <div className="h-3 w-24 bg-[var(--muted)] animate-shimmer" />
          <div className="h-8 w-full bg-[var(--muted)] animate-shimmer" />
          <div className="h-8 w-full bg-[var(--muted)] animate-shimmer" />
          <div className="h-8 w-4/5 bg-[var(--muted)] animate-shimmer" />
        </div>
        <div className="space-y-1.5">
          <div className="h-3 w-16 bg-[var(--muted)] animate-shimmer" />
          <div className="h-16 w-full bg-[var(--muted)] animate-shimmer" />
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] text-sm px-4 text-center gap-2">
        <p>暂无该文件的 AI 解析数据</p>
        <p className="text-xs text-[var(--muted-foreground)]/70">请确认已配置 DeepSeek API Key（右上角齿轮）</p>
      </div>
    )
  }

  // Show API key missing state
  if ((data as any).error === 'no_key') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] text-sm px-4 text-center gap-3">
        <Settings className="h-8 w-8 text-[var(--primary)]" />
        <p>未配置 AI API Key</p>
        <button
          onClick={() => {
            window.dispatchEvent(new Event('codeatlas:open-settings'))
          }}
          className="px-3 py-1.5 text-xs border border-[var(--border)] rounded-none hover:bg-[var(--accent)] transition-colors"
        >
          前往设置
        </button>
      </div>
    )
  }

  // Show AI request failure state
  if ((data as any).error === 'api_error' || (data as any).error === 'network') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] text-sm px-6 text-center gap-3">
        <AlertTriangle className="h-7 w-7 text-[var(--primary)]" />
        <p>{data.plainExplanation || ((data as any).error === 'network' ? '网络连接失败，请检查网络后重试' : 'AI 请求失败，请稍后重试')}</p>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="px-3 py-1.5 text-xs border border-[var(--border)] rounded-none hover:bg-[var(--accent)] transition-colors"
        >
          重试
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-4">
          <section>
            <div className="flex items-center gap-1.5 mb-1.5">
               <BookOpen className="h-3.5 w-3.5 text-[var(--primary)]" />
              <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase">概要</h3>
            </div>
            <p className="text-sm text-[var(--foreground)] leading-relaxed">{data.summary}</p>
          </section>

          {selectedEntity?.type === 'function' && selectedEntity.name && (
            <CallersSection functionName={selectedEntity.name} />
          )}

          <section>
            <div className="flex items-center gap-1.5 mb-1.5">
              <MessageCircle className="h-3.5 w-3.5 text-[var(--foreground)]" />
              <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase">通俗解释</h3>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">{data.plainExplanation}</p>
          </section>

          {data.keyFunctions && data.keyFunctions.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Hash className="h-3.5 w-3.5 text-[var(--primary)]" />
                <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase">核心函数</h3>
              </div>
              <div className="space-y-1.5">
                {data.keyFunctions.map((f) => (
                  <div key={f.name} className="flex items-start gap-2">
                    <code className="text-xs font-mono text-[var(--primary)] flex-shrink-0">{f.name}</code>
                    <span className="text-xs text-[var(--muted-foreground)]">{f.role}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.prerequisites && data.prerequisites.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 mb-1.5">
                <BookOpen className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase">前置知识</h3>
              </div>
              <div className="flex flex-wrap gap-1">
                {data.prerequisites.map((p) => (
                  <Badge key={p} variant="outline" className="text-[10px] border-[var(--border)] text-[var(--muted-foreground)]">
                    {p}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {data.mermaid && (
            <section>
              <div className="flex items-center gap-1.5 mb-1.5">
                <GitBranch className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase">流程图</h3>
              </div>
              <div className="bg-[var(--card)] rounded-none p-3 border border-[var(--border)]">
                <MermaidDiagram chart={data.mermaid} />
              </div>
            </section>
          )}

          {data.relatedFiles && data.relatedFiles.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 mb-1.5">
                <ExternalLink className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase">相关文件</h3>
              </div>
              <div className="space-y-1">
                {data.relatedFiles.map((rf) => (
                  <div key={rf.path} className="flex items-start gap-2 text-xs">
                    <code className="text-[var(--primary)] flex-shrink-0">{rf.path}</code>
                    <span className="text-[var(--muted-foreground)]">{rf.reason}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.faq && data.faq.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 mb-1.5">
                <MessageCircle className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase">常见问题</h3>
              </div>
              <div className="space-y-2">
                {data.faq.map((item, i) => (
                  <div key={i} className="bg-[var(--card)] rounded-none p-2.5 border border-[var(--border)]">
                    <p className="text-xs text-[var(--foreground)] font-medium mb-1">{item.q}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">{item.a}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Chat messages */}
          {chatMessages.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="h-3.5 w-3.5 text-[var(--primary)]" />
                <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase">对话</h3>
              </div>
              <div className="space-y-2">
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`rounded-none p-2.5 border ${
                      msg.role === 'user'
                        ? 'bg-[var(--primary)]/10 border-[var(--primary)]/50'
                        : 'bg-[var(--card)] border-[var(--border)]'
                    }`}
                  >
                    <MarkdownRenderer content={msg.content} />
                  </div>
                ))}
                {sending && (
                  <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] py-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    AI 正在思考...
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </ScrollArea>
      </div>

      {/* Chat input */}
      <div className="p-3 border-t border-[var(--border)]">
        {!isConfigured() && (
          <div className="flex items-center gap-1 mb-2 text-[10px] text-[var(--primary)]/80">
            <AlertTriangle className="h-3 w-3" />
            未配置 API Key，点击右上角齿轮图标设置
          </div>
        )}
        <div className="flex gap-1.5" ref={scrollRef}>
          <Textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="针对该文件向 AI 提问..."
            disabled={sending}
            className="min-h-[32px] max-h-[100px] text-xs resize-none bg-[var(--muted)]/50 border-[var(--border)]"
            rows={1}
          />
          <Button
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={handleSend}
            disabled={sending || !query.trim()}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
