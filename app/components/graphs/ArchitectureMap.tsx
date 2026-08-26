'use client'

import { useMemo, useState, useCallback } from 'react'
import { useStore } from '@/app/store'
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { graphlib } from 'dagre-d3-es'
import { layout } from 'dagre-d3-es/src/dagre/index.js'
import { Folder, FolderOpen, File, ChevronRight, ChevronDown } from 'lucide-react'
import type { FileNode, IncludeEdge } from '@/app/lib/types'

const DIR_NOTES: Record<string, string> = {
  'kernel': '进程调度、信号处理、系统调用',
  'mm': '内存管理、页面分配、交换分区',
  'fs': '文件系统、VFS层、缓冲区',
  'init': '内核入口、初始化流程',
  'drivers': '设备驱动（控制台、硬盘、TTY）',
  'include': '公共头文件、类型定义',
  'lib': '工具函数库（字符串、printf）',
  'boot': '引导启动代码',
  'net': '网络协议栈',
  'arch': '架构相关代码',
  'tools': '构建/辅助工具',
  'scripts': '自动化脚本',
  'src': '源代码主目录',
  'doc': '文档',
  'test': '测试代码',
}

const CARD_WIDTH = 270
const CARD_HEIGHT = 300

interface Subsystem {
  name: string
  path: string
  note: string
  tree: FileNode
  files: string[]
}

function flattenFiles(node: FileNode, out: string[] = []): string[] {
  if (node.type === 'file') out.push(node.path)
  if (node.children) for (const c of node.children) flattenFiles(c, out)
  return out
}

function collectSubsystems(files: FileNode[]): Subsystem[] {
  return files
    .filter((f) => f.type === 'directory')
    .map((f) => ({
      name: f.name,
      path: f.path,
      note: DIR_NOTES[f.name] || '',
      tree: f,
      files: flattenFiles(f),
    }))
}

function resolveIncludeTarget(toFile: string, pathSet: Set<string>): string | null {
  if (pathSet.has(toFile)) return toFile
  if (pathSet.has(`include/${toFile}`)) return `include/${toFile}`
  let best: string | null = null
  for (const p of pathSet) {
    if (p.endsWith(`/${toFile}`)) {
      if (!best || p.length < best.length) best = p
    }
  }
  return best
}

function SubsystemFileRow({ node, expanded, toggle, onOpen }: {
  node: FileNode
  expanded: Set<string>
  toggle: (path: string) => void
  onOpen: (path: string) => void
}) {
  const isDir = node.type === 'directory'
  const isOpen = expanded.has(node.path)
  if (isDir) {
    return (
      <div>
        <button
          onClick={(e) => { e.stopPropagation(); toggle(node.path) }}
          className="w-full flex items-center gap-1 text-left text-[11px] py-0.5 px-1 rounded hover:bg-[var(--accent)]/60 text-[var(--muted-foreground)] group"
        >
          {isOpen
            ? <ChevronDown className="h-2.5 w-2.5 flex-shrink-0 text-[var(--foreground)]/70" />
            : <ChevronRight className="h-2.5 w-2.5 flex-shrink-0 text-[var(--foreground)]/70" />}
          {isOpen
            ? <FolderOpen className="h-3 w-3 flex-shrink-0 text-[var(--foreground)]/70" />
            : <Folder className="h-3 w-3 flex-shrink-0 text-[var(--foreground)]/70" />}
          <span className="truncate">{node.name}</span>
          <span className="ml-auto text-[9px] text-[var(--muted-foreground)]/50 group-hover:opacity-100 opacity-0">
            {node.children ? node.children.length : 0}
          </span>
        </button>
        {isOpen && node.children && (
          <div className="ml-2 border-l border-[var(--border)]/60 pl-1">
            {node.children.map((c) => (
              <SubsystemFileRow key={c.path} node={c} expanded={expanded} toggle={toggle} onOpen={onOpen} />
            ))}
          </div>
        )}
      </div>
    )
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onOpen(node.path) }}
      className="w-full flex items-center gap-1 text-left text-[11px] py-0.5 px-1 rounded hover:bg-[var(--primary)]/15 hover:text-[var(--primary)] text-[var(--muted-foreground)]/90 font-mono group"
      title={node.path}
    >
      <File className="h-3 w-3 flex-shrink-0 text-[var(--muted-foreground)]" />
      <span className="truncate">{node.name}</span>
    </button>
  )
}

function SubsystemNode({ data }: NodeProps) {
  const sub = data.subsystem as Subsystem
  const selectFile = data.selectFile as (p: string) => void
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  return (
    <div
      className="flex flex-col overflow-hidden border border-[var(--foreground)]/80 bg-[var(--card)]"
      style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
    >
      <Handle type="target" position={Position.Left} className="!bg-[var(--foreground)] !border-0 !rounded-none" />
      <div className="px-3 py-2 border-b border-[var(--foreground)]/80 bg-[var(--muted)] flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Folder className="h-3.5 w-3.5 text-[var(--foreground)] flex-shrink-0" />
          <span className="text-xs font-mono font-bold text-[var(--foreground)] truncate">{sub.name}</span>
          <span className="ml-auto text-[10px] text-[var(--muted-foreground)] font-mono flex-shrink-0">{sub.files.length}</span>
        </div>
        {sub.note && <p className="text-[9px] text-[var(--muted-foreground)] mt-0.5 leading-tight">{sub.note}</p>}
      </div>
      <div className="flex-1 overflow-y-auto p-1 min-h-0 bg-[var(--card)]">
        {sub.tree.children && sub.tree.children.map((c) => (
          <SubsystemFileRow key={c.path} node={c} expanded={expanded} toggle={toggle} onOpen={selectFile} />
        ))}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-[var(--foreground)] !border-0 !rounded-none" />
    </div>
  )
}

const nodeTypes = { subsystem: SubsystemNode }

export function ArchitectureMap() {
  const { files, includes, selectFile } = useStore()

  const { nodes, edges } = useMemo(() => {
    const subsystems = collectSubsystems(files)
    if (subsystems.length === 0) return { nodes: [], edges: [] }

    const bySubsystem = new Map<string, Subsystem>()
    for (const s of subsystems) bySubsystem.set(s.path, s)

    const pathSet = new Set<string>()
    for (const f of files) {
      const walk = (n: FileNode) => {
        pathSet.add(n.path)
        if (n.children) n.children.forEach(walk)
      }
      walk(f)
    }

    const edgeMap = new Map<string, { source: string; target: string; count: number }>()
    for (const inc of includes as IncludeEdge[]) {
      const source = inc.from_file.split('/')[0]
      const targetPath = resolveIncludeTarget(inc.to_file, pathSet)
      if (!targetPath) continue
      const target = targetPath.split('/')[0]
      if (!bySubsystem.has(source) || !bySubsystem.has(target)) continue
      if (source === target) continue
      const key = `${source}->${target}`
      const existing = edgeMap.get(key)
      if (existing) existing.count++
      else edgeMap.set(key, { source, target, count: 1 })
    }
    const subsystemEdges = Array.from(edgeMap.values())

    // dagre layout
    const g = new graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 120, marginx: 30, marginy: 30 })
    for (const s of subsystems) {
      g.setNode(s.path, { width: CARD_WIDTH, height: CARD_HEIGHT })
    }
    for (const e of subsystemEdges) {
      g.setEdge(e.source, e.target)
    }
    layout(g, {})

    const ns: Node[] = subsystems.map((s) => {
      const pos = g.node(s.path)
      return {
        id: s.path,
        type: 'subsystem',
        position: { x: pos.x - CARD_WIDTH / 2, y: pos.y - CARD_HEIGHT / 2 },
        data: { subsystem: s, selectFile },
        draggable: false,
        selectable: false,
      }
    })

    const es: Edge[] = subsystemEdges.map((e) => ({
      id: `edge:${e.source}->${e.target}`,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      label: e.count > 1 ? String(e.count) : undefined,
      labelStyle: { fontSize: 9, fill: 'var(--muted-foreground)' },
      labelBgStyle: { fill: 'var(--card)', fillOpacity: 0.9 },
      labelBgPadding: [3, 2] as [number, number],
      labelBgBorderRadius: 2,
      style: {
        stroke: '#1A1A18',
        strokeWidth: e.count > 5 ? 2 : e.count > 1 ? 1.5 : 1,
        opacity: 0.7,
      },
    }))

    return { nodes: ns, edges: es }
  }, [files, includes, selectFile])

  if (files.length === 0 || nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm">
        无项目数据
      </div>
    )
  }

  return (
    <div className="h-full bg-gridpaper">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Background color="rgba(224,169,60,0.10)" gap={24} />
        <Controls className="[&>button]:bg-[var(--card)] [&>button]:border-[var(--border)] [&>button]:text-[var(--foreground)] [&>button]:rounded-none" />
      </ReactFlow>
    </div>
  )
}
