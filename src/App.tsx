import { useState, useEffect, useRef } from 'react'
import { SpeechRecorder } from './components/SpeechRecorder'
import { SummaryBoard } from './components/SummaryBoard'
import { AILoadingBar } from './components/AILoadingBar'
import { SettingsModal } from './components/SettingsModal'
import { summarizeWithLLM } from './services/llm'
import './App.css'

function App() {
  const [transcript, setTranscript] = useState('')
  const [summary, setSummary] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcribeProgress, setTranscribeProgress] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)
  const [isLoadingSummary, setIsLoadingSummary] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const [sttProgress, setSttProgress] = useState(0)
  const [sttStatus, setSttStatus] = useState('Initializing...')
  const [sttError, setSttError] = useState<string | null>(null)

  const sttReadyRef = useRef(false)
  const cancelTranscribeRef = useRef(false)

  useEffect(() => {
    // 1. Initialize Whisper (Main Process via IPC)
    const offProgress = window.electronAPI.onSttProgress((data: any) => {
      if (data.progress !== undefined) setSttProgress(data.progress)
      setSttStatus(`[${data.status}] ${data.name || ''}`)
    })
    const offReady = window.electronAPI.onSttReady(() => {
      sttReadyRef.current = true
      setSttProgress(100)
      setSttStatus('Ready')
    })
    const offError = window.electronAPI.onSttError((err: string) => {
      if (!sttReadyRef.current) setSttError(err)
      else { alert('STT 추론 에러: ' + err); setIsTranscribing(false) }
    })
    window.electronAPI.whisperLoad()

    return () => {
      offProgress()
      offReady()
      offError()
    }
  }, [])

  const handleAudioCaptured = async (blob: Blob) => {
    cancelTranscribeRef.current = false
    setIsCancelling(false)
    setIsTranscribing(true)
    setTranscribeProgress('')
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const ctx = new window.AudioContext({ sampleRate: 16000 })
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      const float32Array = audioBuffer.getChannelData(0)

      const CHUNK_SAMPLES = 16000 * 30 // 30초
      const total = Math.ceil(float32Array.length / CHUNK_SAMPLES)

      for (let i = 0; i < total; i++) {
        if (cancelTranscribeRef.current) break
        setTranscribeProgress(total > 1 ? `처리 중... (${i + 1}/${total})` : '')
        const chunk = float32Array.slice(i * CHUNK_SAMPLES, (i + 1) * CHUNK_SAMPLES)
        const result = await window.electronAPI.whisperTranscribe(chunk.buffer.slice(0))
        if (result.success && result.text) {
          setTranscript(prev => (prev ? prev + '\n' : '') + result.text)
        } else {
          alert('STT 추론 에러: ' + result.error)
          break
        }
      }
    } catch (e: any) {
      alert('오디오 데이터를 파싱하는데 실패했습니다. 다시 녹음해주세요.')
    } finally {
      setIsTranscribing(false)
      setTranscribeProgress('')
      setIsCancelling(false)
      cancelTranscribeRef.current = false
    }
  }

  const handleCancelTranscribe = () => {
    cancelTranscribeRef.current = true
    setIsCancelling(true)
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

  const handleSaveTranscript = async () => {
    if (!transcript) return
    const result = await window.electronAPI.saveFile({ transcript, summary: '' })
    if (result.success) {
      alert(`녹취 텍스트가 저장되었습니다!\n경로: ${result.filePath}`)
    } else if (result.error) {
      alert(`저장 중 오류가 발생했습니다: ${result.error}`)
    }
  }

  return (
    <div className="container">
      <AILoadingBar
        sttProgress={sttProgress} sttStatus={sttStatus}
        sttError={sttError} onDismissSttError={() => setSttProgress(100)}
      />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      
      <header className="app-header">
        <h1>🚀 meetManager v1.1</h1>
        <p>PC 와 AI 를 활용한 진정한 로보틱 회의 보조원</p>
        <button className="btn-settings" onClick={() => setShowSettings(true)}>⚙️ LLM 설정</button>
      </header>

      <main className="app-main">
        <div className="panel-container">
          <SpeechRecorder
            transcript={transcript}
            isRecording={isRecording}
            setIsRecording={setIsRecording}
            onAudioCaptured={handleAudioCaptured}
            isTranscribing={isTranscribing}
            transcribeProgress={transcribeProgress}
            isCancelling={isCancelling}
            onCancelTranscribe={handleCancelTranscribe}
            onClearTranscript={() => setTranscript('')}
            onTranscriptChange={setTranscript}
            onSaveTranscript={handleSaveTranscript}
          />
          <SummaryBoard
            summary={summary}
            isLoading={isLoadingSummary}
            hasTranscript={transcript.length > 0}
            onRequestSummary={handleRequestSummary}
            onSaveFile={handleSaveFile}
            onSummaryChange={setSummary}
          />
        </div>
      </main>

      <footer className="app-footer">
        made by 김정웅
      </footer>
    </div>
  )
}

export default App