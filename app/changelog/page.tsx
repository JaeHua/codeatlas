import Link from 'next/link'
import { Logo } from '@/app/components/layout/Logo'
import { HandUnderline } from '@/app/components/hand/Sketch'
import { CHANGELOG } from './data'

export const metadata = {
  title: '更新日志 — CodeAtlas',
  description: 'CodeAtlas 历史更新记录',
}

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Top bar */}
      <div className="border-b border-[var(--border)] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Logo className="h-7 w-7" />
          <span className="font-display text-[11px] tracking-[0.25em] uppercase text-[var(--muted-foreground)]">CodeAtlas</span>
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <Link href="/" className="text-[var(--primary)] hover:underline">← 返回首页</Link>
        </div>
      </div>

      {/* Header */}
      <div className="px-6 pt-12 pb-8 flex flex-col items-center text-center">
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight">
          CHANGELOG
        </h1>
        <HandUnderline className="w-36 h-3 text-[var(--primary)] mt-3" />
        <p className="mt-5 text-sm text-[var(--muted-foreground)] max-w-lg">
          记录 CodeAtlas 一路走来的每一个脚印。用地图的方式，认识代码，也认识这个工具本身。
        </p>
      </div>

      {/* Timeline */}
      <div className="px-6 pb-20 max-w-3xl mx-auto">
        {CHANGELOG.map((entry, i) => (
          <div key={entry.version} className="relative pl-8 pb-10">
            {/* Timeline line + node */}
            <div className="absolute left-0 top-1 bottom-0 w-px bg-[var(--border)]" />
            <div className="absolute left-0 top-1 w-2.5 h-2.5 -translate-x-1/2 bg-[var(--primary)] border border-[var(--primary)]" />

            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="font-display text-lg font-bold text-[var(--primary)]">
                v{entry.version}
              </span>
              <span className="text-[11px] font-mono text-[var(--muted-foreground)]">
                {entry.date}
              </span>
              <span className="text-sm font-semibold">{entry.title}</span>
            </div>

            <ul className="mt-3 space-y-1.5 border-l border-[var(--border)] ml-1 pl-4">
              {entry.items.map((item, j) => (
                <li key={j} className="text-[13px] text-[var(--muted-foreground)] leading-relaxed flex gap-2">
                  <span className="text-[var(--primary)] select-none">▸</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            {i === CHANGELOG.length - 1 && (
              <p className="mt-3 text-[11px] text-[var(--muted-foreground)]/60 italic">
                —— 起点
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
