'use client'

import { useEffect, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { ProjectAIView } from './ProjectAIView'

export function ProjectAIDrawer({ projectId }: { projectId: number }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end">
      {open && (
        <div className="mb-3 w-[min(92vw,420px)] h-[min(70vh,600px)] flex flex-col border border-[var(--border)] bg-[var(--card)] shadow-fabric animate-scale-in">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--primary)]" />
              项目 AI
            </div>
            <button
              onClick={() => setOpen(false)}
              className="h-6 w-6 flex items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ProjectAIView projectId={projectId} />
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
