'use client'

import { useEffect, useRef, useState, useId } from 'react'
import mermaid from 'mermaid'

let initialized = false
function ensureInit() {
  if (initialized) return
  initialized = true
  mermaid.initialize({
    startOnLoad: false,
    theme: 'neutral',
    securityLevel: 'loose',
    themeVariables: {
      primaryColor: '#c17e60', primaryTextColor: '#3d3629', primaryBorderColor: '#d4c9b5',
      lineColor: '#8c8273', secondaryColor: '#d4c9b5', tertiaryColor: '#e8dcc8',
      noteBkgColor: '#ede6d8', noteTextColor: '#8c8273',
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
      // Sanitize: wrap node labels containing special chars in quotes
      let sanitized = chart
        .replace(/\[([^\]]*?);([^\]]*)\]/g, '["$1#59;$2"]')
        .replace(/\(([^)]*?);([^)]*)\)/g, '("$1#59;$2")')
        .replace(/\[([^\]]*?)</g, '["$1')
        .replace(/>([^\]]*?)\]/g, '$1"]')

      try {
        const { svg: rendered } = await mermaid.render(`${id}-${Date.now()}`, sanitized)
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
      <pre className="text-xs font-mono text-[var(--muted-foreground)] whitespace-pre-wrap p-3 rounded-lg border border-[var(--border)] overflow-auto max-h-[300px]">
        {chart}
      </pre>
    )
  }
  if (!svg) return <div className="flex items-center justify-center py-8 text-[var(--muted-foreground)] text-xs">Rendering...</div>
  return <div className="flex justify-center overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
}
