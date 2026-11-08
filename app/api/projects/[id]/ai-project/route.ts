import { NextResponse } from 'next/server'
import { getProject } from '@/app/lib/db'
import { retrieveProjectContext, buildProjectSystemPrompt } from '@/app/lib/project-retrieval'

interface IncomingMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const projectId = Number(id)

  try {
    const body = await req.json()
    const { messages, apiKey, baseUrl, model } = body as {
      messages?: IncomingMessage[]
      apiKey?: string
      baseUrl?: string
      model?: string
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 })
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'apiKey required' }, { status: 400 })
    }

    const project = (await getProject(projectId)) as { name?: string } | undefined
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    const query = lastUser?.content || ''

    const ctx = await retrieveProjectContext(projectId, query)
    const systemPrompt = buildProjectSystemPrompt(project?.name || '当前项目', ctx)

    const upstream = await fetch(`${baseUrl || 'https://api.deepseek.com'}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 0.3,
        max_tokens: 4096,
        stream: true,
      }),
    })

    if (!upstream.ok || !upstream.body) {
      const err = await upstream.json().catch(() => ({}))
      const msg = (err as { error?: { message?: string } })?.error?.message || `AI API error: ${upstream.status}`
      return NextResponse.json({ error: msg }, { status: upstream.status || 502 })
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
