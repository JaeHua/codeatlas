export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  symbols?: Symbol[]
}

export interface Symbol {
  name: string
  kind: 'function' | 'struct' | 'macro' | 'typedef' | 'variable'
  file: string
  line: number
  signature?: string
  description?: string
}

export interface IncludeEdge {
  from_file: string
  to_file: string
}

export interface CallEdge {
  caller: string
  callee: string
  caller_file: string
  callee_file: string
}

export interface ArchNode {
  name: string
  description?: string
  children?: ArchNode[]
  files?: string[]
}

export interface MockAI {
  filePath: string
  summary: string
  plainExplanation: string
  keyFunctions: { name: string; role: string }[]
  prerequisites: string[]
  relatedFiles: { path: string; reason: string }[]
  mermaid?: string
  faq?: { q: string; a: string }[]
}

export interface SearchResult {
  type: 'file' | 'function' | 'struct' | 'macro'
  name: string
  path: string
  line?: number
  score: number
}

export type ActiveView = 'code' | 'graph' | 'architecture'

export interface SelectedEntity {
  type: 'file' | 'function'
  path: string
  name: string
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  type: 'include' | 'call' | 'struct_dep' | 'concept'
}

export interface GraphNode {
  id: string
  label: string
  type: 'file' | 'function' | 'struct' | 'macro'
  file?: string
  line?: number
}

export interface StructEdge {
  struct_name: string
  uses: string
  relation: 'nested' | 'pointer' | 'typed_field'
}

export type EdgeType = 'include' | 'call' | 'struct_dep' | 'concept'
