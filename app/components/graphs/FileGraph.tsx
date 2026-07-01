'use client'

import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useStore } from '@/app/store'
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  MarkerType,
  Handle,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { cn } from '@/lib/utils'

// ───── Custom Nodes ─────

function EntryNode({ data }: { data: { label: string; desc?: string } }) {
  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
      <div className="flex flex-col items-center">
        <div className="w-14 h-14 rounded-full bg-[#1e40af] border-4 border-[#3b82f6] shadow-lg shadow-blue-500/30 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full border-2 border-blue-400/30 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white font-mono text-center leading-tight">{data.label}</span>
          </div>
        </div>
        {data.desc && <span className="text-[8px] text-blue-300/70 mt-1 max-w-[80px] text-center">{data.desc}</span>}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
    </div>
  )
}

function InternalFuncNode({ data }: { data: { label: string; desc?: string; heat: number } }) {
  const intensity = Math.min(1, 0.3 + data.heat * 0.7)
  const bg = `rgba(${Math.round(20 + 34 * intensity)}, ${Math.round(80 + 33 * intensity)}, ${Math.round(180 + 75 * intensity)}, 1)`
  return (
    <div className="relative group">
      <Handle type="target" position={Position.Top} style={{ background: '#60a5fa', width: 6, height: 6 }} />
      <div
        className="rounded-lg px-3 py-1.5 text-center min-w-[90px] transition-shadow duration-300 border"
        style={{ background: bg, borderColor: `#3b82f6` }}
      >
        <div className="text-[10px] font-semibold text-white font-mono">{data.label}</div>
        {data.desc && <div className="text-[8px] text-blue-200/70 mt-0.5 line-clamp-1">{data.desc}</div>}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#60a5fa', width: 6, height: 6 }} />
    </div>
  )
}

function StructNode({ data }: { data: { label: string; desc?: string } }) {
  return (
    <div className="relative">
      <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
      <div
        className="flex items-center justify-center bg-[#7c2d12] border-2 border-[#f59e0b] shadow-md shadow-orange-500/10 hover:border-[#fbbf24] transition-colors"
        style={{
          width: 64, height: 56,
          clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
        }}
      >
        <span className="text-[9px] font-bold text-white font-mono">{data.label}</span>
      </div>
      {data.desc && <div className="text-[8px] text-orange-300/70 mt-1 text-center max-w-[70px]">{data.desc}</div>}
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
    </div>
  )
}

function ExtCallerNode({ data }: { data: { label: string; file?: string } }) {
  return (
    <div
      className="bg-transparent border border-dashed border-[#7e22ce]/50 rounded-lg px-2.5 py-1.5 text-center min-w-[90px] hover:border-[#a855f7] transition-colors"
    >
      <Handle type="source" position={Position.Bottom} style={{ background: '#a855f7', width: 6, height: 6 }} />
      <div className="text-[10px] font-mono text-purple-300">{data.label}</div>
      {data.file && <div className="text-[8px] text-purple-400/50 mt-0.5">{data.file.split('/').pop()}</div>}
    </div>
  )
}

function ExtCalleeNode({ data }: { data: { label: string; file?: string } }) {
  return (
    <div
      className="bg-[#451a03]/40 border border-[#d97706]/50 rounded-lg px-2.5 py-1.5 text-center min-w-[90px] hover:border-[#f59e0b] transition-colors"
    >
      <Handle type="target" position={Position.Top} style={{ background: '#f59e0b', width: 6, height: 6 }} />
      <div className="text-[10px] font-mono text-amber-200">{data.label}</div>
      {data.file && <div className="text-[8px] text-amber-500/60 mt-0.5">{data.file.split('/').pop()}</div>}
    </div>
  )
}

const nodeTypes = {
  entry: EntryNode,
  internalFunc: InternalFuncNode,
  struct: StructNode,
  extCaller: ExtCallerNode,
  extCallee: ExtCalleeNode,
}

// ───── Main Component ─────

export function FileGraph() {
  const { selectedFile, symbols, calls, includes, structs: structDeps, selectFile, setSelectedEntity } = useStore()
  const [showExternal, setShowExternal] = useState(true)
  const [focusNode, setFocusNode] = useState<string | null>(null)
  const breathRef = useRef<string | null>(null)

  const { nodes, edges } = useMemo(() => {
    if (!selectedFile) return { nodes: [], edges: [] }

    const fileSymbols = symbols.filter((s) => s.file === selectedFile)
    const funcs = fileSymbols.filter((s) => s.kind === 'function')
    const fileStructs = fileSymbols.filter((s) => s.kind === 'struct')
    const funcNames = new Set(funcs.map((s) => s.name))

    const ns: Node[] = []
    const es: Edge[] = []

    // Calculate call frequency for heatmap
    const callCount = new Map<string, number>()
    const internalCalls = calls.filter((c) => funcNames.has(c.caller) && funcNames.has(c.callee))
    internalCalls.forEach((c) => {
      callCount.set(c.callee, (callCount.get(c.callee) || 0) + 1)
      callCount.set(c.caller, (callCount.get(c.caller) || 0) + 1)
    })
    const maxCalls = Math.max(1, ...Array.from(callCount.values()))

    // Determine entry functions (called from outside)
    const externalCallers = calls.filter((c) => funcNames.has(c.callee) && !funcNames.has(c.caller))
    const entryFuncs = new Set(externalCallers.map((c) => c.callee))

    // Layout: Entry functions left, internal functions center, structs right
    const entryList = funcs.filter((f) => entryFuncs.has(f.name))
    const internalList = funcs.filter((f) => !entryFuncs.has(f.name))

    // Entry nodes - left column
    entryList.forEach((f, i) => {
      ns.push({
        id: f.name, type: 'entry',
        position: { x: 40, y: 30 + i * 120 },
        data: { label: f.name, desc: f.description },
      })
    })

    // Internal function nodes - center column
    internalList.forEach((f, i) => {
      const heat = (callCount.get(f.name) || 0) / maxCalls
      ns.push({
        id: f.name, type: 'internalFunc',
        position: { x: 220, y: 20 + i * 65 },
        data: { label: f.name, desc: f.description, heat },
      })
    })

    // Struct nodes - right column
    fileStructs.forEach((s, i) => {
      ns.push({
        id: `struct-${s.name}`, type: 'struct',
        position: { x: 440, y: 30 + i * 90 },
        data: { label: s.name, desc: s.description },
      })
    })

    // Internal call edges (blue solid)
    internalCalls.forEach((c) => {
      es.push({
        id: `call:${c.caller}->${c.callee}`,
        source: c.caller, target: c.callee,
        style: { stroke: '#3b82f6', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6', width: 12, height: 12 },
        type: 'smoothstep',
      })
    })

    // Struct data-flow edges (orange dashed bidirectional)
    fileStructs.forEach((s) => {
      // Find functions that reference this struct
      funcNames.forEach((fn) => {
        const sym = fileSymbols.find((x) => x.name === fn)
        if (sym?.signature?.includes(s.name)) {
          es.push({
            id: `dataflow:${fn}↔${s.name}`,
            source: fn, target: `struct-${s.name}`,
            style: { stroke: '#f59e0b', strokeWidth: 1, strokeDasharray: '4 3' },
            type: 'smoothstep',
          })
        }
      })
    })

    if (showExternal) {
      // External callers - left wing (purple glow)
      const extCallerFuncs = [...new Set(externalCallers.map((c) => c.caller))].slice(0, 8)
      extCallerFuncs.forEach((caller, i) => {
        const ec = externalCallers.filter((c) => c.caller === caller)
        ns.push({
          id: `extcaller-${caller}`, type: 'extCaller',
          position: { x: -200, y: 30 + i * 55 },
          data: { label: caller, file: ec[0]?.caller_file },
        })
        ec.forEach((c) => {
          es.push({
            id: `extin:${caller}→${c.callee}`,
            source: `extcaller-${caller}`, target: c.callee,
            style: { stroke: '#a855f7', strokeWidth: 1.5, filter: 'drop-shadow(0 0 4px #a855f7)' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#a855f7', width: 12, height: 12 },
            type: 'smoothstep',
          })
        })
      })

      // Include files
      const incs = includes.filter((i) => i.from_file === selectedFile)
      const incFiles = [...new Set(incs.map((i) => i.to_file))].slice(0, 6)
      incFiles.forEach((inc, i) => {
        ns.push({
          id: `inc-${inc}`, type: 'extCallee',
          position: { x: 440, y: 280 + i * 55 },
          data: { label: inc.split('/').pop() || inc, file: inc },
        })
        es.push({
          id: `inc:file→${inc}`,
          source: selectedFile, target: `inc-${inc}`,
          style: { stroke: '#d97706', strokeWidth: 1 },
          type: 'smoothstep',
        })
      })

      // External callees - right wing
      const extCalleeList = calls.filter((c) => funcNames.has(c.caller) && !funcNames.has(c.callee))
      const extCallees = [...new Set(extCalleeList.map((c) => c.callee))].slice(0, 8)
      extCallees.forEach((callee, i) => {
        const ec = extCalleeList.find((c) => c.callee === callee)
        ns.push({
          id: `extcallee-${callee}`, type: 'extCallee',
          position: { x: 620, y: 30 + i * 55 },
          data: { label: callee, file: ec?.callee_file },
        })
        extCalleeList.filter((c) => c.callee === callee).forEach((c) => {
          es.push({
            id: `extout:${c.caller}→${callee}`,
            source: c.caller, target: `extcallee-${callee}`,
            style: { stroke: '#d97706', strokeWidth: 1, strokeDasharray: '5 4' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#d97706', width: 10, height: 10 },
            type: 'smoothstep',
          })
        })
      })
    }

    return { nodes: ns, edges: es }
  }, [selectedFile, symbols, calls, includes, structDeps, showExternal])

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
    const d = node.data as any
    if (d.file) {
      setSelectedEntity({ type: 'function', path: d.file, name: d.label })
      selectFile(d.file)
    }
    setFocusNode((prev) => prev === node.id ? null : node.id)
  }, [selectFile, setSelectedEntity])

  // Breathing animation for highlighted node
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { name?: string }
      if (detail?.name) breathRef.current = detail.name
    }
    window.addEventListener('codeatlas:hover-func', handler)
    return () => window.removeEventListener('codeatlas:hover-func', handler)
  }, [])

  if (!selectedFile) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm">
        选择左侧文件查看微观图谱
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] text-sm gap-1">
        <p>该文件暂无解析数据</p>
        <p className="text-xs">请等待项目解析完成</p>
      </div>
    )
  }

  return (
    <div className="h-full relative">
      {/* Toggle & Legend */}
      <div className="absolute top-2 left-2 z-10 flex gap-2">
        <button
          onClick={() => setShowExternal(!showExternal)}
          className={cn(
            'px-2.5 py-1 rounded text-[10px] border transition-all duration-200',
            showExternal
              ? 'bg-purple-600/20 border-purple-800/50 text-purple-300'
              : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)]/50'
          )}
        >
          {showExternal ? '外部联网: 开' : '外部联网: 关'}
        </button>
      </div>

      {/* Focus indicator */}
      {focusNode && (
        <div className="absolute top-2 right-2 z-10 bg-[var(--card)]/95 rounded-lg px-3 py-1.5 border border-blue-800/50 text-xs shadow-fabric">
          <span className="text-[var(--muted-foreground)]">聚焦 </span>
          <span className="text-blue-400 font-mono">{focusNode}</span>
          <button onClick={() => setFocusNode(null)} className="ml-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-[10px]">✕</button>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-2 left-2 z-10 bg-[var(--card)]/95 rounded-lg p-2 border border-[var(--border)] flex gap-3 text-[9px] shadow-fabric">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#1e40af] border border-[#3b82f6]" />外部入口</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#1e3a5f] border border-[#3b82f6]" />内部函数</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-[#7c2d12]" style={{clipPath:'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)'}} />结构体</span>
        <span className="flex items-center gap-1 text-purple-400"><span className="w-3 border-t border-dashed border-purple-500" />外部调用者</span>
        <span className="flex items-center gap-1 text-amber-400"><span className="w-3 border-t border-emerald-500" />外部依赖</span>
      </div>

      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        defaultViewport={{ x: 100, y: 0, zoom: 0.85 }}
        minZoom={0.3}
        maxZoom={1.5}
      >
        <Background color="var(--border)" gap={20} />
        <Controls className="[&>button]:bg-[var(--muted)] [&>button]:border-[var(--border)] [&>button]:text-[var(--foreground)]" />
      </ReactFlow>
    </div>
  )
}
