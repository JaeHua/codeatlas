import { NextResponse } from 'next/server'
import { getIncludes, getCalls, getStructDeps } from '@/app/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const pid = Number(id)
  const includes = await getIncludes(pid)
  const calls = await getCalls(pid)
  const structs = await getStructDeps(pid)
  return NextResponse.json({ includes, calls, structs })
}
