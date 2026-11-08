import { NextResponse } from 'next/server'
import { getFileTree } from '@/app/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const files = await getFileTree(Number(id))
  return NextResponse.json(files)
}
