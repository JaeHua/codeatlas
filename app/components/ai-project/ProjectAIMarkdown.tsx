'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useStore } from '@/app/store'
import { MermaidDiagram } from '@/app/components/ai-panel/MermaidDiagram'

interface Props {
  content: string
}

function parseCodeatlasHref(href?: string): { path: string; line?: number } | null {
  if (!href || !href.startsWith('codeatlas://file')) return null
  try {
    const url = new URL(href)
    const path = url.searchParams.get('path')
    const lineStr = url.searchParams.get('line')
    if (!path) return null
    const line = lineStr ? Number(lineStr) : undefined
    return { path, line: Number.isFinite(line) ? line : undefined }
  } catch {
    return null
  }
}

export function ProjectAIMarkdown({ content }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="text-base font-bold text-[var(--foreground)] mt-3 mb-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-semibold text-[var(--foreground)] mt-3 mb-1.5">{children}</h2>,
        h3: ({ children }) => <h3 className="text-xs font-semibold text-[var(--foreground)] mt-2 mb-1">{children}</h3>,
        p: ({ children }) => <p className="text-xs text-[var(--foreground)] leading-relaxed mb-1.5">{children}</p>,
        ul: ({ children }) => <ul className="text-xs text-[var(--foreground)] list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="text-xs text-[var(--foreground)] list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-xs text-[var(--foreground)]">{children}</li>,
        code: ({ className, children, ...props }) => {
          const match = /language-(\w+)/.exec(className || '')
          if (match && match[1] === 'mermaid') {
            return <MermaidDiagram chart={String(children).replace(/\n$/, '')} />
          }
          if (!match) {
            return (
              <code className="text-[11px] font-mono bg-[var(--muted)] text-[var(--primary)] px-1 py-0.5 rounded" {...props}>
                {children}
              </code>
            )
          }
          return (
            <pre className="text-xs font-mono bg-[var(--background)] border border-[var(--border)] rounded-none p-3 my-2 overflow-x-auto whitespace-pre-wrap">
              <code className={className} {...props}>
                {children}
              </code>
            </pre>
          )
        },
        pre: ({ children }) => <>{children}</>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-[var(--primary)]/50 pl-3 my-2 text-xs text-[var(--muted-foreground)]">
            {children}
          </blockquote>
        ),
        strong: ({ children }) => <strong className="font-semibold text-[var(--foreground)]">{children}</strong>,
        em: ({ children }) => <em className="italic text-[var(--foreground)]">{children}</em>,
        a: ({ children, href }) => {
          const ref = parseCodeatlasHref(href)
          if (ref) {
            return (
              <button
                type="button"
                onClick={() => useStore.getState().selectFileWithLine(ref.path, ref.line)}
                className="text-[var(--primary)] underline text-xs cursor-pointer"
              >
                {children}
              </button>
            )
          }
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] underline text-xs">
              {children}
            </a>
          )
        },
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full text-xs border-collapse">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-[var(--border)] bg-[var(--muted)]/50 px-2 py-1 text-left text-[var(--foreground)] font-medium">{children}</th>
        ),
        td: ({ children }) => (
          <td className="border border-[var(--border)] px-2 py-1 text-[var(--muted-foreground)]">{children}</td>
        ),
        hr: () => <hr className="border-[var(--border)] my-2" />,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
