/// <reference types="vite/client" />

interface Window {
  // expose in the `electron/preload/index.ts`
  ipcRenderer: import('electron').IpcRenderer
  electronAPI: {
    saveFile: (data: { transcript: string; summary: string }) => Promise<{ success: boolean; filePath?: string; error?: string }>
  }
}
