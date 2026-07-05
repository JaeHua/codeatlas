'use client'

import { useState } from 'react'
import { useSettings } from '@/app/store/settings'
import { ThemePicker } from '@/app/components/theme/ThemePicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Settings, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SettingsDialog() {
  const { apiKey, baseUrl, model, setApiKey, setBaseUrl, setModel } = useSettings()
  const [open, setOpen] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testMsg, setTestMsg] = useState('')

  const testConnection = async () => {
    if (!apiKey) { setTestMsg('请先填写 API Key'); setTestStatus('error'); return }
    setTestStatus('testing')
    try {
      const res = await fetch(`${baseUrl || 'https://api.deepseek.com'}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: model || 'deepseek-chat', messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
      })
      if (res.ok) {
        setTestStatus('success')
        setTestMsg('连接成功')
      } else {
        const err = await res.json().catch(() => ({}))
        setTestStatus('error')
        setTestMsg(err.error?.message || `HTTP ${res.status}`)
      }
    } catch (e) {
      setTestStatus('error')
      setTestMsg(String(e))
    }
  }

  return (
    <>
      <Button variant="ghost" size="icon" className="h-6 w-6 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        onClick={() => { setOpen(true); setTestStatus('idle'); setTestMsg('') }}>
        <Settings className="h-3.5 w-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass sm:max-w-lg max-h-[80vh] animate-scale-in">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">设置</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-5 pr-1 pt-2">
              <div>
                <h3 className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase mb-2">API 配置</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[var(--muted-foreground)] mb-1 block">API Key</label>
                    <Input type="password" placeholder="sk-..." value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="h-8 text-xs bg-[var(--muted)]/50 border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/70" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Base URL</label>
                    <Input placeholder="https://api.deepseek.com" value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      className="h-8 text-xs bg-[var(--muted)]/50 border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/70" />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Model</label>
                    <Input placeholder="deepseek-chat" value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="h-8 text-xs bg-[var(--muted)]/50 border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/70" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={testConnection} disabled={testStatus === 'testing'}
                      className="h-7 text-xs">
                      {testStatus === 'testing' ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                      测试连接
                    </Button>
                    {testStatus === 'success' && (
                      <span className="flex items-center gap-1 text-xs text-green-500">
                        <CheckCircle className="h-3 w-3" />{testMsg}
                      </span>
                    )}
                    {testStatus === 'error' && (
                      <span className="flex items-center gap-1 text-xs text-red-400">
                        <XCircle className="h-3 w-3" />{testMsg}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="border-t border-[var(--border)]" />
              <div>
                <h3 className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase mb-2">主题</h3>
                <ThemePicker />
              </div>
            </div>
          </ScrollArea>
          <div className="pt-3">
            <Button onClick={() => setOpen(false)} className="w-full h-8 text-xs">Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
