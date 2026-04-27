import React from 'react'

interface Props {
  sttProgress: number
  sttStatus: string
  sttError?: string | null
  onDismissSttError?: () => void
}

export const AILoadingBar: React.FC<Props> = ({
  sttProgress, sttStatus, sttError, onDismissSttError,
}) => {
  if (sttProgress === 100) return null

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
      </div>
    </div>
  )
}
