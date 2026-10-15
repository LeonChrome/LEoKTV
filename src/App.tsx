import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties } from 'react'

type Song = {
  id: number
  title: string
  artist: string
  album: string
  duration: string
  accent: string
  audioUrl?: string
}

const starterSongs: Song[] = [
  { id: 1, title: '晴天', artist: '周杰伦', album: '叶惠美', duration: '04:29', accent: '#f19a71' },
  { id: 2, title: '起风了', artist: '买辣椒也用券', album: '起风了', duration: '05:12', accent: '#a58dff' },
  { id: 3, title: '光年之外', artist: '邓紫棋', album: '摩天动物园', duration: '03:55', accent: '#57c4d9' },
  { id: 4, title: '夜曲', artist: '周杰伦', album: '十一月的萧邦', duration: '03:46', accent: '#dd729c' },
  { id: 5, title: '小幸运', artist: '田馥甄', album: '我的少女时代', duration: '04:08', accent: '#f4c76e' },
  { id: 6, title: '我怀念的', artist: '孙燕姿', album: '逆光', duration: '04:47', accent: '#83b7d4' },
]

const lyricLines = [
  '故事的小黄花',
  '从出生那年就飘着',
  '童年的荡秋千',
  '随记忆一直晃到现在',
  'Re So So Si Do Si La',
  'So La Si Si Si Si La Si La So',
  '吹着前奏望着天空',
  '我想起花瓣试着掉落',
]

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '00:00'
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const remaining = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${remaining}`
}

function App() {
  const [songs, setSongs] = useState<Song[]>(starterSongs)
  const [currentId, setCurrentId] = useState(1)
  const [queue, setQueue] = useState<number[]>([1, 3, 5])
  const [query, setQuery] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(78)
  const [progress, setProgress] = useState(78)
  const [duration, setDuration] = useState(269)
  const [elapsed, setElapsed] = useState(132)
  const [activeLyric, setActiveLyric] = useState(3)
  const audioRef = useRef<HTMLAudioElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const currentSong = songs.find((song) => song.id === currentId) ?? songs[0]
  const filteredSongs = useMemo(
    () => songs.filter((song) => `${song.title}${song.artist}`.toLowerCase().includes(query.toLowerCase())),
    [songs, query],
  )
  const queueSongs = queue.map((id) => songs.find((song) => song.id === id)).filter(Boolean) as Song[]

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
      setActiveLyric(Math.min(lyricLines.length - 1, Math.floor(audio.currentTime / 22)))
    }
    const onEnded = () => setIsPlaying(false)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('ended', onEnded)
    }
  }, [])

  const selectSong = (song: Song) => {
    setCurrentId(song.id)
    setQueue((items) => (items.includes(song.id) ? items : [...items, song.id]))
    setIsPlaying(Boolean(song.audioUrl))
  }

  const togglePlay = () => {
    const audio = audioRef.current
    if (audio && currentSong?.audioUrl) {
      if (isPlaying) audio.pause()
      else void audio.play().catch(() => setIsPlaying(false))
    }
    setIsPlaying((playing) => !playing)
  }

  const seek = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value)
    setProgress(next)
    const nextTime = (next / 100) * duration
    setElapsed(nextTime)
    if (audioRef.current?.duration) audioRef.current.currentTime = nextTime
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
      id: Date.now() + index,
      title: file.name.replace(/\.[^/.]+$/, ''),
      artist: '本地音乐',
      album: '我的导入',
      duration: '--:--',
      accent: ['#d89cff', '#66d8c0', '#ff9b80'][index % 3],
      audioUrl: URL.createObjectURL(file),
    }))
    setSongs((items) => [...imported, ...items])
    selectSong(imported[0])
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
        </aside>

        <section className="content">
          <section className="hero panel">
            <div className="hero-copy"><p className="eyebrow">NOW PLAYING</p><h1>{currentSong?.title ?? '选择一首歌开始'}</h1><p className="artist">{currentSong?.artist ?? 'LEoKTV 音乐库'} <span>·</span> {currentSong?.album ?? '私人歌房'}</p><div className="hero-tags"><span className="tag">高音质</span><span className="tag subtle">本地播放</span></div></div>
            <div className="album-art" style={{ '--accent': currentSong?.accent } as CSSProperties}><span className="vinyl">L</span><div className="art-caption">LEoKTV<br /><small>SESSION 01</small></div></div>
            <div className="hero-glow" style={{ background: currentSong?.accent }} />
          </section>

          <section className="player panel">
            <div className="progress-row"><span>{formatTime(elapsed)}</span><input aria-label="播放进度" type="range" min="0" max="100" value={progress} onChange={seek} style={{ '--value': `${progress}%` } as CSSProperties} /><span>{formatTime(duration)}</span></div>
            <div className="controls"><button className="control-button" aria-label="随机播放">⤨</button><button className="control-button" aria-label="上一首">◀◀</button><button className="play-button" onClick={togglePlay} aria-label={isPlaying ? '暂停' : '播放'}>{isPlaying ? 'Ⅱ' : '▶'}</button><button className="control-button" aria-label="下一首">▶▶</button><button className="control-button" aria-label="循环播放">↻</button></div>
            <div className="volume"><button className="volume-icon" onClick={() => { setIsMuted((muted) => !muted); if (audioRef.current) audioRef.current.muted = !isMuted }}>{isMuted || volume === 0 ? '♩' : '◖'}</button><input aria-label="音量" type="range" min="0" max="100" value={isMuted ? 0 : volume} onChange={changeVolume} style={{ '--value': `${isMuted ? 0 : volume}%` } as CSSProperties} /></div>
          </section>

          <section className="lower-grid"><div className="lyrics panel"><div className="panel-title"><div><p className="eyebrow">LYRICS</p><h2>歌词</h2></div><button className="small-button">展开 ↗</button></div><div className="lyrics-list">{lyricLines.map((line, index) => <p key={line} className={index === activeLyric ? 'lyric active' : 'lyric'}>{line}</p>)}</div></div><div className="tips panel"><div className="tips-icon">✦</div><p className="eyebrow">LEoKTV TIP</p><h3>把房间变成<br /><span>你的舞台</span></h3><p className="tip-copy">导入喜欢的歌曲，和朋友一起分享你的歌单。</p><button onClick={() => fileRef.current?.click()}>开始导入 <span>→</span></button></div></section>
        </section>

        <aside className="queue panel"><div className="queue-header"><div><p className="eyebrow">UP NEXT</p><h2>播放队列 <span>{queueSongs.length}</span></h2></div><button className="more-button">•••</button></div><div className="queue-list">{queueSongs.map((song, index) => <div key={song.id} className={song.id === currentId ? 'queue-item current' : 'queue-item'} onClick={() => selectSong(song)}><span className="queue-index">{song.id === currentId ? '♫' : String(index + 1).padStart(2, '0')}</span><div className="queue-art" style={{ background: song.accent }} /><div className="queue-info"><strong>{song.title}</strong><span>{song.artist}</span></div><span className="queue-time">{song.duration}</span><button className="remove-queue" onClick={(event) => { event.stopPropagation(); removeFromQueue(song.id) }}>×</button></div>)}</div><button className="clear-button" onClick={() => setQueue([])}>清空队列</button><div className="queue-footer"><span className="wave-icon">▂▅▃▆</span><div><strong>私人歌房</strong><span>正在播放你的精选</span></div></div></aside>
      </main>
      <audio ref={audioRef} />
    </div>
  )
}

export default App
