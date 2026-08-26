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
    name: 'blueprint',
    label: '工程图纸',
    variables: {
      '--background': '#FBF8F0',
      '--foreground': '#1A1A18',
      '--card': '#FFFFFF',
      '--card-foreground': '#1A1A18',
      '--primary': '#E0A93C',
      '--primary-foreground': '#1A1A18',
      '--secondary': '#F3EFE6',
      '--secondary-foreground': '#4A463E',
      '--muted': '#F3EFE6',
      '--muted-foreground': '#8A8578',
      '--accent': '#F3EFE6',
      '--accent-foreground': '#4A463E',
      '--border': '#E2DDD2',
      '--input': '#E2DDD2',
      '--ring': '#E0A93C',
      '--radius': '2px',
    },
  },
]
