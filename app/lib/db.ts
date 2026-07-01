import Database from 'better-sqlite3'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'codeatlas.db')

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initSchema(db)
  }
  return db
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source_path TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'local',
      created_at TEXT DEFAULT (datetime('now')),
      last_opened TEXT DEFAULT (datetime('now')),
      parse_status TEXT DEFAULT 'pending',
      parse_progress INTEGER DEFAULT 0,
      parse_error TEXT
    );

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      parent_path TEXT,
      content TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      UNIQUE(project_id, path)
    );

    CREATE TABLE IF NOT EXISTS symbols (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      file TEXT NOT NULL,
      line INTEGER,
      signature TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS includes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      from_file TEXT NOT NULL,
      to_file TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      caller TEXT NOT NULL,
      callee TEXT NOT NULL,
      caller_file TEXT,
      callee_file TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS struct_deps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      struct_name TEXT NOT NULL,
      uses TEXT NOT NULL,
      relation TEXT DEFAULT 'pointer',
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      summary TEXT,
      explanation TEXT,
      key_functions TEXT,
      prerequisites TEXT,
      related_files TEXT,
      mermaid TEXT,
      generated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `)

  // Migration: add missing columns to existing DB
  try { db.exec('ALTER TABLE projects ADD COLUMN parse_error TEXT') } catch {}
  try { db.exec('ALTER TABLE projects ADD COLUMN parse_progress INTEGER DEFAULT 0') } catch {}
  // Remove duplicate file records, then add unique constraint
  try {
    db.exec(`
      DELETE FROM files WHERE id NOT IN (
        SELECT MIN(id) FROM files GROUP BY project_id, path
      )
    `)
  } catch {}
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_files_project_path ON files(project_id, path)') } catch {}
}

// Project queries
export function listProjects() {
  return getDb().prepare('SELECT * FROM projects ORDER BY last_opened DESC').all()
}

export function getProject(id: number) {
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id)
}

export function createProject(name: string, sourcePath: string, sourceType: string) {
  const result = getDb().prepare(
    'INSERT INTO projects (name, source_path, source_type) VALUES (?, ?, ?)'
  ).run(name, sourcePath, sourceType)
  return result.lastInsertRowid as number
}

export function deleteProject(id: number) {
  getDb().prepare('DELETE FROM projects WHERE id = ?').run(id)
}

export function updateParseStatus(id: number, status: string) {
  getDb().prepare('UPDATE projects SET parse_status = ? WHERE id = ?').run(status, id)
}

export function updateParseError(id: number, error: string) {
  getDb().prepare('UPDATE projects SET parse_status = ?, parse_error = ? WHERE id = ?').run('error', error, id)
}

// File queries
export function getFileTree(projectId: number) {
  return getDb().prepare(
    'SELECT * FROM files WHERE project_id = ? ORDER BY path'
  ).all(projectId)
}

export function getSourceCode(projectId: number, filePath: string) {
  const row = getDb().prepare(
    'SELECT content FROM files WHERE project_id = ? AND path = ?'
  ).get(projectId, filePath) as { content: string } | undefined
  return row?.content || ''
}

export function insertFile(projectId: number, file: { path: string; name: string; type: string; parentPath?: string | null; content?: string | null }) {
  getDb().prepare(
    'INSERT OR REPLACE INTO files (project_id, path, name, type, parent_path, content) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(projectId, file.path, file.name, file.type, file.parentPath || null, file.content || null)
}

// Symbol queries
export function getSymbols(projectId: number) {
  return getDb().prepare('SELECT * FROM symbols WHERE project_id = ?').all(projectId)
}

export function insertSymbol(projectId: number, sym: { name: string; kind: string; file: string; line: number; signature?: string }) {
  getDb().prepare(
    'INSERT INTO symbols (project_id, name, kind, file, line, signature) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(projectId, sym.name, sym.kind, sym.file, sym.line, sym.signature || null)
}

// Include queries
export function getIncludes(projectId: number) {
  return getDb().prepare('SELECT * FROM includes WHERE project_id = ?').all(projectId)
}

export function insertInclude(projectId: number, inc: { from_file: string; to_file: string }) {
  getDb().prepare(
    'INSERT INTO includes (project_id, from_file, to_file) VALUES (?, ?, ?)'
  ).run(projectId, inc.from_file, inc.to_file)
}

// Call queries
export function getCalls(projectId: number) {
  return getDb().prepare('SELECT * FROM calls WHERE project_id = ?').all(projectId)
}

export function insertCall(projectId: number, call: { caller: string; callee: string; caller_file?: string; callee_file?: string }) {
  getDb().prepare(
    'INSERT INTO calls (project_id, caller, callee, caller_file, callee_file) VALUES (?, ?, ?, ?, ?)'
  ).run(projectId, call.caller, call.callee, call.caller_file || null, call.callee_file || null)
}

// Struct dep queries
export function getStructDeps(projectId: number) {
  return getDb().prepare('SELECT * FROM struct_deps WHERE project_id = ?').all(projectId)
}

export function insertStructDep(projectId: number, dep: { struct: string; uses: string; relation: string }) {
  getDb().prepare(
    'INSERT INTO struct_deps (project_id, struct_name, uses, relation) VALUES (?, ?, ?, ?)'
  ).run(projectId, dep.struct, dep.uses, dep.relation)
}

// AI cache queries
export function getAICache(projectId: number, filePath: string) {
  return getDb().prepare(
    'SELECT * FROM ai_cache WHERE project_id = ? AND file_path = ?'
  ).get(projectId, filePath)
}

export function setAICache(projectId: number, filePath: string, data: { summary?: string; explanation?: string; keyFunctions?: string; prerequisites?: string; relatedFiles?: string; mermaid?: string }) {
  getDb().prepare(
    `INSERT INTO ai_cache (project_id, file_path, summary, explanation, key_functions, prerequisites, related_files, mermaid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`
  ).run(projectId, filePath, data.summary || null, data.explanation || null, data.keyFunctions || null,
    data.prerequisites || null, data.relatedFiles || null, data.mermaid || null)
}

// Clear project data before re-parse
export function clearProjectData(projectId: number) {
  const db = getDb()
  db.prepare('DELETE FROM files WHERE project_id = ?').run(projectId)
  db.prepare('DELETE FROM symbols WHERE project_id = ?').run(projectId)
  db.prepare('DELETE FROM includes WHERE project_id = ?').run(projectId)
  db.prepare('DELETE FROM calls WHERE project_id = ?').run(projectId)
  db.prepare('DELETE FROM struct_deps WHERE project_id = ?').run(projectId)
}

export function insertFileParams(file: { name: string; path: string; type: string; parentPath?: string | null; content?: string | null }) {
  return { path: file.path, name: file.name, type: file.type, parentPath: file.parentPath, content: file.content }
}
