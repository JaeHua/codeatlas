import { getFileTree, getSymbols, getCalls } from './db'
import { retrieveProjectContext } from './project-retrieval'
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
  structureSummary?: string
}

const MAX_NODES = 40
const MAX_DEPTH = 3
const MAX_SOURCE_FILES = 8
const MAX_PER_FILE = 3000
const MAX_TOTAL = 18000

const PLAIN_STYLE = `## 讲解风格（最重要，务必遵守）
- 读者是 Linux 内核零基础的初学者。用大白话，像给朋友讲，不要端着。
- 先讲“它是干什么的、为什么需要它”，再提函数名和细节；不要一上来堆术语。
- 必须用到的术语，第一次出现时用一句大白话解释，例如“路由表：系统用来决定数据包走哪条路的对照表”。
- 每个步骤的 role 用一句口语化的话（不超过 30 字），说清“做了什么、为了什么”，不要罗列参数、宏、字段。
- 多用生活化类比（如查地图、快递分拣）帮助建立直觉。
- 不展开代码行级细节，先让人明白整体在做什么。`

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
围绕入口函数，提炼一条 5–8 步的主路径，讲清楚“前因 → 调用流转 → 数据结构 → 后果”。

${PLAIN_STYLE}

## 严格要求
- 只输出 JSON，不要 markdown 代码围栏，不要解释文字。
- summary：用一句大白话概括“这个流程到底在干嘛”。
- trigger：用生活化场景说明“什么情况下会走到这里”。
- steps 控制在 5–8 步，只放最关键的；若某步来自上面的“静态调用边/函数列表”，confidence 填 "graph"；若你根据内核知识补充但其调用关系未被静态图捕获（函数指针、间接调用等），填 "inferred"。
- 文件路径尽量用上面出现的真实路径；行号不确定可省略 line。
- dataFlow 最多 3 个最关键的结构体；fields 用“字段（含义）”形式，最多 4 个；用“谁创建 → 装了什么 → 谁用它 → 最后怎么处理”的话说生命周期。
- effects：说清对系统或用户的实际影响，别只写技术术语。
- mermaid 用 sequenceDiagram 或 flowchart，只画主路径，节点名可简短。
- 全部用中文。

## 输出 JSON 格式
{
  "summary": "一句话大白话总结这个流程",
  "trigger": "什么场景下会走到这里（大白话）",
  "steps": [
    { "name": "函数名", "file": "路径", "line": 123, "role": "一句大白话说明这步做了什么、为了什么", "confidence": "graph" }
  ],
  "dataFlow": [
    { "struct": "结构体名（一句话它是什么）", "role": "作用（大白话）", "fields": ["字段（含义）"], "lifecycle": "谁创建 → 装了什么 → 谁用 → 最后怎么处理" }
  ],
  "effects": ["对系统/用户的实际影响（大白话）"],
  "mermaid": "sequenceDiagram\\n A->>B: ..."
}`
}

export async function buildTopicFlowContext(projectId: number, query: string): Promise<FlowContext> {
  const [symbolRows, callRows, retrieval] = await Promise.all([
    getSymbols(projectId),
    getCalls(projectId),
    retrieveProjectContext(projectId, query),
  ])

  const symbols = symbolRows as SymbolRow[]
  const calls = callRows as CallRow[]
  const fnNames = new Set(symbols.filter((s) => s.kind === 'function').map((s) => s.name))

  const functions: FlowCandidate[] = symbols
    .filter((s) => s.kind === 'function')
    .slice(0, 300)
    .map((s) => ({ name: s.name, file: s.file, line: s.line ?? undefined }))

  const edges = calls
    .filter((c) => fnNames.has(c.caller) && fnNames.has(c.callee))
    .slice(0, 200)
    .map((c) => ({ caller: c.caller, callee: c.callee }))

  return {
    entry: { name: query, file: '' },
    callers: [],
    functions,
    edges,
    sources: retrieval.files.map((f) => ({ path: f.path, content: f.content })),
    degraded: edges.length === 0,
    structureSummary: retrieval.structureSummary,
  }
}

export function buildTopicFlowPrompt(projectName: string, query: string, ctx: FlowContext): string {
  const fnList = ctx.functions.slice(0, 200).map((f) => `- ${f.name} (${f.file || '?'}:${f.line ?? '?'})`).join('\n')
  const edgeList = ctx.edges.slice(0, 150).map((e) => `- ${e.caller} -> ${e.callee}`).join('\n')
  const sources = ctx.sources.map((s) => `### 文件: ${s.path}\n\`\`\`c\n${s.content}\n\`\`\``).join('\n\n')

  return `你是资深 Linux 内核工程师，正在为一个新手讲解他关心的一个“流程”。

项目: ${projectName}
用户想了解: ${query}

## 项目结构概览
${ctx.structureSummary || '（无）'}

## 项目中的函数（来自符号表）
${fnList || '（无）'}

## 静态调用边（可能不完整，函数指针/间接调用常缺失）
${edgeList || '（无）'}

## 相关源码（按问题检索）
${sources || '（无）'}

## 任务
1. 先从上面的“函数列表”中挑选最合适的入口函数，填入输出 JSON 的 entry 字段（name 必须来自函数列表）。
2. 围绕该入口，提炼一条 5–8 步的主路径，讲清楚“前因 → 调用流转 → 数据结构 → 后果”。

${PLAIN_STYLE}

## 严格要求
- 只输出 JSON，不要 markdown 代码围栏，不要解释文字。
- entry.name 必须来自“函数列表”；entry.file 用该函数所在文件，行号不确定可省略。
- summary：用一句大白话概括“这个流程到底在干嘛”。
- trigger：用生活化场景说明“什么情况下会走到这里”，呼应他的问题。
- steps 控制在 5–8 步，只放最关键的；若某步来自“静态调用边/函数列表”，confidence 填 "graph"；若你根据内核知识补充但调用关系未被静态图捕获，填 "inferred"。
- dataFlow 最多 3 个最关键的结构体；fields 用“字段（含义）”形式，最多 4 个；用“谁创建 → 装了什么 → 谁用它 → 最后怎么处理”的话说生命周期。
- effects：说清对系统或用户的实际影响，别只写技术术语。
- mermaid 用 sequenceDiagram 或 flowchart，只画主路径，节点名可简短。
- 全部用中文。

## 输出 JSON 格式
{
  "entry": { "name": "入口函数名", "file": "路径", "line": 123 },
  "summary": "一句话大白话总结这个流程",
  "trigger": "什么场景下会走到这里（大白话）",
  "steps": [
    { "name": "函数名", "file": "路径", "line": 123, "role": "一句大白话说明这步做了什么、为了什么", "confidence": "graph" }
  ],
  "dataFlow": [
    { "struct": "结构体名（一句话它是什么）", "role": "作用（大白话）", "fields": ["字段（含义）"], "lifecycle": "谁创建 → 装了什么 → 谁用 → 最后怎么处理" }
  ],
  "effects": ["对系统/用户的实际影响（大白话）"],
  "mermaid": "sequenceDiagram\\n A->>B: ..."
}`
}
