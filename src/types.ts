export type LyricLine = {
  time: number
  text: string
}

export type Song = {
  id: number
  title: string
  artist: string
  album: string
  duration: string
  accent: string
  audioUrl?: string
  sourcePath?: string
  nativePath?: string
  kind?: 'source' | 'instrumental'
  lyrics?: LyricLine[]
}
