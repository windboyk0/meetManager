# meetManager v1.0 — 구현 설계서

회의 중 음성을 녹음하고, **로컬 Whisper STT**로 텍스트 변환 후 **외부 LLM(Ollama / OpenAI / Claude)**으로 개조식 요약하여 `.txt`로 저장하는 Electron 데스크톱 앱입니다.

- **STT**: 완전 오프라인 (Whisper medium, Main Process Node.js 실행)
- **요약**: 설정에 따라 Ollama(로컬) 또는 OpenAI / Claude API 선택

---

## ⚠️ 초기 실행 안내

- **Whisper 모델 다운로드**: 앱 최초 실행 시 `Xenova/whisper-medium` (~750MB)이 `app.getPath('userData')/hf-cache`에 다운로드됩니다. 이후 실행 시 스킵.
- **LLM**: 별도 다운로드 없음. Ollama 서버 또는 OpenAI / Claude API Key 설정 후 바로 사용.
- **STT 방식**: 실시간 스트리밍 X — **"녹음 중지 후 전체 Blob 일괄 변환"** 배치 방식 (연산 과부하 방지).

---

## 기술 스택

| 분류 | 선택 |
|---|---|
| Framework | Electron + Vite + React + TypeScript |
| Styling | Vanilla CSS (Dark Mode, Glassmorphism) |
| STT | `@xenova/transformers` — `Xenova/whisper-medium`, Main Process(Node.js) 실행 |
| 요약 LLM | Ollama(로컬 서버) / OpenAI API / Claude API — 앱 내 ⚙️ 설정에서 선택 |

---

## 프로세스 아키텍처

```
Main Process (Node.js)
  └─ IPC: whisper-load       → @xenova/transformers 파이프라인 초기화
  └─ IPC: whisper-transcribe → Float32Array 수신 → Whisper 추론 → 텍스트 반환
  └─ IPC: save-file          → dialog.showSaveDialog + fs.writeFile (.txt)
  └─ IPC: save-audio         → dialog.showSaveDialog + fs.writeFile (.webm)
  └─ Event: stt-progress / stt-ready / stt-error → Renderer로 push

Renderer Process (React)
  ├─ AILoadingBar    — Whisper 모델 다운로드/초기화 진행 바
  ├─ SpeechRecorder  — MediaRecorder 녹음 → Float32Array 변환 → IPC 전달
  ├─ SummaryBoard    — 외부 LLM 요약 트리거 + 스트리밍 결과 렌더링
  └─ SettingsModal   — LLM 제공자/URL/Key/모델 설정
```

**IPC 채널:**

| 채널 | 방향 | 설명 |
|---|---|---|
| `whisper-load` | Renderer → Main | Whisper 모델 로딩 시작 |
| `whisper-transcribe` | Renderer → Main | ArrayBuffer 전달, 텍스트 반환 |
| `stt-progress` | Main → Renderer | 모델 다운로드 진행률 |
| `stt-ready` | Main → Renderer | 모델 준비 완료 |
| `stt-error` | Main → Renderer | 로딩/추론 에러 |
| `save-file` | Renderer → Main | 회의록 텍스트 저장 (.txt) |
| `save-audio` | Renderer → Main | 녹음 파일 저장 (.webm) |

---

## 구현 상세

### 1. vite.config.ts 핵심 설정 (수정 금지)

| 옵션 | 이유 |
|---|---|
| `resolve.conditions: ['browser']` | `@xenova/transformers` 브라우저 빌드 강제 |
| `define: { 'process.versions.node': 'undefined' }` | IS_NODE 감지 차단 |
| `optimizeDeps.exclude: ['@xenova/transformers', 'onnxruntime-web']` | WASM 경로 보호 + dep optimizer 충돌 방지 |
| `mock-node-builtins` 플러그인 | `onnxruntime-web`의 `require('fs')` 해소. `node:fs` 등 prefixed 형태는 제외(Electron main 충돌 방지) |

### 2. CSP 설정

`index.html`에 `'unsafe-eval' 'wasm-unsafe-eval'` 필수 — 없으면 Wasm 엔진 동작 불가.

### 3. 핵심 기능

#### A. Whisper 로딩 바 (AILoadingBar)
- 앱 최초 진입 시 `whisper-load` IPC 호출 → Main Process가 모델 다운로드
- `stt-progress` 이벤트로 진행률(%) 수신 → 프로그레스 바 렌더링
- `stt-ready` 수신 시 바 숨김, `stt-error` 수신 시 에러 메시지 표시

#### B. 음성 녹음 및 STT (SpeechRecorder)
- `MediaRecorder`로 `audio/webm` Blob 녹음
- 녹음 완료 후 "▶ 녹음 듣기" / "💾 파일 저장" / "변환하기" 버튼 표시
- "변환하기" 클릭 시 Blob → `Float32Array` → IPC `whisper-transcribe` → 텍스트 누적
- 녹음 중 / 마이크 테스트 중 실시간 음성 레벨 미터 표시
- 텍스트 결과 직접 편집 가능 (readOnly는 변환 중에만)

#### C. 외부 LLM 요약 (SummaryBoard + services/llm.ts)
- `[AI 요약]` 버튼 클릭 시 `summarizeWithLLM(transcript, onUpdate)` 호출
- `localStorage`에서 설정 로드 → 제공자별 스트리밍 API 호출
  - **Ollama**: `POST /api/generate` NDJSON 스트리밍
  - **OpenAI**: `POST /v1/chat/completions` SSE 스트리밍
  - **Claude**: `POST /v1/messages` SSE 스트리밍 (`content_block_delta`)
- 결과 직접 편집 가능

#### D. LLM 설정 (SettingsModal)
- 제공자 선택: Ollama / OpenAI / Claude
- Ollama: 서버 URL + 모델명
- OpenAI / Claude: API Key + 모델명
- `localStorage`에 저장, 앱 재시작 후에도 유지

#### E. 파일 저장
- **회의록**: `saveFile({ transcript, summary })` → IPC `save-file` → `.txt`
- **녹음 파일**: `saveAudio(buffer, filename)` → IPC `save-audio` → `.webm`

---

## 녹음 흐름 상세

### 1단계 — 녹음 시작 (`startRecording`)
- `navigator.mediaDevices.getUserMedia({ audio: true })` 로 마이크 스트림 획득
- `MediaRecorder(stream)` 생성 후 녹음 시작
- `AudioContext + AnalyserNode` 로 실시간 음성 레벨 미터 표시 (REC 중 빨간 막대)

### 2단계 — 녹음 중
- `recorder.ondataavailable` 이벤트마다 Blob 청크를 `chunksRef` 배열에 누적

### 3단계 — 녹음 중지 (`stopRecording`)
- `recorder.onstop` 에서 청크 배열을 합쳐 `audio/webm` Blob 생성
- `URL.createObjectURL(blob)` 으로 재생용 Object URL 생성
- 마이크 스트림 및 레벨 미터 종료

### 4단계 — 녹음 완료 후 선택지

| 버튼 | 동작 |
|---|---|
| ▶ 녹음 듣기 | `HTMLAudioElement` 로 webm 재생 / 일시정지 |
| 💾 파일 저장 | `blob.arrayBuffer()` → IPC `save-audio` → Main Process에서 `.webm` 저장 |
| 변환하기 | Blob → `AudioContext.decodeAudioData()` → `Float32Array` → IPC `whisper-transcribe` → 텍스트 누적 |

### 변환 흐름 (변환하기 클릭 시)

```
Renderer
  └─ blob.arrayBuffer()
  └─ new AudioContext({ sampleRate: 16000 })
  └─ ctx.decodeAudioData(arrayBuffer)
  └─ audioBuffer.getChannelData(0)  →  Float32Array
  └─ ipcRenderer.invoke('whisper-transcribe', float32Array.buffer)

Main Process
  └─ new Float32Array(buffer)
  └─ whisperPipeline(audio, { language: 'korean', task: 'transcribe', chunk_length_s: 30 })
  └─ return { success: true, text: result.text }

Renderer
  └─ setTranscript(prev + '\n' + result.text)
```

> **배치 방식**: 실시간 스트리밍 X — 녹음 완료 후 전체 Blob을 한 번에 변환. 연산 과부하 방지.

---

## 디렉토리 구조

```
meetManager/
├── package.json
├── vite.config.ts                 # Vite + Electron 통합 설정
├── index.html                     # CSP: unsafe-eval, wasm-unsafe-eval
├── electron/
│   ├── main/index.ts              # BrowserWindow + Whisper 파이프라인 + IPC 핸들러
│   └── preload/index.ts           # contextBridge: window.electronAPI 전체 노출
└── src/
    ├── electron.d.ts              # window.electronAPI 타입 선언
    ├── components/
    │   ├── AILoadingBar.tsx       # Whisper 로딩 진행 바
    │   ├── SpeechRecorder.tsx     # 녹음 + STT 결과 편집 textarea
    │   ├── SummaryBoard.tsx       # 외부 LLM 요약 + 저장 버튼
    │   └── SettingsModal.tsx      # LLM 제공자/URL/Key/모델 설정
    ├── services/
    │   └── llm.ts                 # Ollama/OpenAI/Claude 스트리밍 요약
    ├── App.tsx
    ├── App.css
    └── index.css
```

---

## 결정 사항

| 질문 | 결정 |
|---|---|
| STT 동작 방식 | 배치 방식 — 녹음 완료 후 "변환하기" 클릭 시 일괄 변환 |
| Whisper 모델 | `whisper-medium` (~750MB) — 한국어 인식률 최적 |
| STT 실행 위치 | Main Process (Node.js) — Renderer/Worker에서 `require('fs')` 불가 문제 해결 |
| LLM 방식 | 외부 API (Ollama/OpenAI/Claude) — WebGPU WebLLM 대체 (하드웨어 의존성 제거) |
| LLM 설정 저장 | `localStorage` — `{ provider, url, apiKey, model }` |
