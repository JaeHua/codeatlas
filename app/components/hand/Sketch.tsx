'use client'

/**
 * 手绘技术草图元素 — 干净、低不规则度，用于品牌区 / 空状态 / 探索提示。
 * 线条风格：黑色细线 + 轻微自然抖动，像工程师在图纸上的手写批注。
 */

function sketchPath(d: string): React.ReactElement {
  return <path d={d} fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
}

export function HandArrow({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 24" className={className} fill="none" aria-hidden>
      <path d="M2 6 C 14 4, 30 3, 44 10" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
      <path d="M33 7 L 45 10 L 39 17" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function HandCircle({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden>
      <path d="M5 24 C 4 12, 12 4, 24 4 C 37 4, 44 13, 43 26 C 42 39, 32 45, 21 43 C 12 42, 6 36, 5 26" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
    </svg>
  )
}

export function HandUnderline({ className = 'w-10 h-2' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 8" className={className} fill="none" aria-hidden>
      <path d="M2 5 C 12 3, 24 2, 34 4 C 39 5, 43 5, 46 4" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

export function HandMagnifier({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden>
      <path d="M20 8 C 12 8, 6 14, 6 21 C 6 28, 12 34, 20 34 C 27 34, 33 28, 33 21 C 33 14, 28 8, 20 8" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
      <path d="M29 30 L 42 43" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

export function HandNode({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden>
      <circle cx="24" cy="22" r="12" stroke="currentColor" strokeWidth={1.2} />
      <path d="M8 30 L 4 40" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
      <path d="M40 30 L 44 40" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
      <circle cx="24" cy="22" r="3" fill="currentColor" />
    </svg>
  )
}

export function HandAnnotation({ className = 'w-10 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 24" className={className} fill="none" aria-hidden>
      <path d="M6 4 C 12 2, 20 2, 26 3 C 32 4, 38 6, 42 9 L 40 12" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
      <path d="M36 12 L 43 12 L 40 17" stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
