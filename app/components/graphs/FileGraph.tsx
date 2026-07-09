'use client'

import { useState, useEffect } from 'react'
import { useStore } from '@/app/store'
import { MermaidDiagram } from '@/app/components/ai-panel/MermaidDiagram'
import { Loader2, Sparkles, RefreshCw } from 'lucide-react'

export function FileGraph() {
  const { selectedFile, symbols, calls, selectFile, setSelectedEntity, projectId } = useStore()
  const [mermaidCode, setMermaidCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [desc, setDesc] = useState('')

  useEffect(() => { setMermaidCode(null); setDesc('') }, [selectedFile])

  const generateCallFlow = async () => {
    if (!selectedFile || !projectId) return
    const s = JSON.parse(localStorage.getItem('codeatlas-settings') || '{}')
    if (!s?.state?.apiKey) return
    setLoading(true)

    const fileSymbols = symbols.filter((f: any) => f.file === selectedFile)
    const funcs = fileSymbols.filter((f: any) => f.kind === 'function')
    const funcNames = new Set(funcs.map((f: any) => f.name))
    const relevantCalls = calls.filter((c: any) => funcNames.has(c.caller) || funcNames.has(c.callee))

    const prompt = `你是一个 Linux 内核源码分析专家，专门为开发者生成可视化的函数调用流程图。

请分析以下源文件的函数调用关系，生成一个 **Mermaid flowchart 格式**的调用流程图（graph TD）。

文件: ${selectedFile}

函数列表:
${funcs.map((f: any) => `- ${f.name}: ${f.signature || '(无签名)'}`).join('\n')}

调用关系:
${relevantCalls.slice(0, 80).map((c: any) => `${c.caller} → ${c.callee}`).join(', ')}

要求:
1. 用 graph TD 格式
2. 节点用中文描述功能（括号内标注函数名和所在文件）
3. 用 --> 表示调用关系
4. 重要的入口函数用 ★ 标记
5. 按调用层次从上到下排列
6. 添加简洁的注释说明每个节点的作用
7. 只输出 Mermaid 代码，不要 markdown 代码块标记`

    try {
      const res = await fetch(`${s.state.baseUrl || 'https://api.deepseek.com'}/v1/chat/completions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.state.apiKey}` },
        body: JSON.stringify({ model: s.state.model || 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 3000 }),
      })
      const data = await res.json()
      let text = data.choices?.[0]?.message?.content || ''
      text = text.replace(/```mermaid|```/g, '').trim()
      if (!text.startsWith('graph')) text = 'graph TD\n' + text
      setMermaidCode(text)
      setDesc('')
    } catch (e) {
      setMermaidCode(null)
      setDesc('生成失败: ' + String(e))
    }
    setLoading(false)
  }

  if (!selectedFile) {
    return <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm">选择文件查看调用关系</div>
  }

  return (
    <div className="h-full relative flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] bg-[var(--card)]/30">
        <span className="text-[11px] text-[var(--muted-foreground)]">
          {selectedFile.split('/').pop()} — 调用关系
        </span>
        <button onClick={generateCallFlow} disabled={loading}
          className="px-2.5 py-1 rounded text-[11px] border border-[var(--border)] bg-[var(--card)]/80 hover:bg-[var(--accent)] transition-all duration-200 flex items-center gap-1.5">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-amber-400" />}
          {mermaidCode ? '重新生成' : 'AI 生成调用流程图'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 text-[var(--muted-foreground)] gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
            <p className="text-sm">AI 正在分析函数调用关系...</p>
            <p className="text-xs text-[var(--muted-foreground)]/60">预计 5-15 秒</p>
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
            <p className="text-xs text-[var(--muted-foreground)]/60">需要配置 DeepSeek API Key</p>
          </div>
        )}
      </div>
    </div>
  )
}
