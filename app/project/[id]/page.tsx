'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useStore as useAppStore } from '@/app/store'
import { AppShell } from '@/app/components/layout/AppShell'
import { Loader2, ArrowLeft } from 'lucide-react'

export default function ProjectPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const {
    setFiles, setSymbols, setIncludes, setCalls, setArchitecture, setStructs,
    files,
  } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [parseProgress, setParseProgress] = useState(0)
  const [parseStatus, setParseStatus] = useState('')

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [filesRes, symbolsRes, graphRes] = await Promise.all([
        fetch(`/api/projects/${id}/files`),
        fetch(`/api/projects/${id}/symbols`),
        fetch(`/api/projects/${id}/graph`),
      ])

      if (!filesRes.ok) throw new Error('Failed to load')

      const rawFiles = await filesRes.json()
      const symbols = await symbolsRes.json()
      const graph = await graphRes.json()

      // Transform flat file list to tree
      const fileTree = buildFileTree(rawFiles)
      setFiles(fileTree)
      setSymbols(symbols)
      setIncludes(graph.includes || [])
      setCalls(graph.calls || [])
      setStructs(graph.structs || [])

      // Build architecture from directory structure
      const arch = buildArchitecture(fileTree)
      setArchitecture(arch)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [id, setFiles, setSymbols, setIncludes, setCalls, setArchitecture, setStructs])

  useEffect(() => { loadData() }, [loadData])

  // Poll project status only if data hasn't loaded yet
  useEffect(() => {
    if (!loading || files.length > 0) return
    let timer: ReturnType<typeof setInterval>
    const poll = async () => {
      try {
        const res = await fetch(`/api/projects/${id}`)
        if (res.ok) {
          const proj = await res.json()
          setParseStatus(proj.parse_status || '')
          setParseProgress(proj.parse_progress || 0)
          if (proj.parse_status === 'complete') {
            clearInterval(timer)
            loadData()
          }
        }
      } catch {}
    }
    timer = setInterval(poll, 2000)
    return () => clearInterval(timer)
  }, [id, loading, files.length, loadData])

  // Parsing progress view
  if (parseStatus === 'parsing' && files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[var(--background)] gap-6">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
        <div className="w-64">
          <div className="flex justify-between text-xs text-[var(--muted-foreground)] mb-2">
            <span>正在解析项目代码</span>
            <span>{parseProgress}%</span>
          </div>
          <div className="h-2 bg-[var(--muted)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--primary)] rounded-full transition-all duration-500"
              style={{ width: `${parseProgress}%` }}
            />
          </div>
          <p className="text-[11px] text-[var(--muted-foreground)] mt-2 text-center">
            正在用 tree-sitter 分析源码结构...
          </p>
        </div>
      </div>
    )
  }

  // Loading: fetching data
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--background)] gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--primary)]" />
        <span className="text-sm text-[var(--muted-foreground)]">加载项目数据...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[var(--background)] gap-3">
        <p className="text-sm text-red-400">{error}</p>
        <button onClick={() => router.push('/')} className="text-xs text-[var(--primary)] hover:underline">← 返回项目列表</button>
      </div>
    )
  }

  return <AppShell projectId={Number(id)} />
}

interface DBFile {
  id: number
  project_id: number
  path: string
  name: string
  type: string
  parent_path: string | null
}

function buildFileTree(rawFiles: DBFile[]) {
  // Deduplicate: keep only first occurrence of each path
  const seen = new Set<string>()
  const unique = rawFiles.filter((f) => {
    if (seen.has(f.path)) return false
    seen.add(f.path)
    return true
  })

  const nodeMap = new Map<string, any>()

  // Create all nodes
  for (const f of unique) {
    nodeMap.set(f.path, {
      name: f.name,
      path: f.path,
      type: f.type as 'file' | 'directory',
      children: f.type === 'directory' ? [] : undefined,
    })
  }

  // Build hierarchy
  const roots: any[] = []
  for (const f of rawFiles) {
    const node = nodeMap.get(f.path)
    if (!node) continue

    if (!f.parent_path) {
      roots.push(node)
    } else {
      const parent = nodeMap.get(f.parent_path)
      if (parent && parent.children) {
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    }
  }

  // Sort: directories first, then alphabetically
  const sortNode = (node: any) => {
    if (node.children) {
      node.children.sort((a: any, b: any) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      node.children.forEach(sortNode)
    }
  }
  roots.forEach(sortNode)
  roots.sort((a: any, b: any) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return roots
}

function buildArchitecture(fileTree: any[]) {
  const subsystems = [
    { name: 'Source Files', files: [] as string[] },
  ]

  function collect(node: any) {
    if (node.type === 'file') {
      subsystems[0].files.push(node.path)
    }
    if (node.children) node.children.forEach(collect)
  }
  fileTree.forEach(collect)

  return subsystems.filter((s) => s.files.length > 0)
}
