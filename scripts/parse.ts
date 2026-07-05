// @ts-nocheck
/**
 * parse.ts — Parse Linux Kernel 0.21 source code into static JSON data files.
 *
 * Usage: npx tsx scripts/parse.ts
 *
 * Generates:
 *   app/data/files.json          - file tree
 *   app/data/symbols.json        - functions, structs, macros, typedefs
 *   app/data/includes.json       - #include relationships
 *   app/data/calls.json          - function call graph
 *   app/data/architecture.json   - module hierarchy
 *   app/data/ai-mock/*.json      - mock AI data per file
 */

import * as fs from 'fs'
import * as path from 'path'
import Parser from 'tree-sitter'
// @ts-ignore
import C from 'tree-sitter-c'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

interface Symbol {
  name: string
  kind: 'function' | 'struct' | 'macro' | 'typedef' | 'variable'
  file: string
  line: number
  signature?: string
}

interface IncludeEdge {
  from: string
  to: string
}

interface CallEdge {
  caller: string
  callee: string
  callerFile: string
  calleeFile: string
}

interface ArchNode {
  name: string
  description?: string
  children?: ArchNode[]
  files?: string[]
}

interface MockAI {
  filePath: string
  summary: string
  plainExplanation: string
  keyFunctions: { name: string; role: string }[]
  prerequisites: string[]
  relatedFiles: { path: string; reason: string }[]
  mermaid?: string
}

const SOURCE_DIR = path.resolve('public/kernel-source')
const DATA_DIR = path.resolve('app/data')
const AI_MOCK_DIR = path.join(DATA_DIR, 'ai-mock')

// Skip non-C files
function isCFile(filepath: string): boolean {
  const ext = path.extname(filepath)
  return ext === '.c' || ext === '.h'
}

// List all C source files in directory
function listCFiles(dir: string): string[] {
  const results: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...listCFiles(fullPath))
    } else if (entry.isFile() && isCFile(fullPath)) {
      results.push(fullPath)
    }
  }
  return results
}

// Build file tree from directory structure
function buildFileTree(dir: string, baseDir: string): FileNode[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const nodes: FileNode[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'Makefile') continue

    const fullPath = path.join(dir, entry.name)
    const relativePath = path.relative(baseDir, fullPath)

    if (entry.isDirectory()) {
      const children = buildFileTree(fullPath, baseDir)
      if (children.length > 0) {
        nodes.push({
          name: entry.name,
          path: relativePath,
          type: 'directory',
          children,
        })
      }
    } else if (entry.isFile() && isCFile(fullPath)) {
      nodes.push({ name: entry.name, path: relativePath, type: 'file' })
    }
  }

  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

// Parse a C file with tree-sitter and extract symbols + includes + calls
function parseFile(
  filepath: string,
  relativePath: string,
  parser: Parser,
  allFunctions: Set<string>
): { symbols: Symbol[]; includes: IncludeEdge[]; calls: CallEdge[] } {
  const source = fs.readFileSync(filepath, 'utf-8')
  const tree = parser.parse(source)
  const rootNode = tree.rootNode

  const symbols: Symbol[] = []
  const includes: IncludeEdge[] = []
  const calls: CallEdge[] = []

  function walk(node: any) {
    switch (node.type) {
      case 'preproc_include': {
        const pathNode = node.descendantsOfType('system_lib_string')[0]
          || node.descendantsOfType('string_literal')[0]
        if (pathNode) {
          const includePath = pathNode.text.slice(1, -1)
          includes.push({ from: relativePath, to: includePath })
        }
        break
      }

      case 'function_definition': {
        const declarator = node.childForFieldName('declarator')
        if (declarator) {
          const nameNode = findDeepestIdentifier(declarator)
          if (nameNode) {
            const funcName = nameNode.text
            allFunctions.add(funcName)
            const sig = source.slice(node.startIndex, node.startIndex + 200).replace(/\n/g, ' ')
            symbols.push({
              name: funcName,
              kind: 'function',
              file: relativePath,
              line: node.startPosition.row + 1,
              signature: sig.slice(0, 150),
            })
          }
        }

        // Extract function calls within body
        const body = node.childForFieldName('body')
        if (body) {
          extractCalls(body, source, relativePath, allFunctions, calls)
        }
        break
      }

      case 'struct_specifier': {
        const nameNode = node.childForFieldName('name')
        if (nameNode) {
          symbols.push({
            name: nameNode.text,
            kind: 'struct',
            file: relativePath,
            line: node.startPosition.row + 1,
          })
        }
        break
      }

      case 'preproc_def': {
        const nameNode = node.childForFieldName('name')
        if (nameNode && /^[A-Z_]/.test(nameNode.text)) {
          symbols.push({
            name: nameNode.text,
            kind: 'macro',
            file: relativePath,
            line: node.startPosition.row + 1,
          })
        }
        break
      }

      case 'type_definition': {
        const nameNode = node.descendantsOfType('type_identifier').pop()
        if (nameNode) {
          symbols.push({
            name: nameNode.text,
            kind: 'typedef',
            file: relativePath,
            line: node.startPosition.row + 1,
          })
        }
        break
      }
    }

    if (node.children) {
      for (const child of node.children) {
        walk(child)
      }
    }
  }

  walk(rootNode)
  return { symbols, includes, calls }
}

function findDeepestIdentifier(node: any): any {
  if (node.type === 'identifier') return node
  if (node.type === 'function_declarator' || node.type === 'pointer_declarator' || node.type === 'parenthesized_declarator') {
    for (const child of node.children || []) {
      const result = findDeepestIdentifier(child)
      if (result) return result
    }
  }
  for (const child of (node.namedChildren || [])) {
    const result = findDeepestIdentifier(child)
    if (result) return result
  }
  return null
}

function extractCalls(
  body: any,
  source: string,
  filepath: string,
  knownFunctions: Set<string>,
  calls: CallEdge[]
) {
  const callExprs = body.descendantsOfType('call_expression')
  for (const call of callExprs) {
    const funcNode = call.childForFieldName('function')
    if (funcNode) {
      const calleeName = source.slice(funcNode.startIndex, funcNode.endIndex)
      if (calleeName && knownFunctions.has(calleeName)) {
        calls.push({
          caller: '',
          callee: calleeName,
          callerFile: filepath,
          calleeFile: '', // Will be resolved later
        })
      }
    }
  }
}

// Build architecture tree from directory structure
function buildArchitecture(fileTree: FileNode[]): ArchNode[] {
  const subsystems: Record<string, ArchNode> = {
    kernel: { name: 'Process Management', children: [] },
    mm: { name: 'Memory Management', children: [] },
    fs: { name: 'Filesystem', children: [] },
    net: { name: 'Network Stack', children: [] },
    drivers: { name: 'Device Drivers', children: [] },
    init: { name: 'Initialization', children: [] },
    lib: { name: 'Library', children: [] },
    include: { name: 'Headers', children: [] },
    tools: { name: 'Tools', children: [] },
  }

  function collectFiles(node: FileNode, parent: ArchNode) {
    if (node.type === 'file') {
      parent.files = parent.files || []
      parent.files.push(node.path)
    } else if (node.children) {
      for (const child of node.children) {
        collectFiles(child, parent)
      }
    }
  }

  for (const node of fileTree) {
    const topDir = node.name
    if (subsystems[topDir]) {
      collectFiles(node, subsystems[topDir])
    } else {
      subsystems.misc = subsystems.misc || {
        name: topDir,
        files: [],
      }
      collectFiles(node, subsystems.misc)
    }
  }

  return Object.values(subsystems).filter((a) => a.files && a.files.length > 0)
}

// Generate mock AI data for a file
function generateMockAI(relativePath: string, symbols: Symbol[]): MockAI {
  const fileName = path.basename(relativePath)
  const funcNames = symbols.filter((s) => s.kind === 'function').map((s) => s.name)
  const structNames = symbols.filter((s) => s.kind === 'struct').map((s) => s.name)

  const summaries: Record<string, string> = {
    main: '程序入口点，初始化内核各子系统',
    init: '内核初始化主函数，设置中断、内存管理、调度器等',
    sched: '进程调度器实现，负责CPU时间片分配',
    fork: '创建新进程的系统调用实现',
    exit: '进程退出的系统调用实现',
    signal: '信号处理机制实现',
    mm: '内存管理子系统',
    page: '物理页面分配器',
    swap: '交换分区管理',
    buffer: '磁盘缓冲区管理',
    fs: '文件系统抽象层',
    inode: 'inode管理',
    namei: '路径名解析',
    super: '超级块管理',
    bitmap: '位图操作',
    tty: '终端设备驱动',
    console: '控制台驱动',
    keyboard: '键盘驱动',
    floppy: '软盘驱动',
    hd: '硬盘驱动',
    serial: '串口驱动',
    math: '数学协处理器仿真',
    system: '系统调用入口',
    sys: '系统调用实现',
    traps: '中断和异常处理',
    asm: '汇编级底层操作',
    segment: '段描述符管理',
    pipe: '管道实现',
  }

  function guessSummary(): string {
    const lower = fileName.toLowerCase()
    for (const [key, val] of Object.entries(summaries)) {
      if (lower.includes(key)) return val
    }
    return `${fileName} — Linux Kernel 0.21 源代码文件`
  }

  return {
    filePath: relativePath,
    summary: guessSummary(),
    plainExplanation: `这个文件是 Linux 0.21 内核的一部分。它包含了${funcNames.length > 0 ? ` ${funcNames.length} 个函数` : ''}${structNames.length > 0 ? `和 ${structNames.length} 个结构体` : ''}的定义，负责内核中与${fileName.replace(/\.\w+$/, '')}相关的功能实现。`,
    keyFunctions: funcNames.slice(0, 8).map((name) => ({
      name,
      role: `${name} 是 ${fileName} 中的关键函数`,
    })),
    prerequisites: ['C语言基础', '操作系统概念', 'Linux内核基本架构'],
    relatedFiles: symbols
      .filter((s) => s.file !== relativePath)
      .slice(0, 5)
      .map((s) => ({ path: s.file, reason: `引用了 ${s.name}` })),
  }
}

// Main
async function main() {
  console.log('Parsing Linux Kernel 0.21 source code...\n')

  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`Source directory not found: ${SOURCE_DIR}`)
    console.error('Run scripts/download-kernel.sh first')
    process.exit(1)
  }

  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.mkdirSync(AI_MOCK_DIR, { recursive: true })

  const parser = new Parser()
  parser.setLanguage(C)

  const allFunctions = new Set<string>()
  const allSymbols: Symbol[] = []
  const allIncludes: IncludeEdge[] = []
  const allCalls: CallEdge[] = []

  // Phase 1: Extract symbols and includes
  const cFiles = listCFiles(SOURCE_DIR)
  console.log(`Found ${cFiles.length} C source files`)

  for (const filepath of cFiles) {
    const relativePath = path.relative(SOURCE_DIR, filepath)
    process.stdout.write(`  Parsing ${relativePath}... `)
    try {
      const { symbols, includes, calls } = parseFile(filepath, relativePath, parser, allFunctions)
      allSymbols.push(...symbols)
      allIncludes.push(...includes)
      allCalls.push(...calls)
      console.log(`OK (${symbols.length} symbols, ${includes.length} includes)`)
    } catch (err) {
      console.log(`SKIP (parse error)`)
    }
  }

  // Phase 2: Build file tree
  const fileTree = buildFileTree(SOURCE_DIR, SOURCE_DIR)

  // Phase 3: Resolve call edges (match callees to their defining files)
  const symbolFileMap = new Map<string, string>()
  for (const sym of allSymbols) {
    symbolFileMap.set(sym.name, sym.file)
  }
  for (const call of allCalls) {
    call.calleeFile = symbolFileMap.get(call.callee) || ''
  }

  // Phase 4: Build architecture
  const architecture = buildArchitecture(fileTree)

  // Phase 5: Write JSON files
  console.log('\nWriting JSON files...')

  // Extract just the root children (skip top-level SOURCE_DIR)
  const fs2: FileNode[] = buildFileTree(SOURCE_DIR, SOURCE_DIR)

  fs.writeFileSync(path.join(DATA_DIR, 'files.json'), JSON.stringify(fs2, null, 2))
  console.log(`  files.json (${countNodes(fs2)} entries)`)

  fs.writeFileSync(path.join(DATA_DIR, 'symbols.json'), JSON.stringify(allSymbols, null, 2))
  console.log(`  symbols.json (${allSymbols.length} symbols)`)

  fs.writeFileSync(path.join(DATA_DIR, 'includes.json'), JSON.stringify(allIncludes, null, 2))
  console.log(`  includes.json (${allIncludes.length} edges)`)

  fs.writeFileSync(path.join(DATA_DIR, 'calls.json'), JSON.stringify(allCalls, null, 2))
  console.log(`  calls.json (${allCalls.length} edges)`)

  fs.writeFileSync(path.join(DATA_DIR, 'architecture.json'), JSON.stringify(architecture, null, 2))
  console.log(`  architecture.json (${architecture.length} subsystems)`)

  // Generate mock AI data per file
  const fileSymbolMap = new Map<string, Symbol[]>()
  for (const sym of allSymbols) {
    const list = fileSymbolMap.get(sym.file) || []
    list.push(sym)
    fileSymbolMap.set(sym.file, list)
  }

  let aiCount = 0
  for (const [filePath, symbols] of fileSymbolMap) {
    const mock = generateMockAI(filePath, symbols)
    const slug = filePath.replace(/\//g, '_').replace(/\./g, '_')
    fs.writeFileSync(path.join(AI_MOCK_DIR, `${slug}.json`), JSON.stringify(mock, null, 2))
    aiCount++
  }
  console.log(`  ai-mock/*.json (${aiCount} files)`)

  console.log('\nDone! All data files generated in app/data/')
}

function countNodes(nodes: FileNode[]): number {
  let count = nodes.length
  for (const node of nodes) {
    if (node.children) count += countNodes(node.children) - 1
  }
  return count
}

main().catch(console.error)
