import { getFileTree, getSymbols, getCalls } from '@/app/lib/db'

export interface RetrievedFile {
  path: string
  content: string
  score: number
}

export interface ProjectContext {
  files: RetrievedFile[]
  structureSummary: string
}

interface FileRow {
  path: string
  name: string
  type: string
  content?: string | null
}

interface SymbolRow {
  name: string
  kind: string
  file: string
  line?: number | null
}

interface CallRow {
  caller?: string
  callee?: string
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'of', 'to', 'in', 'on', 'for',
  'and', 'or', 'not', 'how', 'what', 'why', 'where', 'when', 'which', 'who', 'does', 'do',
  'did', 'this', 'that', 'these', 'those', 'with', 'from', 'by', 'as', 'at', 'it', 'its',
  'can', 'could', 'should', 'would', 'will', 'you', 'your', 'we', 'file', 'files', 'function',
  'functions', 'code', 'please', 'explain', 'tell', 'about', 'project', 'module',
])

function extractKeywords(query: string): string[] {
  const tokens = query.match(/[A-Za-z_][A-Za-z0-9_]{1,}/g) || []
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of tokens) {
    const t = raw.toLowerCase()
    if (t.length < 2 || STOPWORDS.has(t) || seen.has(t)) continue
    seen.add(t)
    result.push(t)
  }
  return result.slice(0, 12)
}

function buildStructureSummary(files: FileRow[], symbols: SymbolRow[], calls: CallRow[]): string {
  const dirs = new Set<string>()
  for (const f of files) {
    const parts = String(f.path).split('/')
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'))
  }
  const funcs = symbols.filter((s) => s.kind === 'function')
  const structs = symbols.filter((s) => s.kind === 'struct')
  const lines: string[] = []
  lines.push(`文件总数: ${files.length}，目录数: ${dirs.size}`)
  lines.push(`函数: ${funcs.length} 个，结构体: ${structs.length} 个，调用关系: ${calls.length} 条`)
  lines.push('文件列表（部分）:')
  for (const f of files.slice(0, 80)) lines.push(`- ${f.path}`)
  const fnList = funcs.slice(0, 60).map((s) => `${s.name} (${s.file}:${s.line ?? '?'})`)
  if (fnList.length) {
    lines.push('主要函数:')
    for (const x of fnList) lines.push(`- ${x}`)
  }
  const stList = structs.slice(0, 40).map((s) => `${s.name} (${s.file})`)
  if (stList.length) {
    lines.push('结构体:')
    for (const x of stList) lines.push(`- ${x}`)
  }
  return lines.join('\n')
}

export async function retrieveProjectContext(projectId: number, query: string): Promise<ProjectContext> {
  const [fileRows, symbolRows, callRows] = await Promise.all([
    getFileTree(projectId),
    getSymbols(projectId),
    getCalls(projectId),
  ])

  const files = (fileRows as FileRow[]).filter((f) => f.type === 'file')
  const symbols = symbolRows as SymbolRow[]
  const calls = callRows as CallRow[]
  const keywords = extractKeywords(query)
  const scores = new Map<string, number>()
  const addScore = (filePath: string, n: number) => {
    if (!filePath) return
    scores.set(filePath, (scores.get(filePath) || 0) + n)
  }

  for (const f of files) {
    const p = String(f.path).toLowerCase()
    const name = String(f.name).toLowerCase()
    for (const kw of keywords) {
      if (p.includes(kw) || name.includes(kw)) addScore(f.path, 5)
    }
  }

  for (const s of symbols) {
    const sname = String(s.name).toLowerCase()
    if (keywords.some((kw) => sname.includes(kw))) addScore(s.file, 6)
  }

  for (const f of files) {
    const content = String(f.content || '').toLowerCase()
    if (!content) continue
    for (const kw of keywords) {
      if (content.includes(kw)) addScore(f.path, 1)
    }
  }

  const ranked = files
    .map((f) => ({ path: String(f.path), content: String(f.content || ''), score: scores.get(f.path) || 0 }))
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)

  let selected = ranked.slice(0, 6)
  if (selected.length === 0) {
    const fallback = files
      .map((f) => ({ path: String(f.path), content: String(f.content || ''), score: 0 }))
      .filter((f) => /(^|\/)(main|init|start|kernel)\.(c|h)$/i.test(f.path) || f.path.split('/').length === 1)
      .slice(0, 4)
    selected = fallback.length
      ? fallback
      : files.slice(0, 3).map((f) => ({ path: String(f.path), content: String(f.content || ''), score: 0 }))
  }

  const MAX_PER_FILE = 4000
  const MAX_TOTAL = 24000
  let total = 0
  const out: RetrievedFile[] = []
  for (const f of selected) {
    if (total >= MAX_TOTAL) break
    const capped = f.content.slice(0, Math.min(MAX_PER_FILE, MAX_TOTAL - total))
    total += capped.length
    out.push({ path: f.path, content: capped, score: f.score })
  }

  return { files: out, structureSummary: buildStructureSummary(files, symbols, calls) }
}

export function buildProjectSystemPrompt(projectName: string, ctx: ProjectContext): string {
  const sources = ctx.files
    .map((f) => `### 文件: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n')
  return `你是一个资深软件工程师，正在帮助用户理解名为“${projectName}”的整个项目（一个 C 语言内核类项目）。

## 项目结构
${ctx.structureSummary}

## 相关文件源码（根据问题检索）
${sources || '（未检索到直接相关的源码，请基于项目结构回答，并说明上下文有限。）'}

## 回答要求
- 用中文、技术性、简洁地回答用户关于整个项目的问题。
- 优先基于上面的项目结构与源码回答；信息不足时明确说明，并指出可以查看哪些文件。
- 引用文件时使用格式：[路径:行号](codeatlas://file?path=<URL编码路径>&line=<行号>)，不要只写纯文本。
- 需要展示流程/调用关系时，输出 \`\`\`mermaid 代码块。
- 不要编造项目中不存在的文件或函数。`
}
