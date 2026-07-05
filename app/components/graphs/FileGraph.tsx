'use client'

import { useMemo, useCallback, useState } from 'react'
import { useStore } from '@/app/store'
import {
  ReactFlow, Background, Controls, useNodesState, useEdgesState,
  type Node, type Edge, MarkerType, Handle, Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { cn } from '@/lib/utils'

// ───── Importance scoring ─────

function scoreImportance(
  funcs: any[], calls: any[], funcNames: Set<string>
): Map<string, { score: number; stars: number; callCount: number; isEntry: boolean }> {
  const map = new Map<string, any>()

  // Count how many times each function is called
  const callCount = new Map<string, number>()
  const internalCalls = calls.filter((c) => funcNames.has(c.caller) && funcNames.has(c.callee))
  internalCalls.forEach((c) => {
    callCount.set(c.callee, (callCount.get(c.callee) || 0) + 1)
    callCount.set(c.caller, (callCount.get(c.caller) || 0) + 1)
  })

  // Entry functions (called from outside)
  const entries = new Set(calls.filter((c) => funcNames.has(c.callee) && !funcNames.has(c.caller)).map((c) => c.callee))

  for (const f of funcs) {
    const count = callCount.get(f.name) || 0
    const isEntry = entries.has(f.name)
    // Score: entry + high calls = important
    let score = count
    if (isEntry) score += 10
    // Stars: 1-5 based on score percentile
    const stars = score > 20 ? 5 : score > 10 ? 4 : score > 5 ? 3 : score > 1 ? 2 : 1
    map.set(f.name, { score, stars, callCount: count, isEntry })
  }
  return map
}

// ───── Custom Nodes ─────

function FuncNode({ data }: { data: { label: string; desc?: string; stars: number; isEntry: boolean; callCount: number } }) {
  const starStr = '★'.repeat(data.stars) + '☆'.repeat(5 - data.stars)
  return (
    <div className="relative group">
      <Handle type="target" position={Position.Top} style={{ background: data.isEntry ? '#f59e0b' : '#60a5fa', width: 6, height: 6 }} />
      <div
        className={cn(
          'rounded-lg px-3 py-2 text-center min-w-[110px] transition-all duration-300 border',
          data.isEntry
            ? 'bg-[#1e3a5f] border-[#f59e0b] ring-1 ring-[#f59e0b]/30'
            : 'bg-[#0f2a1a] border-[#22c55e]'
        )}
      >
        <div className="text-[11px] font-semibold text-white font-mono">{data.label}</div>
        {data.desc && <div className="text-[9px] text-blue-200/70 mt-0.5 line-clamp-1">{data.desc}</div>}
        <div className="text-[8px] mt-1">{starStr}</div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: data.isEntry ? '#f59e0b' : '#60a5fa', width: 6, height: 6 }} />
    </div>
  )
}

function StructNode({ data }: { data: { label: string; desc?: string } }) {
  return (
    <div className="relative group">
      <Handle type="source" position={Position.Bottom} style={{ background: '#a855f7', width: 6, height: 6 }} />
      <div className="flex flex-col items-center transition-all duration-300 hover:scale-105">
        <div className="flex items-center justify-center bg-[#7c2d12] border-2 border-[#f59e0b] shadow-md shadow-orange-500/10"
          style={{ width: 56, height: 48, clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' }}>
          <span className="text-[9px] font-bold text-white font-mono">{data.label}</span>
        </div>
        {data.desc && <span className="text-[8px] text-orange-300/60 mt-1 max-w-[80px] text-center leading-tight">{data.desc}</span>}
      </div>
    </div>
  )
}

function ExtFuncNode({ data }: { data: { label: string; file?: string } }) {
  return (
    <div className="bg-[#1e293b] border border-[#475569] rounded-lg px-2.5 py-1.5 text-center min-w-[100px]">
      <Handle type="target" position={Position.Top} style={{ background: '#64748b', width: 4, height: 4 }} />
      <div className="text-[10px] font-mono text-slate-300">{data.label}</div>
      {data.file && <div className="text-[8px] text-slate-500">{data.file.split('/').pop()}</div>}
    </div>
  )
}

const nodeTypes = { func: FuncNode, struct: StructNode, extFunc: ExtFuncNode }

// ───── Main ─────

export function FileGraph() {
  const { selectedFile, symbols, calls, includes, selectFile, setSelectedEntity } = useStore()
  const [showAll, setShowAll] = useState(false)
  const [focusNode, setFocusNode] = useState<string | null>(null)

  const { nodes, edges } = useMemo(() => {
    if (!selectedFile) return { nodes: [], edges: [] }

    const fileSymbols = symbols.filter((s) => s.file === selectedFile)
    const funcs = fileSymbols.filter((s) => s.kind === 'function')
    const fileStructs = fileSymbols.filter((s) => s.kind === 'struct')
    const funcNames = new Set(funcs.map((s) => s.name))

    const importance = scoreImportance(funcs, calls, funcNames)
    const minStars = showAll ? 1 : 3  // Default: show only 3★+

    const importantFuncs = funcs.filter((f) => (importance.get(f.name)?.stars || 1) >= minStars)
    const hiddenFuncs = funcs.filter((f) => (importance.get(f.name)?.stars || 1) < minStars)
    const hiddenCount = hiddenFuncs.length

    const ns: Node[] = []
    const es: Edge[] = []

    // Entry functions first, then by call count
    const sorted = [...importantFuncs].sort((a, b) => {
      const ia = importance.get(a.name)!
      const ib = importance.get(b.name)!
      if (ia.isEntry !== ib.isEntry) return ia.isEntry ? -1 : 1
      return ib.score - ia.score
    })

    // Layout: vertical column
    sorted.forEach((f, i) => {
      const imp = importance.get(f.name)!
      ns.push({
        id: f.name, type: 'func',
        position: { x: 80, y: 30 + i * 80 },
        data: { label: f.name, desc: f.description, stars: imp.stars, isEntry: imp.isEntry, callCount: imp.callCount },
      })
    })

    // Structs — right column
    fileStructs.forEach((s, i) => {
      ns.push({
        id: `struct-${s.name}`, type: 'struct',
        position: { x: 350, y: 30 + i * 90 },
        data: { label: s.name, desc: s.description },
      })
    })

    // Hidden count node
    if (hiddenCount > 0) {
      ns.push({
        id: 'hidden-count', type: 'func',
        position: { x: 80, y: 30 + sorted.length * 80 + 20 },
        data: { label: `+${hiddenCount} 辅助函数`, desc: '点击「展开全部」查看', stars: 1, isEntry: false, callCount: 0 },
      })
    }

    // Internal call edges
    const internalCalls = calls.filter((c) => funcNames.has(c.caller) && funcNames.has(c.callee))
    internalCalls.forEach((c) => {
      const callerImp = importance.get(c.caller)?.stars || 1
      const calleeImp = importance.get(c.callee)?.stars || 1
      if (callerImp >= minStars && calleeImp >= minStars) {
        es.push({
          id: `call:${c.caller}->${c.callee}`,
          source: c.caller, target: c.callee,
          style: { stroke: '#22c55e', strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#22c55e', width: 12, height: 12 },
          type: 'smoothstep',
        })
      }
    })

    // External callees
    const extCalls = calls.filter((c) => funcNames.has(c.caller) && !funcNames.has(c.callee))
    const extCallees = [...new Set(extCalls.map((c) => c.callee))].slice(0, 6)
    extCallees.forEach((callee, i) => {
      const id = `ext-${callee}`
      ns.push({ id, type: 'extFunc', position: { x: 550, y: 30 + i * 55 }, data: { label: callee, file: extCalls.find((c) => c.callee === callee)?.callee_file } })
      extCalls.filter((c) => c.callee === callee).forEach((c) => {
        if ((importance.get(c.caller)?.stars || 1) >= minStars) {
          es.push({
            id: `ext:${c.caller}->${callee}`, source: c.caller, target: id,
            style: { stroke: '#d97706', strokeWidth: 1, strokeDasharray: '4 3' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#d97706', width: 10, height: 10 },
            type: 'smoothstep',
          })
        }
      })
    })

    return { nodes: ns, edges: es }
  }, [selectedFile, symbols, calls, includes, showAll])

  const displayNodes = useMemo(() => {
    if (!focusNode) return nodes
    const connected = new Set([focusNode])
    for (const e of edges) {
      if (e.source === focusNode) connected.add(e.target)
      if (e.target === focusNode) connected.add(e.source)
    }
    return nodes.filter((n) => connected.has(n.id))
  }, [focusNode, nodes, edges])

  const displayEdges = useMemo(() => {
    if (!focusNode) return edges
    return edges.filter((e) => e.source === focusNode || e.target === focusNode)
  }, [focusNode, edges])

  const [, , onNodesChange] = useNodesState(displayNodes)
  const [, , onEdgesChange] = useEdgesState(displayEdges)

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.id === 'hidden-count') { setShowAll(true); return }
    const d = node.data as any
    if (d.callCount !== undefined || d.label) {
      setSelectedEntity({ type: 'function', path: selectedFile || '', name: d.label || node.id })
      selectFile(selectedFile || '')
    }
    setFocusNode((prev) => prev === node.id ? null : node.id)
  }, [selectFile, setSelectedEntity, selectedFile])

  if (!selectedFile) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm">
        选择左侧文件查看结构图谱
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] text-sm gap-2">
        <p>该文件暂无解析数据</p>
        <p className="text-xs">请确认项目解析状态为「已解析」</p>
      </div>
    )
  }

  const funcs = symbols.filter((s) => s.file === selectedFile && s.kind === 'function')
  const totalFuncs = funcs.length
  const importance = scoreImportance(funcs, calls, new Set(funcs.map((s) => s.name)))
  const topCount = funcs.filter((f) => (importance.get(f.name)?.stars || 1) >= 3).length

  return (
    <div className="h-full relative">
      <div className="absolute top-2 left-2 z-10 flex gap-2">
        <button onClick={() => setShowAll(!showAll)}
          className={cn('px-2.5 py-1 rounded text-[10px] border transition-all duration-200',
            showAll ? 'bg-blue-600/20 border-blue-800/50 text-blue-300' : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)]/50'
          )}>
          {showAll ? `全部(${totalFuncs})` : `核心(${topCount}/${totalFuncs})`}
        </button>
      </div>

      {focusNode && (
        <div className="absolute top-2 right-2 z-10 bg-[var(--card)]/95 rounded-lg px-3 py-1.5 border border-blue-800/50 text-xs">
          <span className="text-[var(--muted-foreground)]">聚焦 </span>
          <span className="text-blue-400 font-mono">{focusNode}</span>
          <button onClick={() => setFocusNode(null)} className="ml-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-[10px]">✕</button>
        </div>
      )}

      <div className="absolute bottom-2 left-2 z-10 bg-[var(--card)]/95 rounded-lg p-2 border border-[var(--border)] flex gap-3 text-[9px]">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#1e3a5f] border border-[#f59e0b]" />入口函数</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#0f2a1a] border border-[#22c55e]" />内部函数</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-[#7c2d12]" style={{clipPath:'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)'}} />结构体</span>
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
