// Electron renderer workers inherit process.versions.node from the main process.
// @xenova/transformers checks this to detect Node.js and switches to fs/path APIs.
// We patch it out BEFORE the dynamic import so the library uses browser code paths.
if (typeof process !== 'undefined') {
  try {
    if (process.versions) {
      Object.defineProperty(process.versions, 'node', {
        value: undefined, configurable: true, writable: true,
      })
    }
    if (process.release) {
      Object.defineProperty(process, 'release', {
        value: { name: 'browser' }, configurable: true, writable: true,
      })
    }
  } catch { /* read-only — ignore */ }
}

// Singleton — stores the Promise returned by pipeline() so second calls
// return the same (already-resolved) Promise without re-downloading.
let pipelinePromise: Promise<any> | null = null

async function getPipeline(progress_callback?: (data: any) => void) {
  if (pipelinePromise !== null) return pipelinePromise

  // Dynamic import runs AFTER the process patch above
  const { pipeline, env } = await import('@xenova/transformers')
  env.allowLocalModels = false
  env.useBrowserCache = true
  // onnxruntime WASM 바이너리를 상대경로에서 못 찾는 문제를 방지하기 위해 CDN 경로 명시
  env.backends.onnx.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/'

  pipelinePromise = pipeline('automatic-speech-recognition' as any, 'Xenova/whisper-tiny', {
    progress_callback,
  })
  return pipelinePromise
}

self.addEventListener('message', async (event) => {
  if (event.data.type === 'load') {
    try {
      await getPipeline((x: any) => {
        self.postMessage({ type: 'progress', data: x })
      })
      self.postMessage({ type: 'ready' })
    } catch (err: any) {
      self.postMessage({ type: 'error', error: err.message })
    }
  } else if (event.data.type === 'transcribe') {
    try {
      const transcriber = await getPipeline()
      self.postMessage({ type: 'status', status: 'transcribing' })
      const result = await transcriber(event.data.audio, {
        chunk_length_s: 30,
        stride_length_s: 5,
        language: 'korean',
        task: 'transcribe',
      })
      self.postMessage({ type: 'result', text: result.text })
    } catch (e: any) {
      self.postMessage({ type: 'error', error: e.message })
    }
  }
})
