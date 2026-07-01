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
  Handle,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Folder, File, ChevronRight, ChevronDown } from 'lucide-react'

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

function buildFlattenedTree(files: any[]): any[] {
  const tree: any[] = []
  for (const f of files) {
    tree.push({ ...f, _depth: 0, _parentId: null })
    if (f.children) {
      function walk(children: any[], depth: number, parentId: string) {
        for (const c of children) {
          tree.push({ ...c, _depth: depth, _parentId: parentId })
          if (c.children) walk(c.children, depth + 1, c.path)
        }
      }
      walk(f.children, 1, f.path)
    }
  }
  return tree
}

export function ArchitectureMap() {
  const { files, selectFile } = useStore()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const flatTree = useMemo(() => buildFlattenedTree(files), [files])

  const visibleRoots = useMemo(() => {
    // Start with root-level directories only
    const roots = new Set<string>()
    for (const node of flatTree.filter((n) => n._depth === 0)) {
      roots.add(node.path)
    }
    // Expand all expanded nodes recursively
    const visible = new Set<string>()
    for (const node of flatTree) {
      if (node._depth === 0) {
        visible.add(node.path)
        if (expanded.has(node.path) && node.children) {
          function show(children: any[]) {
            for (const c of children) {
              visible.add(c.path)
              if (expanded.has(c.path) && c.children) show(c.children)
            }
          }
          show(node.children)
        }
      }
    }
    return visible
  }, [flatTree, expanded])

  const { nodes, edges } = useMemo(() => {
    const ns: Node[] = []
    const es: Edge[] = []

    // Layout params
    const levelGap = 100
    const nodeGap = 45
    let currentY = 30

    // Only show top-level nodes and expanded children
    const visible = flatTree.filter((n) => visibleRoots.has(n.path))

    // Group by parent for layout
    const byParent = new Map<string | null, any[]>()
    for (const n of visible) {
      const key = n._parentId
      if (!byParent.has(key)) byParent.set(key, [])
      byParent.get(key)!.push(n)
    }

    // Layout root level
    const roots = byParent.get(null) || []
    let x = 60
    for (const r of roots) {
      const { ns: childNs, es: childEs, endX } = layoutSubtree(r, byParent, x, currentY, levelGap, 0, true)
      ns.push(...childNs)
      es.push(...childEs)
      x = endX + 40
    }

    return { nodes: ns, edges: es }
  }, [flatTree, visibleRoots, expanded])

  function layoutSubtree(
    node: any, byParent: Map<string | null, any[]>,
    startX: number, y: number, levelGap: number, depth: number,
    isDir: boolean
  ): { ns: Node[]; es: Edge[]; endX: number } {
    const ns: Node[] = []
    const es: Edge[] = []
    const note = DIR_NOTES[node.name] || ''
    const hasChildren = node.children && node.children.length > 0

    // Directory node
    ns.push({
      id: node.path,
      type: 'default',
      position: { x: startX, y },
      data: {
        label: (
          <div className="flex flex-col items-start gap-0.5">
            <div className="flex items-center gap-1.5">
              {isDir ? <Folder className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" /> : <File className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />}
              <span className="text-xs font-mono font-bold text-white">{node.name}</span>
              {hasChildren && (
                expanded.has(node.path)
                  ? <ChevronDown className="h-3 w-3 text-blue-400" />
                  : <ChevronRight className="h-3 w-3 text-blue-400" />
              )}
            </div>
            {note && isDir && <span className="text-[9px] text-blue-300/70 leading-tight">{note}</span>}
          </div>
        ),
        type: isDir ? 'dir' : 'file',
        path: node.path,
        hasChildren,
        isExpanded: expanded.has(node.path),
      },
      style: {
        background: isDir ? '#1e3a5f' : '#1e293b',
        border: `1.5px solid ${isDir ? '#3b82f6' : '#475569'}`,
        borderRadius: 8,
        padding: note ? '8px 12px' : '6px 12px',
        minWidth: 180,
        cursor: 'pointer',
      },
    })

    let maxX = startX + 180

    // Children
    if (expanded.has(node.path) && node.children) {
      const children = node.children
      let childX = startX + 40
      const childY = y + 80

      for (const child of children) {
        const childIsDir = child.type === 'directory'
        const result = layoutSubtree(child, byParent, childX, childY, levelGap, depth + 1, childIsDir)
        ns.push(...result.ns)
        es.push(...result.es)
        es.push({
          id: `edge:${node.path}->${child.path}`,
          source: node.path,
          target: child.path,
          type: 'smoothstep',
          style: { stroke: childIsDir ? '#3b82f6' : '#475569', strokeWidth: 1.5 },
          markerEnd: childIsDir ? undefined : undefined,
        })
        childX = result.endX + 20
        maxX = Math.max(maxX, result.endX)
      }
    }

    return { ns, es, endX: maxX }
  }

  const [, , onNodesChange] = useNodesState(nodes)
  const [, , onEdgesChange] = useEdgesState(edges)

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const d = node.data as any
    if (d.type === 'file' && d.path) {
      selectFile(d.path)
    } else if (d.hasChildren && d.path) {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(d.path)) next.delete(d.path)
        else next.add(d.path)
        return next
      })
    }
  }, [selectFile])

  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm">
        无项目数据
      </div>
    )
  }

  return (
    <div className="h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={1.5}
      >
        <Background color="var(--border)" gap={20} />
        <Controls className="[&>button]:bg-[var(--muted)] [&>button]:border-[var(--border)] [&>button]:text-[var(--foreground)]" />
      </ReactFlow>
    </div>
  )
}
