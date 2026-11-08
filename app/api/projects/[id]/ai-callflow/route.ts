import { NextResponse } from 'next/server'
import { getSymbols, getCalls } from '@/app/lib/db'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const projectId = Number(id)

  try {
    const body = await req.json()
    const { filePath, apiKey, baseUrl, model } = body
    if (!apiKey || !filePath) return NextResponse.json({ error: 'apiKey and filePath required' }, { status: 400 })

    const allSymbols = await getSymbols(projectId)
    const fileSymbols = allSymbols.filter((s: any) => s.file === filePath)
    const funcs = fileSymbols.filter((s: any) => s.kind === 'function')
    const structs = fileSymbols.filter((s: any) => s.kind === 'struct')

    const allCalls = await getCalls(projectId)
    const funcNames = new Set(funcs.map((f: any) => f.name))
    const relevantCalls = allCalls.filter((c: any) => funcNames.has(c.caller) || funcNames.has(c.callee))

    const prompt = `你是一个 Linux 内核源码分析专家。请分析这个源文件的函数调用关系，生成一个结构化的调用流程描述。

文件: ${filePath}

函数列表:
${funcs.map((f: any) => `- ${f.name}: ${f.signature || ''}`).join('\n')}

调用关系:
${relevantCalls.slice(0, 50).map((c: any) => `${c.caller} → ${c.callee}`).join(', ')}

请用中文回复。返回 JSON 格式（不要 markdown 代码块）:
{
  "fileSummary": "一句话概述这个文件的作用",
  "groups": [{"name": "分组名", "desc": "说明", "order": 1}],
  "nodes": [
    {"id": "函数名", "label": "显示名", "desc": "一句话描述", "importance": 5, "group": "分组名", "isEntry": true}
  ],
  "edges": [
    {"from": "A", "to": "B", "desc": "调用说明"}
  ],
  "layout": "tree"
}

importance 1-5, 入口函数给5, 核心函数给4, 辅助函数给1-2. 只返回 JSON, 不要其他内容.`

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: model || 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 2000 }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({ error: err.error?.message || `AI API error: ${res.status}` }, { status: 500 })
    }

    const data = await res.json()
    const text = data.choices?.[0]?.message?.content || ''
    let parsed: any = {}
    try { parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) } catch { parsed = { fileSummary: text, nodes: [], edges: [], groups: [] } }

    return NextResponse.json(parsed)
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }) }
}
