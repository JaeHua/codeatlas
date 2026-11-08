import { NextResponse } from 'next/server'
import { getSymbols } from '@/app/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const symbols = await getSymbols(Number(id))
  return NextResponse.json(symbols)
}
