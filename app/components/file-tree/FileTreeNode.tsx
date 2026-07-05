'use client'

import { useMemo } from 'react'
import { useStore } from '@/app/store'
import { cn } from '@/lib/utils'
import { ChevronRight, Folder, File, Hash, Star, FileCode, FileType, Cog } from 'lucide-react'
import type { FileNode } from '@/app/lib/types'

function IconForFile({ name }: { name: string }) {
  if (name.endsWith('.c')) return <FileCode className="h-3.5 w-3.5 text-[var(--primary)] flex-shrink-0" />
  if (name.endsWith('.h')) return <FileType className="h-3.5 w-3.5 text-[var(--foreground)] flex-shrink-0" />
  if (name.endsWith('.S') || name.endsWith('.s')) return <Cog className="h-3.5 w-3.5 text-[var(--primary)] flex-shrink-0" />
  return <File className="h-3.5 w-3.5 text-[var(--muted-foreground)] flex-shrink-0" />
}

interface Props {
  node: FileNode
  depth: number
  selectedFile: string | null
  onSelect: (path: string) => void
}

export function FileTreeNode({ node, depth, selectedFile, onSelect }: Props) {
  const { expandedDirs, toggleDir, favorites, addFavorite, removeFavorite } = useStore()
  const isExpanded = expandedDirs.includes(node.path)
  const isSelected = selectedFile === node.path
  const isDir = node.type === 'directory'
  const isFavorite = favorites.includes(node.path)

  const dirSymbolCount = useMemo(() => {
    if (!isDir || !node.children) return 0
    function count(nodes: FileNode[]): number {
      let n = 0
      for (const c of nodes) {
        if (c.type === 'file') n += c.symbols?.length || 0
        if (c.children) n += count(c.children)
      }
      return n
    }
    return count(node.children)
  }, [isDir, node.children])

  const symbolCount = node.symbols?.length || dirSymbolCount

  return (
    <div>
      <div className="flex items-center group w-full">
        <button
          onClick={() => {
            if (isDir) {
              toggleDir(node.path)
            } else {
              onSelect(node.path)
            }
          }}
            className={cn(
              'flex items-center gap-1 flex-1 text-left px-2 py-0.5 text-sm transition-all duration-200 min-w-0',
              isSelected && 'glass animate-breathe'
            )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isDir && (
            <ChevronRight
              className={cn('h-3.5 w-3.5 text-[var(--muted-foreground)] flex-shrink-0 transition-transform', isExpanded && 'rotate-90')}
            />
          )}
          {isDir ? (
            <Folder className="h-3.5 w-3.5 text-[var(--muted-foreground)] flex-shrink-0" />
          ) : (
            <IconForFile name={node.name} />
          )}
          <span className={cn('truncate flex-1', isDir ? 'text-[var(--muted-foreground)] text-xs font-medium' : 'text-[var(--foreground)] text-xs')}>
            {node.name}
          </span>
          {isFavorite && <Star className="h-3 w-3 text-[var(--primary)] flex-shrink-0" />}
          {symbolCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-[var(--muted-foreground)] flex-shrink-0">
              <Hash className="h-2.5 w-2.5" />
              {symbolCount}
            </span>
          )}
        </button>
        {!isDir && (
          <button
            onClick={() => isFavorite ? removeFavorite(node.path) : addFavorite(node.path)}
            className="opacity-0 group-hover:opacity-100 flex-shrink-0 px-1 text-[var(--muted-foreground)]/70 hover:text-[var(--primary)] transition-colors"
            title={isFavorite ? '取消收藏' : '收藏'}
          >
            <Star className={cn('h-3 w-3', isFavorite && 'fill-[var(--primary)] text-[var(--primary)]')} />
          </button>
        )}
      </div>
      {isDir && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}
