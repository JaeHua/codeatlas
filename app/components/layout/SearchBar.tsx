'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { useStore } from '@/app/store'
import { useSearch } from '@/app/store/hooks'
import { SettingsDialog } from './SettingsDialog'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Command, CommandInput, CommandList, CommandItem } from '@/components/ui/command'
import { Search, ArrowLeft, FunctionSquare, Box, Hash, FileText, Code, ListTree, X, Braces } from 'lucide-react'
import { cn } from '@/lib/utils'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  file: FileText,
  function: FunctionSquare,
  struct: Box,
  macro: Hash,
  content: Code,
  ref: ListTree,
}

const REF_SEARCHABLE = new Set(['function', 'struct', 'macro', 'typedef', 'variable', 'ref'])

export function SearchBar({ projectName }: { projectName?: string }) {
  const { searchOpen, setSearchOpen, searchResults, selectedFile, navBack, navForward, goBack, goForward } = useStore()
  const search = useSearch()
  const router = useRouter()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const [queryInput, setQueryInput] = useState('')
  const [regex, setRegex] = useState(false)
  const [scope, setScope] = useState<'all' | 'file'>('all')
  const [refName, setRefName] = useState<string | null>(null)

  const runSearch = useCallback((v: string, opts?: { mode?: 'normal' | 'refs'; regex?: boolean; scope?: 'all' | 'file'; name?: string }) => {
    const mode = opts?.mode || (opts?.name ? 'refs' : 'normal')
    const scopeFile = (opts?.scope ?? scope) === 'file' ? (selectedFile || '') : ''
    search(v, { mode, regex: opts?.regex ?? regex, scopeFile })
  }, [search, regex, scope, selectedFile])

  const handleSearch = useCallback((v: string) => {
    setQueryInput(v)
    if (refName && v !== refName) setRefName(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runSearch(v), 120)
  }, [runSearch, refName])

  const findRefs = useCallback((name: string) => {
    setRefName(name)
    setQueryInput(name)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    runSearch(name, { mode: 'refs', name, scope: scope })
  }, [runSearch, scope])

  const clearRefs = useCallback(() => {
    setRefName(null)
    runSearch(queryInput, { mode: 'normal' })
  }, [queryInput, runSearch])

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
      {projectName && (
        <div className="flex items-center border border-[var(--border)]">
          <button
            onClick={goBack}
            disabled={navBack.length === 0}
            className="px-1.5 py-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            title="后退 (⌘[)"
          >
            <ArrowLeft className="h-3.5 w-3.5 rotate-90" />
          </button>
          <button
            onClick={goForward}
            disabled={navForward.length === 0}
            className="px-1.5 py-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed border-l border-[var(--border)]"
            title="前进 (⌘])"
          >
            <ArrowLeft className="h-3.5 w-3.5 -rotate-90" />
          </button>
        </div>
      )}
      <button onClick={() => setSearchOpen(true)} className="flex items-center gap-2 px-3 py-1.5 w-full max-w-md bg-[var(--muted)]/50 text-sm text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)] transition-colors border border-[var(--border)]">
        <Search className="h-3.5 w-3.5" />
        <span>搜索文件、函数、结构体...</span>
        <kbd className="ml-auto text-xs text-[var(--muted-foreground)]/70 bg-[var(--muted)] px-1.5 py-0.5 rounded">⌘K</kbd>
      </button>
      <SettingsDialog />

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="p-0 gap-0 bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] animate-scale-in sm:max-w-lg">
          <Command shouldFilter={false} className="bg-transparent">
            <CommandInput
              placeholder={refName ? `引用：${refName}（可输入切换）` : '搜索文件、函数、结构体...'}
              value={queryInput}
              onValueChange={(v) => handleSearch(v)}
              className="border-none text-[var(--foreground)]"
              autoFocus
            />

            {/* Controls row: regex toggle + scope */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-[var(--border)]">
              {refName && (
                <span className="flex items-center gap-1 text-[10px] text-[var(--primary)] bg-[var(--primary)]/10 border border-[var(--primary)]/30 px-1.5 py-0.5 rounded-none">
                  <ListTree className="h-3 w-3" />
                  引用:{refName}
                  <button onClick={clearRefs} className="ml-1 hover:text-[var(--foreground)]"><X className="h-3 w-3" /></button>
                </span>
              )}
              <button
                onClick={() => { setRegex(!regex); runSearch(queryInput, { regex: !regex }) }}
                className={cn(
                  'flex items-center gap-1 text-[10px] px-1.5 py-0.5 border rounded-none transition-colors',
                  regex ? 'text-[var(--primary)] border-[var(--primary)] bg-[var(--primary)]/10' : 'text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'
                )}
                title="正则表达式搜索"
              >
                <Braces className="h-3 w-3" />
                .*
              </button>
              <button
                onClick={() => { const next = scope === 'all' ? 'file' : 'all'; setScope(next); runSearch(queryInput, { scope: next }) }}
                className={cn(
                  'flex items-center gap-1 text-[10px] px-1.5 py-0.5 border rounded-none transition-colors',
                  scope === 'file' ? 'text-[var(--primary)] border-[var(--primary)] bg-[var(--primary)]/10' : 'text-[var(--muted-foreground)] border-[var(--border)] hover:text-[var(--foreground)]'
                )}
                title="搜索范围"
              >
                {scope === 'all' ? '全部' : `当前文件:${(selectedFile || '').split('/').pop()}`}
              </button>
            </div>

            <CommandList className="max-h-80 overflow-auto">
              {searchResults.length === 0 && (
                <div className="py-8 text-center text-sm text-[var(--muted-foreground)] px-6">
                  <Search className="h-6 w-6 mx-auto mb-2 opacity-30" />
                  {queryInput.trim() ? (
                    <>
                      <p>没有找到与「{queryInput}」相关的结果</p>
                      <div className="mt-3 space-y-1 text-[11px] text-[var(--muted-foreground)]/70">
                        <p>· 可搜索函数名、结构体、宏、typedef</p>
                        <p>· 打开「.*」用正则表达式搜索</p>
                        <p>· 在符号结果上悬停点「引用」查看所有引用位置</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <p>输入关键词搜索</p>
                      <div className="mt-3 space-y-1 text-[11px] text-[var(--muted-foreground)]/70">
                        <p>· 搜函数：alloc_pages · 搜结构体：task_struct</p>
                        <p>· 打开「.*」启用正则 · 「当前文件」限定范围</p>
                        <p>· 符号结果悬停可「引用」</p>
                      </div>
                    </>
                  )}
                </div>
              )}
              {searchResults.map((item) => {
                const Icon = ICON_MAP[item.type] || FileText
                const canRef = REF_SEARCHABLE.has(item.type)
                return (
                  <CommandItem
                    key={`${item.type}-${item.path}-${item.name}-${item.line || 0}`}
                    onSelect={() => handleSelect(item)}
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer aria-selected:bg-[var(--accent)] group"
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
                    {canRef && (
                      <button
                        onClick={(e) => { e.stopPropagation(); findRefs(item.type === 'ref' ? item.name : item.name) }}
                        className="text-[10px] text-[var(--muted-foreground)]/50 hover:text-[var(--primary)] uppercase flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        引用
                      </button>
                    )}
                    <span className="text-[10px] text-[var(--muted-foreground)]/50 uppercase flex-shrink-0">
                      {item.type === 'content' ? 'match' : item.type === 'ref' ? 'ref' : item.type}
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
