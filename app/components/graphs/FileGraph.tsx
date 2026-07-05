'use client'

import { useMemo, useCallback, useState, useEffect } from 'react'
import { useStore } from '@/app/store'
import {
  ReactFlow, Background, Controls, useNodesState, useEdgesState,
  type Node, type Edge, MarkerType, Handle, Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { cn } from '@/lib/utils'
import { X, GitBranch, ArrowDown, Star, Loader2 } from 'lucide-react'

// ───── Importance scoring ─────

function scoreImportance(funcs: any[], calls: any[], funcNames: Set<string>) {
  const map = new Map<string, { score: number; stars: number; callCount: number; isEntry: boolean }>()
  const callCount = new Map<string, number>()
  const internal = calls.filter((c) => funcNames.has(c.caller) && funcNames.has(c.callee))
  internal.forEach((c) => {
    callCount.set(c.callee, (callCount.get(c.callee) || 0) + 1)
    callCount.set(c.caller, (callCount.get(c.caller) || 0) + 1)
  })
  const entries = new Set(calls.filter((c) => funcNames.has(c.callee) && !funcNames.has(c.caller)).map((c) => c.callee))
  for (const f of funcs) {
    const c = callCount.get(f.name) || 0
    const e = entries.has(f.name)
    const s = c + (e ? 10 : 0)
    const stars = s > 20 ? 5 : s > 10 ? 4 : s > 5 ? 3 : s > 1 ? 2 : 1
    map.set(f.name, { score: s, stars, callCount: c, isEntry: e })
  }
  return map
}

// Build a storyline (deepest call path from a function)
function buildStoryline(startFunc: string, calls: any[], depth: number = 0, visited = new Set<string>()): string[] {
  if (depth > 6 || visited.has(startFunc)) return []
  visited.add(startFunc)
  const callees = calls.filter((c) => c.caller === startFunc).map((c) => c.callee)
  if (callees.length === 0) return [startFunc]
  // Follow the most-called callee
  const counts = new Map<string, number>()
  callees.forEach((c) => counts.set(c, (counts.get(c) || 0) + 1))
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  return [startFunc, ...buildStoryline(best, calls, depth + 1, visited)]
}

// ───── Nodes ─────

function FuncNode({ data }: { data: any }) {
  return (
    <div className="relative group">
      <Handle type="target" position={Position.Top} style={{ background: data.isEntry ? '#f59e0b' : '#60a5fa', width: 6, height: 6 }} />
      <div className={cn('rounded-lg px-3 py-2 text-center min-w-[110px] transition-all duration-300 border hover:scale-105',
        data.isEntry ? 'bg-[#1e3a5f] border-[#f59e0b] ring-1 ring-[#f59e0b]/30' : 'bg-[#0f2a1a] border-[#22c55e]'
      )}>
        <div className="text-[11px] font-semibold text-white font-mono">{data.label}</div>
        {data.desc && <div className="text-[9px] text-blue-200/60 mt-0.5 max-w-[110px] line-clamp-1">{data.desc}</div>}
        <div className="text-[8px] mt-1 text-amber-400">{'★'.repeat(data.stars)}{'☆'.repeat(5 - data.stars)}</div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: data.isEntry ? '#f59e0b' : '#60a5fa', width: 6, height: 6 }} />
    </div>
  )
}

function StoryFuncNode({ data }: { data: any }) {
  return (
    <div className={cn('rounded-lg px-3 py-2 text-center min-w-[130px] transition-all duration-300 border',
      data.step === 0 ? 'bg-[#1e3a5f] border-[#f59e0b] ring-1 ring-[#f59e0b]/30' : 'bg-[#0f2a1a] border-[#22c55e]/50'
    )}>
      <Handle type="target" position={Position.Top} style={{ background: data.step === 0 ? '#f59e0b' : '#60a5fa', width: 6, height: 6 }} />
      <div className="text-[10px] font-semibold font-mono" style={{ color: data.step === 0 ? '#fbbf24' : '#4ade80' }}>{data.label}</div>
      <div className="text-[8px] text-slate-500 mt-0.5">Step {data.step + 1}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: data.step === 0 ? '#f59e0b' : '#60a5fa', width: 6, height: 6 }} />
    </div>
  )
}

const nodeTypes = { func: FuncNode, storyline: StoryFuncNode }

// ───── Summary Panel ─────

function FuncSummary({ funcName, symbols, calls, onClose }: { funcName: string; symbols: any[]; calls: any[]; onClose: () => void }) {
  const sym = symbols.find((s) => s.name === funcName && s.kind === 'function')
  const callees = [...new Set(calls.filter((c) => c.caller === funcName).map((c) => c.callee))].slice(0, 8)
  const callers = [...new Set(calls.filter((c) => c.callee === funcName).map((c) => c.caller))].slice(0, 5)
  const fileStructs = symbols.filter((s) => s.file === sym?.file && s.kind === 'struct').map((s) => s.name)

  return (
    <div className="absolute top-2 right-2 z-20 w-72 bg-[var(--card)]/98 backdrop-blur-xl rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden animate-scale-in">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Star className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-xs font-semibold text-[var(--foreground)] font-mono">{funcName}</span>
        </div>
        <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="p-3 space-y-3 max-h-[50vh] overflow-auto text-xs">
        <div>
          <div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase mb-1">签名</div>
          <code className="text-[11px] text-[var(--foreground)]">{sym?.signature || funcName + '()'}</code>
          {sym?.file && <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{sym.file}:{sym.line}</div>}
        </div>

        {sym?.description && (
          <div>
            <div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase mb-1">角色</div>
            <p className="text-[var(--foreground)] leading-relaxed">{sym.description}</p>
          </div>
        )}

        {callers.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase mb-1">被谁调用 ({callers.length})</div>
            <div className="flex flex-wrap gap-1">{callers.map((c) => <code key={c} className="text-[10px] bg-[var(--muted)] px-1.5 py-0.5 rounded text-[var(--foreground)]">{c}</code>)}</div>
          </div>
        )}

        {callees.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase mb-1">调用 ({callees.length})</div>
            <div className="flex flex-wrap gap-1">{callees.map((c) => <code key={c} className="text-[10px] bg-[var(--muted)] px-1.5 py-0.5 rounded text-[var(--foreground)]">{c}</code>)}</div>
          </div>
        )}

        {fileStructs.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase mb-1">关联结构体</div>
            <div className="flex flex-wrap gap-1">{fileStructs.map((s) => <code key={s} className="text-[10px] bg-[var(--muted)] px-1.5 py-0.5 rounded text-purple-300">{s}</code>)}</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ───── Main ─────

export function FileGraph() {
  const { selectedFile, symbols, calls, selectFile, setSelectedEntity } = useStore()
  const [showAll, setShowAll] = useState(false)
  const [storylineMode, setStorylineMode] = useState(false)
  const [storylineFunc, setStorylineFunc] = useState<string | null>(null)
  const [selectedFunc, setSelectedFunc] = useState<string | null>(null)
  const [focusNode, setFocusNode] = useState<string | null>(null)

  // AI description cache
  const [aiDesc, setAiDesc] = useState<any>(null)

  useEffect(() => { setAiDesc(null); setSelectedFunc(null); setStorylineFunc(null) }, [selectedFile])

  const { nodes, edges, storyline } = useMemo(() => {
    if (!selectedFile) return { nodes: [], edges: [], storyline: [] }

    const fileSymbols = symbols.filter((s) => s.file === selectedFile)
    const funcs = fileSymbols.filter((s) => s.kind === 'function')
    const fileStructs = fileSymbols.filter((s) => s.kind === 'struct')
    const funcNames = new Set(funcs.map((s) => s.name))
    const importance = scoreImportance(funcs, calls, funcNames)

    // Storyline: if a function is selected for storyline mode
    const story = storylineFunc ? buildStoryline(storylineFunc, calls) : []

    if (storylineMode && story.length > 0) {
      const sns: Node[] = []
      const ses: Edge[] = []
      story.forEach((name, i) => {
        sns.push({ id: `s-${name}`, type: 'storyline', position: { x: 300, y: 30 + i * 90 }, data: { label: name, step: i } })
        if (i > 0) ses.push({ id: `se-${i}`, source: `s-${story[i - 1]}`, target: `s-${name}`, style: { stroke: '#22c55e', strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#22c55e', width: 14, height: 14 }, type: 'smoothstep' })
      })
      return { nodes: sns, edges: ses, storyline: story }
    }

    const minStars = showAll ? 1 : 3
    const importantFuncs = funcs.filter((f) => (importance.get(f.name)?.stars || 1) >= minStars)
    const hiddenCount = funcs.length - importantFuncs.length

    const ns: Node[] = []
    const es: Edge[] = []

    const sorted = [...importantFuncs].sort((a, b) => {
      const ia = importance.get(a.name)!; const ib = importance.get(b.name)!
      if (ia.isEntry !== ib.isEntry) return ia.isEntry ? -1 : 1
      return ib.score - ia.score
    })

    sorted.forEach((f, i) => {
      const imp = importance.get(f.name)!
      ns.push({ id: f.name, type: 'func', position: { x: 80, y: 30 + i * 80 }, data: { label: f.name, desc: f.description, stars: imp.stars, isEntry: imp.isEntry } })
    })

    if (hiddenCount > 0) {
      ns.push({ id: 'more', type: 'func', position: { x: 80, y: 30 + sorted.length * 80 + 20 }, data: { label: `+${hiddenCount} 辅助函数`, desc: '点击展开', stars: 1, isEntry: false } })
    }

    fileStructs.forEach((s, i) => {
      ns.push({ id: `struct-${s.name}`, type: 'func', position: { x: 350, y: 30 + i * 90 }, data: { label: s.name, desc: s.description, stars: 3, isEntry: false } })
    })

    const internal = calls.filter((c) => funcNames.has(c.caller) && funcNames.has(c.callee))
    internal.forEach((c) => {
      if ((importance.get(c.caller)?.stars || 1) >= minStars && (importance.get(c.callee)?.stars || 1) >= minStars) {
        es.push({ id: `call:${c.caller}->${c.callee}`, source: c.caller, target: c.callee, style: { stroke: '#22c55e', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#22c55e', width: 12, height: 12 }, type: 'smoothstep' })
      }
    })

    return { nodes: ns, edges: es, storyline: [] }
  }, [selectedFile, symbols, calls, showAll, storylineMode, storylineFunc])

  const displayNodes = useMemo(() => {
    if (!focusNode) return nodes
    const connected = new Set([focusNode])
    for (const e of edges) { if (e.source === focusNode) connected.add(e.target); if (e.target === focusNode) connected.add(e.source) }
    return nodes.filter((n) => connected.has(n.id))
  }, [focusNode, nodes, edges])

  const displayEdges = useMemo(() => {
    if (!focusNode) return edges
    return edges.filter((e) => e.source === focusNode || e.target === focusNode)
  }, [focusNode, edges])

  const [, , onNodesChange] = useNodesState(displayNodes)
  const [, , onEdgesChange] = useEdgesState(displayEdges)

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id === 'more') { setShowAll(true); return }
    if (node.id.startsWith('s-')) {
      const name = node.id.slice(2)
      setSelectedEntity({ type: 'function', path: selectedFile || '', name })
      selectFile(selectedFile || '')
      return
    }
    const d = node.data as any
    if (d.callCount !== undefined || d.label) {
      setSelectedFunc(d.label || node.id)
    }
    setFocusNode((prev) => prev === node.id ? null : node.id)
  }, [selectFile, setSelectedEntity, selectedFile])

  const funcs = symbols.filter((s) => s.file === selectedFile && s.kind === 'function')
  const totalFuncs = funcs.length
  const importance = scoreImportance(funcs, calls, new Set(funcs.map((s) => s.name)))
  const topCount = funcs.filter((f) => (importance.get(f.name)?.stars || 1) >= 3).length

  if (!selectedFile) {
    return <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm">选择左侧文件查看结构图谱</div>
  }
  if (nodes.length === 0 && !storylineMode) {
    return <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] text-sm gap-2"><p>该文件暂无解析数据</p><p className="text-xs">请确认项目解析状态为「已解析」</p></div>
  }

  return (
    <div className="h-full relative">
      {/* Toolbar */}
      <div className="absolute top-2 left-2 z-10 flex gap-2">
        <button onClick={() => setShowAll(!showAll)}
          className={cn('px-2.5 py-1 rounded text-[10px] border transition-all duration-200',
            showAll ? 'bg-blue-600/20 border-blue-800/50 text-blue-300' : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)]/50'
          )}>
          {showAll ? `全部(${totalFuncs})` : `核心(${topCount}/${totalFuncs})`}
        </button>
        <button onClick={() => { setStorylineMode(!storylineMode); setStorylineFunc(storylineFunc || (funcs.find((f) => importance.get(f.name)?.isEntry)?.name || funcs[0]?.name)); setSelectedFunc(null) }}
          className={cn('px-2.5 py-1 rounded text-[10px] border transition-all duration-200',
            storylineMode ? 'bg-green-600/20 border-green-800/50 text-green-300' : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)]/50'
          )}>
          <GitBranch className="h-3 w-3 inline mr-1" />故事线
        </button>
      </div>

      {/* Focus indicator */}
      {focusNode && (
        <div className="absolute top-2 right-2 z-10 bg-[var(--card)]/95 rounded-lg px-3 py-1.5 border border-blue-800/50 text-xs">
          <span className="text-[var(--muted-foreground)]">聚焦 </span>
          <span className="text-blue-400 font-mono">{focusNode}</span>
          <button onClick={() => setFocusNode(null)} className="ml-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-[10px]">✕</button>
        </div>
      )}

      {/* Function summary panel */}
      {selectedFunc && !storylineMode && (
        <FuncSummary funcName={selectedFunc} symbols={symbols} calls={calls} onClose={() => setSelectedFunc(null)} />
      )}

      {/* Storyline label */}
      {storylineMode && storyline.length > 0 && (
        <div className="absolute top-2 right-2 z-10 bg-[var(--card)]/95 rounded-lg px-3 py-1.5 border border-green-800/50 text-xs">
          <span className="text-green-400 font-mono">{storylineFunc}</span>
          <span className="text-[var(--muted-foreground)] ml-2">执行路径 ({storyline.length} 步)</span>
          <button onClick={() => { setStorylineMode(false); setStorylineFunc(null) }} className="ml-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-[10px]">✕</button>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-2 left-2 z-10 bg-[var(--card)]/95 rounded-lg p-2 border border-[var(--border)] flex gap-3 text-[9px]">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#1e3a5f] border border-[#f59e0b]" />入口</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#0f2a1a] border border-[#22c55e]" />函数</span>
        <span className="flex items-center gap-1">⭐重要性</span>
        <span className="flex items-center gap-1">点击节点查看详情</span>
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
