import { Channel, invoke, isTauri } from '@tauri-apps/api/core'

export type MdxEvent = { event: string; stage?: string; value?: number; error?: string }
export type MdxResult = { instrumental: string; vocals: string; cached: boolean }

export const supportsMdx = () => isTauri() && /Windows/i.test(navigator.userAgent)

export async function separateMdx(wav: Blob, onProgress: (event: MdxEvent) => void): Promise<MdxResult> {
  const onEvent = new Channel<MdxEvent>()
  onEvent.onmessage = onProgress
  return invoke<MdxResult>('mdx_run', { audio: Array.from(new Uint8Array(await wav.arrayBuffer())), onEvent })
}

export async function readMdxAudio(path: string): Promise<Blob> {
  const bytes = await invoke<number[]>('mdx_read', { path })
  return new Blob([new Uint8Array(bytes)], { type: 'audio/wav' })
}
