'use client'

import { useState, useMemo } from 'react'
import { useStore } from '@/app/store'
import { FileTreeNode } from './FileTreeNode'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Search, Star } from 'lucide-react'

export function FileTree() {
  const { files, selectFile, selectedFile, favorites } = useStore()
  const [filter, setFilter] = useState('')

  const filtered = useMemo(() => {
    if (!filter.trim()) return files
    const lower = filter.toLowerCase()

    function filterNodes(nodes: typeof files): typeof files {
      return nodes
        .map((n) => {
          if (n.children) {
            const filteredChildren = filterNodes(n.children)
            if (filteredChildren.length > 0) return { ...n, children: filteredChildren }
            if (n.name.toLowerCase().includes(lower)) return n
            return null
          }
          return n.name.toLowerCase().includes(lower) || n.path.toLowerCase().includes(lower) ? n : null
        })
        .filter(Boolean) as typeof files
    }

    return filterNodes(files)
  }, [files, filter])

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
          <Input
            placeholder="Filter files..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-7 pl-7 text-xs bg-[var(--muted)]/50 border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
          />
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="py-1">
          {/* Favorites section */}
          {favorites.length > 0 && !filter && (
            <>
              <div className="flex items-center gap-1.5 px-2 py-1">
                <Star className="h-3 w-3 text-[var(--primary)]" />
                <span className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase">Favorites</span>
              </div>
              {favorites.map((path) => (
                <FileTreeNode
                  key={`fav-${path}`}
                  node={{ name: path.split('/').pop() || path, path, type: 'file' }}
                  depth={0}
                  selectedFile={selectedFile}
                  onSelect={selectFile}
                />
              ))}
              <Separator className="my-1 bg-[var(--border)]" />
            </>
          )}

          {filtered.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              depth={0}
              selectedFile={selectedFile}
              onSelect={selectFile}
            />
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-4 text-xs text-[var(--muted-foreground)] text-center">No files found</p>
          )}
        </div>
      </ScrollArea>
      </div>
    </div>
  )
}
