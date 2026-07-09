'use client'

import { useMemo, useCallback, useState, useEffect } from 'react'
import { useStore } from '@/app/store'
import {
  ReactFlow, Background, Controls, useNodesState, useEdgesState,
  type Node, type Edge, MarkerType, Handle, Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { cn } from '@/lib/utils'
import { X, GitBranch, Star, Box, Zap } from 'lucide-react'

// ───── Scoring ─────

function scoreImportance(funcs: any[], calls: any[], funcNames: Set<string>) {
  const map = new Map<string, any>()
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

function buildStoryline(start: string, calls: any[], depth = 0, visited = new Set<string>()): string[] {
  if (depth > 6 || visited.has(start)) return []
  visited.add(start)
  const callees = calls.filter((c) => c.caller === start).map((c) => c.callee)
  if (callees.length === 0) return [start]
  const counts = new Map<string, number>()
  callees.forEach((c) => counts.set(c, (counts.get(c) || 0) + 1))
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  return [start, ...buildStoryline(best, calls, depth + 1, visited)]
}

// ───── Nodes ─────

function EntryNode({ data }: { data: any }) {
  return (
    <div className="relative" style={{ transform: 'scale(1.25)' }}>
      <Handle type="source" position={Position.Bottom} style={{ background: '#f59e0b', width: 8, height: 8 }} />
      <div className="bg-[#1e3a5f] border-2 border-[#f59e0b] rounded-xl px-5 py-3 text-center shadow-lg shadow-amber-500/10 ring-1 ring-[#f59e0b]/30 min-w-[160px] transition-all duration-300 hover:scale-105">
        <div className="text-xs font-bold text-amber-200 font-mono">{data.label}</div>
        <div className="text-[9px] text-blue-300/60 mt-1">{data.desc || '入口函数'}</div>
      </div>
    </div>
  )
}

function FuncNode({ data }: { data: any }) {
  const opacity = 0.5 + (data.stars / 10)
  return (
    <div className="relative group transition-all duration-300 hover:scale-105">
      <Handle type="target" position={Position.Top} style={{ background: '#60a5fa', width: 5, height: 5 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: '#60a5fa', width: 5, height: 5 }} />
      <div className="bg-[#0f2a1a] border border-[#22c55e]/60 rounded-lg px-3 py-2 text-center min-w-[100px]" style={{ opacity }}>
        <div className="text-[10px] font-semibold text-green-300 font-mono">{data.label}</div>
        {data.desc && <div className="text-[8px] text-green-400/40 mt-0.5 line-clamp-1">{data.desc}</div>}
        <div className="text-[7px] mt-1 text-amber-400/60">{'★'.repeat(data.stars)}</div>
      </div>
    </div>
  )
}

function StructNode({ data }: { data: any }) {
  return (
    <div className="relative group transition-all duration-300 hover:scale-105">
      <Handle type="source" position={Position.Bottom} style={{ background: '#a855f7', width: 6, height: 6 }} />
      <div className="flex items-center justify-center bg-[#581c87] border-2 border-[#a855f7] shadow-sm shadow-purple-500/10"
        style={{ width: 48, height: 40, clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' }}>
        <span className="text-[8px] font-bold text-white font-mono">{data.label}</span>
      </div>
    </div>
  )
}

function ExtFuncNode({ data }: { data: any }) {
  return (
    <div className="bg-[#1e293b]/60 border border-[#475569]/40 rounded-lg px-2 py-1 text-center min-w-[90px]">
      <Handle type="target" position={Position.Top} style={{ background: '#64748b', width: 4, height: 4 }} />
      <div className="text-[9px] text-slate-400 font-mono">{data.label}</div>
      {data.file && <div className="text-[7px] text-slate-600">{data.file.split('/').pop()}</div>}
    </div>
  )
}

function StoryFuncNode({ data }: { data: any }) {
  return (
    <div className={cn('rounded-lg px-3 py-2 text-center min-w-[140px] transition-all duration-300',
      data.step === 0 ? 'bg-[#1e3a5f] border-2 border-[#f59e0b] ring-1 ring-[#f59e0b]/30' : 'bg-[#0f2a1a] border border-[#22c55e]/50'
    )}>
      <Handle type="target" position={Position.Top} style={{ background: data.step === 0 ? '#f59e0b' : '#60a5fa', width: 6, height: 6 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: data.step === 0 ? '#f59e0b' : '#60a5fa', width: 6, height: 6 }} />
      <div className="text-[10px] font-bold font-mono" style={{ color: data.step === 0 ? '#fbbf24' : '#4ade80' }}>{data.label}</div>
      <div className="text-[8px] text-slate-500 mt-0.5">{data.step === 0 ? '入口' : `Step ${data.step + 1}`}</div>
    </div>
  )
}

const nodeTypes = { entry: EntryNode, func: FuncNode, struct: StructNode, extFunc: ExtFuncNode, storyline: StoryFuncNode }

// ───── Summary Panel ─────

function FuncSummary({ funcName, symbols, calls, onClose, selectFile }: { funcName: string; symbols: any[]; calls: any[]; onClose: () => void; selectFile: (f: string) => void }) {
  const sym = symbols.find((s) => s.name === funcName && s.kind === 'function')
  const callees = [...new Set(calls.filter((c) => c.caller === funcName).map((c) => c.callee))].slice(0, 10)
  const callers = [...new Set(calls.filter((c) => c.callee === funcName).map((c) => c.caller))].slice(0, 10)
  const fileStructs = symbols.filter((s) => s.file === sym?.file && s.kind === 'struct').map((s) => s.name)

  // Group callees by file
  const calleeMap = new Map<string, string[]>()
  calls.filter((c) => c.caller === funcName).forEach((c) => {
    const file = symbols.find((s) => s.name === c.callee)?.file || c.callee_file
    if (file && file !== sym?.file) {
      if (!calleeMap.has(file)) calleeMap.set(file, [])
      calleeMap.get(file)!.push(c.callee)
    }
  })

  const callerMap = new Map<string, string[]>()
  calls.filter((c) => c.callee === funcName).forEach((c) => {
    const file = symbols.find((s) => s.name === c.caller)?.file || c.caller_file
    if (file && file !== sym?.file) {
      if (!callerMap.has(file)) callerMap.set(file, [])
      callerMap.get(file)!.push(c.caller)
    }
  })

  return (
    <div className="absolute top-2 right-2 z-20 w-80 bg-[var(--card)]/98 backdrop-blur-xl rounded-xl border border-[var(--border)] shadow-2xl overflow-hidden animate-scale-in">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border)]">
        <div className="flex items-center gap-2"><Star className="h-3.5 w-3.5 text-amber-400" /><span className="text-xs font-semibold text-[var(--foreground)] font-mono">{funcName}</span></div>
        <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="p-3 space-y-3 max-h-[55vh] overflow-auto text-xs">
        <div><div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase mb-1">签名</div>
          <code className="text-[11px] text-[var(--foreground)]">{sym?.signature || funcName + '()'}</code>
          {sym?.file && <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">{sym.file}:{sym.line}</div>}
        </div>
        {sym?.description && <div><div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase mb-1">角色</div><p className="text-[var(--foreground)] leading-relaxed">{sym.description}</p></div>}

        {/* Cross-file callers */}
        {callerMap.size > 0 && <div>
          <div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase mb-1">外部调用者</div>
          {[...callerMap.entries()].slice(0, 6).map(([file, funcs]) => (
            <div key={file} className="mb-1">
              <button onClick={() => selectFile(file)} className="text-[10px] text-blue-400 hover:underline truncate block">{file.split('/').pop()}</button>
              <div className="flex flex-wrap gap-1 ml-2">{funcs.slice(0, 4).map((f) => <code key={f} className="text-[10px] bg-[var(--muted)] px-1 rounded text-[var(--foreground)]">{f}</code>)}</div>
            </div>
          ))}
        </div>}

        {/* Cross-file callees */}
        {calleeMap.size > 0 && <div>
          <div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase mb-1">调用的外部函数</div>
          {[...calleeMap.entries()].slice(0, 6).map(([file, funcs]) => (
            <div key={file} className="mb-1">
              <button onClick={() => selectFile(file)} className="text-[10px] text-green-400 hover:underline truncate block">{file.split('/').pop()}</button>
              <div className="flex flex-wrap gap-1 ml-2">{funcs.slice(0, 4).map((f) => <code key={f} className="text-[10px] bg-[var(--muted)] px-1 rounded text-[var(--foreground)]">{f}</code>)}</div>
            </div>
          ))}
        </div>}

        {fileStructs.length > 0 && <div><div className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase mb-1">关联结构体</div><div className="flex flex-wrap gap-1">{fileStructs.map((s) => <code key={s} className="text-[10px] bg-[var(--muted)] px-1.5 py-0.5 rounded text-purple-300">{s}</code>)}</div></div>}
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
  const [treeMode, setTreeMode] = useState(false)
  const [expandedFuncs, setExpandedFuncs] = useState<Set<string>>(new Set())

  useEffect(() => { setSelectedFunc(null); setStorylineFunc(null) }, [selectedFile])

  const { nodes, edges, concept } = useMemo(() => {
    if (!selectedFile) return { nodes: [], edges: [], concept: '' }

    const fileSymbols = symbols.filter((s) => s.file === selectedFile)
    const funcs = fileSymbols.filter((s) => s.kind === 'function')
    const fileStructs = fileSymbols.filter((s) => s.kind === 'struct')
    const funcNames = new Set(funcs.map((s) => s.name))
    const importance = scoreImportance(funcs, calls, funcNames)

    // Concept — file name heuristic
    const fileName = selectedFile.split('/').pop()?.replace(/\.\w+$/, '') || selectedFile
    const concept = fileName.charAt(0).toUpperCase() + fileName.slice(1)

    // Storyline
    if (storylineMode && storylineFunc) {
      const story = buildStoryline(storylineFunc, calls)
      if (story.length === 0) return { nodes: [], edges: [], concept }
      const sns: Node[] = []
      const ses: Edge[] = []
      story.forEach((name, i) => {
        sns.push({ id: `s-${name}`, type: 'storyline', position: { x: 300, y: 60 + i * 100 }, data: { label: name, step: i } })
        if (i > 0) ses.push({ id: `se-${i}`, source: `s-${story[i - 1]}`, target: `s-${name}`, style: { stroke: '#f59e0b', strokeWidth: 2.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b', width: 16, height: 16 }, type: 'smoothstep' })
      })
      return { nodes: sns, edges: ses, concept }
    }

    // Tree mode — horizontal call tree from file root
    if (treeMode) {
      const tn: Node[] = []
      const te: Edge[] = []

      // File root node
      const shortName = selectedFile.split('/').pop() || selectedFile
      tn.push({ id: 'file-root', type: 'func', position: { x: 40, y: 300 }, data: { label: shortName, stars: 5, isEntry: true } })

      // Functions in file (level 1)
      funcs.forEach((f, i) => {
        tn.push({ id: f.name, type: 'func', position: { x: 220, y: 30 + i * 70 }, data: { label: f.name, stars: importance.get(f.name)?.stars || 3, isEntry: importance.get(f.name)?.isEntry || false } })
        te.push({ id: `root-${f.name}`, source: 'file-root', target: f.name, style: { stroke: '#22c55e', strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#22c55e', width: 12, height: 12 }, type: 'smoothstep' })
      })

      // Collect all expanded nodes and their callees, stacked vertically
      let yOffset = 30
      const expanded = [...expandedFuncs]
      expanded.forEach((nodeId) => {
        // Extract the actual function name from the node ID
        const funcName = nodeId.startsWith('callee-') ? nodeId.split('-').slice(2).join('-') : nodeId
        const callees = [...new Set(calls.filter((c) => c.caller === funcName).map((c) => c.callee))].slice(0, 6)
        if (callees.length === 0) return

        // Determine level based on whether this is a file function or a callee
        const parentNode = tn.find((n) => n.id === nodeId)
        const parentX = parentNode?.position.x || 220
        const level = Math.round((parentX - 40) / 200) + 1
        const x = 40 + level * 200

        callees.forEach((callee, ci) => {
          const id = `callee-${funcName}-${callee}`
          tn.push({ id, type: 'func', position: { x, y: yOffset + ci * 55 }, data: { label: callee, stars: 2, isEntry: false } })
          te.push({ id: `tc-${funcName}-${callee}`, source: nodeId, target: id, style: { stroke: '#d97706', strokeWidth: 1, strokeDasharray: '4 3' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#d97706', width: 10, height: 10 }, type: 'smoothstep' })
        })
        yOffset += callees.length * 55 + 20
      })

      return { nodes: tn, edges: te, concept }
    }

    const minStars = showAll ? 1 : 3
    const importantFuncs = funcs.filter((f) => (importance.get(f.name)?.stars || 1) >= minStars)
    const hiddenCount = funcs.length - importantFuncs.length
    const ns: Node[] = []
    const es: Edge[] = []

    // Separate entry functions (top) from internal functions (below)
    const entries = importantFuncs.filter((f) => importance.get(f.name)?.isEntry)
    const internal = importantFuncs.filter((f) => !importance.get(f.name)?.isEntry)

    // Layout: concept title at top, then entries, then internals, then structs on right
    let y = 70

    // Entry functions — large and prominent
    entries.forEach((f, i) => {
      const imp = importance.get(f.name)!
      ns.push({ id: f.name, type: 'entry', position: { x: 80 + i * 210, y }, data: { label: f.name, desc: f.description, stars: imp.stars } })
    })
    if (entries.length > 0) y += 140

    // Internal functions
    internal.forEach((f, i) => {
      const imp = importance.get(f.name)!
      const col = Math.floor(i / 6)
      const row = i % 6
      ns.push({ id: f.name, type: 'func', position: { x: 40 + col * 180, y: y + row * 55 }, data: { label: f.name, desc: f.description, stars: imp.stars } })
    })
    if (internal.length > 0) y += Math.min(internal.length, 6) * 55 + 30

    // Hidden indicator
    if (hiddenCount > 0) {
      ns.push({ id: 'more', type: 'func', position: { x: 40, y }, data: { label: `+${hiddenCount} 辅助`, desc: '点击展开', stars: 1 } })
      y += 60
    }

    // Structs — right side column
    fileStructs.forEach((s, i) => {
      ns.push({ id: `struct-${s.name}`, type: 'struct', position: { x: 600, y: 70 + i * 70 }, data: { label: s.name, desc: s.description } })
    })

    // Edges between important functions
    const internalCalls = calls.filter((c) => funcNames.has(c.caller) && funcNames.has(c.callee))
    internalCalls.forEach((c) => {
      if ((importance.get(c.caller)?.stars || 1) >= minStars && (importance.get(c.callee)?.stars || 1) >= minStars) {
        es.push({ id: `call:${c.caller}->${c.callee}`, source: c.caller, target: c.callee, style: { stroke: '#22c55e', strokeWidth: 1 }, type: 'smoothstep' })
      }
    })

    // Entry → struct connections
    entries.forEach((f) => {
      fileStructs.forEach((s) => {
        if (f.description?.includes(s.name) || calls.some((c: any) => (c.caller === f.name || c.callee === f.name) && c.callee?.includes?.(s.name))) {
          es.push({ id: `es:${f.name}→${s.name}`, source: f.name, target: `struct-${s.name}`, style: { stroke: '#a855f7', strokeWidth: 0.5, strokeDasharray: '3 3' }, type: 'smoothstep' })
        }
      })
    })

    return { nodes: ns, edges: es, concept }
  }, [selectedFile, symbols, calls, showAll, storylineMode, storylineFunc, treeMode, expandedFuncs])

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
    if (node.id === 'file-root') return
    if (node.id.startsWith('s-')) {
      const name = node.id.slice(2)
      setSelectedEntity({ type: 'function', path: selectedFile || '', name })
      selectFile(selectedFile || '')
      return
    }
    if (node.id.startsWith('struct-')) {
      const name = node.id.slice(7)
      setSelectedEntity({ type: 'function', path: selectedFile || '', name })
      return
    }
    if (node.id.startsWith('callee-')) {
      // In tree mode, clicking a callee node also toggles its expansion
      if (treeMode) {
        setExpandedFuncs((prev) => {
          const next = new Set(prev)
          if (next.has(node.id)) next.delete(node.id)
          else next.add(node.id)
          return next
        })
      }
      return
    }

    // Tree mode: toggle function expansion to show callees
    if (treeMode) {
      setExpandedFuncs((prev) => {
        const next = new Set(prev)
        if (next.has(node.id)) next.delete(node.id)
        else next.add(node.id)
        return next
      })
      return
    }

    const d = node.data as any
    if (d.label) setSelectedFunc(d.label)
    setFocusNode((prev) => prev === node.id ? null : node.id)
  }, [selectFile, setSelectedEntity, selectedFile, treeMode])

  const funcs = symbols.filter((s) => s.file === selectedFile && s.kind === 'function')
  const importance = scoreImportance(funcs, calls, new Set(funcs.map((s) => s.name)))
  const topCount = funcs.filter((f) => (importance.get(f.name)?.stars || 1) >= 3).length
  const entryCount = funcs.filter((f) => importance.get(f.name)?.isEntry).length

  if (!selectedFile) return <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm">选择左侧文件查看结构图谱</div>
  if (nodes.length === 0 && !storylineMode) return <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] text-sm gap-2"><p>该文件暂无解析数据</p><p className="text-xs">请确认项目解析状态为「已解析」</p></div>

  return (
    <div className="h-full relative">
      {/* Concept title */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10">
        <div className="bg-[var(--card)]/90 backdrop-blur rounded-lg px-4 py-1.5 border border-[var(--border)] text-xs font-semibold text-[var(--foreground)] shadow-fabric">
          {concept}
        </div>
      </div>

      {/* Toolbar */}
      <div className="absolute top-2 left-2 z-10 flex gap-2">
        <button onClick={() => setShowAll(!showAll)}
          className={cn('px-2.5 py-1 rounded text-[10px] border transition-all duration-200',
            showAll ? 'bg-blue-600/20 border-blue-800/50 text-blue-300' : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)]/50'
          )}>
          {showAll ? `全部(${funcs.length})` : `核心(${topCount}/${funcs.length})`}
        </button>
        <button onClick={() => { setStorylineMode(!storylineMode); setStorylineFunc(storylineFunc || funcs.find((f) => importance.get(f.name)?.isEntry)?.name || funcs[0]?.name); setSelectedFunc(null) }}
          className={cn('px-2.5 py-1 rounded text-[10px] border transition-all duration-200',
            storylineMode ? 'bg-green-600/20 border-green-800/50 text-green-300' : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)]/50'
          )}>
          <GitBranch className="h-3 w-3 inline mr-1" />故事线
        </button>
        <button onClick={() => { setTreeMode(!treeMode); setStorylineMode(false); setExpandedFuncs(new Set()) }}
          className={cn('px-2.5 py-1 rounded text-[10px] border transition-all duration-200',
            treeMode ? 'bg-amber-600/20 border-amber-800/50 text-amber-300' : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)]/50'
          )}>
          🌲 调用树
        </button>
      </div>

      {/* Storyline info */}
      {storylineMode && storylineFunc && (
        <div className="absolute top-2 right-2 z-10 bg-[var(--card)]/95 rounded-lg px-3 py-1.5 border border-green-800/50 text-xs">
          <span className="text-green-400 font-mono">{storylineFunc}</span>
          <button onClick={() => { setStorylineMode(false); setStorylineFunc(null) }} className="ml-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-[10px]">✕</button>
        </div>
      )}

      {/* Focus */}
      {focusNode && (
        <div className="absolute top-2 right-2 z-10 bg-[var(--card)]/95 rounded-lg px-3 py-1.5 border border-blue-800/50 text-xs">
          <span className="text-[var(--muted-foreground)]">聚焦 </span>
          <span className="text-blue-400 font-mono">{focusNode}</span>
          <button onClick={() => setFocusNode(null)} className="ml-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-[10px]">✕</button>
        </div>
      )}

      {/* Summary panel */}
      {selectedFunc && (
        <FuncSummary funcName={selectedFunc} symbols={symbols} calls={calls} onClose={() => setSelectedFunc(null)} selectFile={selectFile} />
      )}

      {/* Legend */}
      <div className="absolute bottom-2 left-2 z-10 bg-[var(--card)]/95 rounded-lg p-2 border border-[var(--border)] flex gap-3 text-[9px]">
        <span className="flex items-center gap-1"><Zap className="h-3 w-3 text-amber-400" />入口({entryCount})</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#0f2a1a] border border-[#22c55e]" />函数</span>
        <span className="flex items-center gap-1"><Box className="h-3 w-3 text-purple-400" />结构体</span>
        <span className="flex items-center gap-1">⭐重要性</span>
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
