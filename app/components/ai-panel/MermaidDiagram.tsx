'use client'

import { useEffect, useState, useId } from 'react'
import mermaid from 'mermaid'

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
  const id = useId().replace(/:/g, '-')

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
  return <div className="flex justify-center overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
}
