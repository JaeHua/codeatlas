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

const ACCENT = '#E0A93C'
const LINE = '#8A8578'

// 黑灰白节点，当前/选中用黄
const NODE_STYLES: Record<string, { shape: string; textColor: string }> = {
  file:     { shape: 'rect', textColor: '#1A1A18' },
  function: { shape: 'ellipse', textColor: '#1A1A18' },
  struct:   { shape: 'rect', textColor: '#1A1A18' },
  macro:    { shape: 'rect', textColor: '#1A1A18' },
}

const EDGE_COLORS: Record<string, string> = {
  include:    LINE,
  call:       '#1A1A18',
  struct_dep: '#B9B3A6',
  concept:    ACCENT,
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
      const isCurrent = id === selectedFile
      map.set(id, {
        id,
        data: { label, type, file, line },
        position: { x: 0, y: 0 },
        style: {
          background: isCurrent ? ACCENT : '#FFFFFF',
          color: style.textColor,
          border: `1.5px solid ${isCurrent ? ACCENT : '#1A1A18'}`,
          borderRadius: style.shape === 'ellipse' ? '9999px' : '2px',
          padding: '4px 12px',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'var(--font-mono)',
          boxShadow: isCurrent ? 'none' : undefined,
        },
      })
    }

    if (selectedFile) {
      add(selectedFile, selectedFile.split('/').pop()!, 'file', selectedFile)
    }

    for (const s of symbols) {
      add(s.name, s.name, s.kind, s.file, s.line)
    }

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
    const edge = (id: string, source: string, target: string, color: string, dash?: string) => ({
      id,
      source,
      target,
      type: 'smoothstep',
      style: { stroke: color, strokeWidth: 1.2, strokeDasharray: dash, opacity: 0.9 },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 12, height: 12 },
    })

    if (visibleEdgeTypes.has('include') && selectedFile) {
      for (const inc of includes) {
        if (inc.from_file === selectedFile || inc.to_file === selectedFile) {
          if (allNodes.has(inc.from_file) && allNodes.has(inc.to_file)) {
            edges.push(edge(`inc:${inc.from_file}->${inc.to_file}`, inc.from_file, inc.to_file, EDGE_COLORS.include))
          }
        }
      }
    }

    if (visibleEdgeTypes.has('call') && selectedFile) {
      for (const call of calls) {
        if (call.caller_file === selectedFile || call.callee_file === selectedFile) {
          if (allNodes.has(call.caller) && allNodes.has(call.callee)) {
            edges.push(edge(`call:${call.caller}->${call.callee}`, call.caller, call.callee, EDGE_COLORS.call, '4 3'))
          }
        }
      }
    }

    if (visibleEdgeTypes.has('struct_dep')) {
      for (const s of structs) {
        if (allNodes.has(s.struct_name) && allNodes.has(s.uses)) {
          edges.push(edge(`struct:${s.struct_name}->${s.uses}`, s.struct_name, s.uses, EDGE_COLORS.struct_dep, '2 2'))
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

    if (centerNode) {
      centerNode.position = { x: 500, y: 350 }
    }

    const files = nodeArr.filter((n) => (n.data as { type: string }).type === 'file')
    const funcs = nodeArr.filter((n) => (n.data as { type: string }).type === 'function')
    const structs = nodeArr.filter((n) => (n.data as { type: string }).type === 'struct')
    const rest = nodeArr.filter((n) => !files.includes(n) && !funcs.includes(n) && !structs.includes(n))

    const layers = [files, funcs, structs, rest]
    const radii = [240, 340, 440, 540]

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
    <div className="h-full relative bg-gridpaper">
      {/* Edge type filter bar */}
      <div className="absolute top-2 left-2 z-10 flex gap-0 bg-[var(--card)] border border-[var(--border)]">
        {([
          ['include', LINE, 'Include'],
          ['call', '#1A1A18', '函数调用'],
          ['struct_dep', '#B9B3A6', '结构体'],
          ['concept', ACCENT, '概念'],
        ] as const).map(([type, color, label]) => (
          <button
            key={type}
            onClick={() => toggleEdgeType(type)}
            className={`flex items-center gap-1 px-2 py-1 text-[10px] transition-colors ${
              visibleEdgeTypes.has(type)
                ? 'text-[var(--foreground)]'
                : 'text-[var(--muted-foreground)]/60 hover:text-[var(--muted-foreground)]'
            }`}
          >
            <span className="w-1.5 h-1.5" style={{ backgroundColor: color }} />
            {label}
          </button>
        ))}
      </div>

      {/* Focus indicator */}
      {focusNode && (
        <div className="absolute top-2 right-2 z-10 bg-[var(--card)] px-3 py-1.5 border border-[var(--border)] text-xs">
          <span className="text-[var(--muted-foreground)]">聚焦: </span>
          <span className="text-[var(--foreground)] font-mono">{focusNode}</span>
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
        minZoom={0.2}
        maxZoom={2.5}
      >
        <Background color="rgba(224,169,60,0.10)" gap={24} />
        <Controls className="[&>button]:bg-[var(--card)] [&>button]:border-[var(--border)] [&>button]:text-[var(--foreground)] [&>button]:rounded-none" />
      </ReactFlow>
    </div>
  )
}
