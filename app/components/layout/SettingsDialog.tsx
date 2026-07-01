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
import { Settings } from 'lucide-react'

export function SettingsDialog() {
  const { apiKey, baseUrl, model, setApiKey, setBaseUrl, setModel } = useSettings()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        onClick={() => setOpen(true)}
      >
        <Settings className="h-3.5 w-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-[var(--card)] border-[var(--border)] text-[var(--foreground)] sm:max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">设置</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-5 pr-1 pt-2">
              {/* API Settings */}
              <div>
                <h3 className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase mb-2">API 配置</h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[var(--muted-foreground)] mb-1 block">API Key</label>
                    <Input
                      type="password"
                      placeholder="sk-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="h-8 text-xs bg-[var(--muted)]/50 border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/70"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Base URL</label>
                    <Input
                      placeholder="https://api.deepseek.com"
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      className="h-8 text-xs bg-[var(--muted)]/50 border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/70"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--muted-foreground)] mb-1 block">Model</label>
                    <Input
                      placeholder="deepseek-chat"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="h-8 text-xs bg-[var(--muted)]/50 border-[var(--border)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]/70"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-[var(--border)]" />

              {/* Theme */}
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
