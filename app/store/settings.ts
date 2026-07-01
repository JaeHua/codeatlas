'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsStore {
  apiKey: string
  baseUrl: string
  model: string
  setApiKey: (key: string) => void
  setBaseUrl: (url: string) => void
  setModel: (model: string) => void
  isConfigured: () => boolean
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set, get) => ({
      apiKey: '',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      setApiKey: (apiKey) => set({ apiKey }),
      setBaseUrl: (baseUrl) => set({ baseUrl }),
      setModel: (model) => set({ model }),
      isConfigured: () => !!(get().apiKey && get().baseUrl),
    }),
    {
      name: 'codeatlas-settings',
    }
  )
)
