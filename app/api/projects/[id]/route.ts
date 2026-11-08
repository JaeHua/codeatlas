import { NextResponse } from 'next/server'
import { deleteProject, getProject } from '@/app/lib/db'
import fs from 'fs'
import path from 'path'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const projectId = Number(id)

  // Clean up source files
  const project = await getProject(projectId) as { source_path: string } | undefined
  if (project?.source_path) {
    try {
      const projectsDir = path.join(process.cwd(), 'projects')
      if (project.source_path.startsWith(projectsDir) && fs.existsSync(project.source_path)) {
        fs.rmSync(project.source_path, { recursive: true, force: true })
      }
    } catch {}
  }

  await deleteProject(projectId)
  return NextResponse.json({ ok: true })
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = await getProject(Number(id))
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(project)
}
