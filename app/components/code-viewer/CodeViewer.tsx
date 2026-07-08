'use client'

import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react'
import { useStore } from '@/app/store'
import { loadSourceCode } from '@/app/lib/data-api'
import Editor, { type OnMount } from '@monaco-editor/react'
import { Loader2 } from 'lucide-react'
import { useTheme } from '@/app/store/theme'
import type { editor } from 'monaco-editor'

function buildMonacoTheme(vars: Record<string, string>): editor.IStandaloneThemeData {
  const bg = vars['--background']?.replace('#', '') || 'f5f0e8'
  const fg = vars['--foreground']?.replace('#', '') || '3d3629'
  const primary = vars['--primary']?.replace('#', '') || 'c17e60'
  const mutedFg = vars['--muted-foreground']?.replace('#', '') || '8c8273'
  const card = vars['--card']?.replace('#', '') || 'ede6d8'
  const border = vars['--border']?.replace('#', '') || 'd4c9b5'
  const accent = vars['--accent']?.replace('#', '') || 'e8dcc8'
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
      ].filter(Boolean).join('\n\n')
      return {
        range: { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn },
        contents: [{ value }],
      }
    },
  })
}

function getLanguage(filename: string | null): string {
  if (!filename) return 'plaintext'
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const name = filename.toLowerCase()
  const map: Record<string, string> = {
    c: 'c', h: 'c',
    s: 'asm', S: 'asm', asm: 'asm',
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

  useEffect(() => { if (selectedEntity?.line) pendingLineRef.current = selectedEntity.line }, [selectedEntity?.line])

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
  }, [source])

  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    ensureHoverProvider(monaco)

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
  }, [selectedFile, symbols])

  useEffect(() => {
    if (!monacoRef.current) return
    const disposable = monacoRef.current.editor.registerCommand('codeatlas.detail', (_: unknown, data: string) => {
      try { const { name, file } = JSON.parse(decodeURIComponent(data)); setSelectedEntity({ type: 'function', path: file, name }) } catch {}
    })
    return () => disposable.dispose()
  }, [setSelectedEntity])

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
