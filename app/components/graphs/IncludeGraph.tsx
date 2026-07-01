'use client'

import { useMemo, useCallback } from 'react'
import { useStore } from '@/app/store'
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

const nodeColors: Record<string, string> = {
  current: '#3b82f6',
  included: '#22c55e',
  includer: '#a855f7',
}

export function IncludeGraph() {
  const { selectedFile, includes, selectFile } = useStore()

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!selectedFile) return { initialNodes: [], initialEdges: [] }

    const fromCurrent = includes.filter((e) => e.from_file === selectedFile)
    const toCurrent = includes.filter((e) => e.to_file === selectedFile)

    const nodeMap = new Map<string, Node>()
    const edgeList: Edge[] = []

    nodeMap.set(selectedFile, {
      id: selectedFile,
      data: { label: selectedFile.split('/').pop() || selectedFile },
      position: { x: 400, y: 300 },
      style: {
        background: nodeColors.current,
        color: '#fff',
        border: '2px solid #2563eb',
        borderRadius: '8px',
        padding: '8px 16px',
        fontSize: 12,
        fontWeight: 600,
      },
    })

    fromCurrent.forEach((inc, i) => {
      nodeMap.set(inc.to_file, {
        id: inc.to_file,
        data: { label: inc.to_file.split('/').pop() || inc.to_file },
        position: {
          x: 400 + 250 * Math.cos((2 * Math.PI * i) / fromCurrent.length),
          y: 300 + 250 * Math.sin((2 * Math.PI * i) / fromCurrent.length),
        },
        style: {
          background: nodeColors.included,
          color: '#fff',
          border: '1px solid #16a34a',
          borderRadius: '8px',
          padding: '6px 14px',
          fontSize: 11,
        },
      })
      edgeList.push({
        id: `${selectedFile}->${inc.to_file}`,
        source: selectedFile,
        target: inc.to_file,
        style: { stroke: '#22c55e', strokeWidth: 1.5 },
        animated: true,
      })
    })

    toCurrent.forEach((inc, i) => {
      if (!nodeMap.has(inc.from_file)) {
        nodeMap.set(inc.from_file, {
          id: inc.from_file,
          data: { label: inc.from_file.split('/').pop() || inc.from_file },
          position: {
            x: 400 + 250 * Math.cos(Math.PI + (2 * Math.PI * i) / toCurrent.length),
            y: 300 + 250 * Math.sin(Math.PI + (2 * Math.PI * i) / toCurrent.length),
          },
          style: {
            background: nodeColors.includer,
            color: '#fff',
            border: '1px solid #9333ea',
            borderRadius: '8px',
            padding: '6px 14px',
            fontSize: 11,
          },
        })
      }
      edgeList.push({
        id: `${inc.from_file}->${selectedFile}`,
        source: inc.from_file,
        target: selectedFile,
        style: { stroke: '#a855f7', strokeWidth: 1.5 },
        animated: true,
      })
    })

    return { initialNodes: Array.from(nodeMap.values()), initialEdges: edgeList }
  }, [selectedFile, includes])

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectFile(node.id)
    },
    [selectFile]
  )

  if (!selectedFile) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        Select a file to view its include graph
      </div>
    )
  }

  return (
    <div className="h-full bg-neutral-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#27272a" gap={20} />
        <Controls className="[&>button]:bg-neutral-800 [&>button]:border-neutral-700 [&>button]:text-neutral-300" />
      </ReactFlow>
    </div>
  )
}
