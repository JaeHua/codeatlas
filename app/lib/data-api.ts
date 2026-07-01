import { useStore } from '@/app/store'

export async function loadSourceCode(projectId: number, filePath: string): Promise<string> {
  const res = await fetch(`/api/projects/${projectId}/source?file=${encodeURIComponent(filePath)}`)
  if (!res.ok) return '// Source not found'
  const data = await res.json()
  return data.content || '// Empty file'
}

export async function loadAIMock(projectId: number, filePath: string): Promise<{
  filePath: string
  summary: string
  plainExplanation: string
  keyFunctions: { name: string; role: string }[]
  prerequisites: string[]
  relatedFiles: { path: string; reason: string }[]
  mermaid?: string
} | null> {
  const settings = useStore.getState()
  // Don't call AI if no key
  const settingsData = JSON.parse(localStorage.getItem('codeatlas-settings') || '{}')
  const apiKey = settingsData?.state?.apiKey || ''
  if (!apiKey) return null

  const res = await fetch(`/api/projects/${projectId}/ai-explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filePath,
      apiKey,
      baseUrl: settingsData?.state?.baseUrl || 'https://api.deepseek.com',
      model: settingsData?.state?.model || 'deepseek-chat',
    }),
  })
  if (!res.ok) return null
  return res.json()
}

export async function chatCompletionStream(
  projectId: number,
  filePath: string,
  messages: { role: string; content: string }[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const settingsData = JSON.parse(localStorage.getItem('codeatlas-settings') || '{}')
  const apiKey = settingsData?.state?.apiKey || ''
  const baseUrl = settingsData?.state?.baseUrl || 'https://api.deepseek.com'
  const model = settingsData?.state?.model || 'deepseek-chat'

  const res = await fetch(`/api/projects/${projectId}/ai-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, apiKey, baseUrl, model, question: messages[messages.length - 1]?.content || '' }),
    signal,
  })

  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const data = await res.json()
  onChunk(data.reply || '')
  return data.reply || ''
}
