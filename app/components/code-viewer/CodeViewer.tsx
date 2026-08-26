'use client'

import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react'
import { useStore } from '@/app/store'
import { loadSourceCode } from '@/app/lib/data-api'
import Editor, { type OnMount } from '@monaco-editor/react'
import { Loader2 } from 'lucide-react'
import { useTheme } from '@/app/store/theme'
import type { editor } from 'monaco-editor'

function buildMonacoTheme(vars: Record<string, string>): editor.IStandaloneThemeData {
  const bg = vars['--background']?.replace('#', '') || 'FBF8F0'
  const fg = vars['--foreground']?.replace('#', '') || '1A1A18'
  const primary = vars['--primary']?.replace('#', '') || 'E0A93C'
  const mutedFg = vars['--muted-foreground']?.replace('#', '') || '8A8578'
  const card = vars['--card']?.replace('#', '') || 'FFFFFF'
  const border = vars['--border']?.replace('#', '') || 'E2DDD2'
  const accent = vars['--accent']?.replace('#', '') || 'F3EFE6'
  return {
    base: 'vs', inherit: false,
    rules: [
      { token: 'comment', foreground: mutedFg, fontStyle: 'italic' },
      { token: 'keyword', foreground: primary, fontStyle: 'bold' },
      { token: 'string', foreground: mutedFg },
      { token: 'number', foreground: primary },
      { token: 'type', foreground: primary, fontStyle: 'bold' },
      { token: 'predefined', foreground: primary },
      { token: 'function', foreground: fg },
      { token: 'identifier', foreground: fg },
      { token: 'delimiter', foreground: mutedFg },
    ],
    colors: {
      'editor.background': `#${bg}`, 'editor.foreground': `#${fg}`,
      'editor.lineHighlightBackground': `#${card}`, 'editor.selectionBackground': `#${border}`,
      'editorCursor.foreground': `#${primary}`, 'editorLineNumber.foreground': `#${border}`,
      'editorLineNumber.activeForeground': `#${mutedFg}`, 'editor.selectionHighlightBackground': `#${card}`,
      'editorBracketMatch.background': `#${accent}`, 'editorBracketMatch.border': `#${primary}`,
      'editorIndentGuide.background': `#${card}`, 'editorIndentGuide.activeBackground': `#${border}`,
      'editorWidget.background': `#${card}`, 'editorWidget.border': `#${border}`,
      'editorSuggestWidget.background': `#${card}`, 'editorSuggestWidget.border': `#${border}`,
      'editorSuggestWidget.selectedBackground': `#${accent}`, 'minimap.background': `#${bg}`,
    },
  }
}

// Module-level hover symbols ref — shared across all editors, only ONE hover provider
let globalSymbolsRef: any[] = []

function ensureHoverProvider(monaco: any) {
  const key = '_codeatlas_hover_registered'
  if ((monaco as any)[key]) return
  ;(monaco as any)[key] = true

  monaco.languages.registerHoverProvider('c', {
    provideHover: (model: any, position: any) => {
      const word = model.getWordAtPosition(position)
      if (!word) return null
      const sym = globalSymbolsRef.find((s: any) => s.name === word.word)
      if (!sym) return null
      const value = [
        sym.signature ? `\`\`\`c\n${sym.signature}\n\`\`\`` : '',
        sym.description || '',
        `📁 ${sym.file}:${sym.line}`,
        '_⌘+点击 跳转定义_',
      ].filter(Boolean).join('\n\n')
      return {
        range: { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn },
        contents: [{ value }],
      }
    },
  })
}

/** 从源码提取函数体（从定义行起做花括号配对，上限 200 行） */
function extractFunctionBody(source: string, defLine: number): string {
  const lines = source.split('\n')
  const start = Math.max(0, defLine - 1)
  let depth = 0
  let started = false
  const body: string[] = []
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]
    body.push(line)
    for (const ch of line) {
      if (ch === '{') { depth++; started = true }
      else if (ch === '}') depth--
    }
    if (started && depth === 0 && body.length > 1) break
    if (body.length > 200) break
  }
  return body.join('\n')
}

function getLanguage(filename: string | null): string {
  if (!filename) return 'plaintext'
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const name = filename.toLowerCase()
  const map: Record<string, string> = {
    c: 'c', h: 'c',
    s: 'mips', S: 'mips', asm: 'mips',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
    py: 'python', pyw: 'python',
    java: 'java',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    go: 'go', rs: 'rust', rb: 'ruby',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    pl: 'perl', pm: 'perl', php: 'php',
    swift: 'swift', kt: 'kotlin', scala: 'scala',
    lua: 'lua', r: 'r', dart: 'dart',
    sql: 'sql', json: 'json',
    xml: 'xml', html: 'html', htm: 'html',
    css: 'css', scss: 'scss', less: 'less',
    yaml: 'yaml', yml: 'yaml', toml: 'ini',
    md: 'markdown', markdown: 'markdown',
    diff: 'diff', patch: 'diff',
    dockerfile: 'dockerfile',
    ps1: 'powershell', bat: 'bat',
    ini: 'ini', cfg: 'ini', conf: 'ini',
    makefile: 'plaintext',
  }
  return map[ext] || map[name] || 'plaintext'
}

export function CodeViewer() {
  const theme = useTheme()
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<any>(null)

  useLayoutEffect(() => {
    if (!monacoRef.current) return
    const t = theme.getTheme()
    monacoRef.current.editor.defineTheme('dynamic-theme', buildMonacoTheme(t.variables as Record<string, string>))
    monacoRef.current.editor.setTheme('dynamic-theme')
  }, [theme])

  const { selectedFile, symbols, setSelectedEntity, projectId, selectedEntity } = useStore()
  const [source, setSource] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const decorationsRef = useRef<string[]>([])
  const pendingLineRef = useRef<number | null>(null)

  // Keep global symbol ref updated (used by the shared hover provider)
  globalSymbolsRef = symbols

  useEffect(() => {
    pendingLineRef.current = selectedEntity?.line || null
  }, [selectedEntity?.line, selectedEntity?.path])

  useEffect(() => {
    const line = pendingLineRef.current
    if (!line || !editorRef.current || !source) return
    pendingLineRef.current = null
    const ed = editorRef.current
    ed.revealLineInCenter(line)
    ed.setPosition({ lineNumber: line, column: 1 })
    decorationsRef.current = ed.deltaDecorations(decorationsRef.current, [{
      range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
      options: { isWholeLine: true, className: 'search-highlight-line', marginClassName: 'search-highlight-margin' },
    }])
    setTimeout(() => { decorationsRef.current = ed.deltaDecorations(decorationsRef.current, []) }, 3000)
  }, [source, selectedEntity?.line, selectedEntity?.path])

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    ensureHoverProvider(monaco)

    // ⌘/Ctrl+Click: jump to symbol definition (cross-file)
    editor.onMouseDown((e) => {
      if (!(e.event.metaKey || e.event.ctrlKey)) return
      const model = editor.getModel()
      if (!model) return
      const pos = e.target.position
      if (!pos) return
      const word = model.getWordAtPosition(pos)
      if (!word) return
      const state = useStore.getState()
      const sym = state.symbols.find((s) => s.name === word.word)
      if (!sym) return
      e.event.preventDefault()
      e.event.stopPropagation()
      const line = sym.kind === 'function' ? sym.line + 1 : sym.line
      if (sym.file === state.selectedFile) {
        window.dispatchEvent(new CustomEvent('codeatlas:reveal-line', { detail: { line } }))
      } else {
        state.selectFileWithLine(sym.file, line)
      }
    })

    // Cmd+E action for selection explain
    editor.addAction({
      id: 'explain-selection', label: 'AI 解释选中代码',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE],
      run: (ed) => {
        const selection = ed.getSelection()
        if (!selection || selection.isEmpty()) return
        const selectedText = ed.getModel()?.getValueInRange(selection)
        if (!selectedText) return
        const filePath = selectedFile || ''
        const model = ed.getModel()
        if (!model) return
        const startLine = Math.max(1, selection.startLineNumber - 5)
        const endLine = Math.min(model.getLineCount(), selection.endLineNumber + 5)
        const context = model.getValueInRange({ startLineNumber: startLine, startColumn: 1, endLineNumber: endLine, endColumn: model.getLineMaxColumn(endLine) })
        window.dispatchEvent(new CustomEvent('codeatlas:explain', { detail: { filePath, fileName: filePath.split('/').pop() || '', selectedText, context } }))
      },
    })

    // Track cursor position for status bar
    editor.onDidChangeCursorPosition((e) => {
      useStore.getState().setCursorPosition(e.position.lineNumber, e.position.column)
    })
    editor.addAction({
      id: 'trace-function', label: '追踪执行流', contextMenuGroupId: 'navigation', contextMenuOrder: 1,
      run: (ed) => {
        const position = ed.getPosition()
        if (!position) return
        const word = ed.getModel()?.getWordAtPosition(position)
        if (!word) return
        const sym = symbols.find((s) => s.name === word.word && s.kind === 'function')
        if (sym) window.dispatchEvent(new CustomEvent('codeatlas:trace', { detail: { type: 'trace', functionName: word.word } }))
      },
    })

    // 解释此函数：提取函数体 + 调用上下文 → AI 面板
    editor.addAction({
      id: 'explain-function', label: 'AI 解释此函数', contextMenuGroupId: 'navigation', contextMenuOrder: 2,
      run: (ed) => {
        const model = ed.getModel()
        const position = ed.getPosition()
        if (!model || !position) return
        const word = model.getWordAtPosition(position)
        if (!word) return
        const state = useStore.getState()
        const func = state.symbols.find((s) => s.name === word.word && s.kind === 'function')
        if (!func) return
        const filePath = state.selectedFile || ''
        const source = model.getValue()
        const body = extractFunctionBody(source, func.line)
        const relevant = state.calls.filter((c) => c.caller === word.word || c.callee === word.word)
        const callers = Array.from(new Set(relevant.filter((c) => c.callee === word.word).map((c) => c.caller)))
        const callees = Array.from(new Set(relevant.filter((c) => c.caller === word.word).map((c) => c.callee)))
        window.dispatchEvent(new CustomEvent('codeatlas:explain-function', {
          detail: { filePath, fileName: filePath.split('/').pop() || '', functionName: word.word, source: body, callers, callees },
        }))
      },
    })
  }, [selectedFile, symbols])

  useEffect(() => {
    if (!monacoRef.current) return
    const disposable = monacoRef.current.editor.registerCommand('codeatlas.detail', (_: unknown, data: string) => {
      try { const { name, file } = JSON.parse(decodeURIComponent(data)); setSelectedEntity({ type: 'function', path: file, name }) } catch {}
    })
    return () => disposable.dispose()
  }, [setSelectedEntity])

  // Listen for reveal-line events (from Outline clicks)
  useEffect(() => {
    const handler = (e: Event) => {
      const line = (e as CustomEvent).detail?.line
      if (!line || !editorRef.current) return
      const ed = editorRef.current
      ed.revealLineInCenter(line)
      ed.setPosition({ lineNumber: line, column: 1 })
      decorationsRef.current = ed.deltaDecorations(decorationsRef.current, [{
        range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
        options: { isWholeLine: true, className: 'search-highlight-line', marginClassName: 'search-highlight-margin' },
      }])
      setTimeout(() => { decorationsRef.current = ed.deltaDecorations(decorationsRef.current, []) }, 3000)
    }
    window.addEventListener('codeatlas:reveal-line', handler)
    return () => window.removeEventListener('codeatlas:reveal-line', handler)
  }, [])

  // Load source
  useEffect(() => {
    if (!selectedFile) { setSource(''); setLoading(false); setError(null); return }
    let cancelled = false; setLoading(true); setError(null)
    const timeoutId = setTimeout(() => { if (!cancelled) { setLoading(false); setError('加载超时') } }, 15000)
    loadSourceCode(projectId || 0, selectedFile)      .then((s) => {
        if (!cancelled) {
          clearTimeout(timeoutId); setSource(s); setLoading(false)
          useStore.getState().setFileInfo(s.split('\n').length, selectedFile?.match(/\.(s|S|asm)$/) ? 'x86 Assembly' : 'C')
        }
      }).catch(() => { if (!cancelled) { clearTimeout(timeoutId); setSource('// Failed to load source'); setLoading(false) } })
    return () => { cancelled = true; clearTimeout(timeoutId) }
  }, [selectedFile, projectId])

  if (!selectedFile) return <div className="flex items-center justify-center h-full text-[var(--muted-foreground)] text-sm">选择文件查看源码</div>
  if (error) return <div className="flex flex-col items-center justify-center h-full gap-2 text-[var(--muted-foreground)] text-sm"><p>{error}</p><button onClick={() => { useStore.getState().selectFile(null); setTimeout(() => useStore.getState().selectFile(selectedFile), 50) }} className="px-3 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded transition-colors">重试</button></div>
  if (loading) return <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--muted-foreground)]"><Loader2 className="h-5 w-5 animate-spin" /><span className="text-xs">加载 {selectedFile.split('/').pop()}...</span></div>

  return (
    <div className="h-full">
      <Editor
        height="100%"
        language={getLanguage(selectedFile)}
        value={source}
        theme="vs"
        beforeMount={(monaco) => { const t = theme.getTheme(); monaco.editor.defineTheme('dynamic-theme', buildMonacoTheme(t.variables as Record<string, string>)); ensureHoverProvider(monaco) }}
        onMount={handleEditorMount}
        options={{
          readOnly: true, fontSize: 13, lineNumbers: 'on', scrollBeyondLastLine: false,
          wordWrap: 'off', padding: { top: 8 }, smoothScrolling: true, cursorBlinking: 'smooth',
          renderLineHighlight: 'line', guides: { indentation: true, bracketPairs: true },
          automaticLayout: true, mouseWheelZoom: true,
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        }}
      />
    </div>
  )
}
