declare global {
  interface Window {
    electronAPI: {
      saveFile: (data: { transcript: string; summary: string }) => Promise<{ success: boolean; filePath?: string; error?: string }>
      saveAudio: (buffer: ArrayBuffer, filename: string) => Promise<{ success: boolean; filePath?: string; error?: string }>
      whisperLoad: () => Promise<void>
      whisperTranscribe: (buffer: ArrayBuffer) => Promise<{ success: boolean; text?: string; error?: string }>
      onSttProgress: (cb: (data: any) => void) => () => void
      onSttReady: (cb: () => void) => () => void
      onSttError: (cb: (err: string) => void) => () => void
    }
  }
}

export {}
