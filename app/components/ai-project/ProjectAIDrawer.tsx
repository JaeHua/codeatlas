'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Sparkles, X, GitBranch, Minus, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ProjectAIView } from './ProjectAIView'
import { ProjectAIFlowView } from './ProjectAIFlowView'

type DrawerTab = 'chat' | 'flow'
type ResizeDir = 'left' | 'top' | 'corner'

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

export function ProjectAIDrawer({ projectId }: { projectId: number }) {
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [tab, setTab] = useState<DrawerTab>('chat')
  const [size, setSize] = useState({ w: 480, h: 700 })
  const resizeRef = useRef<{
    dir: ResizeDir
    startX: number
    startY: number
    startW: number
    startH: number
  } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault()
        setOpen((v) => !v)
        setMinimized(false)
      }
      if (e.key === 'Escape') {
        if (document.querySelector('.mermaid-diagram-zoom')) return
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const r = resizeRef.current
      if (!r) return
      const maxW = window.innerWidth - 24
      const maxH = window.innerHeight - 24
      let w = r.startW
      let h = r.startH
      if (r.dir === 'left' || r.dir === 'corner') w = clamp(r.startW + (r.startX - e.clientX), 360, maxW)
      if (r.dir === 'top' || r.dir === 'corner') h = clamp(r.startH + (r.startY - e.clientY), 260, maxH)
      setSize({ w, h })
    }
    function onUp() {
      resizeRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  function startResize(e: ReactPointerEvent<HTMLDivElement>, dir: ResizeDir) {
    e.preventDefault()
    e.stopPropagation()
    resizeRef.current = {
      dir,
      startX: e.clientX,
      startY: e.clientY,
      startW: size.w,
      startH: size.h,
    }
    document.body.style.cursor = dir === 'corner' ? 'nwse-resize' : dir === 'left' ? 'ew-resize' : 'ns-resize'
    document.body.style.userSelect = 'none'
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end">
      <div
        className={cn(
          'relative mb-3 flex flex-col border border-[var(--border)] bg-[var(--card)] shadow-fabric animate-scale-in',
          !open && 'hidden'
        )}
        style={{
          width: size.w,
          height: minimized ? undefined : size.h,
          maxWidth: '94vw',
          maxHeight: '88vh',
        }}
      >
        {open && !minimized && (
          <>
            <div
              onPointerDown={(e) => startResize(e, 'left')}
              className="absolute left-0 top-0 z-10 h-full w-1 cursor-ew-resize hover:bg-[var(--primary)]/40"
            />
            <div
              onPointerDown={(e) => startResize(e, 'top')}
              className="absolute left-0 top-0 z-10 h-1 w-full cursor-ns-resize hover:bg-[var(--primary)]/40"
            />
            <div
              onPointerDown={(e) => startResize(e, 'corner')}
              className="absolute left-0 top-0 z-10 h-3 w-3 cursor-nwse-resize"
            />
          </>
        )}

        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--primary)]" />
              项目 AI
            </div>
            <div className={cn('flex items-center gap-1', minimized && 'hidden')}>
              <button
                onClick={() => setTab('chat')}
                className={
                  tab === 'chat'
                    ? 'border-b-2 border-[var(--primary)] px-1 pb-0.5 text-[11px] text-[var(--primary)]'
                    : 'border-b-2 border-transparent px-1 pb-0.5 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }
              >
                项目问答
              </button>
              <button
                onClick={() => setTab('flow')}
                className={
                  tab === 'flow'
                    ? 'flex items-center gap-1 border-b-2 border-[var(--primary)] px-1 pb-0.5 text-[11px] text-[var(--primary)]'
                    : 'flex items-center gap-1 border-b-2 border-transparent px-1 pb-0.5 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }
              >
                <GitBranch className="h-3 w-3" />
                流程向导
              </button>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-0.5">
            <button
              onClick={() => setMinimized((v) => !v)}
              title={minimized ? '展开' : '收起'}
              className="flex h-6 w-6 items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              {minimized ? <Maximize2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => setOpen(false)}
              title="关闭"
              className="flex h-6 w-6 items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className={cn('flex min-h-0 flex-1 flex-col', (minimized || tab !== 'chat') && 'hidden')}>
          <ProjectAIView projectId={projectId} />
        </div>
        <div className={cn('flex min-h-0 flex-1 flex-col', (minimized || tab !== 'flow') && 'hidden')}>
          <ProjectAIFlowView projectId={projectId} onOpenChat={() => setTab('chat')} />
        </div>
      </div>

      <button
        onClick={() => {
          if (!open) {
            setOpen(true)
            setMinimized(false)
          } else {
            setOpen(false)
          }
        }}
        title="项目 AI (Cmd/Ctrl+Shift+A)"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] shadow-fabric hover:opacity-90 transition-opacity"
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </button>
    </div>
  )
}
