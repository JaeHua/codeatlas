'use client'

import { useMemo, useCallback, useState, useEffect } from 'react'
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
import { Loader2 } from 'lucide-react'

const NODE_STYLES: Record<string, { bg: string; border: string }> = {
  file: { bg: '#1e3a5f', border: '#3b82f6' },
  function: { bg: '#14532d', border: '#22c55e' },
  struct: { bg: '#581c87', border: '#a855f7' },
  macro: { bg: '#78350f', border: '#f59e0b' },
}

const EDGE_COLORS: Record<string, string> = {
  include: '#3b82f6',
  call: '#22c55e',
  struct_dep: '#a855f7',
}

const FILTERS = [
  { key: 'call', color: '#22c55e', label: '调用' },
  { key: 'include', color: '#3b82f6', label: 'Include' },
  { key: 'struct_dep', color: '#a855f7', label: '结构体' },
]

interface AIDesc {
  file_desc: string
  nodes: { id: string; desc: string; type: string }[]
  edges: { from: string; to: string; desc: string; type: string }[]
}

function getDescCacheKey(projectId: number | null, filePath: string) {
  return `codeatlas-desc-${projectId}-${filePath}`
}

function loadDescCache(projectId: number | null, filePath: string): AIDesc | null {
  try {
    const raw = localStorage.getItem(getDescCacheKey(projectId, filePath))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveDescCache(projectId: number | null, filePath: string, desc: AIDesc) {
  try {
    localStorage.setItem(getDescCacheKey(projectId, filePath), JSON.stringify(desc))
  } catch {}
}

// ───── Nodes ─────

function EntryNode({ data }: { data: { label: string; desc?: string } }) {
  return (
    <div className="relative">
      <Handle type="target" position={Position.Top} style={{ visibility: 'hidden' }} />
      <div className="flex flex-col items-center">
        <div className="w-14 h-14 rounded-full bg-[#1e40af] border-4 border-[#3b82f6] shadow-lg shadow-blue-500/30 flex items-center justify-center
          transition-all duration-300 hover:scale-110 hover:shadow-xl hover:shadow-blue-500/40">
          <div className="w-10 h-10 rounded-full border-2 border-blue-400/30 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white font-mono text-center leading-tight">{data.label}</span>
          </div>
        </div>
        {data.desc && <span className="text-[9px] text-blue-300/80 mt-1.5 max-w-[100px] text-center leading-tight line-clamp-2">{data.desc}</span>}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ visibility: 'hidden' }} />
    </div>
  )
}

function InternalFuncNode({ data }: { data: { label: string; desc?: string; heat: number; callCount?: number } }) {
  const intensity = Math.min(1, 0.25 + data.heat * 0.75)
  const bg = `rgba(${Math.round(15 + 39 * intensity)}, ${Math.round(75 + 65 * intensity)}, ${Math.round(170 + 85 * intensity)}, 1)`
  return (
    <div className="relative group">
      <Handle type="target" position={Position.Top} style={{ background: '#60a5fa', width: 6, height: 6 }} />
      <div
        className="rounded-lg px-3 py-2 text-center min-w-[90px] transition-all duration-300 border hover:scale-105 hover:shadow-lg hover:border-blue-300"
        style={{ background: bg, borderColor: '#3b82f6' }}
      >
        <div className="text-[10px] font-semibold text-white font-mono">{data.label}</div>
        {data.callCount !== undefined && (
          <div className="text-[8px] text-blue-200/50 mt-0.5">{data.callCount} 次调用</div>
        )}
        {data.desc && <div className="text-[9px] text-blue-200/80 mt-1 leading-tight max-w-[110px] line-clamp-2">{data.desc}</div>}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#60a5fa', width: 6, height: 6 }} />
    </div>
  )
}

function StructNode({ data }: { data: { label: string; desc?: string; fieldCount?: number } }) {
  return (
    <div className="relative group">
      <Handle type="source" position={Position.Bottom} style={{ background: '#a855f7', width: 6, height: 6 }} />
      <div className="flex flex-col items-center transition-all duration-300 hover:scale-105">
        <div
          className="flex items-center justify-center bg-[#7c2d12] border-2 border-[#f59e0b] shadow-md shadow-orange-500/10 hover:border-[#fbbf24] transition-colors"
          style={{ width: 56, height: 48, clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' }}
        >
          <span className="text-[9px] font-bold text-white font-mono">{data.label}</span>
        </div>
        {data.fieldCount !== undefined && (
          <span className="text-[9px] text-orange-300/70 mt-1">{data.fieldCount} 字段</span>
        )}
        {data.desc && <span className="text-[8px] text-orange-300/60 mt-0.5 max-w-[80px] text-center leading-tight">{data.desc}</span>}
      </div>
    </div>
  )
}

function ExtCallerNode({ data }: { data: { label: string; file?: string; desc?: string } }) {
  return (
    <div className="bg-transparent border border-dashed border-[#7e22ce]/50 rounded-lg px-2.5 py-1.5 text-center min-w-[90px] hover:border-[#a855f7] transition-all duration-200 hover:scale-105">
      <Handle type="source" position={Position.Bottom} style={{ background: '#a855f7', width: 6, height: 6 }} />
      <div className="text-[10px] font-mono text-purple-300">{data.label}</div>
      {data.file && <div className="text-[8px] text-purple-400/50 mt-0.5">{data.file.split('/').pop()}</div>}
    </div>
  )
}

function ExtCalleeNode({ data }: { data: { label: string; file?: string; desc?: string } }) {
  return (
    <div className="bg-[#451a03]/40 border border-[#d97706]/50 rounded-lg px-2.5 py-1.5 text-center min-w-[90px] hover:border-[#f59e0b] transition-all duration-200 hover:scale-105">
      <Handle type="target" position={Position.Top} style={{ background: '#f59e0b', width: 6, height: 6 }} />
      <div className="text-[10px] font-mono text-amber-200">{data.label}</div>
      {data.file && <div className="text-[8px] text-amber-500/60 mt-0.5">{data.file.split('/').pop()}</div>}
    </div>
  )
}

const nodeTypes = { entry: EntryNode, internalFunc: InternalFuncNode, struct: StructNode, extCaller: ExtCallerNode, extCallee: ExtCalleeNode }

// ───── Main ─────

export function FileGraph() {
  const { selectedFile, symbols, calls, includes, selectFile, setSelectedEntity, projectId } = useStore()
  const [showExternal, setShowExternal] = useState(true)
  const [focusNode, setFocusNode] = useState<string | null>(null)
  const [aiDesc, setAiDesc] = useState<AIDesc | null>(null)
  const [loadingAI, setLoadingAI] = useState(false)

  // Load AI descriptions with caching
  useEffect(() => {
    if (!selectedFile || !projectId) return

    // Check cache first
    const cached = loadDescCache(projectId, selectedFile)
    if (cached) { setAiDesc(cached); return }

    const settingsData = JSON.parse(localStorage.getItem('codeatlas-settings') || '{}')
    const apiKey = settingsData?.state?.apiKey
    if (!apiKey) return

    setLoadingAI(true)
    fetch(`/api/projects/${projectId}/ai-describe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: selectedFile,
        apiKey,
        baseUrl: settingsData?.state?.baseUrl || 'https://api.deepseek.com',
        model: settingsData?.state?.model || 'deepseek-chat',
      }),
    })
      .then((r) => r.json())
      .then((d: AIDesc) => {
        setAiDesc(d)
        saveDescCache(projectId, selectedFile, d)
      })
      .catch(() => {})
      .finally(() => setLoadingAI(false))
  }, [selectedFile, projectId])

  const { nodes, edges } = useMemo(() => {
    if (!selectedFile) return { nodes: [], edges: [] }

    const fileSymbols = symbols.filter((s) => s.file === selectedFile)
    const funcs = fileSymbols.filter((s) => s.kind === 'function')
    const fileStructs = fileSymbols.filter((s) => s.kind === 'struct')
    const fileMacros = fileSymbols.filter((s) => s.kind === 'macro' || s.kind === 'typedef')
    const funcNames = new Set(funcs.map((s) => s.name))

    const ns: Node[] = []
    const es: Edge[] = []

    // Nothing at all? Show fallback
    if (ns.length === 0 && fileSymbols.length === 0) {
      ns.push({
        id: 'no-symbols', type: 'internalFunc',
        position: { x: 200, y: 100 },
        data: { 
          label: '该文件无解析符号', 
          desc: `项目共 ${symbols.length} 个符号, 当前文件 ${fileSymbols.length} 个`, 
          heat: 0 
        },
      })
      return { nodes: ns, edges: [] }
    }

    // Build AI node desc map
    const nodeDescMap = new Map<string, string>()
    if (aiDesc?.nodes) {
      for (const n of aiDesc.nodes) nodeDescMap.set(n.id, n.desc)
    }

    // Build AI edge desc map
    const edgeDescMap = new Map<string, string>()
    if (aiDesc?.edges) {
      for (const e of aiDesc.edges) edgeDescMap.set(`${e.from}→${e.to}`, e.desc)
    }

    const callCount = new Map<string, number>()
    const internalCalls = calls.filter((c) => funcNames.has(c.caller) && funcNames.has(c.callee))
    internalCalls.forEach((c) => {
      callCount.set(c.callee, (callCount.get(c.callee) || 0) + 1)
      callCount.set(c.caller, (callCount.get(c.caller) || 0) + 1)
    })
    const maxCalls = Math.max(1, ...Array.from(callCount.values()))

    // Entry functions
    const externalCallers = calls.filter((c) => funcNames.has(c.callee) && !funcNames.has(c.caller))
    const entryFuncs = new Set(externalCallers.map((c) => c.callee))

    // ─── Nodes ───

    // Entry nodes
    const entryList = funcs.filter((f) => entryFuncs.has(f.name))
    entryList.forEach((f, i) => {
      const desc = nodeDescMap.get(f.name) || f.description
      ns.push({
        id: f.name, type: 'entry',
        position: { x: 40, y: 30 + i * 120 },
        data: { label: f.name, desc },
      })
    })

    // Internal functions
    const internalList = funcs.filter((f) => !entryFuncs.has(f.name))
    internalList.forEach((f, i) => {
      const heat = (callCount.get(f.name) || 0) / maxCalls
      const desc = nodeDescMap.get(f.name) || f.description
      ns.push({
        id: f.name, type: 'internalFunc',
        position: { x: 220, y: 20 + i * 65 },
        data: { label: f.name, desc, heat, callCount: callCount.get(f.name) || 0 },
      })
    })

    // Structs
    fileStructs.forEach((s, i) => {
      const desc = nodeDescMap.get(s.name) || s.description
      ns.push({
        id: `struct-${s.name}`, type: 'struct',
        position: { x: 440, y: 30 + i * 90 },
        data: { label: s.name, desc },
      })
    })

    // Macros and typedefs — also show in the graph
    fileMacros.forEach((s, i) => {
      ns.push({
        id: `macro-${s.name}`, type: 'internalFunc',
        position: { x: 620, y: 30 + i * 55 },
        data: { label: s.name, desc: nodeDescMap.get(s.name) || s.description, heat: 0 },
      })
    })

    // Still no functions at all? Show a message node
    if (funcs.length === 0 && fileStructs.length === 0 && fileMacros.length === 0) {
      ns.push({
        id: 'no-data', type: 'internalFunc',
        position: { x: 220, y: 100 },
        data: { label: '无函数数据', desc: '请重新解析项目', heat: 0 },
      })
    }

    // ─── Edges ───

    // Internal calls
    internalCalls.forEach((c) => {
      const ek = `${c.caller}→${c.callee}`
      const label = edgeDescMap.get(ek)
      es.push({
        id: `call:${c.caller}->${c.callee}`,
        source: c.caller, target: c.callee,
        style: { stroke: '#22c55e', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#22c55e', width: 12, height: 12 },
        type: 'smoothstep',
        label,
        labelStyle: { fontSize: 9, fill: '#86efac' },
        labelBgStyle: { fill: '#0f172a', fillOpacity: 0.85 },
      })
    })

    if (showExternal) {
      // External callers
      const ecFuncs = [...new Set(externalCallers.map((c) => c.caller))].slice(0, 8)
      ecFuncs.forEach((caller, i) => {
        const ec = externalCallers.filter((c) => c.caller === caller)
        ns.push({
          id: `extcaller-${caller}`, type: 'extCaller',
          position: { x: -200, y: 30 + i * 55 },
          data: { label: caller, file: ec[0]?.caller_file },
        })
        ec.forEach((c) => {
          const ek = `${caller}→${c.callee}`
          es.push({
            id: `extin:${caller}→${c.callee}`,
            source: `extcaller-${caller}`, target: c.callee,
            style: { stroke: '#a855f7', strokeWidth: 1.5, filter: 'drop-shadow(0 0 4px #a855f7)' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#a855f7', width: 12, height: 12 },
            type: 'smoothstep',
            label: edgeDescMap.get(ek),
            labelStyle: { fontSize: 9, fill: '#c084fc' },
            labelBgStyle: { fill: '#0f172a', fillOpacity: 0.85 },
          })
        })
      })

      // Includes
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
          style: { stroke: '#3b82f6', strokeWidth: 1 },
          type: 'smoothstep',
        })
      })

      // External callees
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
  }, [selectedFile, symbols, calls, includes, showExternal, aiDesc])

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

  if (!selectedFile) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm">
        选择左侧文件查看微观图谱
      </div>
    )
  }

  if (nodes.length === 0) {
    // Try to load symbols if we're missing them
    const symCount = symbols.filter((s: any) => s.file === selectedFile).length
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)] text-sm gap-3">
        <p>该文件暂无解析数据</p>
        <p className="text-xs text-[var(--muted-foreground)]/70">
          {symCount > 0 ? `已找到 ${symCount} 个符号，正在渲染...` : `文件: ${selectedFile}, 项目符号总数: ${symbols.length}`}
        </p>
        <button
          onClick={() => {
            // Force reload page data
            window.location.reload()
          }}
          className="px-3 py-1.5 text-xs border border-[var(--border)] rounded-lg hover:bg-[var(--accent)] transition-colors"
        >
          重新加载
        </button>
      </div>
    )
  }

  return (
    <div className="h-full relative">
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
        {loadingAI && (
          <span className="flex items-center gap-1 px-2 py-1 text-[10px] text-[var(--primary)]">
            <Loader2 className="h-3 w-3 animate-spin" />
            AI 分析中...
          </span>
        )}
      </div>

      {focusNode && (
        <div className="absolute top-2 right-2 z-10 bg-[var(--card)]/95 rounded-lg px-3 py-1.5 border border-blue-800/50 text-xs shadow-fabric">
          <span className="text-[var(--muted-foreground)]">聚焦 </span>
          <span className="text-blue-400 font-mono">{focusNode}</span>
          <button onClick={() => setFocusNode(null)} className="ml-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-[10px]">✕</button>
        </div>
      )}

      <div className="absolute bottom-2 left-2 z-10 bg-[var(--card)]/95 rounded-lg p-2 border border-[var(--border)] flex gap-3 text-[9px] shadow-fabric">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-[#1e40af] border border-[#3b82f6]" />外部入口</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#1e3a5f] border border-[#3b82f6]" />内部函数</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 bg-[#7c2d12]" style={{clipPath:'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)'}} />结构体</span>
        <span className="flex items-center gap-1 text-purple-400"><span className="w-3 border-t border-dashed border-purple-500" />外部调用者</span>
        <span className="flex items-center gap-1 text-amber-400"><span className="w-3 border-t border-amber-500" />外部依赖</span>
      </div>

      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        defaultViewport={{ x: 100, y: 0, zoom: 0.85 }}
        minZoom={0.3} maxZoom={1.5}
      >
        <Background color="var(--border)" gap={20} />
        <Controls className="[&>button]:bg-[var(--muted)] [&>button]:border-[var(--border)] [&>button]:text-[var(--foreground)]" />
      </ReactFlow>
    </div>
  )
}
