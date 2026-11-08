import { NextResponse } from 'next/server'
import { getSourceCode, getProject } from '@/app/lib/db'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const projectId = Number(id)

  try {
    const body = await req.json()
    const { filePath, question, apiKey, baseUrl, model } = body

    if (!apiKey) return NextResponse.json({ error: 'apiKey required' }, { status: 400 })

    const source = await getSourceCode(projectId, filePath || '')
    const project = await getProject(projectId) as { name: string } | undefined

    const res = await fetch(`${baseUrl || 'https://api.deepseek.com'}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `你正在帮助分析一个 C 语言项目的代码。项目: ${project?.name || '未知'}。文件: ${filePath}。\n\n源码:\n\`\`\`c\n${source.slice(0, 6000)}\n\`\`\`\n\n用中文回答，简洁专业。`,
          },
          { role: 'user', content: question },
        ],
        temperature: 0.3,
        max_tokens: 2048,
      }),
    })

    if (!res.ok) throw new Error(`AI API error: ${res.status}`)
    const data = await res.json()
    return NextResponse.json({ reply: data.choices?.[0]?.message?.content || '' })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
