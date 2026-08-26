'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Logo } from '@/app/components/layout/Logo'
import { HandArrow, HandAnnotation, HandUnderline } from '@/app/components/hand/Sketch'
import { HeroPenguin } from '@/app/components/hero/HeroPenguin'
import { Plus, FolderOpen, GitBranch, Upload, Trash2, Loader2, History } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Project {
  id: number
  name: string
  source_path: string
  source_type: string
  created_at: string
  parse_status: string
  parse_error?: string
}

export default function Home() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'folder' | 'git' | 'zip'>('folder')
  const [projectName, setProjectName] = useState('')
  const [gitUrl, setGitUrl] = useState('')
  const [localPath, setLocalPath] = useState('')
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [importedFiles, setImportedFiles] = useState<{ filePath: string; content: string }[]>([])
  const [deleteId, setDeleteId] = useState<number | null>(null)

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects')
      if (res.ok) setProjects(await res.json())
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadProjects() }, [loadProjects])

  const handleCreate = async () => {
    if (!projectName.trim()) return
    setCreating(true)
    setError('')

    try {
      if (dialogMode === 'git') {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: projectName, gitUrl }),
        })
        if (!res.ok) throw new Error((await res.json()).error)
        const { id } = await res.json()
        await fetch(`/api/projects/${id}/parse`, { method: 'POST' })
        router.push(`/project/${id}`)
        return
      }

      if (dialogMode === 'zip' && zipFile) {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: projectName }),
        })
        if (!res.ok) throw new Error((await res.json()).error)
        const { id } = await res.json()

        const formData = new FormData()
        formData.append('zip', zipFile)
        await fetch(`/api/projects/${id}/import-zip`, { method: 'POST', body: formData })
        await fetch(`/api/projects/${id}/parse`, { method: 'POST' })
        router.push(`/project/${id}`)
        return
      }

      if (dialogMode === 'folder') {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: projectName }),
        })
        if (!res.ok) throw new Error((await res.json()).error || '创建项目失败')
        const { id } = await res.json()

        if (importedFiles.length > 0) {
          const body = JSON.stringify({ files: importedFiles })
          const importRes = await fetch(`/api/projects/${id}/import-local`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          })
          let importData: any = {}
          try {
            importData = await importRes.json()
          } catch {
            const text = await importRes.text().catch(() => '')
            throw new Error('服务器响应异常: ' + text.slice(0, 200))
          }
          if (!importRes.ok) throw new Error(importData.error || '上传文件失败')
        } else {
          throw new Error('未选择文件，请点击文件夹区域选择项目目录')
        }

        const parseRes = await fetch(`/api/projects/${id}/parse`, { method: 'POST' })
        const parseData = await parseRes.json()
        if (!parseRes.ok) throw new Error(parseData.error || '解析项目失败')

        router.push(`/project/${id}`)
        return
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: number) => {
    await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    setDeleteId(null)
    loadProjects()
  }

  const handleRetryParse = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    await fetch(`/api/projects/${id}/parse`, { method: 'POST' })
    loadProjects()
  }

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const inputFiles = e.target.files
      if (!inputFiles || inputFiles.length === 0) return

      const fileList: { filePath: string; content: string }[] = []
      let folderName = ''
      const total = inputFiles.length

      for (let i = 0; i < total; i++) {
        try {
          const file = inputFiles[i]
          const fullPath = file.webkitRelativePath || file.name
          const slashIdx = fullPath.indexOf('/')
          if (slashIdx > 0 && !folderName) folderName = fullPath.slice(0, slashIdx)
          const relativePath = slashIdx > 0 ? fullPath.slice(slashIdx + 1) : fullPath

          if (!relativePath || relativePath.startsWith('.')) continue

          const content = await file.text()
          fileList.push({ filePath: relativePath, content })
        } catch (fileErr) {
          // Skip unreadable files
        }
      }

      setImportedFiles(fileList)
      if (!projectName) {
        setProjectName(folderName || fileList[0]?.filePath.split('/')[0] || 'my-project')
      }
    } catch (err) {
      setError('读取文件失败: ' + String(err))
    }
  }

  const STATUS_META: Record<string, { label: string; className: string }> = {
    complete: { label: '已解析', className: 'text-[var(--primary)]' },
    parsing: { label: '解析中', className: 'text-[var(--muted-foreground)]' },
    error: { label: '失败', className: 'text-red-500' },
    pending: { label: '待解析', className: 'text-[var(--muted-foreground)]/70' },
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Top bar */}
      <div className="border-b border-[var(--border)] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo className="h-7 w-7" />
          <span className="font-display text-[11px] tracking-[0.25em] uppercase text-[var(--muted-foreground)]">CodeAtlas</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/changelog" className="p-1.5 text-[var(--muted-foreground)] hover:text-[var(--primary)] hover:bg-[var(--accent)] transition-colors" title="更新日志" aria-label="更新日志">
            <History className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-1.5 group">
            <HandAnnotation className="w-9 h-6 text-[var(--primary)] -rotate-12 group-hover:rotate-3 transition-transform duration-300" />
            <button
              onClick={() => setDialogOpen(true)}
              className="relative flex items-center gap-1.5 px-4 h-9 text-xs font-semibold tracking-wide text-[var(--foreground)] border border-dashed border-[var(--primary)]/70 rounded-none hover:border-solid hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)] transition-all duration-200"
            >
              <Plus className="h-3.5 w-3.5 text-[var(--primary)] group-hover:text-[var(--primary-foreground)] transition-transform duration-300 group-hover:rotate-90" />
              新建项目
              <HandUnderline className="absolute left-1/2 -translate-x-1/2 -bottom-[7px] w-16 h-2 text-[var(--primary)] group-hover:opacity-0 transition-opacity duration-200 pointer-events-none" />
            </button>
          </div>
        </div>
      </div>

      {/* Hero — oversized editorial title, centered */}
      <div className="px-6 pt-14 pb-10">
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center justify-center">
            <h1 className="font-display text-6xl sm:text-7xl lg:text-8xl font-bold leading-[0.95] tracking-tight text-[var(--foreground)]">
              CODE
              <br />
              ATLAS
            </h1>
            <HeroPenguin className="w-32 sm:w-40 lg:w-48 -ml-1 sm:-ml-2 mt-6" />
          </div>
          <HandUnderline className="w-44 h-3 text-[var(--primary)] mt-3" />
          <p className="mt-6 text-sm text-[var(--muted-foreground)] leading-relaxed max-w-xl">
            像浏览地图一样探索源码。文件画像、核心函数、调用关系、知识图谱与推荐阅读路径，
            绘制成一张可以缩放、标记和探索的源码工程图纸。
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-[var(--muted-foreground)]">
            <span className="flex items-center gap-1.5">
              <HandAnnotation className="w-8 h-5 text-[var(--foreground)]/80" />
              导入项目，开始探索
            </span>
            <span className="flex items-center gap-1.5">
              <HandArrow className="w-8 h-4 text-[var(--foreground)]/80" />
              Linux / Redis / MySQL / Nginx
            </span>
          </div>
        </div>
      </div>

      {/* Project list — fine-line editorial table */}
      <div className="px-6 pb-16 max-w-5xl">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider">项目</h2>
          <span className="text-[11px] text-[var(--muted-foreground)] font-mono">
            {projects.length > 0 ? `${projects.length} entries` : ''}
          </span>
          <div className="flex-1 border-t border-[var(--border)]" />
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-shimmer" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="border border-[var(--border)] py-16 flex flex-col items-center text-center text-[var(--muted-foreground)] gap-4">
            <FolderOpen className="h-8 w-8 text-[var(--muted-foreground)]/40" />
            <div>
              <p className="text-sm text-[var(--foreground)]">还没有项目</p>
              <p className="text-xs mt-1">导入你的第一个 C/C++ 代码库，开始绘制源码地图</p>
            </div>
            <button onClick={() => setDialogOpen(true)} className="mt-2 text-xs text-[var(--primary)] hover:underline">
              点击「新建项目」导入
            </button>
          </div>
        ) : (
          <div>
            {/* Column header */}
            <div className="hidden sm:grid grid-cols-12 gap-4 px-3 pb-1.5 text-[10px] tracking-wider uppercase text-[var(--muted-foreground)]/70 font-mono border-b border-[var(--border)]">
              <span className="col-span-4">名称</span>
              <span className="col-span-4">路径</span>
              <span className="col-span-2">类型</span>
              <span className="col-span-2 text-right">状态</span>
            </div>
            {projects.map((p) => {
              const status = STATUS_META[p.parse_status] || STATUS_META.pending
              return (
                <div
                  key={p.id}
                  onClick={() => router.push(`/project/${p.id}`)}
                  className="group grid grid-cols-2 sm:grid-cols-12 gap-2 sm:gap-4 items-center px-3 py-3 border-b border-[var(--border)] cursor-pointer hover:bg-[var(--card)] transition-colors"
                >
                  <div className="col-span-2 sm:col-span-4 flex items-center gap-2 min-w-0">
                    {p.source_type === 'git' ? (
                      <GitBranch className="h-3.5 w-3.5 text-[var(--muted-foreground)] flex-shrink-0" />
                    ) : (
                      <FolderOpen className="h-3.5 w-3.5 text-[var(--muted-foreground)] flex-shrink-0" />
                    )}
                    <span className="text-sm font-semibold text-[var(--foreground)] truncate">{p.name}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteId(p.id) }}
                      className="opacity-0 group-hover:opacity-100 text-[var(--muted-foreground)] hover:text-red-500 transition-all ml-1 flex-shrink-0"
                      title="删除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="hidden sm:block col-span-4 text-[11px] font-mono text-[var(--muted-foreground)] truncate">
                    {p.source_path}
                  </div>
                  <div className="hidden sm:block col-span-2 text-[11px] text-[var(--muted-foreground)] font-mono">
                    {p.source_type}
                  </div>
                  <div className="col-span-2 sm:col-span-2 flex items-center justify-end gap-2">
                    <Badge variant="outline" className={cn('text-[10px] rounded-none font-mono border-[var(--border)]', status.className)}>
                      {status.label}
                    </Badge>
                    {p.parse_status === 'error' && (
                      <button
                        onClick={(e) => handleRetryParse(p.id, e)}
                        className="text-[10px] text-[var(--primary)] hover:underline"
                      >
                        重试
                      </button>
                    )}
                  </div>
                  {p.parse_error && (
                    <div className="col-span-full text-[10px] text-red-400 line-clamp-2" title={p.parse_error}>
                      {p.parse_error}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* New project dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[var(--card)] border-[var(--border)] text-[var(--foreground)] sm:max-w-md animate-scale-in">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold tracking-wide">导入项目</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Mode tabs */}
            <div className="flex gap-2">
              {([
                ['folder', FolderOpen, '打开文件夹'],
                ['git', GitBranch, 'Git Clone'],
                ['zip', Upload, '上传 ZIP'],
              ] as const).map(([mode, Icon, label]) => (
                <button
                  key={mode}
                  onClick={() => setDialogMode(mode)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-none text-xs border transition-colors',
                    dialogMode === mode
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)]'
                      : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--muted-foreground)]'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <Input
              placeholder="项目名称"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="h-8 text-xs rounded-none bg-[var(--muted)]/50 border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/70"
            />

            {dialogMode === 'git' && (
              <Input
                placeholder="Git URL (https://github.com/...)"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                className="h-8 text-xs rounded-none bg-[var(--muted)]/50 border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/70"
              />
            )}

            {dialogMode === 'folder' && (
              <div>
                <input
                  type="file"
                  // @ts-ignore webkitdirectory is valid
                  webkitdirectory=""
                  directory=""
                  multiple
                  onChange={handleFolderSelect}
                  className="hidden"
                  id="folder-input"
                />
                <label
                  htmlFor="folder-input"
                  className="flex items-center justify-center gap-2 w-full py-6 border border-[var(--border)] rounded-none cursor-pointer hover:border-[var(--primary)] transition-colors text-xs text-[var(--muted-foreground)]"
                >
                  <FolderOpen className="h-4 w-4" />
                  {importedFiles.length > 0
                    ? `已选择 ${importedFiles.length} 个文件`
                    : '点击选择本地项目文件夹'}
                </label>
              </div>
            )}

            {dialogMode === 'zip' && (
              <input
                type="file"
                accept=".zip"
                onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-[var(--muted-foreground)] file:mr-3 file:py-1.5 file:px-3 file:text-xs file:rounded file:border file:border-[var(--border)] file:bg-[var(--muted)]/50 file:text-[var(--foreground)]"
              />
            )}

            {error && <p className="text-xs text-red-400">{error}</p>}

            <Button onClick={handleCreate} disabled={creating || !projectName.trim()} className="w-full h-8 text-xs rounded-none">
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              导入并解析
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="bg-[var(--card)] border-[var(--border)] text-[var(--foreground)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold tracking-wide">确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-[var(--muted-foreground)]">删除后项目及解析数据将被永久移除，无法恢复。</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteId(null)} className="h-8 text-xs rounded-none">取消</Button>
            <Button onClick={() => deleteId && handleDelete(deleteId)} className="h-8 text-xs bg-red-500 hover:bg-red-600 rounded-none">确认删除</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
