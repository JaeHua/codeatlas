'use client'

import { ThemeProvider } from '@/app/components/theme/ThemeProvider'

export function ClientLayout({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>
}
