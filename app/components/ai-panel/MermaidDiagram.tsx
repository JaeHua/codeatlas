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
    themeVariables: {
      primaryColor: '#c17e60',
      primaryTextColor: '#3d3629',
      primaryBorderColor: '#d4c9b5',
      lineColor: '#8c8273',
      secondaryColor: '#d4c9b5',
      tertiaryColor: '#e8dcc8',
      noteBkgColor: '#ede6d8',
      noteTextColor: '#8c8273',
    },
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true,
      curve: 'basis',
    },
  })
}

interface Props {
  chart: string
}

export function MermaidDiagram({ chart }: Props) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const id = useId().replace(/:/g, '-')

  useEffect(() => {
    ensureInit()
    let cancelled = false
    const renderId = `${id}-${Date.now()}`

    async function render() {
      try {
        const { svg: rendered } = await mermaid.render(renderId, chart)
        if (!cancelled) {
          setSvg(rendered)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to render diagram')
        }
      }
    }

    render()

    return () => {
      cancelled = true
    }
  }, [chart, id])

  if (error) {
    return (
      <pre className="text-xs font-mono text-[var(--muted-foreground)] whitespace-pre-wrap p-3 rounded-lg border border-[var(--border)]">
        {chart}
      </pre>
    )
  }

  if (!svg) {
    return (
      <div className="flex items-center justify-center py-8 text-[var(--muted-foreground)] text-xs">
        Rendering...
      </div>
    )
  }

  return (
    <div
      className="flex justify-center overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}