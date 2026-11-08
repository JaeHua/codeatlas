import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getProject, insertFile, updateParseStatus } from '@/app/lib/db'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const projectId = Number(id)
  const project = await getProject(projectId) as { source_path: string } | undefined
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    let files: { filePath: string; content: string }[] = []

    // Try JSON first (for Tauri/WKWebView compatibility)
    const contentType = req.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const body = await req.json()
      files = body.files || []
    } else {
      // Fallback: FormData
      const formData = await req.formData()
      for (const [key, value] of formData.entries()) {
        if (key.startsWith('file:') && typeof value === 'object' && 'text' in value) {
          const blob = value as Blob
          const content = await blob.text()
          files.push({ filePath: key.slice(5), content })
        }
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files received' }, { status: 400 })
    }

    console.log(`Importing ${files.length} files to project ${projectId}`)

    const insertedDirs = new Set<string>()
    for (const f of files) {
      if (!f.filePath || !f.content) continue
      const fullPath = path.join(project.source_path, f.filePath)
      const dir = path.dirname(fullPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) continue
      fs.writeFileSync(fullPath, f.content || '', 'utf-8')

      const relativePath = f.filePath
      const fileName = path.basename(relativePath)
      const parentDir = path.dirname(relativePath)

      if (parentDir !== '.') {
        const parts = parentDir.split(path.sep)
        let acc = ''
        for (const part of parts) {
          const p = acc ? path.join(acc, part) : part
          if (!insertedDirs.has(p)) {
            await insertFile(projectId, { path: p, name: part, type: 'directory', parentPath: acc || undefined })
            insertedDirs.add(p)
          }
          acc = p
        }
      }

      await insertFile(projectId, {
        path: relativePath, name: fileName, type: 'file',
        parentPath: parentDir === '.' ? undefined : parentDir,
        content: f.content,
      })
    }

    await updateParseStatus(projectId, 'pending')
    return NextResponse.json({ imported: files.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
