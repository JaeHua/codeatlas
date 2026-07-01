'use client'

import { useCallback } from 'react'
import { useStore } from '@/app/store'
import { loadFiles, loadSymbols, loadIncludes, loadCalls, loadArchitecture, globalSearch } from '@/app/lib/data-loader'

export function useInitData() {
  const { setFiles, setSymbols, setIncludes, setCalls, setArchitecture } = useStore()

  const init = useCallback(async () => {
    const [f, s, i, c, a] = await Promise.all([
      Promise.resolve(loadFiles()),
      Promise.resolve(loadSymbols()),
      Promise.resolve(loadIncludes()),
      Promise.resolve(loadCalls()),
      Promise.resolve(loadArchitecture()),
    ])
    setFiles(f)
    setSymbols(s)
    setIncludes(i)
    setCalls(c)
    setArchitecture(a)
  }, [setFiles, setSymbols, setIncludes, setCalls, setArchitecture])

  return init
}

export function useSearch() {
  const { files, symbols, setSearchQuery, setSearchResults } = useStore()

  return useCallback(
    (query: string) => {
      setSearchQuery(query)
      if (!query.trim()) {
        setSearchResults([])
        return
      }
      const results = globalSearch(query, files, symbols)
      setSearchResults(results)
    },
    [files, symbols, setSearchQuery, setSearchResults]
  )
}
