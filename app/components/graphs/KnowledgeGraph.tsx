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
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

const NODE_STYLES: Record<string, { bg: string; border: string; size: string }> = {
  file:    { bg: '#1e40af', border: '#3b82f6', size: 'text-xs px-3 py-2' },
  function:{ bg: '#15803d', border: '#22c55e', size: 'text-xs px-3 py-1.5' },
  struct:  { bg: '#7e22ce', border: '#a855f7', size: 'text-xs px-3 py-1.5' },
  macro:   { bg: '#b45309', border: '#f59e0b', size: 'text-[10px] px-2 py-1' },
}

const EDGE_COLORS: Record<string, string> = {
  include:    '#3b82f6',
  call:       '#22c55e',
  struct_dep: '#a855f7',
  concept:    '#f59e0b',
}

export function KnowledgeGraph() {
  const { selectedFile, symbols, includes, calls, structs, selectFile, setSelectedEntity } = useStore()
  const [visibleEdgeTypes, setVisibleEdgeTypes] = useState<Set<string>>(
    new Set(['include', 'call', 'struct_dep', 'concept'])
  )
  const [focusNode, setFocusNode] = useState<string | null>(null)

  const toggleEdgeType = (type: string) => {
    setVisibleEdgeTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const allNodes = useMemo(() => {
    const map = new Map<string, Node>()
    const add = (id: string, label: string, type: string, file?: string, line?: number) => {
      if (map.has(id)) return
      const style = NODE_STYLES[type] || NODE_STYLES.file
      map.set(id, {
        id,
        data: {
          label,
          type,
          file,
          line,
        },
        position: { x: 0, y: 0 },
        style: {
          background: style.bg,
          color: '#e5e5e5',
          border: `1.5px solid ${style.border}`,
          borderRadius: type === 'file' ? '8px' : '16px',
          padding: style.size.split(' ').slice(1).join(' '),
          fontSize: style.size.split(' ')[0] === 'text-xs' ? 11 : 10,
          fontWeight: type === 'file' ? 600 : 500,
        },
      })
    }

    // Current file as center
    if (selectedFile) {
      add(selectedFile, selectedFile.split('/').pop()!, 'file', selectedFile)
    }

    // Add symbols
    for (const s of symbols) {
      add(s.name, s.name, s.kind, s.file, s.line)
    }

    // Include edges add file nodes
    for (const inc of includes) {
      if (selectedFile && (inc.from_file === selectedFile || inc.to_file === selectedFile)) {
        const other = inc.from_file === selectedFile ? inc.to_file : inc.from_file
        add(other, other.split('/').pop()!, 'file', other)
      }
    }

    return map
  }, [selectedFile, symbols, includes])

  const allEdges = useMemo(() => {
    const edges: Edge[] = []

    // Include edges
    if (visibleEdgeTypes.has('include') && selectedFile) {
      for (const inc of includes) {
        if (inc.from_file === selectedFile || inc.to_file === selectedFile) {
          const source = inc.from_file
          const target = inc.to_file
          if (allNodes.has(source) && allNodes.has(target)) {
            edges.push({
              id: `inc:${source}->${target}`,
              source,
              target,
              type: 'smoothstep',
              style: { stroke: EDGE_COLORS.include, strokeWidth: 1.5 },
              markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLORS.include, width: 14, height: 14 },
            })
          }
        }
      }
    }

    // Call edges
    if (visibleEdgeTypes.has('call') && selectedFile) {
      for (const call of calls) {
        if (call.caller_file === selectedFile || call.callee_file === selectedFile) {
          if (allNodes.has(call.caller) && allNodes.has(call.callee)) {
            edges.push({
              id: `call:${call.caller}->${call.callee}`,
              source: call.caller,
              target: call.callee,
              type: 'smoothstep',
              style: { stroke: EDGE_COLORS.call, strokeWidth: 1.5, strokeDasharray: '5 5' },
              markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLORS.call, width: 14, height: 14 },
            })
          }
        }
      }
    }

    // Struct dep edges
    if (visibleEdgeTypes.has('struct_dep')) {
      for (const s of structs) {
        if (allNodes.has(s.struct_name) && allNodes.has(s.uses)) {
          edges.push({
            id: `struct:${s.struct_name}->${s.uses}`,
            source: s.struct_name,
            target: s.uses,
            type: 'smoothstep',
            style: { stroke: EDGE_COLORS.struct_dep, strokeWidth: 1.5, strokeDasharray: '3 3' },
            markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLORS.struct_dep, width: 12, height: 12 },
          })
        }
      }
    }

    return edges
  }, [visibleEdgeTypes, selectedFile, allNodes, includes, calls, structs])

  const focusNodes = useMemo(() => {
    if (!focusNode) return Array.from(allNodes.values())
    const visited = new Set<string>([focusNode])
    const queue = [focusNode]
    while (queue.length > 0) {
      const current = queue.shift()!
      for (const e of allEdges) {
        if (e.source === current && !visited.has(e.target)) {
          visited.add(e.target)
          queue.push(e.target)
        }
        if (e.target === current && !visited.has(e.source)) {
          visited.add(e.source)
          queue.push(e.source)
        }
      }
    }
    return Array.from(allNodes.values()).filter((n) => visited.has(n.id))
  }, [focusNode, allNodes, allEdges])

  const displayNodes = focusNode ? focusNodes : Array.from(allNodes.values())

  const [, , onNodesChange] = useNodesState(displayNodes)
  const [, , onEdgesChange] = useEdgesState(allEdges)

  useEffect(() => {
    const center = focusNode || selectedFile

    const nodeArr = displayNodes.filter((n) => n.id !== center)
    const centerNode = displayNodes.find((n) => n.id === center)

    // Place center at origin
    if (centerNode) {
      centerNode.position = { x: 500, y: 350 }
    }

    // Arrange others in concentric circles
    const files = nodeArr.filter((n) => (n.data as { type: string }).type === 'file')
    const funcs = nodeArr.filter((n) => (n.data as { type: string }).type === 'function')
    const structs = nodeArr.filter((n) => (n.data as { type: string }).type === 'struct')
    const rest = nodeArr.filter((n) => !files.includes(n) && !funcs.includes(n) && !structs.includes(n))

    const layers = [files, funcs, structs, rest]
    const radii = [250, 350, 450, 550]

    for (let l = 0; l < layers.length; l++) {
      const layer = layers[l]
      const r = radii[l]
      for (let i = 0; i < layer.length; i++) {
        const angle = (2 * Math.PI * i) / layer.length
        layer[i].position = { x: 500 + r * Math.cos(angle), y: 350 + r * Math.sin(angle) }
      }
    }
  }, [displayNodes, focusNode, selectedFile])

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const nd = node.data as { type: string; label: string; file?: string; line?: number }
      if (nd.type === 'file') {
        selectFile(node.id)
      } else {
        setSelectedEntity({ type: 'function', path: nd.file || '', name: nd.label })
        if (nd.file) selectFile(nd.file)
      }
      if (focusNode === node.id) {
        setFocusNode(null)
      } else {
        setFocusNode(node.id)
      }
    },
    [selectFile, setSelectedEntity, focusNode]
  )

  if (!selectedFile) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm">
        选择文件查看知识图谱
      </div>
    )
  }

  return (
    <div className="h-full relative">
      {/* Edge type filter bar */}
      <div className="absolute top-2 left-2 z-10 flex gap-1 bg-[var(--card)]/90 rounded-lg p-1 border border-[var(--border)]">
        {([
          ['include', '#3b82f6', 'Include'],
          ['call', '#22c55e', '函数调用'],
          ['struct_dep', '#a855f7', '结构体'],
          ['concept', '#f59e0b', '概念'],
        ] as const).map(([type, color, label]) => (
          <button
            key={type}
            onClick={() => toggleEdgeType(type)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
              visibleEdgeTypes.has(type)
                ? 'bg-[var(--muted)] text-[var(--foreground)]'
                : 'text-[var(--muted-foreground)]/70 hover:text-[var(--muted-foreground)]'
            }`}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            {label}
          </button>
        ))}
      </div>

      {/* Focus indicator */}
      {focusNode && (
        <div className="absolute top-2 right-2 z-10 bg-[var(--card)]/90 rounded-lg px-3 py-1.5 border border-[var(--primary)]/50 text-xs">
          <span className="text-[var(--muted-foreground)]">聚焦: </span>
          <span className="text-[var(--primary)] font-mono">{focusNode}</span>
          <button
            onClick={() => setFocusNode(null)}
            className="ml-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-[10px]"
          >
            ✕ 取消
          </button>
        </div>
      )}

      <ReactFlow
        nodes={displayNodes}
        edges={allEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#27272a" gap={20} />
        <Controls className="[&>button]:bg-[var(--muted)] [&>button]:border-[var(--border)] [&>button]:text-[var(--foreground)]" />
      </ReactFlow>
    </div>
  )
}
