'use client'

import { useEffect, useState, useId } from 'react'
import mermaid from 'mermaid'
import { X, Maximize2 } from 'lucide-react'

let initialized = false
function ensureInit() {
  if (initialized) return
  initialized = true
  mermaid.initialize({
    startOnLoad: false,
    theme: 'neutral',
    securityLevel: 'loose',
    suppressErrorRendering: true,
    themeVariables: {
      primaryColor: '#FFFFFF', primaryTextColor: '#1A1A18', primaryBorderColor: '#1A1A18',
      lineColor: '#8A8578', secondaryColor: '#F3EFE6', tertiaryColor: '#F3EFE6',
      noteBkgColor: '#FFF7E0', noteTextColor: '#4A463E',
      edgeLabelBackground: '#FFFFFF',
    },
    flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
  })
}

export function MermaidDiagram({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const id = useId().replace(/:/g, '-')

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [expanded])

  useEffect(() => {
    ensureInit()
    let cancelled = false

    async function render() {
      try {
        const { svg: rendered } = await mermaid.render(`${id}-${Date.now()}`, chart)
        if (!cancelled) { setSvg(rendered); setError(false) }
        return
      } catch {}

      // Try with semicolons escaped inside brackets only
      try {
        const escaped = chart.replace(/\[([^\]]*);([^\]]*)\]/g, '["$1&#59;$2"]')
        const { svg: rendered } = await mermaid.render(`${id}-2-${Date.now()}`, escaped)
        if (!cancelled) { setSvg(rendered); setError(false) }
      } catch {
        if (!cancelled) setError(true)
      }
    }
    render()
    return () => { cancelled = true }
  }, [chart, id])

  if (error) {
    return (
      <pre className="text-xs font-mono text-[var(--muted-foreground)] whitespace-pre-wrap p-3 rounded-none border border-[var(--border)] overflow-auto max-h-[300px]">
        {chart}
      </pre>
    )
  }
  if (!svg) return <div className="flex items-center justify-center py-8 text-[var(--muted-foreground)] text-xs">Rendering...</div>
  return (
    <>
      <div className="group relative">
        <div
          role="button"
          tabIndex={0}
          title="点击放大"
          onClick={() => setExpanded(true)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(true) } }}
          className="mermaid-diagram flex justify-center overflow-x-auto cursor-zoom-in outline-none"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="pointer-events-none absolute right-1 top-1 rounded bg-[var(--card)]/85 p-1 text-[var(--muted-foreground)] opacity-0 transition-opacity group-hover:opacity-100">
          <Maximize2 className="h-3 w-3" />
        </div>
      </div>
      {expanded && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6"
          onClick={() => setExpanded(false)}
        >
          <button
            onClick={() => setExpanded(false)}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-none bg-white/10 text-white hover:bg-white/20 transition-colors"
            title="关闭 (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
          <div
            className="mermaid-diagram-zoom max-h-[88vh] max-w-[92vw] overflow-auto"
            onClick={(e) => e.stopPropagation()}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      )}
    </>
  )
}
