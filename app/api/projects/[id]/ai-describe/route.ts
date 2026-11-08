import { NextResponse } from 'next/server'
import { getSymbols, getIncludes, getCalls } from '@/app/lib/db'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const projectId = Number(id)

  try {
    const body = await req.json()
    const { filePath, apiKey, baseUrl, model } = body

    if (!apiKey || !filePath) {
      return NextResponse.json({ error: 'apiKey and filePath required' }, { status: 400 })
    }

    const allSymbols = await getSymbols(projectId)
    const fileSymbols = allSymbols.filter((s: any) => s.file === filePath)

    const allIncludes = await getIncludes(projectId)
    const includes = allIncludes.filter((i: any) => i.from_file === filePath || i.to_file === filePath)

    const allCalls = await getCalls(projectId)
    const calls = allCalls.filter((c: any) => c.caller_file === filePath || c.callee_file === filePath).slice(0, 30)

    // Build prompt
    const funcNames = fileSymbols.filter((s) => s.kind === 'function').map((s) => s.name)
    const structNames = fileSymbols.filter((s) => s.kind === 'struct').map((s) => s.name)
    const connectedFiles = [...new Set(includes.map((i) => i.from_file === filePath ? i.to_file : i.from_file))]
    const callList = calls.map((c) => `${c.caller} → ${c.callee}`).join(', ')

    const prompt = `分析 Linux 内核源码文件的结构和关系。用中文回复，JSON 格式：

{
  "file_desc": "这个文件的一句话概要",
  "nodes": [
    {"id": "函数或文件名", "desc": "1句话中文描述（8字以内）", "type": "function|struct|file"}
  ],
  "edges": [
    {"from": "A", "to": "B", "desc": "1句话关系描述（6字以内）", "type": "call|include|struct_dep"}
  ]
}

分析文件: ${filePath}
包含函数: ${funcNames.join(', ')}
包含结构体: ${structNames.join(', ')}
Include关系: ${connectedFiles.join(', ')}
调用关系: ${callList}

只返回JSON，不要markdown代码块。`

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 1500,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({ error: err.error?.message || `AI API error: ${res.status}` }, { status: 500 })
    }

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content || ''

    // Parse JSON from AI response
    let parsed: any = {}
    try {
      const cleaned = text.replace(/```json|```/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      parsed = { file_desc: text, nodes: [], edges: [] }
    }

    return NextResponse.json(parsed)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
