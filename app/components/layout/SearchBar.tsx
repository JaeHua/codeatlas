'use client'

import { useEffect, useCallback } from 'react'
import { useStore } from '@/app/store'
import { useSearch } from '@/app/store/hooks'
import { SettingsDialog } from './SettingsDialog'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import { Search, ArrowLeft } from 'lucide-react'

export function SearchBar({ projectName }: { projectName?: string }) {
  const { searchOpen, setSearchOpen, searchQuery, searchResults } = useStore()
  const search = useSearch()
  const router = useRouter()

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
      const { selectFile, setSelectedEntity } = useStore.getState()
      selectFile(result.path)
      setSelectedEntity({
        type: result.type === 'file' ? 'file' : 'function',
        path: result.path,
        name: result.name,
      })
      setSearchOpen(false)
    },
    [setSearchOpen]
  )

  const groups = {
    Files: searchResults.filter((r) => r.type === 'file'),
    Functions: searchResults.filter((r) => r.type === 'function'),
    Structs: searchResults.filter((r) => r.type === 'struct'),
    Macros: searchResults.filter((r) => r.type === 'macro'),
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border)] bg-[var(--card)]">
      {projectName && (
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors flex-shrink-0"
          title="返回项目列表"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{projectName}</span>
        </button>
      )}
      <button
        onClick={() => setSearchOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 w-full max-w-md rounded-md bg-[var(--muted)]/50 text-sm text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)] transition-colors"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search files and symbols...</span>
        <kbd className="ml-auto text-xs text-[var(--muted-foreground)]/70 bg-[var(--muted)] px-1.5 py-0.5 rounded">
          ⌘K
        </kbd>
      </button>
      <SettingsDialog />

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="p-0 gap-0 bg-[var(--card)] border-[var(--border)]">
          <Command className="bg-transparent">
            <CommandInput
              placeholder="Search files, functions, structs..."
              value={searchQuery}
              onValueChange={(v) => search(v)}
              className="border-none text-[var(--foreground)]"
            />
            <CommandList className="max-h-80">
              {searchQuery && searchResults.length === 0 && (
                <div className="py-6 text-center text-sm text-[var(--muted-foreground)]">
                  No results found.
                </div>
              )}
              {Object.entries(groups).map(
                ([group, items]) =>
                  items.length > 0 && (
                    <CommandGroup key={group} heading={group}>
                      {items.map((item) => (
                        <CommandItem
                          key={`${item.type}-${item.path}-${item.name}`}
                          onSelect={() => handleSelect(item)}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[var(--foreground)]">{item.name}</span>
                            <span className="text-xs text-[var(--muted-foreground)]">{item.path}</span>
                          </div>
                          {item.line && (
                            <span className="text-xs text-[var(--muted-foreground)]/70">:{item.line}</span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </div>
  )
}
