import type { IncludeEdge, CallEdge, FileNode } from './types'

interface CallTreeNode {
  name: string
  children?: CallTreeNode[]
}

export function buildIncludeGraph(
  currentFile: string,
  includes: IncludeEdge[]
) {
  const fromCurrent = includes.filter((e) => e.from_file === currentFile)
  const toCurrent = includes.filter((e) => e.to_file === currentFile)

  const nodes = new Map<string, { id: string; label: string; type: string }>()
  const edges: { id: string; source: string; target: string }[] = []

  nodes.set(currentFile, {
    id: currentFile,
    label: fileName(currentFile),
    type: 'current',
  })

  for (const inc of fromCurrent) {
    nodes.set(inc.to_file, { id: inc.to_file, label: fileName(inc.to_file), type: 'included' })
    edges.push({ id: `${currentFile}->${inc.to_file}`, source: currentFile, target: inc.to_file })
  }

  for (const inc of toCurrent) {
    nodes.set(inc.from_file, {
      id: inc.from_file,
      label: fileName(inc.from_file),
      type: 'includer',
    })
    edges.push({ id: `${inc.from_file}->${currentFile}`, source: inc.from_file, target: currentFile })
  }

  return { nodes: Array.from(nodes.values()), edges }
}

export function buildCallTree(
  functionName: string,
  calls: CallEdge[],
  direction: 'callers' | 'callees'
) {
  const keyField = direction === 'callers' ? 'caller' : 'callee'
  const matchField = direction === 'callers' ? 'callee' : 'caller'

  const visited = new Set<string>()

  function expand(name: string, depth: number): CallTreeNode | null {
    if (depth > 3 || visited.has(name)) return null
    visited.add(name)

    const children = calls
      .filter((c) => c[matchField as keyof CallEdge] === name)
      .map((c) => expand(c[keyField as keyof CallEdge] as string, depth + 1))
      .filter(Boolean) as CallTreeNode[]

    return { name, children: children.length > 0 ? children : undefined }
  }

  return expand(functionName, 0)
}

export function flattenFileTree(node: FileNode, prefix = ''): FileNode[] {
  const fullPath = prefix ? `${prefix}/${node.name}` : node.name
  const result: FileNode[] = [{ ...node, path: fullPath }]
  if (node.children) {
    for (const child of node.children) {
      result.push(...flattenFileTree(child, fullPath))
    }
  }
  return result
}

export function searchFiles(query: string, files: FileNode[]): { path: string; name: string; score: number }[] {
  const lower = query.toLowerCase()
  const results: { path: string; name: string; score: number }[] = []

  const flatFiles: FileNode[] = []
  for (const node of files) {
    flatFiles.push(...flattenFileTree(node))
  }

  for (const f of flatFiles) {
    if (f.type === 'file') {
      const nameLower = f.name.toLowerCase()
      const pathLower = f.path.toLowerCase()

      if (nameLower.includes(lower) || pathLower.includes(lower)) {
        const score =
          nameLower === lower
            ? 100
            : nameLower.startsWith(lower)
              ? 80
              : pathLower.includes(lower)
                ? 50
                : 30
        results.push({ path: f.path, name: f.name, score })
      }
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 20)
}

function fileName(path: string): string {
  return path.split('/').pop() || path
}
