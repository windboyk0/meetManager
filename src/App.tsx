import { useState, useEffect, useRef } from 'react'
import { SpeechRecorder } from './components/SpeechRecorder'
import { SummaryBoard } from './components/SummaryBoard'
import { AILoadingBar } from './components/AILoadingBar'
import { initLLM, summarizeWithLLM } from './services/llm'
import './App.css'

function App() {
  const [transcript, setTranscript] = useState('')
  const [summary, setSummary] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isLoadingSummary, setIsLoadingSummary] = useState(false)

  const [sttProgress, setSttProgress] = useState(0)
  const [sttStatus, setSttStatus] = useState('Initializing...')
  const [sttError, setSttError] = useState<string | null>(null)
  const [llmProgress, setLlmProgress] = useState(0)
  const [llmStatus, setLlmStatus] = useState('Initializing...')
  const [llmError, setLlmError] = useState<string | null>(null)

  const workerRef = useRef<Worker | null>(null)
  const sttReadyRef = useRef(false)

  useEffect(() => {
    // 1. Initialize Whisper Worker (Local STT)
    const worker = new Worker(new URL('./worker/whisper.worker.ts', import.meta.url), {
      type: 'module'
    })

    worker.onmessage = (e) => {
      const msg = e.data
      if (msg.type === 'progress') {
        const { status, name, progress } = msg.data
        if (progress !== undefined) setSttProgress(progress)
        setSttStatus(`[${status}] ${name || ''}`)
      } else if (msg.type === 'ready') {
        sttReadyRef.current = true
        setSttProgress(100)
        setSttStatus('Ready')
      } else if (msg.type === 'result') {
        setTranscript(prev => (prev ? prev + '\n' : '') + msg.text)
        setIsTranscribing(false)
      } else if (msg.type === 'error') {
        if (!sttReadyRef.current) {
          // 초기화(모델 로딩) 중 에러 → 로딩 모달에 표시
          setSttError(msg.error)
        } else {
          // 녹음 변환 중 에러 → 인라인 알림
          alert('STT 추론 에러: ' + msg.error)
          setIsTranscribing(false)
        }
      }
    }
    worker.onerror = (err) => {
      if (!sttReadyRef.current) {
        setSttError(err.message || '워커 로딩 중 알 수 없는 오류가 발생했습니다.')
      }
    }
    worker.postMessage({ type: 'load' })
    workerRef.current = worker

    // 2. Initialize WebLLM (Local Summary)
    initLLM((report) => {
      // report.progress is between 0 and 1
      setLlmProgress(report.progress * 100)
      setLlmStatus(report.text)
    }).then(() => {
      setLlmProgress(100)
      setLlmStatus('Ready')
    }).catch((err) => {
      setLlmError(err.message)
    })

    return () => {
      worker.terminate()
    }
  }, [])

  const handleAudioCaptured = async (blob: Blob) => {
    setIsTranscribing(true)
    try {
      const arrayBuffer = await blob.arrayBuffer()
      // Create an offline audio context to decode the webm blob
      const ctx = new window.AudioContext({ sampleRate: 16000 })
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      
      // We extract float32 samples from channel 0. Whisper only needs 1 channel 16000Hz.
      const float32Array = audioBuffer.getChannelData(0)
      
      workerRef.current?.postMessage({
        type: 'transcribe',
        audio: float32Array
      })
    } catch (e: any) {
      alert('오디오 데이터를 파싱하는데 실패했습니다. 다시 녹음해주세요.')
      setIsTranscribing(false)
    }
  }

  const handleRequestSummary = async () => {
    if (!transcript) return
    setIsLoadingSummary(true)
    setSummary('')
    try {
      await summarizeWithLLM(transcript, (text) => {
        setSummary(text)
      })
    } catch (error: any) {
      alert('로컬 AI 추론 오류: ' + error.message)
    } finally {
      setIsLoadingSummary(false)
    }
  }

  const handleSaveFile = async () => {
    if (!summary) return
    const result = await window.electronAPI.saveFile({ transcript, summary })
    if (result.success) {
      alert(`파일이 저장되었습니다!\n경로: ${result.filePath}`)
    } else if (result.error) {
      alert(`저장 중 오류가 발생했습니다: ${result.error}`)
    }
  }

  return (
    <div className="container">
      <AILoadingBar
        sttProgress={sttProgress} sttStatus={sttStatus}
        llmProgress={llmProgress} llmStatus={llmStatus}
        sttError={sttError} onDismissSttError={() => setSttProgress(100)}
        llmError={llmError} onDismissLlmError={() => setLlmProgress(100)}
      />
      
      <header className="app-header">
        <h1>🚀 극한의 오프라인 로컬 AI 회의록</h1>
        <p>네트워크 패킷 유출 제로! PC의 자원만을 활용한 진정한 로보틱 회의 보조원 (Xenova + WebLLM)</p>
      </header>

      <main className="app-main">
        <div className="panel-container">
          <SpeechRecorder 
            transcript={transcript}
            isRecording={isRecording}
            setIsRecording={setIsRecording}
            onAudioCaptured={handleAudioCaptured}
            isTranscribing={isTranscribing}
          />
          <SummaryBoard 
            summary={summary}
            isLoading={isLoadingSummary}
            hasTranscript={transcript.length > 0}
            onRequestSummary={handleRequestSummary}
            onSaveFile={handleSaveFile}
          />
        </div>
      </main>
    </div>
  )
}

export default App