import type { FlowCard, FlowStep, FlowDataStruct } from './types'

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function parseFlowCard(raw: string): FlowCard {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
  let obj: Record<string, unknown>
  try {
    obj = asRecord(JSON.parse(cleaned))
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('AI 返回的流程数据无法解析')
    obj = asRecord(JSON.parse(m[0]))
  }

  const steps: FlowStep[] = (Array.isArray(obj.steps) ? obj.steps : [])
    .map((item) => {
      const s = asRecord(item)
      const confidence: FlowStep['confidence'] = s.confidence === 'inferred' ? 'inferred' : 'graph'
      return {
        name: asString(s.name),
        file: asString(s.file),
        line: typeof s.line === 'number' ? s.line : undefined,
        role: asString(s.role),
        confidence,
      }
    })
    .filter((s) => s.name)

  const dataFlow: FlowDataStruct[] = (Array.isArray(obj.dataFlow) ? obj.dataFlow : [])
    .map((item) => {
      const d = asRecord(item)
      return {
        struct: asString(d.struct),
        role: asString(d.role),
        fields: asStringArray(d.fields),
        lifecycle: asString(d.lifecycle),
      }
    })
    .filter((d) => d.struct)

  const mermaid = typeof obj.mermaid === 'string' && obj.mermaid.trim() ? obj.mermaid : undefined

  return {
    trigger: asString(obj.trigger),
    steps,
    dataFlow,
    effects: asStringArray(obj.effects),
    mermaid,
  }
}
