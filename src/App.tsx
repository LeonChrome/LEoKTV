import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import type { LyricLine, Song } from './types'
import { loadStoredSongs, saveSongBlob, updateStoredLyrics } from './libraryStore'
import { readMdxAudio, separateMdx, supportsMdx } from './mdx'

const EMPTY_LYRICS: LyricLine[] = []

const starterSongs: Song[] = [
  { id: 1, title: '晴天', artist: '周杰伦', album: '叶惠美', duration: '04:29', accent: '#f19a71', lyrics: [
    { time: 0, text: '故事的小黄花' },
    { time: 22, text: '从出生那年就飘着' },
    { time: 44, text: '童年的荡秋千' },
    { time: 66, text: '随记忆一直晃到现在' },
    { time: 88, text: 'Re So So Si Do Si La' },
    { time: 110, text: 'So La Si Si Si Si La Si La So' },
    { time: 132, text: '吹着前奏望着天空' },
    { time: 154, text: '我想起花瓣试着掉落' },
  ] },
  { id: 2, title: '起风了', artist: '买辣椒也用券', album: '起风了', duration: '05:12', accent: '#a58dff' },
  { id: 3, title: '光年之外', artist: '邓紫棋', album: '摩天动物园', duration: '03:55', accent: '#57c4d9' },
  { id: 4, title: '夜曲', artist: '周杰伦', album: '十一月的萧邦', duration: '03:46', accent: '#dd729c' },
  { id: 5, title: '小幸运', artist: '田馥甄', album: '我的少女时代', duration: '04:08', accent: '#f4c76e' },
  { id: 6, title: '我怀念的', artist: '孙燕姿', album: '逆光', duration: '04:47', accent: '#83b7d4' },
]

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '00:00'
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const remaining = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${remaining}`
}

const parseLrc = (content: string): LyricLine[] => {
  const parsed: LyricLine[] = []
  let offsetMs = 0
  for (const rawLine of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const offset = rawLine.match(/^\[offset:([+-]?\d+)\]/i)
    if (offset) {
      offsetMs = Number(offset[1]) || 0
      continue
    }
    const matches = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
    if (!matches.length) continue
    const text = rawLine.replace(/\[(\d{1,3}):(\d{2})(?:[.:]\d{1,3})?\]/g, '').trim()
    if (!text) continue
    for (const match of matches) {
      const fraction = match[3] ?? '0'
      const milliseconds = fraction.length === 1 ? Number(fraction) * 100 : fraction.length === 2 ? Number(fraction) * 10 : Number(fraction.slice(0, 3))
      const time = Math.max(0, Number(match[1]) * 60_000 + Number(match[2]) * 1_000 + milliseconds + offsetMs) / 1_000
      parsed.push({ time, text })
    }
  }
  return parsed.sort((a, b) => a.time - b.time || a.text.localeCompare(b.text))
}

const lyricIndexAt = (lines: LyricLine[], time: number) => {
  let active = -1
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].time <= time) active = index
    else break
  }
  return active
}

const createSongId = () => Date.now() * 1_000 + Math.floor(Math.random() * 1_000)

const writeAscii = (view: DataView, offset: number, value: string) => {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index))
}

const audioBufferToWav = (audioBuffer: AudioBuffer) => {
  const channels = Math.min(audioBuffer.numberOfChannels, 2)
  const frameCount = audioBuffer.length
  const bytesPerSample = 2
  const dataSize = frameCount * channels * bytesPerSample
  const view = new DataView(new ArrayBuffer(44 + dataSize))
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, audioBuffer.sampleRate, true)
  view.setUint32(28, audioBuffer.sampleRate * channels * bytesPerSample, true)
  view.setUint16(32, channels * bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataSize, true)
  const channelData = Array.from({ length: channels }, (_, index) => audioBuffer.getChannelData(index))
  let offset = 44
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][frame]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([view], { type: 'audio/wav' })
}

function App() {
  const [songs, setSongs] = useState<Song[]>(starterSongs)
  const [currentId, setCurrentId] = useState(1)
  const [queue, setQueue] = useState<number[]>(() => {
    try {
      const saved = window.localStorage.getItem('leoktv.queue')
      return saved ? JSON.parse(saved) as number[] : [1, 3, 5]
    } catch {
      return [1, 3, 5]
    }
  })
  const [query, setQuery] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(78)
  const [progress, setProgress] = useState(78)
  const [duration, setDuration] = useState(269)
  const [elapsed, setElapsed] = useState(132)
  const [activeLyric, setActiveLyric] = useState(lyricIndexAt(starterSongs[0].lyrics ?? EMPTY_LYRICS, 132))
  const [processing, setProcessing] = useState(false)
  const [notice, setNotice] = useState('')
  const audioRef = useRef<HTMLAudioElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const lyricsFileRef = useRef<HTMLInputElement>(null)
  const activeLyricRef = useRef<HTMLParagraphElement>(null)

  const currentSong = songs.find((song) => song.id === currentId) ?? songs[0]
  const currentLyrics = currentSong?.lyrics ?? EMPTY_LYRICS
  const filteredSongs = useMemo(
    () => songs.filter((song) => `${song.title}${song.artist}`.toLowerCase().includes(query.toLowerCase())),
    [songs, query],
  )
  const queueSongs = queue.map((id) => songs.find((song) => song.id === id)).filter(Boolean) as Song[]

  useEffect(() => {
    window.localStorage.setItem('leoktv.queue', JSON.stringify(queue))
  }, [queue])

  useEffect(() => {
    let mounted = true
    void loadStoredSongs().then((storedSongs) => {
      if (!mounted || !storedSongs.length) return
      setSongs((items) => {
        const storedIds = new Set(storedSongs.map((song) => song.id))
        return [...storedSongs, ...items.filter((song) => !storedIds.has(song.id))]
      })
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    activeLyricRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeLyric, currentId])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !currentSong?.audioUrl) return
    audio.src = currentSong.audioUrl
    audio.load()
    setElapsed(0)
    setProgress(0)
    if (isPlaying) void audio.play().catch(() => setIsPlaying(false))
  }, [currentSong?.audioUrl, currentId])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => {
      setElapsed(audio.currentTime)
      setDuration(audio.duration || 269)
      setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0)
      setActiveLyric(lyricIndexAt(currentLyrics, audio.currentTime))
    }
    const onEnded = () => setIsPlaying(false)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnded)
    }
  }, [currentLyrics])

  useEffect(() => {
    if (!isPlaying || currentSong?.audioUrl) return
    const timer = window.setInterval(() => {
      setElapsed((current) => {
        const next = current + 1
        if (next >= duration) {
          setIsPlaying(false)
          setProgress(100)
          return duration
        }
        setProgress((next / duration) * 100)
        setActiveLyric(lyricIndexAt(currentLyrics, next))
        return next
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [currentLyrics, currentSong?.audioUrl, duration, isPlaying])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.matches('input, textarea, button')) return
      if (event.code === 'Space') {
        event.preventDefault()
        togglePlay()
      }
      if (event.key === 'ArrowLeft') seekTo(progress - 5)
      if (event.key === 'ArrowRight') seekTo(progress + 5)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const selectSong = (song: Song) => {
    setCurrentId(song.id)
    setQueue((items) => (items.includes(song.id) ? items : [...items, song.id]))
    setElapsed(0)
    setProgress(0)
    setActiveLyric(lyricIndexAt(song.lyrics ?? EMPTY_LYRICS, 0))
    setIsPlaying(Boolean(song.audioUrl))
  }

  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 4500)
  }

  const createNativeInstrumental = async () => {
    if (!currentSong?.audioUrl) return
    setProcessing(true)
    try {
      const source = await fetch(currentSong.audioUrl).then((response) => response.blob())
      const result = await separateMdx(source, (event) => {
        if (event.stage === 'inference' && typeof event.value === 'number') {
          showNotice(`AI 分离处理中 ${Math.round(event.value * 100)}%`)
        }
      })
      const instrumentalBlob = await readMdxAudio(result.instrumental)
      const instrumental: Song = {
        ...currentSong,
        id: createSongId(),
        title: `${currentSong.title} · AI伴奏`,
        artist: 'MDX · 本地 CPU',
        kind: 'instrumental',
        audioUrl: URL.createObjectURL(instrumentalBlob),
        nativePath: result.instrumental,
      }
      setSongs((items) => [instrumental, ...items])
      setQueue((items) => [...items, instrumental.id])
      setCurrentId(instrumental.id)
      setIsPlaying(false)
      showNotice(result.cached ? '已命中 MDX 本地缓存' : 'MDX 伴奏已生成并缓存到本机')
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'MDX 分离失败')
    } finally {
      setProcessing(false)
    }
  }

  const createQuickInstrumental = async () => {
    if (!currentSong?.audioUrl || currentSong.kind === 'instrumental') return
    if (supportsMdx()) {
      await createNativeInstrumental()
      return
    }
    setProcessing(true)
    try {
      const response = await fetch(currentSong.audioUrl)
      const bytes = await response.arrayBuffer()
      const AudioContextConstructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextConstructor) throw new Error('当前浏览器不支持 Web Audio')
      const context = new AudioContextConstructor()
      const source = await context.decodeAudioData(bytes)
      const output = context.createBuffer(2, source.length, source.sampleRate)
      const left = source.getChannelData(0)
      const right = source.numberOfChannels > 1 ? source.getChannelData(1) : left
      const outputLeft = output.getChannelData(0)
      const outputRight = output.getChannelData(1)
      for (let frame = 0; frame < source.length; frame += 1) {
        // Center cancellation keeps much of the side information while reducing centered vocals.
        outputLeft[frame] = (left[frame] - right[frame]) * 0.7
        outputRight[frame] = (right[frame] - left[frame]) * 0.7
      }
      const instrumentalBlob = audioBufferToWav(output)
      const instrumental: Song = {
        ...currentSong,
        id: createSongId(),
        title: `${currentSong.title} · 伴奏`,
        artist: '基础消音 · 本地',
        duration: formatTime(source.duration),
        kind: 'instrumental',
        audioUrl: URL.createObjectURL(instrumentalBlob),
      }
      setSongs((items) => [instrumental, ...items])
      setQueue((items) => [...items, instrumental.id])
      setCurrentId(instrumental.id)
      setIsPlaying(false)
      showNotice('基础伴奏已在本机生成，可继续试听或导出')
      await context.close()
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '本地处理失败，请换一个音频文件重试')
    } finally {
      setProcessing(false)
    }
  }

  const togglePlay = () => {
    const audio = audioRef.current
    if (audio && currentSong?.audioUrl) {
      if (isPlaying) audio.pause()
      else void audio.play().catch(() => setIsPlaying(false))
    }
    setIsPlaying((playing) => !playing)
  }

  const seekTo = (next: number) => {
    const bounded = Math.max(0, Math.min(100, next))
    setProgress(bounded)
    const nextTime = (bounded / 100) * duration
    setElapsed(nextTime)
    if (audioRef.current?.duration) audioRef.current.currentTime = nextTime
  }

  const seek = (event: ChangeEvent<HTMLInputElement>) => seekTo(Number(event.target.value))

  const playRelative = (direction: -1 | 1) => {
    const ids = queue.length ? queue : songs.map((song) => song.id)
    const currentIndex = Math.max(0, ids.indexOf(currentId))
    const nextIndex = (currentIndex + direction + ids.length) % ids.length
    const nextSong = songs.find((song) => song.id === ids[nextIndex])
    if (nextSong) {
      setCurrentId(nextSong.id)
      setIsPlaying(true)
    }
  }

  const changeVolume = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value)
    setVolume(next)
    setIsMuted(next === 0)
    if (audioRef.current) audioRef.current.volume = next / 100
  }

  const importFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return
    const imported = files.map((file, index) => ({
      id: createSongId() + index,
      title: file.name.replace(/\.[^/.]+$/, ''),
      artist: '本地音乐',
      album: '我的导入',
      duration: '--:--',
      accent: ['#d89cff', '#66d8c0', '#ff9b80'][index % 3],
      kind: 'source' as const,
      audioUrl: URL.createObjectURL(file),
    }))
    setSongs((items) => [...imported, ...items])
    void Promise.all(imported.map((song, index) => saveSongBlob(song, files[index])))
      .catch(() => showNotice('歌曲已加入当前会话，但本地曲库保存失败'))
    selectSong(imported[0])
    event.target.value = ''
  }

  const importLyrics = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !currentSong) return
    const lines = parseLrc(await file.text())
    if (!lines.length) {
      showNotice('没有识别到带时间戳的歌词，请选择标准 .lrc 文件')
      event.target.value = ''
      return
    }
    setSongs((items) => items.map((song) => song.id === currentSong.id ? { ...song, lyrics: lines } : song))
    void updateStoredLyrics(currentSong.id, lines)
    setActiveLyric(lyricIndexAt(lines, elapsed))
    showNotice(`已导入 ${lines.length} 行歌词，并绑定到《${currentSong.title}》`)
    event.target.value = ''
  }

  const removeFromQueue = (id: number) => setQueue((items) => items.filter((item) => item !== id))

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">L</span><span>LEo<span>KTV</span></span></div>
        <nav className="top-nav"><button className="nav-item active">音乐库</button><button className="nav-item">我的歌单</button><button className="nav-item">最近播放</button></nav>
        <div className="top-actions"><span className="online-dot" /> <span>本地模式</span><button className="avatar">L</button></div>
      </header>

      <main className="workspace">
        <aside className="sidebar panel">
          <div className="sidebar-heading"><div><p className="eyebrow">YOUR MUSIC</p><h2>音乐库</h2></div><button className="more-button">•••</button></div>
          <div className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索歌曲或歌手" /></div>
          <div className="library-section"><p className="section-label">浏览</p><button className="side-link active"><span>▦</span>全部歌曲 <b>{songs.length}</b></button><button className="side-link"><span>♡</span>我喜欢的 <b>12</b></button><button className="side-link"><span>◷</span>最近添加 <b>6</b></button></div>
          <div className="library-section category"><p className="section-label">分类</p><button className="side-link"><span className="category-icon purple" />华语流行</button><button className="side-link"><span className="category-icon orange" />欧美金曲</button><button className="side-link"><span className="category-icon blue" />轻音乐</button></div>
          <button className="import-button" onClick={() => fileRef.current?.click()}><span>＋</span> 导入本地音乐</button>
          <input ref={fileRef} className="hidden-input" type="file" accept="audio/*" multiple onChange={importFiles} />
          <input ref={lyricsFileRef} className="hidden-input" type="file" accept=".lrc,.txt,text/plain" onChange={importLyrics} />
        </aside>

        <section className="content">
          <section className="hero panel">
            <div className="hero-copy"><p className="eyebrow">NOW PLAYING</p><h1>{currentSong?.title ?? '选择一首歌开始'}</h1><p className="artist">{currentSong?.artist ?? 'LEoKTV 音乐库'} <span>·</span> {currentSong?.album ?? '私人歌房'}</p><div className="hero-tags"><span className="tag">高音质</span><span className="tag subtle">本地播放</span>{currentSong?.audioUrl && currentSong.kind !== 'instrumental' && <button className="tag action-tag" onClick={createQuickInstrumental} disabled={processing}>{processing ? '处理中…' : supportsMdx() ? 'AI 伴奏分离' : '快速试听消音'}</button>}</div></div>
            <div className="album-art" style={{ '--accent': currentSong?.accent } as CSSProperties}><span className="vinyl">L</span><div className="art-caption">LEoKTV<br /><small>SESSION 01</small></div></div>
            <div className="hero-glow" style={{ background: currentSong?.accent }} />
          </section>

          <section className="player panel">
            <div className="progress-row"><span>{formatTime(elapsed)}</span><input aria-label="播放进度" type="range" min="0" max="100" value={progress} onChange={seek} style={{ '--value': `${progress}%` } as CSSProperties} /><span>{formatTime(duration)}</span></div>
            <div className="controls"><button className="control-button" aria-label="随机播放">⤨</button><button className="control-button" onClick={() => playRelative(-1)} aria-label="上一首">◀◀</button><button className="play-button" onClick={togglePlay} aria-label={isPlaying ? '暂停' : '播放'}>{isPlaying ? 'Ⅱ' : '▶'}</button><button className="control-button" onClick={() => playRelative(1)} aria-label="下一首">▶▶</button><button className="control-button" aria-label="循环播放">↻</button></div>
            <div className="volume"><button className="volume-icon" onClick={() => { setIsMuted((muted) => !muted); if (audioRef.current) audioRef.current.muted = !isMuted }}>{isMuted || volume === 0 ? '♩' : '◖'}</button><input aria-label="音量" type="range" min="0" max="100" value={isMuted ? 0 : volume} onChange={changeVolume} style={{ '--value': `${isMuted ? 0 : volume}%` } as CSSProperties} /></div>
          </section>

          <section className="lower-grid"><div className="lyrics panel"><div className="panel-title"><div><p className="eyebrow">LYRICS</p><h2>歌词</h2></div><button className="small-button" onClick={() => lyricsFileRef.current?.click()}>{currentLyrics.length ? '替换 LRC' : '导入 LRC'}</button></div><div className="lyrics-list">{currentLyrics.length ? currentLyrics.map((line, index) => <p ref={index === activeLyric ? activeLyricRef : undefined} key={`${line.time}-${index}`} className={index === activeLyric ? 'lyric active' : 'lyric'}>{line.text}</p>) : <div className="lyrics-empty"><strong>暂无歌词</strong><span>选择一个 .lrc 文件导入后会自动同步</span></div>}</div></div><div className="tips panel"><div className="tips-icon">✦</div><p className="eyebrow">LEoKTV TIP</p><h3>把房间变成<br /><span>你的舞台</span></h3><p className="tip-copy">导入喜欢的歌曲，和朋友一起分享你的歌单。</p><button onClick={() => fileRef.current?.click()}>开始导入 <span>→</span></button></div></section>
        </section>

        <aside className="queue panel"><div className="queue-header"><div><p className="eyebrow">UP NEXT</p><h2>播放队列 <span>{queueSongs.length}</span></h2></div><button className="more-button">•••</button></div><div className="queue-list">{queueSongs.map((song, index) => <div key={song.id} className={song.id === currentId ? 'queue-item current' : 'queue-item'} onClick={() => selectSong(song)}><span className="queue-index">{song.id === currentId ? '♫' : String(index + 1).padStart(2, '0')}</span><div className="queue-art" style={{ background: song.accent }} /><div className="queue-info"><strong>{song.title}</strong><span>{song.artist}</span></div><span className="queue-time">{song.duration}</span><button className="remove-queue" onClick={(event) => { event.stopPropagation(); removeFromQueue(song.id) }}>×</button></div>)}</div><button className="clear-button" onClick={() => setQueue([])}>清空队列</button><div className="queue-footer"><span className="wave-icon">▂▅▃▆</span><div><strong>私人歌房</strong><span>正在播放你的精选</span></div></div></aside>
      </main>
      <audio ref={audioRef} />
      {notice && <div className="notice" role="status">{notice}</div>}
    </div>
  )
}

export default App
