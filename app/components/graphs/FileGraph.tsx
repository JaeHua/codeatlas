'use client'

import { useState, useEffect, useRef } from 'react'
import { useStore } from '@/app/store'
import { MermaidDiagram } from '@/app/components/ai-panel/MermaidDiagram'
import { Loader2, Sparkles, RefreshCw } from 'lucide-react'

// Cache generated diagrams per file path
const flowCache = new Map<string, string>()

export function FileGraph() {
  const { selectedFile, symbols, calls, projectId } = useStore()
  const [mermaidCode, setMermaidCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [desc, setDesc] = useState('')

  // Load cached or clear when file changes
  useEffect(() => {
    if (!selectedFile) { setMermaidCode(null); setDesc(''); return }
    const cached = flowCache.get(selectedFile)
    setMermaidCode(cached || null)
    setDesc('')
    setLoading(false)
  }, [selectedFile])

  const generateCallFlow = async () => {
    if (!selectedFile || !projectId) return
    const s = JSON.parse(localStorage.getItem('codeatlas-settings') || '{}')
    if (!s?.state?.apiKey) return
    setLoading(true)

    const fileSymbols = symbols.filter((f: any) => f.file === selectedFile)
    const funcs = fileSymbols.filter((f: any) => f.kind === 'function')
    const funcNames = new Set(funcs.map((f: any) => f.name))
    const relevantCalls = calls.filter((c: any) => funcNames.has(c.caller) || funcNames.has(c.callee))

    const prompt = `你是一个 Linux 内核源码分析专家。请为以下源文件生成一个**详尽、专业**的函数调用流程图（Mermaid graph TD 格式）。

文件: ${selectedFile}

函数列表:
${funcs.map((f: any) => `- ${f.name}: ${f.signature || ''}`).join('\n')}

完整调用关系:
${JSON.stringify(relevantCalls.slice(0, 100))}

要求:
1. 使用 graph TD 格式
2. 节点必须包含：中文功能描述 + 函数名 + 所在文件路径，用 <br/> 换行
3. 重要的入口函数节点用星号前缀标注: ★
4. 使用丰富的 box 节点（方括号），不要用简单的圆括号
5. 按实际调用层次从上到下排列，父节点在上，子节点在下
6. 用有意义的节点 ID（英文），用 --> 连接
7. 节点内容要详细，包含：功能说明、参数说明（如有）、返回值说明（如有）
8. 如果函数在某个特定条件下才调用，在连接线上标注条件
9. 生成至少 10-30 个节点，覆盖完整的调用链
10. 只输出 Mermaid 代码，不要任何解释文字，不要 markdown 代码块标记`

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

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 text-[var(--muted-foreground)] gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
            <p className="text-sm">AI 正在分析函数调用关系...</p>
            <p className="text-xs text-[var(--muted-foreground)]/60">预计 5-20 秒</p>
          </div>
        ) : desc ? (
          <div className="flex items-center justify-center h-48 text-[var(--muted-foreground)] text-sm">{desc}</div>
        ) : mermaidCode ? (
          <div className="p-4">
            <MermaidDiagram chart={mermaidCode} />
          </div>
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
