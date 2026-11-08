import { NextResponse, NextRequest } from 'next/server'
import { getSourceCode } from '@/app/lib/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const file = req.nextUrl.searchParams.get('file')
  if (!file) return NextResponse.json({ error: 'file param required' }, { status: 400 })
  const content = await getSourceCode(Number(id), file)
  return NextResponse.json({ file, content })
}
