/**
 * Standalone parse script — runs outside of Next.js bundling.
 * Uses regex-based C parser (no native dependencies).
 *
 * Usage: npx tsx scripts/parse-project.ts <projectId> <sourcePath>
 */

import * as fs from 'fs'
import * as path from 'path'
import Database from 'better-sqlite3'

const DB_PATH = path.join(process.cwd(), 'codeatlas.db')
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

function isCFile(f: string) {
  return f.endsWith('.c') || f.endsWith('.h')
}

function listCFiles(dir: string): string[] {
  const r: string[] = []
  if (!fs.existsSync(dir)) return r
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === '.git') continue
    const fp = path.join(dir, e.name)
    if (e.isDirectory()) r.push(...listCFiles(fp))
    else if (e.isFile() && isCFile(fp)) r.push(fp)
  }
  return r
}

const projectId = parseInt(process.argv[2])
const sourcePath = process.argv[3]

if (!projectId || !sourcePath) {
  console.error('Usage: npx tsx scripts/parse-project.ts <projectId> <sourcePath>')
  process.exit(1)
}

console.log(`Parsing project ${projectId} at ${sourcePath}`)

// Clear existing parse data (keep file records from import-local)
db.exec(`
  DELETE FROM symbols WHERE project_id = ${projectId};
  DELETE FROM includes WHERE project_id = ${projectId};
  DELETE FROM calls WHERE project_id = ${projectId};
  DELETE FROM struct_deps WHERE project_id = ${projectId};
`)

const insertFile = db.prepare(
  'INSERT OR IGNORE INTO files (project_id, path, name, type, parent_path, content) VALUES (?, ?, ?, ?, ?, ?)'
)

export { insertFile }
const insertSymbol = db.prepare(
  'INSERT INTO symbols (project_id, name, kind, file, line, signature) VALUES (?, ?, ?, ?, ?, ?)'
)
const insertInclude = db.prepare(
  'INSERT INTO includes (project_id, from_file, to_file) VALUES (?, ?, ?)'
)
const insertCall = db.prepare(
  'INSERT INTO calls (project_id, caller, callee, caller_file, callee_file) VALUES (?, ?, ?, ?, ?)'
)
const insertStructDep = db.prepare(
  'INSERT INTO struct_deps (project_id, struct_name, uses, relation) VALUES (?, ?, ?, ?)'
)
const updateProgress = db.prepare('UPDATE projects SET parse_progress = ? WHERE id = ?')
const updateStatus = db.prepare('UPDATE projects SET parse_status = ? WHERE id = ?')
const updateError = db.prepare('UPDATE projects SET parse_status = ?, parse_error = ? WHERE id = ?')

updateStatus.run('parsing', projectId)

const allFiles = listCFiles(sourcePath)

if (allFiles.length === 0) {
  const msg = `No C source files (.c/.h) found in ${sourcePath}`
  updateError.run('error', msg, projectId)
  console.error(msg)
  process.exit(1)
}

console.log(`Found ${allFiles.length} source files`)

const totalFiles = allFiles.length
let parsedCount = 0

// Collect all known function names first
const knownFunctions = new Set<string>()
const callMap = new Map<string, string[]>() // caller -> callees
const functionDefs: { name: string; file: string; line: number; sig: string }[] = []

for (const fp of allFiles) {
  try {
    if (!fs.statSync(fp).isFile()) continue
  } catch { continue }

  const rel = path.relative(sourcePath, fp)
  const content = fs.readFileSync(fp, 'utf-8')

  const parentDir = path.dirname(rel)
  insertFile.run(projectId, rel, path.basename(fp), 'file', parentDir === '.' ? null : parentDir, content)

  if (parentDir !== '.') {
    const parts = parentDir.split(path.sep)
    let acc = ''
    for (const part of parts) {
      const p = acc ? path.join(acc, part) : part
      insertFile.run(projectId, p, part, 'directory', acc || null, null)
      acc = p
    }
  }

  updateProgress.run(Math.round((++parsedCount / totalFiles) * 100), projectId)

  // Regex parsing
  const stripped = content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '')

  // #include directives
  for (const m of stripped.matchAll(/#include\s+[<"]([^>"]+)[>"]/g)) {
    insertInclude.run(projectId, rel, m[1])
  }

  // Function definitions: return_type name(...) {
  const funcRegex = /(?:^|\n)\s*([a-zA-Z_]\w*\s+)+([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*\n?\s*\{/g
  let funcMatch
  while ((funcMatch = funcRegex.exec(content)) !== null) {
    const name = funcMatch[2]
    if (/^(if|while|for|switch|return|sizeof|typedef|struct|enum|union)$/.test(name)) continue
    const line = content.slice(0, funcMatch.index).split('\n').length
    const sig = funcMatch[0].replace(/\s+/g, ' ').trim()
    knownFunctions.add(name)
    functionDefs.push({ name, file: rel, line, sig: sig.slice(0, 200) })
  }

  // Also catch K&R style: name(args) arg_types { 
  const knrRegex = /(?:^|\n)([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*\n\s*([a-zA-Z_][\w\s*,;\n]+?)\s*\n?\s*\{/gm
  while ((funcMatch = knrRegex.exec(content)) !== null) {
    const name = funcMatch[1]
    if (/^(if|while|for|switch|return|sizeof|typedef|struct|enum|union)$/.test(name)) continue
    if (knownFunctions.has(name)) continue
    const line = content.slice(0, funcMatch.index).split('\n').length
    knownFunctions.add(name)
    functionDefs.push({ name, file: rel, line, sig: funcMatch[0].replace(/\s+/g, ' ').trim().slice(0, 200) })
  }

  // Struct definitions
  for (const m of stripped.matchAll(/struct\s+(\w+)\s*\{/g)) {
    insertSymbol.run(projectId, m[1], 'struct', rel, content.slice(0, m.index).split('\n').length, null)
  }

  // Macros
  for (const m of stripped.matchAll(/#define\s+([A-Z_][A-Z_0-9]*)\b/g)) {
    insertSymbol.run(projectId, m[1], 'macro', rel, content.slice(0, m.index).split('\n').length, null)
  }

  // Typedefs
  for (const m of stripped.matchAll(/typedef\s+.*\s+(\w+)\s*;/g)) {
    const name = m[1]
    if (name === 'struct' || name === 'enum' || name === 'union') continue
    insertSymbol.run(projectId, name, 'typedef', rel, content.slice(0, m.index).split('\n').length, null)
  }

  parsedCount++
  updateProgress.run(Math.round((parsedCount / totalFiles) * 100), projectId)
}

// Phase 2: extract function calls within each function body
for (const fp of allFiles) {
  try {
    if (!fs.statSync(fp).isFile()) continue
  } catch { continue }

  const rel = path.relative(sourcePath, fp)
  const content = fs.readFileSync(fp, 'utf-8')

  // For each known function in this file, find its body and extract calls
  for (const def of functionDefs.filter((d) => d.file === rel)) {
    // Find the function body: from { after signature to matching }
    const sigStart = content.indexOf(def.name, def.line > 0 ? (def.line - 1) * 80 : 0)
    if (sigStart < 0) continue

    // Find opening brace
    const braceStart = content.indexOf('{', sigStart)
    if (braceStart < 0) continue

    // Find matching closing brace (simple bracket counting)
    let depth = 1
    let i = braceStart + 1
    const bodyEnd = content.length
    while (i < bodyEnd && depth > 0) {
      if (content[i] === '{') depth++
      if (content[i] === '}') depth--
      i++
    }
    const body = content.slice(braceStart, i)

    // Find function calls within body: word(
    for (const call of body.matchAll(/\b([a-zA-Z_]\w*)\s*\(/g)) {
      const callee = call[1]
      if (callee === def.name) continue
      if (/^(if|while|for|switch|return|sizeof|int|char|long|void|unsigned|static|extern|const)$/.test(callee)) continue
      if (knownFunctions.has(callee)) {
        insertCall.run(projectId, def.name, callee, rel, '')
      }
    }
  }
}

// Resolve callee files
const symbolRows = db.prepare('SELECT name, file FROM symbols WHERE project_id = ? AND kind = ?').all(projectId, 'function') as { name: string; file: string }[]
const funcFileMap = new Map<string, string>()
for (const row of symbolRows) funcFileMap.set(row.name, row.file)

// Update call edges with callee_file
const calls = db.prepare('SELECT id, callee FROM calls WHERE project_id = ? AND callee_file = ?').all(projectId, '')
for (const call of calls as { id: number; callee: string }[]) {
  const file = funcFileMap.get(call.callee)
  if (file) {
    db.prepare('UPDATE calls SET callee_file = ? WHERE id = ?').run(file, call.id)
  }
}

// Insert function symbols
for (const def of functionDefs) {
  insertSymbol.run(projectId, def.name, 'function', def.file, def.line, def.sig)
}

// Extract struct field dependencies
for (const fp of allFiles) {
  const rel = path.relative(sourcePath, fp)
  const content = fs.readFileSync(fp, 'utf-8')
  for (const m of content.matchAll(/struct\s+(\w+)\s*\{/g)) {
    const structName = m[1]
    const body = content.slice(m.index + m[0].length, content.indexOf('}', m.index))
    for (const f of body.matchAll(/struct\s+(\w+)\s*\*?\s+\w+/g)) {
      insertStructDep.run(projectId, structName, f[1], body.includes('*') ? 'pointer' : 'nested')
    }
  }
}

updateStatus.run('complete', projectId)
updateProgress.run(100, projectId)
console.log(`Done. ${totalFiles} files, ${knownFunctions.size} functions, ${functionDefs.length} defs, ${symbolRows.length} symbols.`)
db.close()
