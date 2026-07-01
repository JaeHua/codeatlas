'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Logo } from '@/app/components/layout/Logo'
import { Plus, FolderOpen, GitBranch, Upload, Trash2, Loader2 } from 'lucide-react'
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
        // Trigger parse
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
        // Create project first
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: projectName }),
        })
        if (!res.ok) throw new Error((await res.json()).error || '创建项目失败')
        const { id } = await res.json()

        if (importedFiles.length > 0) {
          const formData = new FormData()
          for (const f of importedFiles) {
            formData.append(`file:${f.filePath}`, new File([f.content], f.filePath.split('/').pop() || 'file'))
          }
          const importRes = await fetch(`/api/projects/${id}/import-local`, { method: 'POST', body: formData })
          const importData = await importRes.json()
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

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const fileList: { filePath: string; content: string }[] = []
    const readers: Promise<void>[] = []
    let folderName = ''

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const fullPath = file.webkitRelativePath || file.name
      const slashIdx = fullPath.indexOf('/')
      // Extract folder name from first file
      if (slashIdx > 0 && !folderName) folderName = fullPath.slice(0, slashIdx)
      // Strip the top-level folder name so we import the CONTENTS
      const relativePath = slashIdx > 0 ? fullPath.slice(slashIdx + 1) : fullPath
      readers.push(
        file.text().then((content) => {
          fileList.push({ filePath: relativePath, content })
        })
      )
    }

    Promise.all(readers).then(() => {
      setImportedFiles(fileList)
      if (!projectName) {
        setProjectName(folderName || fileList[0]?.filePath.split('/')[0] || 'my-project')
      }
    })
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Header */}
      <div className="border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo className="h-14 w-14" />
          <h1 className="text-lg font-semibold">CodeAtlas</h1>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="h-8 text-xs gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          新建项目
        </Button>
      </div>

      {/* Project list */}
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--muted-foreground)]" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[var(--muted-foreground)] gap-3">
            <FolderOpen className="h-12 w-12 text-[var(--border)]" />
            <p className="text-sm">还没有项目</p>
            <p className="text-xs">点击「新建项目」导入你的第一个 C/C++ 代码库</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <div
                key={p.id}
                className="group border border-[var(--border)] rounded-lg p-4 hover:border-[var(--primary)]/50 transition-all duration-200 cursor-pointer bg-[var(--card)]/30"
                onClick={() => router.push(`/project/${p.id}`)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {p.source_type === 'git' ? (
                      <GitBranch className="h-4 w-4 text-[var(--primary)]" />
                    ) : (
                      <FolderOpen className="h-4 w-4 text-[var(--primary)]" />
                    )}
                    <h3 className="text-sm font-medium">{p.name}</h3>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteId(p.id) }}
                    className="opacity-0 group-hover:opacity-100 text-[var(--muted-foreground)] hover:text-red-500 transition-all"
                    title="删除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-[var(--muted-foreground)] truncate mb-2">{p.source_path}</p>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px]',
                      p.parse_status === 'complete' && 'text-green-500 border-green-500/30',
                      p.parse_status === 'parsing' && 'text-blue-500 border-blue-500/30',
                      p.parse_status === 'error' && 'text-red-500 border-red-500/30',
                      p.parse_status === 'pending' && 'text-[var(--muted-foreground)]'
                    )}
                  >
                    {p.parse_status === 'complete' ? '已解析' : p.parse_status === 'parsing' ? '解析中' : p.parse_status === 'error' ? '失败' : '待解析'}
                  </Badge>
                  {p.parse_status === 'error' && (
                    <button
                      onClick={(e) => handleRetryParse(p.id, e)}
                      className="text-[10px] text-[var(--primary)] hover:underline"
                    >
                      重试
                    </button>
                  )}
                  <span className="text-[10px] text-[var(--muted-foreground)]">{p.source_type}</span>
                </div>
                {p.parse_error && (
                  <p className="mt-2 text-[10px] text-red-400 line-clamp-2" title={p.parse_error}>
                    {p.parse_error}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New project dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[var(--card)] border-[var(--border)] text-[var(--foreground)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">导入项目</DialogTitle>
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
                    'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs border transition-all',
                    dialogMode === mode
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                      : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)]/50'
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
              className="h-8 text-xs bg-[var(--muted)]/50 border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/70"
            />

            {dialogMode === 'git' && (
              <Input
                placeholder="Git URL (https://github.com/...)"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                className="h-8 text-xs bg-[var(--muted)]/50 border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/70"
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
                  className="flex items-center justify-center gap-2 w-full py-6 border-2 border-dashed border-[var(--border)] rounded-lg cursor-pointer hover:border-[var(--primary)]/50 transition-colors text-xs text-[var(--muted-foreground)]"
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

            <Button onClick={handleCreate} disabled={creating || !projectName.trim()} className="w-full h-8 text-xs">
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
            <DialogTitle className="text-sm font-semibold">确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-[var(--muted-foreground)]">删除后项目及解析数据将被永久移除，无法恢复。</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteId(null)} className="h-8 text-xs">取消</Button>
            <Button onClick={() => deleteId && handleDelete(deleteId)} className="h-8 text-xs bg-red-500 hover:bg-red-600">确认删除</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
