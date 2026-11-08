import { NextResponse } from 'next/server'
import { getProject, getSourceCode, getAICache, setAICache } from '@/app/lib/db'

// DeepSeek API call for AI explanation
async function callAI(apiKey: string, baseUrl: string, model: string, prompt: string): Promise<string> {
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 2048,
    }),
  })
  if (!res.ok) throw new Error(`AI API error: ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const projectId = Number(id)

  try {
    const body = await req.json()
    const { filePath, apiKey, baseUrl, model } = body

    if (!filePath) return NextResponse.json({ error: 'filePath required' }, { status: 400 })
    if (!apiKey) return NextResponse.json({ error: 'apiKey required' }, { status: 400 })

    // Check cache
    const cached = await getAICache(projectId, filePath) as Record<string, unknown> | undefined
    if (cached && cached.summary) {
      return NextResponse.json({
        filePath,
        summary: cached.summary,
        plainExplanation: cached.explanation,
        keyFunctions: JSON.parse((cached.key_functions as string) || '[]'),
        prerequisites: JSON.parse((cached.prerequisites as string) || '[]'),
        relatedFiles: JSON.parse((cached.related_files as string) || '[]'),
        mermaid: cached.mermaid,
        cached: true,
      })
    }

    const project = await getProject(projectId) as { name: string } | undefined
    const source = (await getSourceCode(projectId, filePath)).slice(0, 6000)

    const prompt = `你正在分析一个 C 语言项目的文件。

项目名: ${project?.name || '未知'}
文件: ${filePath}

源码:
\`\`\`c
${source}
\`\`\`

请用中文回复，JSON 格式，不要包含 markdown 代码块标记：
{
  "summary": "一句话概括这个文件的作用",
  "explanation": "2-3句话的通俗解释",
  "keyFunctions": [{"name": "函数名", "role": "作用"}],
  "prerequisites": ["前置知识1", "前置知识2"],
  "relatedFiles": [{"path": "相关文件", "reason": "原因"}],
  "mermaid": "graph TD\\n  简要的流程图(可选)"
}`

    const aiResponse = await callAI(apiKey, baseUrl || 'https://api.deepseek.com', model || 'deepseek-chat', prompt)

    // Parse AI response as JSON
    let parsed: Record<string, unknown> = {}
    try {
      const cleaned = aiResponse.replace(/```json|```/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      parsed = { summary: aiResponse, explanation: aiResponse }
    }

    // Cache result
    await setAICache(projectId, filePath, {
      summary: (parsed.summary as string) || '',
      explanation: (parsed.explanation as string) || '',
      keyFunctions: JSON.stringify(parsed.keyFunctions || []),
      prerequisites: JSON.stringify(parsed.prerequisites || []),
      relatedFiles: JSON.stringify(parsed.relatedFiles || []),
      mermaid: (parsed.mermaid as string) || undefined,
    })

    return NextResponse.json({
      filePath,
      summary: parsed.summary,
      plainExplanation: parsed.explanation,
      keyFunctions: parsed.keyFunctions || [],
      prerequisites: parsed.prerequisites || [],
      relatedFiles: parsed.relatedFiles || [],
      mermaid: parsed.mermaid,
      cached: false,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
