import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs/promises'
import { update } from './update'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// Enable WebGPU for WebLLM (sLLM engine)
app.commandLine.appendSwitch('enable-unsafe-webgpu')
app.commandLine.appendSwitch('enable-features', 'Vulkan,UseSkiaRenderer')
app.commandLine.appendSwitch('use-angle', 'default')
// Enable shader-f16 extension required by Gemma/Qwen models
app.commandLine.appendSwitch('enable-dawn-features', 'allow_unsafe_apis')

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

async function createWindow() {
  win = new BrowserWindow({
    title: 'meetManager v1.1',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    center: true,
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // nodeIntegration: true,

      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      // contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) { // #298
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(indexHtml)
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Auto update
  update(win)
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})

// ─── Whisper STT (Main Process) ───────────────────────────────────────────────
// Running @xenova/transformers in the Main Process (Node.js) avoids the
// "Dynamic require of 'fs' is not supported" error that occurs in the Renderer.
// Node.js has native fs access, so ONNX runtime loads without any issues.

let whisperPipeline: any = null
let whisperLoadPromise: Promise<void> | null = null

async function loadWhisper() {
  if (whisperPipeline) {
    win?.webContents.send('stt-ready')
    return
  }
  if (whisperLoadPromise) return

  whisperLoadPromise = (async () => {
    try {
      const { pipeline, env } = await import('@xenova/transformers')
      env.allowLocalModels = false
      env.useBrowserCache = false
      env.cacheDir = path.join(app.getPath('userData'), 'hf-cache')

      whisperPipeline = await pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-medium',
        {
          progress_callback: (data: any) => {
            win?.webContents.send('stt-progress', data)
          },
        }
      )
      win?.webContents.send('stt-ready')
    } catch (err: any) {
      whisperLoadPromise = null
      win?.webContents.send('stt-error', err.message)
    }
  })()
}

ipcMain.handle('whisper-load', () => {
  loadWhisper()
})

ipcMain.handle('whisper-transcribe', async (_, buffer: ArrayBuffer) => {
  if (!whisperPipeline) return { success: false, error: 'Whisper 모델이 준비되지 않았습니다.' }
  try {
    const audio = new Float32Array(buffer)
    const result = await whisperPipeline(audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: 'korean',
      task: 'transcribe',
    })
    return { success: true, text: result.text }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// Save audio IPC handler
ipcMain.handle('save-audio', async (_, { buffer, filename }: { buffer: ArrayBuffer; filename: string }) => {
  if (!win) return { success: false, error: 'No active window' }
  const result = await dialog.showSaveDialog(win, {
    title: '녹음 파일 저장',
    defaultPath: filename,
    filters: [{ name: 'Audio Files', extensions: ['webm'] }],
  })
  if (result.canceled || !result.filePath) return { success: false }
  try {
    await fs.writeFile(result.filePath, Buffer.from(buffer))
    return { success: true, filePath: result.filePath }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// Save file IPC handler
ipcMain.handle('save-file', async (_, data: { transcript: string; summary: string }) => {
  if (!win) return { success: false, error: 'No active window' }
  
  const result = await dialog.showSaveDialog(win, {
    title: '회의록 저장',
    defaultPath: `Meeting_Summary_${new Date().toISOString().slice(0,10)}.txt`,
    filters: [{ name: 'Text Documents', extensions: ['txt'] }],
  })

  if (result.canceled || !result.filePath) {
    return { success: false }
  }

  const content = `[회의 녹취 내용]\n${data.transcript}\n\n[회의 요약]\n${data.summary}\n`

  try {
    await fs.writeFile(result.filePath, content, 'utf-8')
    return { success: true, filePath: result.filePath }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})
