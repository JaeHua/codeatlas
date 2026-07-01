'use client'

import { useEffect, useState, useCallback } from 'react'
import { useStore } from '@/app/store'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

interface Shortcut {
  keys: string
  desc: string
}

const shortcuts: { group: string; items: Shortcut[] }[] = [
  {
    group: '导航',
    items: [
      { keys: 'Cmd+K', desc: '全局搜索' },
      { keys: 'Cmd+1', desc: '切换到代码视图' },
      { keys: 'Cmd+2', desc: '切换到图谱视图' },
      { keys: 'Cmd+3', desc: '切换到架构视图' },
      { keys: 'Cmd+B', desc: '折叠/展开文件树' },
      { keys: 'Cmd+J', desc: '折叠/展开 AI 面板' },
    ],
  },
  {
    group: '编辑',
    items: [
      { keys: 'Cmd+Shift+F', desc: '当前文件内搜索' },
      { keys: 'Cmd+G', desc: '跳转到指定行' },
    ],
  },
  {
    group: 'AI',
    items: [
      { keys: 'Cmd+E', desc: 'AI 解释选中代码' },
      { keys: 'Cmd+Shift+T', desc: '追踪当前函数的执行流' },
    ],
  },
  {
    group: '面板',
    items: [
      { keys: '?', desc: '显示/隐藏快捷键帮助' },
    ],
  },
]

export function KeyboardShortcuts() {
  const { setActiveView, leftCollapsed, setLeftCollapsed, rightCollapsed, setRightCollapsed } = useStore()
  const [helpOpen, setHelpOpen] = useState(false)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey

    if (e.key === '?') {
      e.preventDefault()
      setHelpOpen((v) => !v)
      return
    }

    if (e.key === 'Escape' && helpOpen) {
      setHelpOpen(false)
      return
    }

    if (!mod) return

    if (e.key === '1') { e.preventDefault(); setActiveView('code') }
    if (e.key === '2') { e.preventDefault(); setActiveView('graph') }
    if (e.key === '3') { e.preventDefault(); setActiveView('architecture') }
    if (e.key === 'b') { e.preventDefault(); setLeftCollapsed(!leftCollapsed) }
    if (e.key === 'j') { e.preventDefault(); setRightCollapsed(!rightCollapsed) }
    if (e.key === 'g') {
      e.preventDefault()
      // Trigger go-to-line in Monaco — dispatched as custom event
      window.dispatchEvent(new CustomEvent('codeatlas:goto-line'))
    }
    if (e.key === 'F' && e.shiftKey) {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('codeatlas:find-in-file'))
    }
    if (e.key === 'T' && e.shiftKey) {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('codeatlas:quick-trace'))
    }
  }, [setActiveView, leftCollapsed, setLeftCollapsed, rightCollapsed, setRightCollapsed, helpOpen])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!helpOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setHelpOpen(false)}>
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 max-w-lg w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">键盘快捷键</h2>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-[var(--muted-foreground)] hover:text-[var(--foreground)]" onClick={() => setHelpOpen(false)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="space-y-4">
          {shortcuts.map((group) => (
            <div key={group.group}>
              <h3 className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase mb-1.5">{group.group}</h3>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <div key={item.keys} className="flex items-center justify-between">
                    <span className="text-xs text-[var(--muted-foreground)]">{item.desc}</span>
                    <kbd className="text-[10px] text-[var(--foreground)] bg-[var(--muted)] border border-[var(--border)] px-1.5 py-0.5 rounded font-mono">
                      {item.keys.split('+').join(' + ')}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
