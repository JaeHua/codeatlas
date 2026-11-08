import { NextResponse, NextRequest } from 'next/server'
import { getFileTree, getSymbols } from '@/app/lib/db'

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const q = req.nextUrl.searchParams.get('q') || ''
  const mode = req.nextUrl.searchParams.get('mode') || 'normal'
  const isRegex = req.nextUrl.searchParams.get('regex') === '1'
  const scopeFile = req.nextUrl.searchParams.get('scopeFile') || ''
  if (!q || q.length < 1) return NextResponse.json([])

  const projectId = Number(id)
  const lower = q.toLowerCase()

  // ─── References mode: whole-word match of a symbol across file content ───
  if (mode === 'refs') {
    let matcher: RegExp
    try {
      matcher = isRegex ? new RegExp(q, 'gi') : new RegExp(`\\b${escapeRegExp(q)}\\b`, 'gi')
    } catch {
      return NextResponse.json([])
    }
    const files = await getFileTree(projectId)
    const results: { type: string; name: string; path: string; line?: number; match?: string; score: number }[] = []
    for (const f of files as any[]) {
      if (f.type !== 'file' || !f.content) continue
      if (scopeFile && f.path !== scopeFile) continue
      const content = f.content as string
      matcher.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = matcher.exec(content)) !== null && results.length < 200) {
        const start = Math.max(0, m.index - 30)
        const end = Math.min(content.length, m.index + q.length + 40)
        const snippet = content.slice(start, end).replace(/[\n\r]/g, ' ').trim()
        const line = content.slice(0, m.index).split('\n').length
        results.push({ type: 'ref', name: q, path: f.path, line, match: snippet, score: 100 })
        if (!matcher.global) break
      }
    }
    // Deduplicate by path + line
    const seen = new Set<string>()
    const deduped = results.filter((r) => {
      const key = `${r.path}:${r.line}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    return NextResponse.json(deduped.slice(0, 100))
  }

  // ─── Normal mode ───
  const results: { type: string; name: string; path: string; line?: number; match?: string; score: number }[] = []

  // 1. Symbol search
  const symbols = await getSymbols(projectId)
  for (const s of symbols as any[]) {
    if (scopeFile && s.file !== scopeFile) continue
    const name = (s.name || '').toLowerCase()
    if (!name.includes(lower)) continue
    let score = 60
    if (name === lower) score = 100
    else if (name.startsWith(lower)) score = 90
    else if (name.includes(`_${lower}`)) score = 85
    // 函数符号为 0 基行号，跳转需 +1（与 SymbolOutline 一致）
    const line = s.kind === 'function' ? s.line + 1 : s.line
    results.push({ type: s.kind || 'symbol', name: s.name, path: s.file, line, score })
  }

  // 2. File path/name search (only meaningful at project scope)
  const files = await getFileTree(projectId)
  if (!scopeFile) {
    for (const f of files as any[]) {
      if (f.type !== 'file') continue
      const pathLower = f.path.toLowerCase()
      const nameLower = f.name.toLowerCase()
      if (!pathLower.includes(lower) && !nameLower.includes(lower)) continue
      let score = 40
      if (nameLower === lower) score = 80
      else if (nameLower.startsWith(lower)) score = 70
      results.push({ type: 'file', name: f.name, path: f.path, score })
    }
  }

  // 3. Full-text content search
  let contentMatcher: RegExp | null = null
  if (isRegex) {
    try { contentMatcher = new RegExp(q, 'i') } catch { contentMatcher = null }
  }
  for (const f of files as any[]) {
    if (f.type !== 'file' || !f.content) continue
    if (scopeFile && f.path !== scopeFile) continue
    if (results.length > 60) break
    const content = (f.content as string).toLowerCase()
    const idx = contentMatcher ? content.search(contentMatcher) : content.indexOf(lower)
    if (idx < 0) continue
    const start = Math.max(0, idx - 25)
    const end = Math.min(content.length, idx + lower.length + 35)
    const snippet = (f.content as string).slice(start, end).replace(/[\n\r]/g, ' ').trim()
    const line = (f.content as string).slice(0, idx).split('\n').length
    results.push({ type: 'content', name: snippet, path: f.path, line, score: 30 })
  }

  // Sort by score descending, deduplicate by key
  const seen = new Set<string>()
  const sorted = results
    .sort((a, b) => b.score - a.score)
    .filter((r) => {
      const key = `${r.type}-${r.path}-${r.name}-${r.line || 0}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  return NextResponse.json(sorted.slice(0, 40))
}
