'use client'

import { useEffect, useLayoutEffect } from 'react'
import { useTheme } from '@/app/store/theme'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme()

  // useLayoutEffect fires before paint, avoiding any flash on hydration
  useLayoutEffect(() => {
    const t = theme.getTheme()
    const root = document.documentElement
    for (const [key, value] of Object.entries(t.variables)) {
      root.style.setProperty(key, value)
    }
    root.dataset.theme = t.name
  }, [theme])

  return <>{children}</>
}
