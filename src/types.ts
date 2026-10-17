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
  /** The local bytes backing audioUrl; kept in memory to avoid refetching blob URLs. */
  audioBlob?: Blob
  sourcePath?: string
  nativePath?: string
  kind?: 'source' | 'instrumental'
  lyrics?: LyricLine[]
}
