'use client'

import { useCallback, useRef } from 'react'
import { useStore } from '@/app/store'

export interface SearchOptions {
  mode?: 'normal' | 'refs'
  regex?: boolean
  scopeFile?: string
}

export function useSearch() {
  const { files, symbols, setSearchQuery, setSearchResults } = useStore()
  const abortRef = useRef<AbortController | null>(null)

  return useCallback(
    async (query: string, opts?: SearchOptions) => {
      const mode = opts?.mode || 'normal'
      const isRegex = opts?.regex || false
      const scopeFile = opts?.scopeFile || ''
      setSearchQuery(query)
      if (!query.trim()) {
        setSearchResults([])
        return
      }

      const projectId = useStore.getState().projectId
      const lower = query.toLowerCase()

      if (projectId) {
        try {
          abortRef.current?.abort()
          const ctrl = new AbortController()
          abortRef.current = ctrl
          const params = new URLSearchParams({
            q: query,
            mode,
            regex: isRegex ? '1' : '0',
          })
          if (scopeFile) params.set('scopeFile', scopeFile)
          const res = await fetch(`/api/projects/${projectId}/search?${params.toString()}`, { signal: ctrl.signal })
          if (res.ok) {
            const data = await res.json()
            setSearchResults(data.map((item: any) => ({
              type: item.type,
              name: item.name,
              path: item.path,
              line: item.line || undefined,
              match: item.match,
              score: item.score || 0,
            })))
            return
          }
        } catch {}
      }

      // Local fallback
      const results: any[] = []
      if (mode !== 'refs') {
        for (const f of files) {
          if (f.type !== 'file') continue
          if (scopeFile && f.path !== scopeFile) continue
          if (f.name.toLowerCase().includes(lower) || f.path.toLowerCase().includes(lower)) {
            results.push({ type: 'file', name: f.name, path: f.path, score: 50 })
          }
        }
        for (const s of symbols) {
          if (scopeFile && s.file !== scopeFile) continue
          if (s.name.toLowerCase().includes(lower)) {
            results.push({ type: s.kind, name: s.name, path: s.file, line: s.kind === 'function' ? s.line + 1 : s.line, score: 70 })
          }
        }
      }
      results.sort((a: any, b: any) => b.score - a.score)
      setSearchResults(results.slice(0, 30))
    },
    [files, symbols, setSearchQuery, setSearchResults]
  )
}
