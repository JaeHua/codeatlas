'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '@/app/store'
import { MermaidDiagram } from '@/app/components/ai-panel/MermaidDiagram'
import { Loader2, Sparkles, RefreshCw, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'

// Cache generated diagrams per file path
const flowCache = new Map<string, string>()

export function FileGraph() {
  const { selectedFile, symbols, calls, projectId } = useStore()
  const [mermaidCode, setMermaidCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [desc, setDesc] = useState('')
  const [zoom, setZoom] = useState(100)
  const containerRef = useRef<HTMLDivElement>(null)

  // Load cached or clear when file changes
  useEffect(() => {
    if (!selectedFile) { setMermaidCode(null); setDesc(''); return }
    const cached = flowCache.get(selectedFile)
    setMermaidCode(cached || null)
    setDesc('')
    setLoading(false)
    setZoom(100)
  }, [selectedFile])

  // Mouse wheel zoom (Cmd+scroll)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault()
        setZoom((z) => Math.min(200, Math.max(30, z - Math.sign(e.deltaY) * 15)))
      }
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  const generateCallFlow = async () => {
    if (!selectedFile || !projectId) return
    const s = JSON.parse(localStorage.getItem('codeatlas-settings') || '{}')
    if (!s?.state?.apiKey) return
    setLoading(true)

    const fileSymbols = symbols.filter((f: any) => f.file === selectedFile)
    const funcs = fileSymbols.filter((f: any) => f.kind === 'function')
    const funcNames = new Set(funcs.map((f: any) => f.name))
    const relevantCalls = calls.filter((c: any) => funcNames.has(c.caller) || funcNames.has(c.callee))

    const prompt = `你是一个 Linux 内核源码分析专家。请为以下源文件生成一个**详尽、美观**的函数调用流程图（Mermaid graph TD 格式）。

文件: ${selectedFile}

函数列表:
${funcs.map((f: any) => `- ${f.name}: ${f.signature || ''}`).join('\n')}

完整调用关系:
${JSON.stringify(relevantCalls.slice(0, 100))}

要求:
1. 使用 graph TD 格式
2. 用多种节点形状区分类型，不要全用方框:
   - A[矩形方框] 用于普通函数调用
   - B(圆角矩形) 用于系统调用/API
   - C{菱形判断} 用于条件分支
   - D((圆形)) 用于入口函数/核心函数
   - E>旗帜形] 用于最终输出/结果
3. 节点内容包含：功能描述 + 函数名 + 文件路径，用 <br/> 换行
4. 重要入口函数节点用 ★ 前缀标记
5. 按调用层次排列，条件分支用菱形节点
6. 节点 ID 使用有意义的英文名
7. 生成 10-30 个节点，覆盖完整调用链
8. 连接线可以有不同样式：实线箭头(-->)、带文字标注的线(-->|条件|)、虚线(-.->)
9. 只输出 Mermaid 代码，不要任何解释文字，不要 markdown 代码块标记`

    try {
      const res = await fetch(`${s.state.baseUrl || 'https://api.deepseek.com'}/v1/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.state.apiKey}` },
        body: JSON.stringify({ model: s.state.model || 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 4000 }),
      })
      const data = await res.json()
      let text = data.choices?.[0]?.message?.content || ''
      text = text.replace(/```mermaid|```/g, '').trim()
      if (!text.startsWith('graph')) text = 'graph TD\n' + text
      setMermaidCode(text)
      if (selectedFile) flowCache.set(selectedFile, text)
      setDesc('')
    } catch (e) {
      setDesc('生成失败: ' + String(e))
    }
    setLoading(false)
  }

  if (!selectedFile) {
    return <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm">选择文件查看调用关系</div>
  }

  return (
    <div className="h-full relative flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] bg-[var(--card)]/30">
        <span className="text-[11px] text-[var(--muted-foreground)]">
          {selectedFile.split('/').pop()} — AI 调用流程图
        </span>
        <button onClick={generateCallFlow} disabled={loading}
          className="px-2.5 py-1 rounded text-[11px] border border-[var(--border)] bg-[var(--card)]/80 hover:bg-[var(--accent)] transition-all duration-200 flex items-center gap-1.5">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : mermaidCode ? <RefreshCw className="h-3 w-3 text-amber-400" /> : <Sparkles className="h-3 w-3 text-amber-400" />}
          {mermaidCode ? '重新生成' : 'AI 生成调用流程图'}
        </button>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 text-[var(--muted-foreground)] gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
            <p className="text-sm">AI 正在分析函数调用关系...</p>
            <p className="text-xs text-[var(--muted-foreground)]/60">预计 5-20 秒</p>
          </div>
        ) : desc ? (
          <div className="flex items-center justify-center h-48 text-[var(--muted-foreground)] text-sm">{desc}</div>
        ) : mermaidCode ? (
          <>
            {/* Zoom controls */}
            <div className="sticky top-2 right-2 float-right z-10 flex gap-1 bg-[var(--card)]/90 rounded-lg p-1 border border-[var(--border)]">
              <button onClick={() => setZoom((z) => Math.min(200, z + 15))} className="p-1 hover:bg-[var(--accent)] rounded text-[var(--muted-foreground)]"><ZoomIn className="h-3.5 w-3.5" /></button>
              <button onClick={() => setZoom((z) => Math.max(30, z - 15))} className="p-1 hover:bg-[var(--accent)] rounded text-[var(--muted-foreground)]"><ZoomOut className="h-3.5 w-3.5" /></button>
              <button onClick={() => setZoom(100)} className="p-1 hover:bg-[var(--accent)] rounded text-[var(--muted-foreground)]"><RotateCcw className="h-3.5 w-3.5" /></button>
              <span className="px-1.5 text-[10px] text-[var(--muted-foreground)] self-center">{zoom}%</span>
            </div>
            <div className="p-4" style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top left', transition: 'transform 0.2s ease-out' }}>
              <MermaidDiagram chart={mermaidCode} />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-[var(--muted-foreground)] gap-4">
            <Sparkles className="h-10 w-10 text-amber-400/30" />
            <p className="text-sm">点击上方按钮，AI 自动生成调用流程图</p>
            <p className="text-xs text-[var(--muted-foreground)]/60">需要配置 DeepSeek API Key（右上角齿轮）</p>
          </div>
        )}
      </div>
    </div>
  )
}
