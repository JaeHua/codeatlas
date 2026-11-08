import { useSettings } from '@/app/store/settings'
import type { FlowCard, FlowEntry } from '@/app/lib/types'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function chatCompletion(messages: ChatMessage[]): Promise<string> {
  const { apiKey, baseUrl, model } = useSettings.getState()

  if (!apiKey) {
    throw new Error('API Key not configured')
  }

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 2048,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `API error: ${res.status}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content || 'No response'
}

export async function chatCompletionStream(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const { apiKey, baseUrl, model } = useSettings.getState()

  if (!apiKey) {
    throw new Error('API Key not configured')
  }

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 2048,
      stream: true,
    }),
    signal,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `API error: ${res.status}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let fullText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    const lines = chunk.split('\n').filter((l) => l.startsWith('data: '))

    for (const line of lines) {
      const data = line.slice(6)
      if (data === '[DONE]') continue

      try {
        const parsed = JSON.parse(data)
        const content = parsed.choices?.[0]?.delta?.content
        if (content) {
          fullText += content
          onChunk(content)
        }
      } catch {
        // skip unparseable chunks
      }
    }
  }

  return fullText
}

export async function streamProjectAI(
  projectId: number,
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const { apiKey, baseUrl, model } = useSettings.getState()

  if (!apiKey) {
    throw new Error('API Key not configured')
  }

  const res = await fetch(`/api/projects/${projectId}/ai-project`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, apiKey, baseUrl, model }),
    signal,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `API error: ${res.status}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue
      try {
        const parsed = JSON.parse(data)
        const content = parsed.choices?.[0]?.delta?.content
        if (content) {
          fullText += content
          onChunk(content)
        }
      } catch {
        // skip unparseable chunks
      }
    }
  }

  return fullText
}

export async function generateFlowWalkthrough(
  projectId: number,
  entry: FlowEntry,
  force = false
): Promise<{ card: FlowCard; cached: boolean }> {
  const { apiKey, baseUrl, model } = useSettings.getState()

  if (!apiKey) {
    throw new Error('请先在设置中配置 API Key')
  }

  const res = await fetch(`/api/projects/${projectId}/ai-flow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entry, apiKey, baseUrl, model, force }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `API error: ${res.status}`)
  return { card: data.card as FlowCard, cached: Boolean(data.cached) }
}

export function buildContext(
  filePath: string,
  sourceCode: string,
  summary: string,
  keyFunctions: { name: string; role: string }[]
): string {
  return `You are helping analyze Linux Kernel 0.21 source code.

Current file: ${filePath}
File summary: ${summary}

Key functions:
${keyFunctions.map((f) => `  - ${f.name}: ${f.role}`).join('\n')}

Source code:
\`\`\`c
${sourceCode.slice(0, 8000)}
\`\`\`

Answer the user's question based on this context. Be concise and technical. Reply in Chinese.`
}
