'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useStore } from '@/app/store'
import { FileTree } from '@/app/components/file-tree/FileTree'
import { CodeViewer } from '@/app/components/code-viewer/CodeViewer'
import { FileGraph } from '@/app/components/graphs/FileGraph'
import { ArchitectureMap } from '@/app/components/graphs/ArchitectureMap'
import { AIPanel } from '@/app/components/ai-panel/AIPanel'
import { SearchBar } from '@/app/components/layout/SearchBar'
import { TracePanel } from '@/app/components/trace/TracePanel'
import { KeyboardShortcuts } from '@/app/components/layout/KeyboardShortcuts'
import { cn } from '@/lib/utils'
import { PanelLeft, PanelRight, Code, Share2, Map } from 'lucide-react'

const tabs = [
  { id: 'code' as const, label: '代码', icon: Code },
  { id: 'graph' as const, label: '图谱', icon: Share2 },
  { id: 'architecture' as const, label: '架构', icon: Map },
]

export function AppShell({ projectId }: { projectId?: number }) {
  const {
    activeView, setActiveView, selectedFile,
    leftWidth, rightWidth, leftCollapsed, rightCollapsed,
    setLeftWidth, setRightWidth, setLeftCollapsed, setRightCollapsed,
    setProjectId,
  } = useStore()
  const [projectName, setProjectName] = useState('')

  useEffect(() => {
    if (projectId) {
      setProjectId(projectId)
      fetch(`/api/projects/${projectId}`)
        .then((r) => r.json())
        .then((p) => setProjectName(p.name || ''))
        .catch(() => {})
    }
  }, [projectId, setProjectId])

  const [dragging, setDragging] = useState<'left' | 'right' | null>(null)
  const [dragValue, setDragValue] = useState<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((side: 'left' | 'right') => {
    setDragging(side)
    setDragValue(side === 'left' ? leftWidth : rightWidth)
  }, [leftWidth, rightWidth])

  useEffect(() => {
    if (!dragging) return
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      if (dragging === 'left') {
        const w = Math.round(Math.max(200, Math.min(500, e.clientX - rect.left)))
        setDragValue(w)
        setLeftWidth(w)
      } else {
        const w = Math.round(Math.max(280, Math.min(600, rect.right - e.clientX)))
        setDragValue(w)
        setRightWidth(w)
      }
    }
    const handleMouseUp = () => setDragging(null)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging, setLeftWidth, setRightWidth])

  return (
    <div className="flex flex-col h-screen relative z-10 bg-[var(--background)] text-[var(--foreground)]">
      <KeyboardShortcuts />
      <SearchBar projectName={projectName || undefined} />
      <div ref={containerRef} className={cn('flex flex-1 overflow-hidden', dragging && 'select-none')}>
        {/* Left panel */}
        {!leftCollapsed && (
          <div style={{ width: leftWidth }} className="flex-shrink-0 border-stitch-r flex flex-col transition-[width] duration-200 bg-white/30">
            <div className="flex items-center justify-between px-3 py-2 border-stitch-b">
              <span className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Explorer</span>
              <button
                onClick={() => setLeftCollapsed(true)}
                className="h-6 w-6 flex items-center justify-center rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-black/5 hover-lift transition-all duration-200"
              >
                <PanelLeft className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <FileTree />
            </div>
          </div>
        )}

        {leftCollapsed && (
          <div className="flex-shrink-0 border-stitch-r flex flex-col py-2 px-1">
            <button
              onClick={() => setLeftCollapsed(false)}
              className="h-6 w-6 flex items-center justify-center rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-black/5 transition-all duration-200"
            >
              <PanelLeft className="h-3.5 w-3.5 rotate-180" />
            </button>
          </div>
        )}

        {/* Left resize handle */}
        {!leftCollapsed && (
          <div className="relative w-1 cursor-col-resize hover:bg-[var(--primary)]/30 active:bg-[var(--primary)] flex-shrink-0 transition-colors duration-150" onMouseDown={() => handleMouseDown('left')}>
            {dragging === 'left' && (
              <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 bg-[var(--primary)] text-[var(--primary-foreground)] text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none shadow-fabric">
                {dragValue}px
              </div>
            )}
          </div>
        )}

        {/* Center */}
        <div className="flex-1 flex flex-col min-w-0 bg-[var(--background)]/60">
          <div className="flex items-center border-stitch-b bg-[var(--card)]/50">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all duration-300 -mb-[1px] hover-lift',
                  activeView === tab.id
                    ? 'text-[var(--primary)] border-b-2 border-[var(--primary)] bg-[var(--card)]'
                    : 'text-[var(--muted-foreground)] border-b-2 border-transparent hover:text-[var(--foreground)]'
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-hidden animate-fabric-in" key={activeView}>
            {activeView === 'code' && <CodeViewer />}
            {activeView === 'graph' && <FileGraph />}
            {activeView === 'architecture' && <ArchitectureMap />}
          </div>
          <TracePanel />
        </div>

        {/* Right resize handle */}
        {!rightCollapsed && (
          <div className="relative w-1 cursor-col-resize hover:bg-[var(--primary)]/30 active:bg-[var(--primary)] flex-shrink-0 transition-colors duration-150" onMouseDown={() => handleMouseDown('right')}>
            {dragging === 'right' && (
              <div className="absolute top-1/2 -translate-y-1/2 right-1/2 translate-x-1/2 bg-[var(--primary)] text-[var(--primary-foreground)] text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-50 pointer-events-none shadow-fabric">
                {dragValue}px
              </div>
            )}
          </div>
        )}

        {/* Right panel */}
        {!rightCollapsed && (
          <div style={{ width: rightWidth }} className="flex-shrink-0 border-stitch-l flex flex-col transition-[width] duration-200 bg-white/30">
            <div className="flex items-center justify-between px-3 py-2 border-stitch-b">
              <span className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">AI Insights</span>
              <button
                onClick={() => setRightCollapsed(true)}
                className="h-6 w-6 flex items-center justify-center rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-black/5 transition-all duration-200"
              >
                <PanelRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <AIPanel />
            </div>
          </div>
        )}

        {rightCollapsed && (
          <div className="flex-shrink-0 border-stitch-l flex flex-col py-2 px-1">
            <button
              onClick={() => setRightCollapsed(false)}
              className="h-6 w-6 flex items-center justify-center rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-black/5 transition-all duration-200"
            >
              <PanelRight className="h-3.5 w-3.5 rotate-180" />
            </button>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 border-stitch-t bg-[var(--card)]/50 text-[11px] text-[var(--muted-foreground)]">
        <span>{selectedFile || 'No file selected'}</span>
        <span>Linux Kernel 0.21 · 按 ? 查看快捷键</span>
      </div>
    </div>
  )
}
