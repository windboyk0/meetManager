import React, { useState } from 'react'
import { LLMSettings, loadSettings, saveSettings } from '../services/llm'

interface Props {
  onClose: () => void
}

const MODEL_DEFAULTS: Record<LLMSettings['provider'], string> = {
  ollama: 'gemma4',
  openai: 'gpt-4o-mini',
  claude: 'claude-haiku-4-5-20251001',
}

export const SettingsModal: React.FC<Props> = ({ onClose }) => {
  const [s, setS] = useState<LLMSettings>(loadSettings)

  const setProvider = (provider: LLMSettings['provider']) => {
    setS(prev => ({ ...prev, provider, model: MODEL_DEFAULTS[provider] }))
  }

  const handleSave = () => {
    saveSettings(s)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <h2>⚙️ LLM 설정</h2>
        <p>요약에 사용할 AI 제공자를 선택하세요.</p>

        {/* Provider 선택 */}
        <div className="settings-provider-group">
          {(['ollama', 'openai', 'claude'] as const).map(p => (
            <label key={p} className={`settings-provider-btn ${s.provider === p ? 'active' : ''}`}>
              <input type="radio" name="provider" value={p}
                checked={s.provider === p} onChange={() => setProvider(p)} />
              {p === 'ollama' ? '🦙 Ollama (로컬)' : p === 'openai' ? '🤖 OpenAI API' : '🧠 Claude API'}
            </label>
          ))}
        </div>

        {/* Ollama URL */}
        {s.provider === 'ollama' && (
          <div className="settings-field">
            <label>서버 URL</label>
            <input className="api-key-input" placeholder="http://192.168.40.103:11434"
              value={s.url} onChange={e => setS({ ...s, url: e.target.value })} />
          </div>
        )}

        {/* API Key */}
        {(s.provider === 'openai' || s.provider === 'claude') && (
          <div className="settings-field">
            <label>API Key</label>
            <input className="api-key-input" type="password"
              placeholder={s.provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
              value={s.apiKey} onChange={e => setS({ ...s, apiKey: e.target.value })} />
          </div>
        )}

        {/* 모델명 */}
        <div className="settings-field">
          <label>모델명</label>
          <input className="api-key-input" placeholder={MODEL_DEFAULTS[s.provider]}
            value={s.model} onChange={e => setS({ ...s, model: e.target.value })} />
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={handleSave}>저장</button>
        </div>
      </div>
    </div>
  )
}
