import { NextResponse } from 'next/server'
import { getProject, updateParseStatus, updateParseError, clearParseError } from '@/app/lib/db'
import { execSync } from 'child_process'
import path from 'path'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const projectId = Number(id)
  const project = await getProject(projectId) as { source_path: string } | undefined
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await updateParseStatus(projectId, 'parsing')
  await clearParseError(projectId)

  try {
    const scriptPath = path.join(process.cwd(), 'scripts', 'parse-project.ts')
    const out = execSync(`npx tsx "${scriptPath}" ${projectId} "${project.source_path}"`, {
      stdio: 'pipe',
      timeout: 120000,
      env: { ...process.env },
    })
    console.log(`Parse output for ${projectId}:`, out.toString().slice(0, 500))
    await updateParseStatus(projectId, 'complete')
    return NextResponse.json({ status: 'complete', progress: 100 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const stderr = (err as { stderr?: Buffer }).stderr?.toString().slice(0, 300) || msg
    console.error(`Parse failed for ${projectId}:`, stderr)
    await updateParseError(projectId, stderr)
    return NextResponse.json({ status: 'error', error: stderr }, { status: 500 })
  }
}
