import React from 'react'

interface Props {
  summary: string
  isLoading: boolean
  hasTranscript: boolean
  onRequestSummary: () => void
  onSaveFile: () => void
}

export const SummaryBoard: React.FC<Props> = ({ 
  summary, 
  isLoading, 
  hasTranscript, 
  onRequestSummary,
  onSaveFile
}) => {
  return (
    <div className="card summary-card">
      <div className="card-header">
        <h2>AI 개조식 요약 (옵션 B)</h2>
        <div className="summary-actions">
          <button 
            className="btn btn-primary" 
            onClick={onRequestSummary}
            disabled={!hasTranscript || isLoading}
          >
            {isLoading ? '요약 추론 중...' : '로컬 AI로 요약'}
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={onSaveFile}
            disabled={!summary}
          >
            텍스트 저장
          </button>
        </div>
      </div>
      <div className="summary-box">
        {isLoading && !summary ? (
          <div className="loading-spinner">
            <div className="spinner"></div>
            <span>로컬 sLLM 엔진이 데이터를 추론하고 있습니다...</span>
          </div>
        ) : summary ? (
          <div className="summary-content">
            {summary.split('\n').map((line, idx) => (
              <p key={idx}>{line}</p>
            ))}
          </div>
        ) : (
          <span className="placeholder">요약 시작 버튼을 누르면 오프라인 엔진이 연산을 시작합니다. (과금 ❌, 안전 ⭕)</span>
        )}
      </div>
    </div>
  )
}
