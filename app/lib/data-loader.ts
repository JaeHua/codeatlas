import type { FileNode, Symbol, IncludeEdge, CallEdge, ArchNode, MockAI, SearchResult, StructEdge } from './types'

import filesData from '@/app/data/files.json'
import symbolsData from '@/app/data/symbols.json'
import includesData from '@/app/data/includes.json'
import callsData from '@/app/data/calls.json'
import architectureData from '@/app/data/architecture.json'
import structsData from '@/app/data/structs.json'

const aiMockIndex: Record<string, () => Promise<MockAI>> = {
  'kernel_sched_c': () => import('@/app/data/ai-mock/kernel_sched_c.json').then((m) => m.default ?? m),
  'kernel_fork_c': () => import('@/app/data/ai-mock/kernel_fork_c.json').then((m) => m.default ?? m),
  'kernel_exit_c': () => import('@/app/data/ai-mock/kernel_exit_c.json').then((m) => m.default ?? m),
  'kernel_signal_c': () => import('@/app/data/ai-mock/kernel_signal_c.json').then((m) => m.default ?? m),
  'kernel_sys_c': () => import('@/app/data/ai-mock/kernel_sys_c.json').then((m) => m.default ?? m),
  'mm_memory_c': () => import('@/app/data/ai-mock/mm_memory_c.json').then((m) => m.default ?? m),
  'mm_swap_c': () => import('@/app/data/ai-mock/mm_swap_c.json').then((m) => m.default ?? m),
  'fs_open_c': () => import('@/app/data/ai-mock/fs_open_c.json').then((m) => m.default ?? m),
  'fs_buffer_c': () => import('@/app/data/ai-mock/fs_buffer_c.json').then((m) => m.default ?? m),
  'fs_exec_c': () => import('@/app/data/ai-mock/fs_exec_c.json').then((m) => m.default ?? m),
  'fs_namei_c': () => import('@/app/data/ai-mock/fs_namei_c.json').then((m) => m.default ?? m),
  'fs_pipe_c': () => import('@/app/data/ai-mock/fs_pipe_c.json').then((m) => m.default ?? m),
  'fs_inode_c': () => import('@/app/data/ai-mock/fs_inode_c.json').then((m) => m.default ?? m),
  'fs_super_c': () => import('@/app/data/ai-mock/fs_super_c.json').then((m) => m.default ?? m),
  'init_main_c': () => import('@/app/data/ai-mock/init_main_c.json').then((m) => m.default ?? m),
  'drivers_tty_io_c': () => import('@/app/data/ai-mock/drivers_tty_io_c.json').then((m) => m.default ?? m),
  'drivers_console_c': () => import('@/app/data/ai-mock/drivers_console_c.json').then((m) => m.default ?? m),
  'drivers_hd_c': () => import('@/app/data/ai-mock/drivers_hd_c.json').then((m) => m.default ?? m),
  'lib_vsprintf_c': () => import('@/app/data/ai-mock/lib_vsprintf_c.json').then((m) => m.default ?? m),
  'include_sched_h': () => import('@/app/data/ai-mock/include_sched_h.json').then((m) => m.default ?? m),
  'include_fs_h': () => import('@/app/data/ai-mock/include_fs_h.json').then((m) => m.default ?? m),
  'include_unistd_h': () => import('@/app/data/ai-mock/include_unistd_h.json').then((m) => m.default ?? m),
}

function slug(path: string): string {
  return path.replace(/\//g, '_').replace(/\./g, '_')
}

export function loadFiles(): FileNode[] {
  return filesData as unknown as FileNode[]
}

export function loadSymbols(): Symbol[] {
  return symbolsData as unknown as Symbol[]
}

export function loadIncludes(): IncludeEdge[] {
  return (includesData as unknown as IncludeEdge[])
}

export function loadCalls(): CallEdge[] {
  return callsData as unknown as CallEdge[]
}

export function loadArchitecture(): ArchNode[] {
  return architectureData as unknown as ArchNode[]
}

export function loadStructs(): StructEdge[] {
  return structsData as unknown as StructEdge[]
}

export async function loadAIMock(filePath: string): Promise<MockAI | null> {
  const loader = aiMockIndex[slug(filePath)]
  if (!loader) return null
  try {
    return await loader()
  } catch {
    return null
  }
}

export async function loadSourceCode(filePath: string): Promise<string> {
  const res = await fetch(`/kernel-source/${filePath}`)
  if (!res.ok) return '// Source not found'
  return res.text()
}

export function globalSearch(
  query: string,
  files: FileNode[],
  symbols: Symbol[]
): SearchResult[] {
  const lower = query.toLowerCase()
  const results: SearchResult[] = []

  for (const f of files) {
    if (f.type !== 'file') continue
    const nameLower = f.name.toLowerCase()
    const pathLower = f.path.toLowerCase()
    if (nameLower.includes(lower) || pathLower.includes(lower)) {
      results.push({
        type: 'file',
        name: f.name,
        path: f.path,
        score: nameLower.startsWith(lower) ? 90 : 50,
      })
    }
  }

  for (const s of symbols) {
    if (s.name.toLowerCase().includes(lower)) {
      results.push({
        type: s.kind as SearchResult['type'],
        name: s.name,
        path: s.file,
        line: s.line,
        score: s.name.toLowerCase() === lower ? 100 : 70,
      })
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 20)
}
