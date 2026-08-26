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

  openTabs: string[]
  activeTabIndex: number

  cursorLine: number
  cursorColumn: number
  fileLineCount: number
  fileLanguage: string

  favorites: string[]
  recentFiles: string[]

  navBack: { path: string; line?: number }[]
  navForward: { path: string; line?: number }[]

  setFiles: (files: FileNode[]) => void
  setProjectId: (id: number | null) => void
  setSymbols: (s: Symbol[]) => void
  setIncludes: (i: IncludeEdge[]) => void
  setCalls: (c: CallEdge[]) => void
  setArchitecture: (a: ArchNode[]) => void
  setStructs: (s: StructEdge[]) => void

  toggleDir: (path: string) => void
  selectFile: (path: string | null) => void
  selectFileWithLine: (path: string | null, line?: number) => void

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
  addTab: (path: string) => void
  closeTab: (index: number) => void
  setActiveTab: (index: number) => void
  setCursorPosition: (line: number, column: number) => void
  setFileInfo: (lineCount: number, language: string) => void
  goBack: () => void
  goForward: () => void
}

interface NavPos {
  path: string
  line?: number
}

const MAX_HISTORY = 50

/** 应用跳转位置：设置选中文件、标签页、实体（不操作历史栈） */
function applyPosition(s: AppStore, path: string | null, line?: number) {
  const recent = path && !s.recentFiles.includes(path)
    ? [path, ...s.recentFiles.filter((f) => f !== path)].slice(0, 10)
    : s.recentFiles
  const tabs = s.openTabs.includes(path || '')
    ? s.openTabs
    : [...s.openTabs, path].filter(Boolean) as string[]
  const idx = tabs.indexOf(path || '')
  return {
    selectedFile: path,
    activeView: 'code' as const,
    selectedEntity: path
      ? { type: 'file' as const, path, name: path.split('/').pop() || path, ...(line ? { line } : {}) }
      : null,
    recentFiles: recent,
    openTabs: tabs,
    activeTabIndex: idx >= 0 ? idx : tabs.length - 1,
  }
}

/** 把当前浏览位置压入后退栈 */
function pushNav(s: AppStore): NavPos[] {
  if (!s.selectedFile) return s.navBack
  return [...s.navBack, { path: s.selectedFile, line: s.cursorLine }].slice(-MAX_HISTORY)
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

      openTabs: [],
      activeTabIndex: 0,

      cursorLine: 1,
      cursorColumn: 1,
      fileLineCount: 0,
      fileLanguage: 'c',

      favorites: [],
      recentFiles: [],
      navBack: [],
      navForward: [],

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
        set((s) => ({
          ...applyPosition(s, path),
          navBack: pushNav(s),
          navForward: [],
        })),
  selectFileWithLine: (path: string | null, line?: number) =>
    set((s) => ({
      ...applyPosition(s, path, line),
      navBack: pushNav(s),
      navForward: [],
    })),

      goBack: () =>
        set((s) => {
          if (s.navBack.length === 0) return s
          const back = [...s.navBack]
          const prev = back.pop() as NavPos
          const forward = s.selectedFile
            ? [{ path: s.selectedFile, line: s.cursorLine }, ...s.navForward].slice(0, MAX_HISTORY)
            : s.navForward
          return {
            ...applyPosition(s, prev.path, prev.line),
            navBack: back,
            navForward: forward,
          }
        }),

      goForward: () =>
        set((s) => {
          if (s.navForward.length === 0) return s
          const forward = [...s.navForward]
          const next = forward.shift() as NavPos
          const back = s.selectedFile
            ? [...s.navBack, { path: s.selectedFile, line: s.cursorLine }].slice(-MAX_HISTORY)
            : s.navBack
          return {
            ...applyPosition(s, next.path, next.line),
            navBack: back,
            navForward: forward,
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

      addTab: (path) => set((s) => {
        const idx = s.openTabs.indexOf(path)
        if (idx >= 0) return { activeTabIndex: idx }
        return { openTabs: [...s.openTabs, path], activeTabIndex: s.openTabs.length }
      }),
      closeTab: (index) => set((s) => {
        const newTabs = s.openTabs.filter((_, i) => i !== index)
        const newIdx = Math.min(s.activeTabIndex, newTabs.length - 1)
        return { openTabs: newTabs, activeTabIndex: newIdx, selectedFile: newTabs[newIdx] || null }
      }),
      setActiveTab: (index) => set((s) => ({
        activeTabIndex: index,
        selectedFile: s.openTabs[index] || null,
      })),
      setCursorPosition: (cursorLine, cursorColumn) => set({ cursorLine, cursorColumn }),
      setFileInfo: (fileLineCount, fileLanguage) => set({ fileLineCount, fileLanguage }),
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
