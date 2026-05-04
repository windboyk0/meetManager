import React, { useRef, useEffect, useState } from 'react'

interface Props {
  transcript: string
  isRecording: boolean
  setIsRecording: (recording: boolean) => void
  onAudioCaptured: (blob: Blob) => void
  isTranscribing: boolean
  transcribeProgress: string
  isCancelling: boolean
  onCancelTranscribe: () => void
  onClearTranscript: () => void
  onTranscriptChange: (text: string) => void
  onSaveTranscript: () => void
}

export const SpeechRecorder: React.FC<Props> = ({
  transcript,
  isRecording,
  setIsRecording,
  onAudioCaptured,
  isTranscribing,
  transcribeProgress,
  isCancelling,
  onCancelTranscribe,
  onClearTranscript,
  onTranscriptChange,
  onSaveTranscript,
}) => {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // Mic test
  const [micCheckActive, setMicCheckActive] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)

  // Audio level — shared by mic test & recording
  const [audioLevel, setAudioLevel] = useState(0)
  const animFrameRef = useRef<number>(0)

  // Recorded audio
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
  const recordedUrlRef = useRef<string | null>(null)   // Object URL (ref: no re-render needed)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current)
      micStreamRef.current?.getTracks().forEach(t => t.stop())
      audioRef.current?.pause()
      if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current)
    }
  }, [])

  // ─── Level meter (shared) ─────────────────────────
  const startLevelMeter = (stream: MediaStream) => {
    cancelAnimationFrame(animFrameRef.current)
    const audioCtx = new AudioContext()
    const source = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    const tick = () => {
      const buf = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(buf)
      const avg = buf.reduce((a, b) => a + b, 0) / buf.length
      setAudioLevel(Math.min(100, avg * 2.5))
      animFrameRef.current = requestAnimationFrame(tick)
    }
    tick()
  }

  const stopLevelMeter = () => {
    cancelAnimationFrame(animFrameRef.current)
    setAudioLevel(0)
  }

  // ─── Mic test ─────────────────────────────────────
  const startMicCheck = async () => {
    setMicError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      startLevelMeter(stream)
      setMicCheckActive(true)
    } catch {
      setMicError('마이크 접근 권한이 필요합니다.')
    }
  }

  const stopMicCheck = () => {
    stopLevelMeter()
    micStreamRef.current?.getTracks().forEach(t => t.stop())
    micStreamRef.current = null
    setMicCheckActive(false)
  }

  // ─── Recording ────────────────────────────────────
  const startRecording = async () => {
    if (transcript) {
      const confirmed = window.confirm('기존 내용을 초기화 하겠습니까?')
      if (confirmed) onClearTranscript()
    }
    if (micCheckActive) stopMicCheck()

    // Discard previous recording
    audioRef.current?.pause()
    audioRef.current = null
    setIsPlaying(false)
    if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current)
    recordedUrlRef.current = null
    setRecordedBlob(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        stopLevelMeter()
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        chunksRef.current = []
        recordedUrlRef.current = URL.createObjectURL(blob)
        setRecordedBlob(blob)
        stream.getTracks().forEach(track => track.stop())
        onAudioCaptured(blob)
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      startLevelMeter(stream)
      setIsRecording(true)
    } catch {
      alert('마이크 접근 권한이 필요합니다.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop()
    }
    setIsRecording(false)
  }

  // ─── Playback ─────────────────────────────────────
  const handlePlayPause = () => {
    if (!recordedUrlRef.current) return

    if (!audioRef.current) {
      audioRef.current = new Audio(recordedUrlRef.current)
      audioRef.current.onended = () => setIsPlaying(false)
    }

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  // ─── Download Audio ───────────────────────────────
  const handleDownloadAudio = async () => {
    if (!recordedBlob) return
    const buffer = await recordedBlob.arrayBuffer()
    const filename = `recording_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.webm`
    await window.electronAPI.saveAudio(buffer, filename)
  }

  // ─── Transcribe ───────────────────────────────────
  const handleTranscribe = () => {
    if (!recordedBlob) return
    audioRef.current?.pause()
    audioRef.current = null
    setIsPlaying(false)
    onAudioCaptured(recordedBlob)
    // blob은 유지 — 새 녹음 시작 전까지 다운로드 가능
  }

  // ─── File Upload ──────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    onAudioCaptured(file)
  }

  // ─── Render helpers ───────────────────────────────
  const levelColor = isRecording
    ? (audioLevel > 60 ? '#f87171' : audioLevel > 20 ? '#fbbf24' : '#475569')
    : (audioLevel > 60 ? '#4ade80' : audioLevel > 20 ? '#facc15' : '#475569')

  const placeholderText = isTranscribing
    ? '텍스트 변환 중...'
    : recordedBlob
    ? '녹음 완료. 들어보고 [변환하기]를 눌러주세요.'
    : '녹음 후 [변환하기]를 누르면 AI가 로컬에서 텍스트로 변환합니다.'

  return (
    <div className="card">
      <div className="card-header">
        <h2>음성 녹음 (STT 추출기)</h2>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          {transcript && !isRecording && !isTranscribing && (
            <button onClick={onClearTranscript} className="btn-mic-check">
              🗑 내용 초기화
            </button>
          )}
          {isRecording ? (
            <button onClick={stopRecording} className="btn btn-stop">녹음 중지</button>
          ) : (
            <button onClick={startRecording} className="btn btn-primary"
              disabled={isTranscribing}>
              {isTranscribing ? 'STT 변환 중...' : '녹음 시작'}
            </button>
          )}
        </div>
      </div>

      <div className="mic-check-bar">
        {/* 대기 중 */}
        {!isRecording && !micCheckActive && !recordedBlob && !isTranscribing && (
          <>
            <button className="btn-mic-check" onClick={startMicCheck}>
              🎤 마이크 테스트
            </button>
            <button className="btn-mic-check" onClick={() => fileInputRef.current?.click()}>
              📂 파일 업로드
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
          </>
        )}

        {/* 마이크 테스트 중 */}
        {micCheckActive && (
          <>
            <span className="mic-check-label">🎤 입력 감지 중</span>
            <div className="mic-level-track">
              <div className="mic-level-fill"
                style={{ width: `${audioLevel}%`, backgroundColor: levelColor }} />
            </div>
            <button className="btn-mic-check" onClick={stopMicCheck}>종료</button>
          </>
        )}

        {/* 녹음 중 — 레벨 미터 */}
        {isRecording && (
          <>
            <span className="rec-indicator">● REC</span>
            <div className="mic-level-track">
              <div className="mic-level-fill"
                style={{ width: `${audioLevel}%`, backgroundColor: levelColor }} />
            </div>
          </>
        )}

        {/* 녹음 완료 — 듣기 / 저장 / 변환 or 텍스트저장 */}
        {!isRecording && recordedBlob && !isTranscribing && (
          <>
            <button className="btn-mic-check btn-play" onClick={handlePlayPause}>
              {isPlaying ? '⏸ 일시정지' : '▶ 녹음 듣기'}
            </button>
            <button className="btn-mic-check" onClick={handleDownloadAudio}>
              💾 음성 저장
            </button>
            {transcript ? (
              <button className="btn btn-primary btn-transcribe" onClick={onSaveTranscript}>
                📄 텍스트 저장
              </button>
            ) : (
              <button className="btn btn-primary btn-transcribe" onClick={handleTranscribe}>
                변환하기
              </button>
            )}
          </>
        )}

        {/* 변환 중 — 음성 다운로드 유지 */}
        {isTranscribing && (
          <>
            <span className="mic-check-label">
              {isCancelling ? '⏳ 중단 요청됨... 현재 구간 완료 후 종료' : `⏳ ${transcribeProgress || 'STT 변환 중...'}`}
            </span>
            {recordedBlob && (
              <button className="btn-mic-check" onClick={handleDownloadAudio}>
                💾 음성 저장
              </button>
            )}
            <button className="btn-mic-check" onClick={onCancelTranscribe} disabled={isCancelling}>
              ⏹ 중단
            </button>
          </>
        )}

        {micError && <span className="mic-error-text">{micError}</span>}
      </div>

      <textarea
        className="editable-textarea"
        value={transcript}
        onChange={e => onTranscriptChange(e.target.value)}
        placeholder={placeholderText}
        readOnly={isTranscribing}
      />
    </div>
  )
}
