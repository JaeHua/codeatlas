'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { FileNode, Symbol, IncludeEdge, CallEdge, ArchNode, SearchResult, ActiveView, SelectedEntity, StructEdge } from '@/app/lib/types'

interface AppStore {
  projectId: number | null
  files: FileNode[]
  symbols: Symbol[]
  includes: IncludeEdge[]
  calls: CallEdge[]
  architecture: ArchNode[]
  structs: StructEdge[]

  expandedDirs: string[]
  selectedFile: string | null

  activeView: ActiveView
  selectedEntity: SelectedEntity | null

  searchOpen: boolean
  searchQuery: string
  searchResults: SearchResult[]

  leftWidth: number
  rightWidth: number
  leftCollapsed: boolean
  rightCollapsed: boolean

  favorites: string[]
  recentFiles: string[]

  setFiles: (files: FileNode[]) => void
  setProjectId: (id: number | null) => void
  setSymbols: (s: Symbol[]) => void
  setIncludes: (i: IncludeEdge[]) => void
  setCalls: (c: CallEdge[]) => void
  setArchitecture: (a: ArchNode[]) => void
  setStructs: (s: StructEdge[]) => void

  toggleDir: (path: string) => void
  selectFile: (path: string | null) => void

  setActiveView: (view: ActiveView) => void
  setSelectedEntity: (entity: SelectedEntity | null) => void

  setSearchOpen: (open: boolean) => void
  setSearchQuery: (query: string) => void
  setSearchResults: (results: SearchResult[]) => void

  setLeftWidth: (w: number) => void
  setRightWidth: (w: number) => void
  setLeftCollapsed: (v: boolean) => void
  setRightCollapsed: (v: boolean) => void

  addFavorite: (path: string) => void
  removeFavorite: (path: string) => void
  removeRecent: (path: string) => void
}

export const useStore = create<AppStore>()(
  persist(
    (set) => ({
      projectId: null,
      files: [],
      symbols: [],
      includes: [],
      calls: [],
      architecture: [],
      structs: [],

      expandedDirs: [],
      selectedFile: null,

      activeView: 'code',
      selectedEntity: null,

      searchOpen: false,
      searchQuery: '',
      searchResults: [],

      leftWidth: 280,
      rightWidth: 380,
      leftCollapsed: false,
      rightCollapsed: false,

      favorites: [],
      recentFiles: [],

      setFiles: (files) => set({ files }),
      setProjectId: (projectId) => set({ projectId }),
      setSymbols: (symbols) => set({ symbols }),
      setIncludes: (includes) => set({ includes }),
      setCalls: (calls) => set({ calls }),
      setArchitecture: (architecture) => set({ architecture }),
      setStructs: (structs) => set({ structs }),

      toggleDir: (path) =>
        set((s) => ({
          expandedDirs: s.expandedDirs.includes(path)
            ? s.expandedDirs.filter((d) => d !== path)
            : [...s.expandedDirs, path],
        })),

      selectFile: (path) =>
        set((s) => {
          const recent = path && !s.recentFiles.includes(path)
            ? [path, ...s.recentFiles.filter((f) => f !== path)].slice(0, 10)
            : s.recentFiles
          return {
            selectedFile: path,
            activeView: 'code',
            selectedEntity: path ? { type: 'file', path, name: path.split('/').pop() || path } : null,
            recentFiles: recent,
          }
        }),

      setActiveView: (activeView) => set({ activeView }),
      setSelectedEntity: (selectedEntity) => set({ selectedEntity }),

      setSearchOpen: (searchOpen) => set({ searchOpen, searchQuery: '', searchResults: [] }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setSearchResults: (searchResults) => set({ searchResults }),

      setLeftWidth: (leftWidth) => set({ leftWidth }),
      setRightWidth: (rightWidth) => set({ rightWidth }),
      setLeftCollapsed: (leftCollapsed) => set({ leftCollapsed }),
      setRightCollapsed: (rightCollapsed) => set({ rightCollapsed }),

      addFavorite: (path) => set((s) => ({
        favorites: [...s.favorites, path],
      })),
      removeFavorite: (path) => set((s) => ({
        favorites: s.favorites.filter((f) => f !== path),
      })),
      removeRecent: (path) => set((s) => ({
        recentFiles: s.recentFiles.filter((f) => f !== path),
      })),
    }),
    {
      name: 'codeatlas-store',
      partialize: (state) => ({
        selectedFile: state.selectedFile,
        expandedDirs: state.expandedDirs,
        activeView: state.activeView,
        leftWidth: state.leftWidth,
        rightWidth: state.rightWidth,
        leftCollapsed: state.leftCollapsed,
        rightCollapsed: state.rightCollapsed,
        favorites: state.favorites,
        recentFiles: state.recentFiles,
      }),
    }
  )
)
