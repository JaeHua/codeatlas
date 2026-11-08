import { getFileTree, getSymbols, getCalls } from './db'
import type { FlowEntry } from './types'

interface FileRow { path: string; name: string; type: string; content?: string | null }
interface SymbolRow { name: string; kind: string; file: string; line?: number | null }
interface CallRow { caller: string; callee: string; caller_file?: string | null; callee_file?: string | null }

export interface FlowCandidate {
  name: string
  file: string
  line?: number
}

export interface FlowContext {
  entry: FlowEntry
  callers: FlowCandidate[]
  functions: FlowCandidate[]
  edges: { caller: string; callee: string }[]
  sources: { path: string; content: string }[]
  degraded: boolean
}

const MAX_NODES = 40
const MAX_DEPTH = 3
const MAX_SOURCE_FILES = 8
const MAX_PER_FILE = 3000
const MAX_TOTAL = 18000

export async function buildFlowContext(projectId: number, entry: FlowEntry): Promise<FlowContext> {
  const [fileRows, symbolRows, callRows] = await Promise.all([
    getFileTree(projectId),
    getSymbols(projectId),
    getCalls(projectId),
  ])

  const files = (fileRows as FileRow[]).filter((f) => f.type === 'file')
  const symbols = symbolRows as SymbolRow[]
  const calls = callRows as CallRow[]

  const defByName = new Map<string, FlowCandidate>()
  for (const s of symbols) {
    if (s.kind === 'function' && !defByName.has(s.name)) {
      defByName.set(s.name, { name: s.name, file: s.file, line: s.line ?? undefined })
    }
  }

  const callees = new Map<string, CallRow[]>()
  const callers = new Map<string, CallRow[]>()
  const fileHint = new Map<string, string>()
  for (const c of calls) {
    if (!callees.has(c.caller)) callees.set(c.caller, [])
    callees.get(c.caller)!.push(c)
    if (!callers.has(c.callee)) callers.set(c.callee, [])
    callers.get(c.callee)!.push(c)
    if (c.caller_file && !fileHint.has(c.caller)) fileHint.set(c.caller, c.caller_file)
    if (c.callee_file && !fileHint.has(c.callee)) fileHint.set(c.callee, c.callee_file)
  }

  const visited = new Set<string>([entry.name])
  const edgeList: { caller: string; callee: string }[] = []
  let queue: string[] = [entry.name]
  for (let depth = 0; depth < MAX_DEPTH && queue.length; depth++) {
    const next: string[] = []
    for (const fn of queue) {
      for (const c of callees.get(fn) || []) {
        edgeList.push({ caller: c.caller, callee: c.callee })
        if (!visited.has(c.callee) && visited.size < MAX_NODES) {
          visited.add(c.callee)
          next.push(c.callee)
        }
      }
    }
    queue = next
  }

  const upstream = (callers.get(entry.name) || [])
    .map((c) => {
      const d = defByName.get(c.caller)
      return d || { name: c.caller, file: c.caller_file || '', line: undefined }
    })
    .slice(0, 10)

  const functions: FlowCandidate[] = []
  functions.push({ name: entry.name, file: entry.file, line: entry.line })
  const pushFn = (name: string) => {
    if (functions.some((f) => f.name === name)) return
    const d = defByName.get(name)
    functions.push(d || { name, file: fileHint.get(name) || '', line: undefined })
  }
  for (const name of visited) pushFn(name)

  const fileMap = new Map(files.map((f) => [f.path, f]))
  const sources: { path: string; content: string }[] = []
  let total = 0
  for (const f of functions) {
    if (sources.length >= MAX_SOURCE_FILES || total >= MAX_TOTAL) break
    const row = fileMap.get(f.file)
    if (!row) continue
    if (sources.some((s) => s.path === f.file)) continue
    const capped = String(row.content || '').slice(0, Math.min(MAX_PER_FILE, MAX_TOTAL - total))
    total += capped.length
    sources.push({ path: f.file, content: capped })
  }

  return {
    entry,
    callers: upstream,
    functions,
    edges: edgeList.slice(0, 120),
    sources,
    degraded: edgeList.length === 0,
  }
}

function entryLine(entry: FlowEntry): string {
  return `${entry.name} (${entry.file || '?'}:${entry.line ?? '?'})`
}

export function buildFlowPrompt(projectName: string, ctx: FlowContext): string {
  const fnList = ctx.functions.map((f) => `- ${f.name} (${f.file || '?'}:${f.line ?? '?'})`).join('\n')
  const edgeList = ctx.edges.map((e) => `- ${e.caller} -> ${e.callee}`).join('\n')
  const callerList = ctx.callers.map((f) => `- ${f.name} (${f.file || '?'})`).join('\n')
  const sources = ctx.sources.map((s) => `### 文件: ${s.path}\n\`\`\`c\n${s.content}\n\`\`\``).join('\n\n')

  return `你是资深 Linux 内核工程师，正在为一个新手讲解一个“流程”。

项目: ${projectName}
入口函数: ${entryLine(ctx.entry)}

## 谁调用了入口（前因线索）
${callerList || '（无）'}

## 本次分析涉及的函数（来自静态调用图）
${fnList}

## 静态调用边
${edgeList || '（无静态调用边，可能全是函数指针/间接调用）'}

## 相关源码
${sources || '（无源码）'}

## 任务
围绕入口函数，提炼一条 5–10 步的精选主路径，讲清楚“前因 → 调用流转 → 数据结构 → 后果”。

## 严格要求
- 只输出 JSON，不要 markdown 代码围栏，不要解释文字。
- steps 里若某步来自上面的“静态调用边/函数列表”，confidence 填 "graph"；若你根据内核知识补充但其调用关系未被静态图捕获（函数指针、间接调用等），填 "inferred"。
- 文件路径尽量用上面出现的真实路径；行号不确定可省略 line。
- dataFlow 描述关键结构体（如 task_struct、sk_buff、fib_result、rtable、dst_entry 等）的作用、涉及字段、生命周期。
- mermaid 用 sequenceDiagram 或 flowchart，只画主路径。
- 全部用中文。

## 输出 JSON 格式
{
  "trigger": "触发条件与前因（什么场景进入这条流程）",
  "steps": [
    { "name": "函数名", "file": "路径", "line": 123, "role": "该步一句话职责", "confidence": "graph" }
  ],
  "dataFlow": [
    { "struct": "结构体名", "role": "作用", "fields": ["字段1", "字段2"], "lifecycle": "创建→填充→消费→释放" }
  ],
  "effects": ["返回值/状态变化/对系统的后果"],
  "mermaid": "sequenceDiagram\\n A->>B: ..."
}`
}
