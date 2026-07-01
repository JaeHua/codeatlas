'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useStore } from '@/app/store'
import { loadSourceCode } from '@/app/lib/data-loader'
import { useSettings } from '@/app/store/settings'
import { chatCompletionStream } from '@/app/lib/ai-api'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import {
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  GitBranch,
  Play,
  Pause,
} from 'lucide-react'

interface TraceStep {
  functionName: string
  file: string
  sourceSnippet: string
  pseudocode: string
  callIndex: number
}

export function TracePanel() {
  const { symbols, calls, selectFile, setSelectedEntity } = useStore()
  const { isConfigured } = useSettings()
  const [open, setOpen] = useState(false)
  const [steps, setSteps] = useState<TraceStep[]>([])
  const [currentStep, setCurrentStep] = useState(0)
  const [autoFollow, setAutoFollow] = useState(true)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const getCallees = useCallback(
    (funcName: string): [string, string][] => {
      return calls
        .filter((c) => c.caller === funcName)
        .map((c) => [c.callee, c.callee_file || ''] as [string, string])
        .filter(([n]) => n && n !== funcName)
    },
    [calls]
  )

  const generatePseudocode = useCallback(
    async (funcName: string, source: string): Promise<string> => {
      if (!isConfigured()) {
        // Mock pseudocode from source
        const lines = source.split('\n').filter((l) => l.trim() && !l.trim().startsWith('/*') && !l.trim().startsWith('*'))
        const callsInFunc = getCallees(funcName)
        const pseudo: string[] = []
        for (const line of lines.slice(0, 20)) {
          const trimmed = line.trim()
          if (trimmed.startsWith('if')) pseudo.push(`  ↓ 判断条件`)
          else if (trimmed.startsWith('return')) pseudo.push(`  ↓ 返回`)
          else if (trimmed.startsWith('for') || trimmed.startsWith('while')) pseudo.push(`  ↓ 循环`)
          else {
            const called = callsInFunc.find(([n]) => trimmed.includes(n))
            if (called) pseudo.push(`  → 调用 ${called[0]}()`)
          }
        }
        return pseudo.length > 0 ? pseudo.slice(0, 8).join('\n') : '无可用伪代码'
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      let result = ''
      try {
        await chatCompletionStream(
          [
            {
              role: 'system',
              content: `你是 Linux 内核代码分析助手。将下面 C 函数转为简洁的中文伪代码（每行一个步骤，用 ↓ 或 → 开头）。最多 8 行。直接输出伪代码，不要其他内容。`,
            },
            { role: 'user', content: `函数 ${funcName}:\n\`\`\`c\n${source.slice(0, 3000)}\n\`\`\`` },
          ],
          (chunk) => { result += chunk },
          controller.signal
        )
      } catch {
        result = '生成失败'
      }
      return result
    },
    [isConfigured, getCallees]
  )

  const startTrace = useCallback(
    async (funcName: string) => {
      setOpen(true)
      setCurrentStep(0)
      setLoading(true)
      setSteps([])

      const sym = symbols.find((s) => s.name === funcName)
      const file = sym?.file || ''

      try {
        const source = file ? await loadSourceCode(file) : ''
        // Extract just the function body roughly
        const lines = source.split('\n')
        const funcStart = sym?.line ? lines.slice(sym.line - 1, sym.line + 30).join('\n') : source.slice(0, 2000)

        const pseudo = await generatePseudocode(funcName, source)

        setSteps([
          {
            functionName: funcName,
            file,
            sourceSnippet: funcStart,
            pseudocode: pseudo,
            callIndex: 0,
          },
        ])

        if (file) {
          selectFile(file)
          setSelectedEntity({ type: 'function', path: file, name: funcName })
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    },
    [symbols, selectFile, setSelectedEntity, generatePseudocode]
  )

  // Listen for trace command from right-click
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.type === 'trace') {
        startTrace(detail.functionName)
      }
    }
    window.addEventListener('codeatlas:trace', handler)
    return () => window.removeEventListener('codeatlas:trace', handler)
  }, [startTrace])

  const advanceStep = useCallback(
    async (toCall?: string) => {
      if (steps.length === 0) return

      if (toCall) {
        // Advance to specific function
        setLoading(true)
        try {
          const sym = symbols.find((s) => s.name === toCall)
          const file = sym?.file || ''
          const source = file ? await loadSourceCode(file) : ''
          const pseudo = await generatePseudocode(toCall, source)

          const newStep: TraceStep = {
            functionName: toCall,
            file,
            sourceSnippet: source.slice(0, 2000),
            pseudocode: pseudo,
            callIndex: steps.length,
          }
          setSteps((prev) => [...prev, newStep])
          setCurrentStep((prev) => prev + 1)

          if (file) {
            selectFile(file)
            setSelectedEntity({ type: 'function', path: file, name: toCall })
          }
        } catch {
          // ignore
        } finally {
          setLoading(false)
        }
        return
      }

      // Auto-advance to next callee
      const currentFunc = steps[currentStep]?.functionName
      if (!currentFunc) return

      const callees = getCallees(currentFunc)
      if (callees.length === 0) return

      const nextIdx = (steps[currentStep]?.callIndex || 0) % callees.length
      const [nextFunc, nextFile] = callees[nextIdx]

      // Update call index
      setSteps((prev) =>
        prev.map((s, i) => (i === currentStep ? { ...s, callIndex: nextIdx + 1 } : s))
      )

      setLoading(true)
      try {
        const source = nextFile ? await loadSourceCode(nextFile) : ''
        const pseudo = await generatePseudocode(nextFunc, source)

        const newStep: TraceStep = {
          functionName: nextFunc,
          file: nextFile,
          sourceSnippet: source.slice(0, 2000),
          pseudocode: pseudo,
          callIndex: 0,
        }

        // Trim steps beyond current
        setSteps((prev) => [...prev.slice(0, currentStep + 1), newStep])
        setCurrentStep((prev) => prev + 1)

        if (nextFile) {
          selectFile(nextFile)
          setSelectedEntity({ type: 'function', path: nextFile, name: nextFunc })
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    },
    [steps, currentStep, symbols, selectFile, setSelectedEntity, generatePseudocode, getCallees]
  )

  const goBack = useCallback(() => {
    if (currentStep <= 0) return
    const prev = steps[currentStep - 1]
    setCurrentStep(currentStep - 1)
    if (prev.file) {
      selectFile(prev.file)
      setSelectedEntity({ type: 'function', path: prev.file, name: prev.functionName })
    }
  }, [currentStep, steps, selectFile, setSelectedEntity])

  const jumpToStep = useCallback(
    (idx: number) => {
      setCurrentStep(idx)
      const step = steps[idx]
      if (step?.file) {
        selectFile(step.file)
        setSelectedEntity({ type: 'function', path: step.file, name: step.functionName })
      }
    },
    [steps, selectFile, setSelectedEntity]
  )

  const close = useCallback(() => {
    abortRef.current?.abort()
    setOpen(false)
    setSteps([])
    setCurrentStep(0)
  }, [])

  if (!open) return null

  const currentFunc = steps[currentStep]

  return (
    <div className="border-t border-[var(--border)] bg-[var(--background)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] bg-[var(--card)]/50">
        <div className="flex items-center gap-2 text-xs">
          <GitBranch className="h-3.5 w-3.5 text-[var(--primary)]" />
          <span className="text-[var(--muted-foreground)]">执行流追踪</span>
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 text-[11px]">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-1">
                <button
                  onClick={() => jumpToStep(i)}
                  className={cn(
                    'font-mono hover:text-[var(--foreground)] transition-colors',
                    i === currentStep ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]'
                  )}
                >
                  {s.functionName}
                </button>
                {i < steps.length - 1 && (
                   <span className="text-[var(--muted-foreground)]/70">→</span>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoFollow(!autoFollow)}
            className={cn(
              'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors',
              autoFollow ? 'bg-[var(--primary)]/20 text-[var(--foreground)]' : 'text-[var(--muted-foreground)]/70'
            )}
          >
            {autoFollow ? <Play className="h-2.5 w-2.5" /> : <Pause className="h-2.5 w-2.5" />}
            自动跟随
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            onClick={close}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex" style={{ height: 200 }}>
        {loading && !currentFunc ? (
          <div className="flex-1 flex items-center justify-center text-[var(--muted-foreground)] text-xs gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            分析执行流...
          </div>
        ) : currentFunc ? (
          <>
            {/* Pseudocode panel */}
            <div className="w-64 border-r border-[var(--border)] flex flex-col">
              <div className="px-3 py-1.5 border-b border-[var(--border)] text-[10px] text-[var(--muted-foreground)] uppercase">
                Step {currentStep + 1}/{steps.length} — 伪代码
              </div>
              <ScrollArea className="flex-1">
                <pre className="p-3 text-xs font-mono text-[var(--foreground)] whitespace-pre-wrap leading-relaxed">
                  {currentFunc.pseudocode}
                </pre>
              </ScrollArea>
            </div>

            {/* Source snippet */}
            <div className="flex-1 flex flex-col">
              <div className="px-3 py-1.5 border-b border-[var(--border)] text-[10px] text-[var(--muted-foreground)] uppercase flex items-center justify-between">
                <span>{currentFunc.functionName} — {currentFunc.file}</span>
                <span className="text-[var(--muted-foreground)]/70">源码片段</span>
              </div>
              <ScrollArea className="flex-1">
                <pre className="p-3 text-xs font-mono text-[var(--muted-foreground)] whitespace-pre-wrap">
                  {currentFunc.sourceSnippet || '// 源码未加载'}
                </pre>
              </ScrollArea>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[var(--muted-foreground)] text-sm gap-1">
            <GitBranch className="h-6 w-6 text-[var(--muted-foreground)]/50" />
            <p>右键函数名 → 追踪执行流</p>
            <p className="text-xs text-[var(--muted-foreground)]/70">逐步跟随函数调用路径</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      {steps.length > 0 && (
        <div className="flex items-center justify-center gap-3 py-1.5 border-t border-[var(--border)] bg-[var(--card)]/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={goBack}
            disabled={currentStep === 0}
            className="h-6 text-xs text-[var(--muted-foreground)] gap-1"
          >
            <ChevronLeft className="h-3 w-3" />
            上一步
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => advanceStep()}
            disabled={loading}
            className="h-6 text-xs text-[var(--muted-foreground)] gap-1"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            下一步
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  )
}
