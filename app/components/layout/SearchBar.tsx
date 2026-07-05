'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useStore } from '@/app/store'
import { useSearch } from '@/app/store/hooks'
import { SettingsDialog } from './SettingsDialog'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Command, CommandInput, CommandList, CommandItem } from '@/components/ui/command'
import { Search, ArrowLeft, FunctionSquare, Box, Hash, FileText, Code } from 'lucide-react'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  file: FileText,
  function: FunctionSquare,
  struct: Box,
  macro: Hash,
  content: Code,
}

export function SearchBar({ projectName }: { projectName?: string }) {
  const { searchOpen, setSearchOpen, searchResults } = useStore()
  const search = useSearch()
  const router = useRouter()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const handleSearch = useCallback((v: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(v), 120)
  }, [search])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearchOpen(!searchOpen)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [searchOpen, setSearchOpen])

  const handleSelect = useCallback(
    (result: (typeof searchResults)[0]) => {
      const { selectFileWithLine, setSelectedEntity } = useStore.getState()
      selectFileWithLine(result.path, result.line)
      setSelectedEntity({ type: result.type === 'file' ? 'file' : 'function', path: result.path, name: result.name, line: result.line })
      setSearchOpen(false)
    }, [setSearchOpen])

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border)] bg-[var(--card)]">
      {projectName && (
        <button onClick={() => router.push('/')} className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors flex-shrink-0" title="返回项目列表">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{projectName}</span>
        </button>
      )}
      <button onClick={() => setSearchOpen(true)} className="flex items-center gap-2 px-3 py-1.5 w-full max-w-md rounded-md bg-[var(--muted)]/50 text-sm text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)] transition-colors">
        <Search className="h-3.5 w-3.5" />
        <span>搜索文件、函数、结构体...</span>
        <kbd className="ml-auto text-xs text-[var(--muted-foreground)]/70 bg-[var(--muted)] px-1.5 py-0.5 rounded">⌘K</kbd>
      </button>
      <SettingsDialog />

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="p-0 gap-0 glass animate-scale-in sm:max-w-lg">
          <Command shouldFilter={false} className="bg-transparent">
            <CommandInput
              placeholder="搜索文件、函数、结构体..."
              onValueChange={(v) => handleSearch(v)}
              className="border-none text-[var(--foreground)]"
              autoFocus
            />
            <CommandList className="max-h-80 overflow-auto">
              {searchResults.length === 0 && (
                <div className="py-8 text-center text-sm text-[var(--muted-foreground)]">
                  <Search className="h-6 w-6 mx-auto mb-2 opacity-30" />
                  输入关键词搜索
                </div>
              )}
              {searchResults.map((item) => {
                const Icon = ICON_MAP[item.type] || FileText
                return (
                  <CommandItem
                    key={`${item.type}-${item.path}-${item.name}-${item.line || 0}`}
                    onSelect={() => handleSelect(item)}
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer aria-selected:bg-[var(--accent)]"
                    value={`${item.type}-${item.name}`}
                  >
                    <Icon className="h-4 w-4 text-[var(--muted-foreground)] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-[var(--foreground)] truncate">{item.name}</div>
                      <div className="flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]">
                        <span className="truncate">{item.path}</span>
                        {item.line && <span className="flex-shrink-0">:{item.line}</span>}
                      </div>
                    </div>
                    <span className="text-[10px] text-[var(--muted-foreground)]/50 uppercase flex-shrink-0">
                      {item.type === 'content' ? 'match' : item.type}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  )
}
