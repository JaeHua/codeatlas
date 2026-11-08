import { defaultUrlTransform } from 'react-markdown'

export interface CodeatlasRef {
  path: string
  line?: number
}

export function allowCodeatlasUrl(url: string): string {
  if (url.startsWith('codeatlas://file')) return url
  return defaultUrlTransform(url)
}

export function parseCodeatlasHref(href?: string): CodeatlasRef | null {
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

export function parseFileLineRef(text: string): { path: string; line: number } | null {
  const m = /^([\w./\-[\]]+):(\d+)$/.exec(text.trim())
  if (!m) return null
  const filePath = m[1]
  if (!/[./]/.test(filePath)) return null
  return { path: filePath, line: Number(m[2]) }
}
