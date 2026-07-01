'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { PRESETS, type Theme } from '@/app/lib/themes'

type CustomColors = Partial<Theme['variables']>

interface ThemeStore {
  currentTheme: string
  customColors: CustomColors
  setTheme: (name: string) => void
  setCustomColor: (key: keyof Theme['variables'], value: string) => void
  getTheme: () => Theme
}

export const useTheme = create<ThemeStore>()(
  persist(
    (set, get) => ({
      currentTheme: 'fabric',
      customColors: {},
      setTheme: (name) => set({ currentTheme: name }),
      setCustomColor: (key, value) =>
        set((s) => {
          const next = { ...s.customColors, [key]: value }
          // If all custom colors match a preset, switch to that preset
          for (const preset of PRESETS) {
            if (preset.name === s.currentTheme) continue
            let matches = true
            for (const [k, v] of Object.entries(preset.variables)) {
              if (next[k as keyof typeof next] && next[k as keyof typeof next] !== v) {
                matches = false
                break
              }
            }
            if (matches) {
              return { customColors: next, currentTheme: preset.name }
            }
          }
          return { customColors: next, currentTheme: 'custom' }
        }),
      getTheme: () => {
        const { currentTheme, customColors } = get()
        const preset = PRESETS.find((p) => p.name === currentTheme)
        if (preset) return preset
        // Build custom theme from fabric base + overrides
        const base = PRESETS[0]
        return {
          ...base,
          name: 'custom',
          label: '自定义',
          variables: { ...base.variables, ...customColors },
        }
      },
    }),
    {
      name: 'codeatlas-theme',
      partialize: (state) => ({
        currentTheme: state.currentTheme,
        customColors: state.customColors,
      }),
    }
  )
)
