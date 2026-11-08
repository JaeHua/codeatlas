'use client'

import { useEffect, useState } from 'react'
import { Sparkles, X, GitBranch } from 'lucide-react'
import { ProjectAIView } from './ProjectAIView'
import { ProjectAIFlowView } from './ProjectAIFlowView'

type DrawerTab = 'chat' | 'flow'

export function ProjectAIDrawer({ projectId }: { projectId: number }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<DrawerTab>('chat')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') {
        if (document.querySelector('.mermaid-diagram-zoom')) return
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end">
      {open && (
        <div className="mb-3 w-[min(94vw,480px)] h-[min(80vh,700px)] flex flex-col border border-[var(--border)] bg-[var(--card)] shadow-fabric animate-scale-in">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
                <Sparkles className="h-3.5 w-3.5 text-[var(--primary)]" />
                项目 AI
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTab('chat')}
                  className={
                    tab === 'chat'
                      ? 'border-b-2 border-[var(--primary)] px-1 pb-0.5 text-[11px] text-[var(--primary)]'
                      : 'border-b-2 border-transparent px-1 pb-0.5 text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }
                >
                  对话
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
            <button
              onClick={() => setOpen(false)}
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className={tab === 'chat' ? 'flex flex-1 min-h-0 flex-col' : 'hidden'}>
            <ProjectAIView projectId={projectId} />
          </div>
          <div className={tab === 'flow' ? 'flex flex-1 min-h-0 flex-col' : 'hidden'}>
            <ProjectAIFlowView projectId={projectId} />
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        title="项目 AI (Cmd/Ctrl+Shift+A)"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] shadow-fabric hover:opacity-90 transition-opacity"
      >
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
      </button>
    </div>
  )
}
