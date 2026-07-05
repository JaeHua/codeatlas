'use client'

import { useCallback, useRef } from 'react'
import { useStore } from '@/app/store'

export function useSearch() {
  const { files, symbols, setSearchQuery, setSearchResults } = useStore()
  const abortRef = useRef<AbortController | null>(null)

  return useCallback(
    async (query: string) => {
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
          const res = await fetch(`/api/projects/${projectId}/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
          if (res.ok) {
            const data = await res.json()
            setSearchResults(data.map((item: any) => ({
              type: item.type,
              name: item.name,
              path: item.path,
              line: item.line || undefined,
              score: item.score || 0,
            })))
            return
          }
        } catch {}
      }

      // Local fallback
      const results: any[] = []
      for (const f of files) {
        if (f.type !== 'file') continue
        if (f.name.toLowerCase().includes(lower) || f.path.toLowerCase().includes(lower)) {
          results.push({ type: 'file', name: f.name, path: f.path, score: 50 })
        }
      }
      for (const s of symbols) {
        if (s.name.toLowerCase().includes(lower)) {
          results.push({ type: s.kind, name: s.name, path: s.file, line: s.line, score: 70 })
        }
      }
      results.sort((a: any, b: any) => b.score - a.score)
      setSearchResults(results.slice(0, 30))
    },
    [files, symbols, setSearchQuery, setSearchResults]
  )
}
