import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { getProject, updateParseStatus } from '@/app/lib/db'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const projectId = Number(id)
  const project = await getProject(projectId) as { source_path: string } | undefined
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const formData = await req.formData()
    const zipFile = formData.get('zip') as File | null
    if (!zipFile) return NextResponse.json({ error: 'No zip file' }, { status: 400 })

    const buffer = Buffer.from(await zipFile.arrayBuffer())
    const zipPath = path.join(project.source_path, '_upload.zip')
    fs.writeFileSync(zipPath, buffer)

    // Try to unzip using system utility
    try {
      execSync(`cd "${project.source_path}" && unzip -o _upload.zip`, { stdio: 'pipe' })
    } catch {
      return NextResponse.json({ error: 'Failed to unzip. Make sure zip file is valid.' }, { status: 400 })
    } finally {
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)
    }

    await updateParseStatus(projectId, 'pending')
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
