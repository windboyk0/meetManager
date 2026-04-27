import React from 'react'

interface Props {
  summary: string
  isLoading: boolean
  hasTranscript: boolean
  onRequestSummary: () => void
  onSaveFile: () => void
  onSummaryChange: (text: string) => void
}

export const SummaryBoard: React.FC<Props> = ({
  summary,
  isLoading,
  hasTranscript,
  onRequestSummary,
  onSaveFile,
  onSummaryChange,
}) => {
  return (
    <div className="card summary-card">
      <div className="card-header">
        <h2>AI 개조식 요약</h2>
        <div className="summary-actions">
          <button
            className="btn btn-primary"
            onClick={onRequestSummary}
            disabled={!hasTranscript || isLoading}
          >
            {isLoading ? '요약 중...' : 'AI 요약'}
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
            <span>AI가 요약하고 있습니다...</span>
          </div>
        ) : (
          <textarea
            className="editable-textarea"
            value={summary}
            onChange={e => onSummaryChange(e.target.value)}
            placeholder="AI 요약 버튼을 누르면 요약 결과가 여기에 표시됩니다."
          />
        )}
      </div>
    </div>
  )
}
