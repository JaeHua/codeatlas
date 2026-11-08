import { NextResponse } from 'next/server'
import { getProject, getFlowCache, setFlowCache } from '@/app/lib/db'
import { buildFlowContext, buildFlowPrompt } from '@/app/lib/flow-context'
import { parseFlowCard } from '@/app/lib/flow-card'
import type { FlowEntry } from '@/app/lib/types'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const projectId = Number(id)

  try {
    const body = await req.json()
    const { entry, apiKey, baseUrl, model, force } = body as {
      entry?: FlowEntry
      apiKey?: string
      baseUrl?: string
      model?: string
      force?: boolean
    }

    if (!entry?.name) return NextResponse.json({ error: 'entry.name required' }, { status: 400 })
    if (!apiKey) return NextResponse.json({ error: 'apiKey required' }, { status: 400 })

    const entryKey = `${entry.file || ''}::${entry.name}`

    if (!force) {
      const cached = await getFlowCache(projectId, entryKey)
      if (cached?.data) {
        try {
          const card = JSON.parse(String(cached.data))
          return NextResponse.json({ entry, card, cached: true })
        } catch {
          // corrupted cache — regenerate below
        }
      }
    }

    const project = (await getProject(projectId)) as { name?: string } | undefined
    const ctx = await buildFlowContext(projectId, entry)
    const prompt = buildFlowPrompt(project?.name || '当前项目', ctx)

    const res = await fetch(`${baseUrl || 'https://api.deepseek.com'}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 3000,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const msg = (err as { error?: { message?: string } })?.error?.message || `AI API error: ${res.status}`
      return NextResponse.json({ error: msg }, { status: res.status || 502 })
    }

    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content || ''
    const card = parseFlowCard(raw)
    await setFlowCache(projectId, entryKey, JSON.stringify(card))

    return NextResponse.json({ entry, card, cached: false })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
