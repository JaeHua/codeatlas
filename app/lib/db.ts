import initSqlJs, { type Database as SqlJsDatabase, type SqlJsStatic } from 'sql.js'
import path from 'path'
import fs from 'fs'

export function getDataDir(): string {
  const appData = process.env.APP_DATA_PATH
  if (appData) {
    if (!fs.existsSync(appData)) fs.mkdirSync(appData, { recursive: true })
    return appData
  }
  return process.cwd()
}

export function getProjectsDir(): string {
  const dir = path.join(getDataDir(), 'projects')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getDBPath(): string {
  return path.join(getDataDir(), 'codeatlas.db')
}

// ─── Core DB Helpers ───

async function getDb(): Promise<SqlJsDatabase> {
  // Always open fresh from disk — no caching, no stale data
  const SQL = await initSqlJs({
    locateFile: (file: string) => {
      const p = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
      if (fs.existsSync(p)) return p
      return file
    }
  })
  const dbPath = getDBPath()
  const database: SqlJsDatabase = fs.existsSync(dbPath)
    ? new SQL.Database(fs.readFileSync(dbPath))
    : new SQL.Database()
  database.run('PRAGMA journal_mode = WAL')
  initSchema(database)
  return database
}

function saveDb(database: SqlJsDatabase) {
  try {
    const dbPath = getDBPath()
    const dir = path.dirname(dbPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const data = database.export()
    fs.writeFileSync(dbPath, Buffer.from(data))
  } catch (err) {
    console.error('Failed to save database:', err)
  }
}

function exec(database: SqlJsDatabase, sql: string, params: any[] = []) {
  const stmt = database.prepare(sql)
  if (params.length > 0) stmt.bind(params)
  stmt.step()
  stmt.free()
  saveDb(database)
}

function queryAll(database: SqlJsDatabase, sql: string, params: any[] = []): any[] {
  const stmt = database.prepare(sql)
  if (params.length > 0) stmt.bind(params)
  const results: any[] = []
  while (stmt.step()) results.push(stmt.getAsObject())
  stmt.free()
  return results
}

function queryOne(database: SqlJsDatabase, sql: string, params: any[] = []): any | undefined {
  const rows = queryAll(database, sql, params)
  return rows[0]
}

// ─── Project queries ───

export async function listProjects() {
  return queryAll(await getDb(), 'SELECT * FROM projects ORDER BY last_opened DESC')
}

export async function getProject(id: number) {
  return queryOne(await getDb(), 'SELECT * FROM projects WHERE id = ?', [id])
}

export async function createProject(name: string, sourcePath: string, sourceType: string) {
  const database = await getDb()
  exec(database, 'INSERT INTO projects (name, source_path, source_type) VALUES (?, ?, ?)', [name, sourcePath, sourceType])
  const rows = queryAll(database, 'SELECT id FROM projects WHERE name = ? AND source_path = ? ORDER BY id DESC LIMIT 1', [name, sourcePath])
  return rows[0]?.id as number
}

export async function deleteProject(id: number) {
  const database = await getDb()
  exec(database, 'DELETE FROM includes WHERE project_id = ?', [id])
  exec(database, 'DELETE FROM calls WHERE project_id = ?', [id])
  exec(database, 'DELETE FROM struct_deps WHERE project_id = ?', [id])
  exec(database, 'DELETE FROM symbols WHERE project_id = ?', [id])
  exec(database, 'DELETE FROM files WHERE project_id = ?', [id])
  exec(database, 'DELETE FROM ai_cache WHERE project_id = ?', [id])
  exec(database, 'DELETE FROM projects WHERE id = ?', [id])
}

export async function updateParseStatus(id: number, status: string) {
  exec(await getDb(), 'UPDATE projects SET parse_status = ? WHERE id = ?', [status, id])
}

export async function updateParseProgress(id: number, progress: number) {
  exec(await getDb(), 'UPDATE projects SET parse_progress = ? WHERE id = ?', [progress, id])
}

export async function updateParseError(id: number, error: string) {
  exec(await getDb(), 'UPDATE projects SET parse_status = ?, parse_error = ? WHERE id = ?', ['error', error, id])
}

export async function clearParseError(id: number) {
  exec(await getDb(), 'UPDATE projects SET parse_error = NULL WHERE id = ?', [id])
}

function initSchema(database: SqlJsDatabase) {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, source_path TEXT NOT NULL, source_type TEXT NOT NULL DEFAULT 'local', created_at TEXT, last_opened TEXT, parse_status TEXT DEFAULT 'pending', parse_progress INTEGER DEFAULT 0, parse_error TEXT)`,
    `CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, path TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, parent_path TEXT, content TEXT, UNIQUE(project_id, path))`,
    `CREATE TABLE IF NOT EXISTS symbols (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, file TEXT NOT NULL, line INTEGER, signature TEXT)`,
    `CREATE TABLE IF NOT EXISTS includes (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, from_file TEXT NOT NULL, to_file TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS calls (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, caller TEXT NOT NULL, callee TEXT NOT NULL, caller_file TEXT, callee_file TEXT)`,
    `CREATE TABLE IF NOT EXISTS struct_deps (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, struct_name TEXT NOT NULL, uses TEXT NOT NULL, relation TEXT DEFAULT 'pointer')`,
    `CREATE TABLE IF NOT EXISTS ai_cache (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, file_path TEXT NOT NULL, summary TEXT, explanation TEXT, key_functions TEXT, prerequisites TEXT, related_files TEXT, mermaid TEXT, generated_at TEXT)`,
  ]
  for (const sql of stmts) database.run(sql)
}

// ─── File queries ───

export async function getFileTree(projectId: number) {
  return queryAll(await getDb(), 'SELECT * FROM files WHERE project_id = ? ORDER BY path', [projectId])
}

export async function getSourceCode(projectId: number, filePath: string) {
  const row = queryOne(await getDb(), 'SELECT content FROM files WHERE project_id = ? AND path = ?', [projectId, filePath])
  return row?.content || ''
}

export async function insertFile(projectId: number, file: { path: string; name: string; type: string; parentPath?: string | null; content?: string | null }) {
  exec(await getDb(),
    'INSERT OR IGNORE INTO files (project_id, path, name, type, parent_path, content) VALUES (?, ?, ?, ?, ?, ?)',
    [projectId, file.path, file.name, file.type, file.parentPath || null, file.content || null]
  )
}

// ─── Symbol queries ───

export async function getSymbols(projectId: number) {
  return queryAll(await getDb(), 'SELECT * FROM symbols WHERE project_id = ?', [projectId])
}

export async function insertSymbol(projectId: number, sym: { name: string; kind: string; file: string; line: number; signature?: string }) {
  exec(await getDb(),
    'INSERT INTO symbols (project_id, name, kind, file, line, signature) VALUES (?, ?, ?, ?, ?, ?)',
    [projectId, sym.name, sym.kind, sym.file, sym.line, sym.signature || null]
  )
}

// ─── Include queries ───

export async function getIncludes(projectId: number) {
  return queryAll(await getDb(), 'SELECT * FROM includes WHERE project_id = ?', [projectId])
}

export async function insertInclude(projectId: number, inc: { from_file: string; to_file: string }) {
  exec(await getDb(), 'INSERT INTO includes (project_id, from_file, to_file) VALUES (?, ?, ?)', [projectId, inc.from_file, inc.to_file])
}

// ─── Call queries ───

export async function getCalls(projectId: number) {
  return queryAll(await getDb(), 'SELECT * FROM calls WHERE project_id = ?', [projectId])
}

export async function insertCall(projectId: number, call: { caller: string; callee: string; caller_file?: string; callee_file?: string }) {
  exec(await getDb(),
    'INSERT INTO calls (project_id, caller, callee, caller_file, callee_file) VALUES (?, ?, ?, ?, ?)',
    [projectId, call.caller, call.callee, call.caller_file || null, call.callee_file || null]
  )
}

// ─── Struct dep queries ───

export async function getStructDeps(projectId: number) {
  return queryAll(await getDb(), 'SELECT * FROM struct_deps WHERE project_id = ?', [projectId])
}

export async function insertStructDep(projectId: number, dep: { struct_name: string; uses: string; relation: string }) {
  exec(await getDb(),
    'INSERT INTO struct_deps (project_id, struct_name, uses, relation) VALUES (?, ?, ?, ?)',
    [projectId, dep.struct_name, dep.uses, dep.relation]
  )
}

// ─── AI cache queries ───

export async function getAICache(projectId: number, filePath: string) {
  return queryOne(await getDb(), 'SELECT * FROM ai_cache WHERE project_id = ? AND file_path = ?', [projectId, filePath])
}

export async function setAICache(projectId: number, filePath: string, data: { summary?: string; explanation?: string; keyFunctions?: string; prerequisites?: string; relatedFiles?: string; mermaid?: string }) {
  exec(await getDb(),
    `INSERT INTO ai_cache (project_id, file_path, summary, explanation, key_functions, prerequisites, related_files, mermaid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [projectId, filePath, data.summary || null, data.explanation || null, data.keyFunctions || null,
     data.prerequisites || null, data.relatedFiles || null, data.mermaid || null]
  )
}
