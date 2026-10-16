import type { LyricLine, Song } from './types'

const DB_NAME = 'leoktv-library'
const DB_VERSION = 1
const SONG_STORE = 'songs'

type StoredSong = Omit<Song, 'audioUrl'> & { blob: Blob }

const openLibrary = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (!('indexedDB' in window)) {
    reject(new Error('当前环境不支持本地曲库'))
    return
  }
  const request = window.indexedDB.open(DB_NAME, DB_VERSION)
  request.onupgradeneeded = () => request.result.createObjectStore(SONG_STORE, { keyPath: 'id' })
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error ?? new Error('无法打开本地曲库'))
})

export const saveSongBlob = async (song: Song, blob: Blob) => {
  const db = await openLibrary()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(SONG_STORE, 'readwrite')
      const { audioUrl: _audioUrl, ...metadata } = song
      transaction.objectStore(SONG_STORE).put({ ...metadata, blob } satisfies StoredSong)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('无法保存本地歌曲'))
      transaction.onabort = () => reject(transaction.error ?? new Error('本地曲库写入被取消'))
    })
  } finally {
    db.close()
  }
}

export const updateStoredLyrics = async (id: number, lyrics: LyricLine[]) => {
  let db: IDBDatabase | undefined
  try {
    const opened = await openLibrary()
    db = opened
    await new Promise<void>((resolve, reject) => {
      const transaction = opened.transaction(SONG_STORE, 'readwrite')
      const store = transaction.objectStore(SONG_STORE)
      const request = store.get(id)
      request.onsuccess = () => {
        if (request.result) store.put({ ...request.result, lyrics })
      }
      request.onerror = () => reject(request.error ?? new Error('无法读取本地歌曲'))
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('无法保存歌词'))
    })
  } catch {
    // A missing IndexedDB record should not prevent the current session from using lyrics.
  } finally {
    db?.close()
  }
}

export const loadStoredSongs = async (): Promise<Song[]> => {
  try {
    const db = await openLibrary()
    try {
      const records = await new Promise<StoredSong[]>((resolve, reject) => {
        const request = db.transaction(SONG_STORE, 'readonly').objectStore(SONG_STORE).getAll()
        request.onsuccess = () => resolve(request.result as StoredSong[])
        request.onerror = () => reject(request.error ?? new Error('无法读取本地曲库'))
      })
      return records.map(({ blob, ...song }) => ({ ...song, audioUrl: URL.createObjectURL(blob) }))
    } finally {
      db.close()
    }
  } catch {
    return []
  }
}
