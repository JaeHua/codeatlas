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
    base: 'vs',
    inherit: false,
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
      'editor.background': `#${bg}`,
      'editor.foreground': `#${fg}`,
      'editor.lineHighlightBackground': `#${card}`,
      'editor.selectionBackground': `#${border}`,
      'editorCursor.foreground': `#${primary}`,
      'editorLineNumber.foreground': `#${border}`,
      'editorLineNumber.activeForeground': `#${mutedFg}`,
      'editor.selectionHighlightBackground': `#${card}`,
      'editorBracketMatch.background': `#${accent}`,
      'editorBracketMatch.border': `#${primary}`,
      'editorIndentGuide.background': `#${card}`,
      'editorIndentGuide.activeBackground': `#${border}`,
      'editorWidget.background': `#${card}`,
      'editorWidget.border': `#${border}`,
      'editorSuggestWidget.background': `#${card}`,
      'editorSuggestWidget.border': `#${border}`,
      'editorSuggestWidget.selectedBackground': `#${accent}`,
      'minimap.background': `#${bg}`,
    },
  }
}

export { buildMonacoTheme }

export function CodeViewer() {
  const theme = useTheme()
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)

  // Re-apply Monaco theme when store theme changes
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
  const symbolsRef = useRef(symbols)
  symbolsRef.current = symbols
  const selectedFileRef = useRef(selectedFile)
  selectedFileRef.current = selectedFile

  // Register hover provider (only once) + navigation click handler
  const handleEditorMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco

      // Hover provider — uses ref so always reads latest symbols
      const disposable = monaco.languages.registerHoverProvider('c', {
        provideHover: (model, position) => {
          const word = model.getWordAtPosition(position)
          if (!word) return null
          const sym = symbolsRef.current.find((s) => s.name === word.word)
          if (!sym) return null
          const contents: { value: string }[] = []
          if (sym.signature) contents.push({ value: `\`\`\`c\n${sym.signature}\n\`\`\`` })
          const lines: string[] = []
          if (sym.description) lines.push(sym.description)
          lines.push(`📁 ${sym.file}:${sym.line}`)
          if (sym.kind === 'function') {
            lines.push(`\n[查看详情 →](command:codeatlas.detail?${encodeURIComponent(JSON.stringify({ name: sym.name, file: sym.file }))})`)
          }
          return { range: { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn }, contents: [...contents, { value: lines.join('\n\n') }] }
        },
      })

      // Cmd+Click → go to definition
      monaco.languages.registerDefinitionProvider('c', {
        provideDefinition: (model, position) => {
          const word = model.getWordAtPosition(position)
          if (!word) return null
          const sym = symbolsRef.current.find((s) => s.name === word.word)
          if (!sym?.file) return null
          useStore.getState().selectFileWithLine(sym.file, sym.line)
          return null
        },
      })

      // Register right-click action for trace
      editor.addAction({
        id: 'trace-function',
        label: '追踪执行流',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1,
        run: (ed) => {
          const position = ed.getPosition()
          if (!position) return
          const word = ed.getModel()?.getWordAtPosition(position)
          if (!word) return

          // Check if this word is a known function
          const sym = symbols.find((s) => s.name === word.word)
          if (sym && sym.kind === 'function') {
            window.dispatchEvent(new CustomEvent('codeatlas:trace', { detail: { type: 'trace', functionName: word.word } }))
          }
        },
      })

      // Register Cmd+E action for selection explain
      editor.addAction({
        id: 'explain-selection',
        label: 'AI 解释选中代码',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE],
        run: (ed) => {
          const selection = ed.getSelection()
          if (!selection || selection.isEmpty()) return

          const selectedText = ed.getModel()?.getValueInRange(selection)
          if (!selectedText) return

          const filePath = selectedFile || ''
          const fileName = filePath.split('/').pop() || ''

          // Get surrounding context
          const model = ed.getModel()
          if (!model) return

          const startLine = Math.max(1, selection.startLineNumber - 5)
          const endLine = Math.min(model.getLineCount(), selection.endLineNumber + 5)
          const context = model.getValueInRange({
            startLineNumber: startLine,
            startColumn: 1,
            endLineNumber: endLine,
            endColumn: model.getLineMaxColumn(endLine),
          })

          const prompt: SelectionExplain = {
            filePath,
            fileName,
            selectedText,
            context,
          }
          window.dispatchEvent(new CustomEvent('codeatlas:explain', { detail: prompt }))
        },
      })
    },
    [selectedFile, symbols]
  )

  // Command handler for hover detail links
  useEffect(() => {
    if (!monacoRef.current) return
    const monaco = monacoRef.current

    const disposable = monaco.editor.registerCommand(
      'codeatlas.detail',
      (_: unknown, data: string) => {
        try {
          const { name, file } = JSON.parse(decodeURIComponent(data))
          setSelectedEntity({ type: 'function', path: file, name })
        } catch {
          // ignore
        }
      }
    )

    return () => disposable.dispose()
  }, [setSelectedEntity])

  // Go-to-line handler
  useEffect(() => {
    const handler = () => {
      const ed = editorRef.current
      if (!ed) return
      const line = prompt('跳转到行号:')
      if (line && !isNaN(Number(line))) {
        ed.revealLineInCenter(Number(line))
        ed.setPosition({ lineNumber: Number(line), column: 1 })
      }
    }
    window.addEventListener('codeatlas:goto-line', handler)
    return () => window.removeEventListener('codeatlas:goto-line', handler)
  }, [])

  // Find-in-file handler
  useEffect(() => {
    const handler = () => {
      const ed = editorRef.current
      if (!ed) return
      ed.getAction('actions.find')?.run()
    }
    window.addEventListener('codeatlas:find-in-file', handler)
    return () => window.removeEventListener('codeatlas:find-in-file', handler)
  }, [])

  // Quick-trace handler
  useEffect(() => {
    const handler = () => {
      const ed = editorRef.current
      if (!ed) return
      const position = ed.getPosition()
      if (!position) return
      const word = ed.getModel()?.getWordAtPosition(position)
      if (!word) return
      const sym = symbols.find((s) => s.name === word.word)
      if (sym?.kind === 'function') {
        window.dispatchEvent(new CustomEvent('codeatlas:trace', { detail: { type: 'trace', functionName: word.word } }))
      }
    }
    window.addEventListener('codeatlas:quick-trace', handler)
    return () => window.removeEventListener('codeatlas:quick-trace', handler)
  }, [symbols])

  // Load source
  useEffect(() => {
    if (!selectedFile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSource('')
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        setLoading(false)
        setError('加载超时，请检查网络连接')
      }
    }, 15000)

    loadSourceCode(projectId || 0, selectedFile)
      .then((s) => {
        if (!cancelled) {
          clearTimeout(timeoutId)
          setSource(s)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearTimeout(timeoutId)
          setSource('// Failed to load source')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [selectedFile])

  if (!selectedFile) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 text-sm">
        选择文件查看源码
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-neutral-500 text-sm">
        <p>{error}</p>
        <button
          onClick={() => {
            useStore.getState().selectFile(null)
            setTimeout(() => useStore.getState().selectFile(selectedFile), 50)
          }}
          className="px-3 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded transition-colors"
        >
          重试
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-neutral-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-xs">加载 {selectedFile.split('/').pop()}...</span>
      </div>
    )
  }

  return (
    <div className="h-full relative">
      <Editor
        height="100%"
        language={selectedFile?.endsWith('.s') || selectedFile?.endsWith('.S') || selectedFile?.endsWith('.asm') ? 'asm' : 'c'}
        value={source}
        theme="vs"
        beforeMount={(monaco) => {
          const t = theme.getTheme()
          monaco.editor.defineTheme('dynamic-theme', buildMonacoTheme(t.variables as Record<string, string>))
        }}
        onMount={handleEditorMount}
        options={{
          readOnly: true,
          minimap: { enabled: true, scale: 1, showSlider: 'mouseover' as const },
          fontSize: 13,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'off',
          mouseWheelZoom: true,
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          renderLineHighlight: 'line',
          guides: { indentation: true, bracketPairs: true },
          automaticLayout: true,
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
        }}
      />
    </div>
  )
}

export interface SelectionExplain {
  filePath: string
  fileName: string
  selectedText: string
  context: string
}
