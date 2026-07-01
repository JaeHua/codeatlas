export interface Theme {
  name: string
  label: string
  variables: {
    '--background': string
    '--foreground': string
    '--card': string
    '--card-foreground': string
    '--primary': string
    '--primary-foreground': string
    '--secondary': string
    '--secondary-foreground': string
    '--muted': string
    '--muted-foreground': string
    '--accent': string
    '--accent-foreground': string
    '--border': string
    '--input': string
    '--ring': string
    '--radius': string
  }
}

export const PRESETS: Theme[] = [
  {
    name: 'fabric',
    label: '织物',
    variables: {
      '--background': '#f5f0e8',
      '--foreground': '#3d3629',
      '--card': '#ede6d8',
      '--card-foreground': '#3d3629',
      '--primary': '#c17e60',
      '--primary-foreground': '#faf7f2',
      '--secondary': '#e8dcc8',
      '--secondary-foreground': '#5c4e3a',
      '--muted': '#eae3d3',
      '--muted-foreground': '#8c8273',
      '--accent': '#e8dcc8',
      '--accent-foreground': '#5c4e3a',
      '--border': '#d4c9b5',
      '--input': '#d4c9b5',
      '--ring': '#c17e60',
      '--radius': '0.5rem',
    },
  },
  {
    name: 'dark',
    label: '暗色',
    variables: {
      '--background': '#0f0f0f',
      '--foreground': '#e5e5e5',
      '--card': '#1a1a1a',
      '--card-foreground': '#e5e5e5',
      '--primary': '#3b82f6',
      '--primary-foreground': '#ffffff',
      '--secondary': '#262626',
      '--secondary-foreground': '#d4d4d4',
      '--muted': '#1f1f1f',
      '--muted-foreground': '#737373',
      '--accent': '#262626',
      '--accent-foreground': '#d4d4d4',
      '--border': '#333333',
      '--input': '#333333',
      '--ring': '#3b82f6',
      '--radius': '0.5rem',
    },
  },
  {
    name: 'light',
    label: '亮色',
    variables: {
      '--background': '#ffffff',
      '--foreground': '#171717',
      '--card': '#fafafa',
      '--card-foreground': '#171717',
      '--primary': '#2563eb',
      '--primary-foreground': '#ffffff',
      '--secondary': '#f5f5f5',
      '--secondary-foreground': '#262626',
      '--muted': '#f5f5f5',
      '--muted-foreground': '#737373',
      '--accent': '#f0f0f0',
      '--accent-foreground': '#262626',
      '--border': '#e5e5e5',
      '--input': '#e5e5e5',
      '--ring': '#2563eb',
      '--radius': '0.5rem',
    },
  },
  {
    name: 'forest',
    label: '森林',
    variables: {
      '--background': '#f6f8f5',
      '--foreground': '#2d3a2a',
      '--card': '#eef2eb',
      '--card-foreground': '#2d3a2a',
      '--primary': '#4a7c59',
      '--primary-foreground': '#ffffff',
      '--secondary': '#e4ece1',
      '--secondary-foreground': '#3d5238',
      '--muted': '#e8efe5',
      '--muted-foreground': '#6b8065',
      '--accent': '#e4ece1',
      '--accent-foreground': '#3d5238',
      '--border': '#c5d6bf',
      '--input': '#c5d6bf',
      '--ring': '#4a7c59',
      '--radius': '0.5rem',
    },
  },
  {
    name: 'ocean',
    label: '海洋',
    variables: {
      '--background': '#f5f7f9',
      '--foreground': '#1e3a4d',
      '--card': '#ecf1f5',
      '--card-foreground': '#1e3a4d',
      '--primary': '#2e86ab',
      '--primary-foreground': '#ffffff',
      '--secondary': '#e2eaf0',
      '--secondary-foreground': '#2a5568',
      '--muted': '#e6edf2',
      '--muted-foreground': '#6b8a9e',
      '--accent': '#e2eaf0',
      '--accent-foreground': '#2a5568',
      '--border': '#c2d5e0',
      '--input': '#c2d5e0',
      '--ring': '#2e86ab',
      '--radius': '0.5rem',
    },
  },
]
