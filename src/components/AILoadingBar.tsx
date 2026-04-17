import React from 'react'

interface Props {
  sttProgress: number // 0 ~ 100
  sttStatus: string
  sttError?: string | null
  onDismissSttError?: () => void
  llmProgress: number // 0 ~ 100
  llmStatus: string
  llmError?: string | null
  onDismissLlmError?: () => void
}

export const AILoadingBar: React.FC<Props> = ({
  sttProgress, sttStatus, sttError, onDismissSttError,
  llmProgress, llmStatus, llmError, onDismissLlmError,
}) => {
  const isComplete = sttProgress === 100 && llmProgress === 100

  if (isComplete) return null

  return (
    <div className="modal-overlay">
      <div className="modal-content loading-modal">
        <h2>🚀 AI 모델 가중치 로딩 중...</h2>
        <p>최초 1회 오프라인 엔진 다운로드가 진행됩니다.</p>

        <div className="progress-container">
          {sttError ? (
            <>
              <div className="progress-label">
                <span>음성 인식 모델 (Whisper)</span>
                <span style={{ color: '#f87171' }}>로딩 실패</span>
              </div>
              <p className="status-text-error">{sttError}</p>
              <button className="btn btn-secondary" onClick={onDismissSttError}>
                계속하기 (STT 비활성화)
              </button>
            </>
          ) : (
            <>
              <div className="progress-label">
                <span>음성 인식 모델 (Whisper)</span>
                <span>{Math.round(sttProgress)}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${sttProgress}%` }}></div>
              </div>
              <p className="status-text">{sttStatus || '대기 중...'}</p>
            </>
          )}
        </div>

        <div className="progress-container" style={{ marginTop: '1.5rem' }}>
          {llmError ? (
            <>
              <div className="progress-label">
                <span>자동 요약 엔진 (Gemma-2B)</span>
                <span style={{ color: '#f87171' }}>로딩 실패</span>
              </div>
              <p className="status-text-error">{llmError}</p>
              <p className="status-text" style={{ marginBottom: '0.75rem', whiteSpace: 'normal', overflow: 'visible' }}>
                WebGPU를 지원하지 않는 환경이거나 VRAM이 부족할 수 있습니다.<br />
                STT(음성 텍스트 변환)는 정상 사용 가능합니다.
              </p>
              <button className="btn btn-secondary" onClick={onDismissLlmError}>
                STT만 사용하기
              </button>
            </>
          ) : (
            <>
              <div className="progress-label">
                <span>자동 요약 엔진 (Gemma-2B)</span>
                <span>{Math.round(llmProgress)}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${llmProgress}%` }}></div>
              </div>
              <p className="status-text">{llmStatus || '대기 중...'}</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
