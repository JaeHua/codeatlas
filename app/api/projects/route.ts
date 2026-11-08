import { NextResponse } from 'next/server'
import { listProjects, createProject } from '@/app/lib/db'
import { getProjectsDir } from '@/app/lib/db'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

export async function GET() {
  const projects = await listProjects()
  return NextResponse.json(projects)
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, gitUrl, localPath } = body

    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })


    let sourcePath = ''
    let sourceType = 'local'

    if (gitUrl) {
      sourceType = 'git'
      const targetDir = path.join(getProjectsDir(), name.replace(/[^a-zA-Z0-9_-]/g, '_'))
      sourcePath = targetDir
      if (!fs.existsSync(targetDir)) {
        execSync(`git clone ${gitUrl} "${targetDir}"`, { stdio: 'pipe' })
      }
    } else if (localPath) {
      sourceType = 'local'
      sourcePath = localPath
    } else {
      const targetDir = path.join(getProjectsDir(), name.replace(/[^a-zA-Z0-9_-]/g, '_'))
      sourceType = 'local'
      sourcePath = targetDir
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true })
    }

    const id = await createProject(name, sourcePath, sourceType)
    return NextResponse.json({ id, name, sourcePath, sourceType })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
