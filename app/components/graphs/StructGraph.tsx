'use client'

import { useMemo, useCallback, useState } from 'react'
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

const RELATION_META: Record<string, { color: string; label: string; dash?: string }> = {
  nested: { color: '#1A1A18', label: '嵌套' },
  pointer: { color: '#E0A93C', label: '指针引用', dash: '5 4' },
  typed_field: { color: '#8A8578', label: '类型字段', dash: '2 3' },
}

const RELATION_ORDER = ['nested', 'pointer', 'typed_field'] as const

/**
 * 结构体依赖图谱（按当前文件聚焦）：
 * 节点 = 当前文件定义的结构体 + 它们直接依赖/被依赖的结构体；
 * 边 = nested/pointer/typed_field 关系，点击跳转定义。
 */
export function StructGraph() {
  const { symbols, structs, selectedFile } = useStore()
  const [visible, setVisible] = useState<Set<string>>(new Set(['nested', 'pointer', 'typed_field']))

  const nodes = useMemo(() => {
    if (!selectedFile) return []
    const isStructName = (name: string) =>
      symbols.some((s) => s.name === name && (s.kind === 'struct' || s.kind === 'typedef'))
    const fileStructs = symbols.filter(
      (s) => s.file === selectedFile && (s.kind === 'struct' || s.kind === 'typedef')
    )
    const seed = new Set(fileStructs.map((s) => s.name))
    if (seed.size === 0) return []

    // One-hop neighborhood in the dep graph
    const includeNames = new Set<string>(seed)
    for (const dep of structs) {
      if (seed.has(dep.struct_name)) includeNames.add(dep.uses)
      if (seed.has(dep.uses)) includeNames.add(dep.struct_name)
    }

    const list: Node[] = []
    const seen = new Set<string>()
    const add = (name: string) => {
      if (seen.has(name)) return
      seen.add(name)
      const sym = symbols.find(
        (s) => s.name === name && (s.kind === 'struct' || s.kind === 'typedef')
      )
      const isCore = seed.has(name)
      list.push({
        id: name,
        data: { label: name, file: sym?.file, line: sym ? (sym.kind === 'function' ? sym.line + 1 : sym.line) : undefined },
        position: { x: 0, y: 0 },
        style: {
          background: isCore ? '#FFFFFF' : '#F3EFE6',
          color: '#1A1A18',
          border: `1.5px solid ${isCore ? ACCENT : '#1A1A18'}`,
          borderRadius: 2,
          padding: '4px 12px',
          fontSize: 11,
          fontWeight: isCore ? 700 : 500,
          fontFamily: 'var(--font-mono)',
        },
      })
    }
    for (const dep of structs) {
      if (includeNames.has(dep.struct_name)) add(dep.struct_name)
      if (includeNames.has(dep.uses) && isStructName(dep.uses)) add(dep.uses)
    }

    // Concentric layout: 当前文件的结构体在中心，依赖在外部
    const n = list.length
    const cx = 500
    const cy = 350
    const core = list.filter((nd) => seed.has(nd.id))
    const outer = list.filter((nd) => !seed.has(nd.id))
    core.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / Math.max(1, core.length)
      node.position = { x: cx + 130 * Math.cos(angle), y: cy + 130 * Math.sin(angle) }
    })
    outer.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / Math.max(1, outer.length)
      node.position = { x: cx + 300 * Math.cos(angle), y: cy + 300 * Math.sin(angle) }
    })
    return list
  }, [symbols, structs, selectedFile])

  const edges = useMemo(() => {
    if (!selectedFile) return []
    const list: Edge[] = []
    const nodeIds = new Set(nodes.map((n) => n.id))
    for (const dep of structs) {
      const meta = RELATION_META[dep.relation] || RELATION_META.pointer
      if (!visible.has(dep.relation)) continue
      if (!nodeIds.has(dep.struct_name) || !nodeIds.has(dep.uses)) continue
      list.push({
        id: `struct:${dep.struct_name}->${dep.uses}:${dep.relation}`,
        source: dep.struct_name,
        target: dep.uses,
        type: 'smoothstep',
        label: meta.label,
        labelStyle: { fontSize: 9, fill: meta.color, fontWeight: 600 },
        labelBgStyle: { fill: '#FFFFFF', fillOpacity: 0.85 },
        style: { stroke: meta.color, strokeWidth: 1.2, strokeDasharray: meta.dash, opacity: 0.9 },
        markerEnd: { type: MarkerType.ArrowClosed, color: meta.color, width: 12, height: 12 },
      })
    }
    return list
  }, [structs, visible, nodes, selectedFile])

  const [rfNodes, , onNodesChange] = useNodesState(nodes)
  const [rfEdges, , onEdgesChange] = useEdgesState(edges)

  const toggleRelation = (rel: string) => {
    setVisible((prev) => {
      const next = new Set(prev)
      if (next.has(rel)) next.delete(rel)
      else next.add(rel)
      return next
    })
  }

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const nd = node.data as { file?: string; line?: number }
    if (!nd.file) return
    const state = useStore.getState()
    state.selectFileWithLine(nd.file, nd.line)
  }, [])

  if (!selectedFile) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm">
        选择文件，查看其结构体依赖关系
      </div>
    )
  }

  return (
    <div className="h-full relative bg-gridpaper">
      {/* Relation type filter bar */}
      <div className="absolute top-2 left-2 z-10 flex gap-0 bg-[var(--card)] border border-[var(--border)]">
        {RELATION_ORDER.map((rel) => {
          const meta = RELATION_META[rel]
          return (
            <button
              key={rel}
              onClick={() => toggleRelation(rel)}
              className={`flex items-center gap-1 px-2 py-1 text-[10px] transition-colors ${
                visible.has(rel)
                  ? 'text-[var(--foreground)]'
                  : 'text-[var(--muted-foreground)]/60 hover:text-[var(--muted-foreground)]'
              }`}
            >
              <span className="w-1.5 h-1.5" style={{ backgroundColor: meta.color }} />
              {meta.label}
            </button>
          )
        })}
      </div>

      {/* File / count info */}
      <div className="absolute top-2 right-2 z-10 bg-[var(--card)] px-3 py-1.5 border border-[var(--border)] text-[11px] text-[var(--muted-foreground)] max-w-[280px] truncate">
        {selectedFile.split('/').pop()} · {nodes.length} 结构体 · {edges.length} 依赖
      </div>

      {nodes.length === 0 ? (
        <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm">
          该文件没有定义结构体
        </div>
      ) : (
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.2}
          maxZoom={3}
        >
          <Background color="rgba(224,169,60,0.10)" gap={24} />
          <Controls className="[&>button]:bg-[var(--card)] [&>button]:border-[var(--border)] [&>button]:text-[var(--foreground)] [&>button]:rounded-none" />
        </ReactFlow>
      )}
    </div>
  )
}
