export interface LLMSettings {
  provider: 'ollama' | 'openai' | 'claude'
  url: string      // Ollama 서버 URL
  apiKey: string   // OpenAI / Claude API Key
  model: string
}

const DEFAULTS: LLMSettings = {
  provider: 'ollama',
  url: 'http://192.168.40.103:11434',
  apiKey: '',
  model: 'gemma4',
}

export function loadSettings(): LLMSettings {
  try {
    const saved = localStorage.getItem('llm-settings')
    return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : { ...DEFAULTS }
  } catch { return { ...DEFAULTS } }
}

export function saveSettings(s: LLMSettings) {
  localStorage.setItem('llm-settings', JSON.stringify(s))
}

export function isConfigured(s: LLMSettings): boolean {
  if (s.provider === 'ollama') return !!s.url && !!s.model
  return !!s.apiKey && !!s.model
}

const PROMPT = (text: string) =>
  `회의 내용을 분석하고, 핵심 주제와 결정 사항을 누락 없이 "개조식(Bullet points, 단답형/명사형 종결)"으로 요약하세요. 오직 요약 결과만 한국어로 출력하세요.\n\n[회의 녹취록]\n${text}`

// ─── Ollama ────────────────────────────────────────────────────────────────
async function summarizeOllama(s: LLMSettings, text: string, onUpdate: (t: string) => void) {
  const res = await fetch(`${s.url}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: s.model, prompt: PROMPT(text), stream: true }),
  })
  if (!res.ok) throw new Error(`Ollama 오류: ${res.status} ${res.statusText}`)

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const line of decoder.decode(value).split('\n').filter(l => l.trim())) {
      const data = JSON.parse(line)
      result += data.response || ''
      onUpdate(result)
      if (data.done) return
    }
  }
}

// ─── OpenAI ────────────────────────────────────────────────────────────────
async function summarizeOpenAI(s: LLMSettings, text: string, onUpdate: (t: string) => void) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${s.apiKey}`,
    },
    body: JSON.stringify({
      model: s.model,
      messages: [{ role: 'user', content: PROMPT(text) }],
      temperature: 0.2,
      stream: true,
    }),
  })
  if (!res.ok) throw new Error(`OpenAI 오류: ${res.status} ${res.statusText}`)

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const line of decoder.decode(value).split('\n')) {
      const trimmed = line.replace(/^data: /, '').trim()
      if (!trimmed || trimmed === '[DONE]') continue
      try {
        const data = JSON.parse(trimmed)
        result += data.choices[0]?.delta?.content || ''
        onUpdate(result)
      } catch { /* ignore malformed lines */ }
    }
  }
}

// ─── Claude ────────────────────────────────────────────────────────────────
async function summarizeClaude(s: LLMSettings, text: string, onUpdate: (t: string) => void) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': s.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: s.model,
      max_tokens: 2048,
      messages: [{ role: 'user', content: PROMPT(text) }],
      stream: true,
    }),
  })
  if (!res.ok) throw new Error(`Claude 오류: ${res.status} ${res.statusText}`)

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const line of decoder.decode(value).split('\n')) {
      const trimmed = line.replace(/^data: /, '').trim()
      if (!trimmed) continue
      try {
        const data = JSON.parse(trimmed)
        if (data.type === 'content_block_delta') {
          result += data.delta?.text || ''
          onUpdate(result)
        }
      } catch { /* ignore */ }
    }
  }
}

// ─── 공통 진입점 ───────────────────────────────────────────────────────────
export async function summarizeWithLLM(text: string, onUpdate: (t: string) => void): Promise<void> {
  const s = loadSettings()
  if (!isConfigured(s)) throw new Error('LLM 설정이 필요합니다. 우측 상단 ⚙️ 버튼을 눌러 설정해주세요.')
  if (s.provider === 'ollama') return summarizeOllama(s, text, onUpdate)
  if (s.provider === 'openai') return summarizeOpenAI(s, text, onUpdate)
  return summarizeClaude(s, text, onUpdate)
}
