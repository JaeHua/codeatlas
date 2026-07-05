// @ts-nocheck
import * as fs from 'fs'
import * as path from 'path'
import initSqlJs from 'sql.js'

async function main() {
  const SQL = await initSqlJs()
  const dbPath = process.env.APP_DATA_PATH
    ? path.join(process.env.APP_DATA_PATH, 'codeatlas.db')
    : path.join(process.cwd(), 'codeatlas.db')
  const db = fs.existsSync(dbPath)
    ? new SQL.Database(fs.readFileSync(dbPath))
    : new SQL.Database()
  db.run('PRAGMA journal_mode = WAL')

  function exec_stmt(stmt: any, params: any[]) {
    stmt.bind(params)
    stmt.step()
    stmt.reset()
  }

  function query_all(sql: string, params: any[] = []) {
    const s = db.prepare(sql)
    if (params.length > 0) s.bind(params)
    const rows = []
    while (s.step()) rows.push(s.getAsObject())
    s.free()
    return rows
  }

  function isCFile(f: string) { return f.endsWith('.c') || f.endsWith('.h') }

  function listCFiles(dir: string): string[] {
    const r: string[] = []
    if (!fs.existsSync(dir)) return r
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
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

  // Clear existing parse data
  db.run(`DELETE FROM symbols WHERE project_id = ${projectId}`)
  db.run(`DELETE FROM includes WHERE project_id = ${projectId}`)
  db.run(`DELETE FROM calls WHERE project_id = ${projectId}`)
  db.run(`DELETE FROM struct_deps WHERE project_id = ${projectId}`)

  const ist = db.prepare('INSERT OR IGNORE INTO files (project_id, path, name, type, parent_path, content) VALUES (?, ?, ?, ?, ?, ?)')
  const isym = db.prepare('INSERT INTO symbols (project_id, name, kind, file, line, signature) VALUES (?, ?, ?, ?, ?, ?)')
  const iinc = db.prepare('INSERT INTO includes (project_id, from_file, to_file) VALUES (?, ?, ?)')
  const icall = db.prepare('INSERT INTO calls (project_id, caller, callee, caller_file, callee_file) VALUES (?, ?, ?, ?, ?)')
  const idep = db.prepare('INSERT INTO struct_deps (project_id, struct_name, uses, relation) VALUES (?, ?, ?, ?)')

  const updateProgress = db.prepare('UPDATE projects SET parse_progress = ? WHERE id = ?')
  const updateStatus = db.prepare('UPDATE projects SET parse_status = ? WHERE id = ?')
  const updateError = db.prepare('UPDATE projects SET parse_status = ?, parse_error = ? WHERE id = ?')

  exec_stmt(updateStatus, ['parsing', projectId])

  const allFiles = listCFiles(sourcePath)
  if (allFiles.length === 0) {
    const msg = `No C source files (.c/.h) found in ${sourcePath}`
    exec_stmt(updateError, ['error', msg, projectId])
    console.error(msg)
    process.exit(1)
  }

  console.log(`Found ${allFiles.length} source files`)
  const totalFiles = allFiles.length
  let parsedCount = 0
  const knownFunctions = new Set<string>()
  const callPairs: { caller: string; callee: string; callerFile: string }[] = []
  const functionDefs: { name: string; file: string; line: number; sig: string }[] = []

  for (const fp of allFiles) {
    if (!fs.statSync(fp).isFile()) continue
    const rel = path.relative(sourcePath, fp)
    const content = fs.readFileSync(fp, 'utf-8')

    const parentDir = path.dirname(rel)
    exec_stmt(ist, [projectId, rel, path.basename(fp), 'file', parentDir === '.' ? null : parentDir, content])

    if (parentDir !== '.') {
      const parts = parentDir.split(path.sep)
      let acc = ''
      for (const part of parts) {
        const p = acc ? path.join(acc, part) : part
        exec_stmt(ist, [projectId, p, part, 'directory', acc || null, null])
        acc = p
      }
    }

    const stripped = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')

    for (const m of stripped.matchAll(/#include\s+[<"]([^>"]+)[>"]/g)) {
      exec_stmt(iinc, [projectId, rel, m[1]])
    }

    const funcRegex = /(?:^|\n)\s*([a-zA-Z_]\w*\s+)+([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*\n?\s*\{/g
    for (const fm of content.matchAll(funcRegex)) {
      const name = fm[2]
      if (/^(if|while|for|switch|return|sizeof|typedef|struct|enum|union)$/.test(name)) continue
      const line = content.slice(0, fm.index).split('\n').length
      knownFunctions.add(name)
      functionDefs.push({ name, file: rel, line, sig: fm[0].replace(/\s+/g, ' ').trim().slice(0, 200) })
    }

    const knrRegex = /(?:^|\n)([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*\n\s*([a-zA-Z_][\w\s*,;\n]+?)\s*\n?\s*\{/gm
    for (const fm of content.matchAll(knrRegex)) {
      const name = fm[1]
      if (/^(if|while|for|switch|return|sizeof|typedef|struct|enum|union)$/.test(name)) continue
      if (knownFunctions.has(name)) continue
      knownFunctions.add(name)
      functionDefs.push({ name, file: rel, line: content.slice(0, fm.index).split('\n').length, sig: fm[0].replace(/\s+/g, ' ').trim().slice(0, 200) })
    }

    for (const m of stripped.matchAll(/struct\s+(\w+)\s*\{/g)) {
      exec_stmt(isym, [projectId, m[1], 'struct', rel, content.slice(0, m.index).split('\n').length, null])
    }

    for (const m of stripped.matchAll(/#define\s+([A-Z_][A-Z_0-9]*)\b/g)) {
      exec_stmt(isym, [projectId, m[1], 'macro', rel, content.slice(0, m.index).split('\n').length, null])
    }

    for (const m of stripped.matchAll(/typedef\s+.*\s+(\w+)\s*;/g)) {
      const name = m[1]
      if (name === 'struct' || name === 'enum' || name === 'union') continue
      exec_stmt(isym, [projectId, name, 'typedef', rel, content.slice(0, m.index).split('\n').length, null])
    }

    parsedCount++
    exec_stmt(updateProgress, [Math.round((parsedCount / totalFiles) * 100), projectId])
  }

  // Phase 2: extract calls and struct deps
  for (const fp of allFiles) {
    if (!fs.statSync(fp).isFile()) continue
    const rel = path.relative(sourcePath, fp)
    const content = fs.readFileSync(fp, 'utf-8')

    for (const def of functionDefs.filter((d) => d.file === rel)) {
      const sigStart = content.indexOf(def.name, def.line > 0 ? (def.line - 1) * 80 : 0)
      if (sigStart < 0) continue
      const braceStart = content.indexOf('{', sigStart)
      if (braceStart < 0) continue
      let depth = 1, i = braceStart + 1
      while (i < content.length && depth > 0) {
        if (content[i] === '{') depth++
        if (content[i] === '}') depth--
        i++
      }
      const body = content.slice(braceStart, i)
      for (const call of body.matchAll(/\b([a-zA-Z_]\w*)\s*\(/g)) {
        const callee = call[1]
        if (callee === def.name) continue
        if (/^(if|while|for|switch|return|sizeof|int|char|long|void|unsigned|static|extern|const)$/.test(callee)) continue
        if (knownFunctions.has(callee)) {
          exec_stmt(icall, [projectId, def.name, callee, rel, ''])
        }
      }
    }

    for (const m of content.matchAll(/struct\s+(\w+)\s*\{/g)) {
      const sn = m[1]
      const body = content.slice(m.index + m[0].length, content.indexOf('}', m.index))
      for (const f of body.matchAll(/struct\s+(\w+)\s*\*?\s+\w+/g)) {
        exec_stmt(idep, [projectId, sn, f[1], body.includes('*') ? 'pointer' : 'nested'])
      }
    }
  }

  // Phase 3: insert function symbols and resolve callee files
  for (const def of functionDefs) {
    exec_stmt(isym, [projectId, def.name, 'function', def.file, def.line, def.sig])
  }

  const symbolRows = query_all('SELECT name, file FROM symbols WHERE project_id = ? AND kind = ?', [projectId, 'function'])
  const funcFileMap = new Map<string, string>()
  for (const row of symbolRows) funcFileMap.set(row.name, row.file)

  const callRows = query_all('SELECT id, callee FROM calls WHERE project_id = ? AND callee_file = ?', [projectId, ''])
  for (const row of callRows) {
    const file = funcFileMap.get(row.callee)
    if (file) {
      const u = db.prepare('UPDATE calls SET callee_file = ? WHERE id = ?')
      exec_stmt(u, [file, row.id])
    }
  }

  exec_stmt(updateStatus, ['complete', projectId])
  exec_stmt(updateProgress, [100, projectId])
  console.log(`Done. ${totalFiles} files, ${knownFunctions.size} functions, ${functionDefs.length} defs.`)

  // Save DB
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
}

main().catch((e) => {
  console.error('Fatal error:', e)
  process.exit(1)
})
