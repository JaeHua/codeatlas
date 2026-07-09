'use client'

import { useMemo, useCallback, useState, useEffect } from 'react'
import { useStore } from '@/app/store'
import {
  ReactFlow, Background, Controls, useNodesState, useEdgesState,
  type Node, type Edge, MarkerType, Handle, Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { cn } from '@/lib/utils'
import { X, Star, Loader2, Sparkles } from 'lucide-react'

// ───── Nodes ─────

function FuncNode({ data }: { data: any }) {
  return (
    <div className="relative group">
      <Handle type="target" position={Position.Top} style={{ background: '#22c55e', width: 6, height: 6 }} />
      <div className={cn('rounded-lg px-3 py-2 text-center min-w-[110px] transition-all duration-300 border hover:scale-105 cursor-pointer',
        data.isEntry ? 'bg-[#1e3a5f] border-[#f59e0b] ring-1 ring-[#f59e0b]/30' : 'bg-[#0f2a1a] border-[#22c55e]'
      )}>
        <div className="text-[11px] font-semibold text-white font-mono">{data.label}</div>
        {data.desc && <div className="text-[9px] text-blue-200/60 mt-0.5 max-w-[110px] line-clamp-1">{data.desc}</div>}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#22c55e', width: 6, height: 6 }} />
    </div>
  )
}

function RootNode({ data }: { data: any }) {
  return (
    <div className="relative">
      <Handle type="source" position={Position.Right} style={{ background: '#f59e0b', width: 8, height: 8 }} />
      <div className="bg-[#1e3a5f] border-2 border-[#f59e0b] rounded-xl px-5 py-3 text-center shadow-lg shadow-amber-500/10 ring-1 ring-[#f59e0b]/30 min-w-[140px]">
        <div className="text-xs font-bold text-amber-200 font-mono">{data.label}</div>
      </div>
    </div>
  )
}

const nodeTypes = { func: FuncNode, root: RootNode }

// ───── Summary Panel ─────

function FuncSummary({ funcName, symbols, calls, onClose }: { funcName: string; symbols: any[]; calls: any[]; onClose: () => void }) {
  const sym = symbols.find((s) => s.name === funcName && s.kind === 'function')
  const callees = [...new Set(calls.filter((c) => c.caller === funcName).map((c) => c.callee))].slice(0, 8)
  const callers = [...new Set(calls.filter((c) => c.callee === funcName).map((c) => c.caller))].slice(0, 5)

  return (
    <div className="absolute top-2 right-2 z-20 w-72 bg-[var(--card)]/98 backdrop-blur-xl rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden animate-scale-in">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2"><Star className="h-3.5 w-3.5 text-amber-400" /><span className="text-xs font-semibold text-[var(--foreground)] font-mono">{funcName}</span></div>
        <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="p-3 space-y-3 max-h-[50vh] overflow-auto text-xs">
        <div>
          <div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase mb-1">签名</div>
          <code className="text-[11px] text-[var(--foreground)]">{sym?.signature || funcName + '()'}</code>
          {sym?.file && <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{sym.file}:{sym.line}</div>}
        </div>
        {callers.length > 0 && <div><div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase mb-1">被谁调用</div><div className="flex flex-wrap gap-1">{callers.map((c) => <code key={c} className="text-[10px] bg-[var(--muted)] px-1.5 py-0.5 rounded text-[var(--foreground)]">{c}</code>)}</div></div>}
        {callees.length > 0 && <div><div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase mb-1">调用</div><div className="flex flex-wrap gap-1">{callees.map((c) => <code key={c} className="text-[10px] bg-[var(--muted)] px-1.5 py-0.5 rounded text-[var(--foreground)]">{c}</code>)}</div></div>}
      </div>
    </div>
  )
}

// ───── Main ─────

export function FileGraph() {
  const { selectedFile, symbols, calls, selectFile, setSelectedEntity } = useStore()
  const [selectedFunc, setSelectedFunc] = useState<string | null>(null)
  const [expandedFuncs, setExpandedFuncs] = useState<Set<string>>(new Set())
  const [aiFlow, setAiFlow] = useState<any>(null)
  const [aiLoading, setAiLoading] = useState(false)

  const fetchAIFlow = async () => {
    if (!selectedFile || !projectId) return
    const s = JSON.parse(localStorage.getItem('codeatlas-settings') || '{}')
    if (!s?.state?.apiKey) return
    setAiLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-callflow`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: selectedFile, apiKey: s.state.apiKey, baseUrl: s.state.baseUrl || 'https://api.deepseek.com', model: s.state.model || 'deepseek-chat' }),
      })
      if (res.ok) setAiFlow(await res.json())
    } catch {}
    setAiLoading(false)
  }

  useEffect(() => {
    if (selectedFile) {
      const funcs = symbols.filter((s) => s.file === selectedFile && s.kind === 'function')
      setExpandedFuncs(new Set(funcs.filter((f) => calls.some((c) => c.caller === f.name)).map((f) => f.name)))
    }
    setSelectedFunc(null)
  }, [selectedFile, symbols, calls])

  const { nodes, edges } = useMemo(() => {
    if (!selectedFile) return { nodes: [], edges: [] }

    const fileSymbols = symbols.filter((s) => s.file === selectedFile)
    const funcs = fileSymbols.filter((s) => s.kind === 'function')
    const funcNames = new Set(funcs.map((s) => s.name))
    const ns: Node[] = []
    const es: Edge[] = []

    // Root node
    const shortName = selectedFile.split('/').pop() || selectedFile
    ns.push({ id: 'file-root', type: 'root', position: { x: 30, y: 200 }, data: { label: shortName } })

    // Functions — laid out vertically
    const fCount = funcs.length
    funcs.forEach((f, i) => {
      ns.push({ id: f.name, type: 'func', position: { x: 220, y: 20 + i * 65 }, data: { label: f.name, desc: f.description } })
      es.push({ id: `r-${f.name}`, source: 'file-root', target: f.name, style: { stroke: '#22c55e', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#22c55e', width: 12, height: 12 }, type: 'smoothstep' })
    })

    // Expanded nodes → show their callees
    let yOffset = Math.max(fCount * 65 + 20, 100)
    const expanded = [...expandedFuncs]
    expanded.forEach((nodeId) => {
      const funcName = nodeId.startsWith('callee-') ? nodeId.split('-').slice(2).join('-') : nodeId
      const callees = [...new Set(calls.filter((c) => c.caller === funcName).map((c) => c.callee))].slice(0, 6)
      if (callees.length === 0) return

      const parent = ns.find((n) => n.id === nodeId)
      const px = parent?.position.x || 220
      const level = Math.round((px - 30) / 200) + 1
      const x = 30 + level * 200

      callees.forEach((callee, ci) => {
        const id = `callee-${funcName}-${callee}`
        ns.push({ id, type: 'func', position: { x, y: yOffset + ci * 55 }, data: { label: callee } })
        es.push({ id: `tc-${funcName}-${callee}`, source: nodeId, target: id, style: { stroke: '#d97706', strokeWidth: 1, strokeDasharray: '4 3' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#d97706', width: 10, height: 10 }, type: 'smoothstep' })
      })
      yOffset += callees.length * 55 + 30
    })

    return { nodes: ns, edges: es }
  }, [selectedFile, symbols, calls, expandedFuncs])

  const displayNodes = nodes
  const displayEdges = edges

  const [, , onNodesChange] = useNodesState(displayNodes)
  const [, , onEdgesChange] = useEdgesState(displayEdges)

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id === 'file-root') return
    if (node.id.startsWith('callee-')) {
      setExpandedFuncs((prev) => {
        const next = new Set(prev)
        if (next.has(node.id)) next.delete(node.id)
        else next.add(node.id)
        return next
      })
      return
    }
    // Toggle expansion for file functions
    setSelectedFunc(node.id)
    setExpandedFuncs((prev) => {
      const next = new Set(prev)
      if (next.has(node.id)) next.delete(node.id)
      else next.add(node.id)
      return next
    })
  }, [])

  if (!selectedFile) {
    return <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm">选择左侧文件查看调用树</div>
  }
  if (nodes.length === 0) {
    return <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] text-sm gap-2"><p>该文件暂无解析数据</p><p className="text-xs">请确认项目解析状态为「已解析」</p></div>
  }

  return (
    <div className="h-full relative">
      {selectedFunc && (
        <FuncSummary funcName={selectedFunc} symbols={symbols} calls={calls} onClose={() => setSelectedFunc(null)} />
      )}

      {/* AI generate button */}
      <div className="absolute top-2 right-2 z-10">
        <button onClick={fetchAIFlow} disabled={aiLoading}
          className="px-2.5 py-1 rounded text-[10px] border border-[var(--border)] bg-[var(--card)]/90 hover:bg-[var(--accent)] transition-all duration-200 flex items-center gap-1">
          {aiLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3 text-amber-400" />}
          AI 生成调用图
        </button>
      </div>

      {/* AI flow result */}
      {aiFlow?.fileSummary && (
        <div className="absolute top-10 right-2 z-10 max-w-xs bg-[var(--card)]/98 backdrop-blur-xl rounded-xl border border-[var(--border)] shadow-2xl p-3 text-xs">
          <p className="text-[var(--foreground)] leading-relaxed">{aiFlow.fileSummary}</p>
        </div>
      )}

      <div className="absolute bottom-2 left-2 z-10 bg-[var(--card)]/95 rounded-lg p-2 border border-[var(--border)] flex gap-3 text-[9px]">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#1e3a5f] border border-[#f59e0b]" />文件</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#0f2a1a] border border-[#22c55e]" />函数</span>
        <span className="flex items-center gap-1"><span className="w-3 border-t border-dashed border-amber-500" />调用</span>
        <span className="flex items-center gap-1">点击展开/折叠</span>
      </div>

      <ReactFlow
        nodes={displayNodes} edges={displayEdges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3} maxZoom={1.5}
      >
        <Background color="var(--border)" gap={20} />
        <Controls className="[&>button]:bg-[var(--muted)] [&>button]:border-[var(--border)] [&>button]:text-[var(--foreground)]" />
      </ReactFlow>
    </div>
  )
}
