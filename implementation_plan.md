# 회의 녹취 및 요약 데스크톱 애플리케이션 (STT Meeting Assistant)

**100% 오프라인 & 완전 무료 온디바이스(Local) AI 아키텍처** 구현 설계안입니다.  
외부 API 통신 없이 PC 내부 자원(CPU, GPU)만을 사용하여 녹음 · STT 변환 · sLLM 요약을 모두 자체 수행합니다.

## ⚠️ 초기 실행 안내

- **모델 다운로드:** 앱 최초 실행 시 Whisper 음성인식 모델(약 100~300MB)과 요약용 sLLM(예: `gemma-2b-it-q4f16_1-MLC`, 약 2~5GB)이 Electron 캐시에 한 번 다운로드됩니다. 이후 실행 시에는 스킵됩니다.
- **PC 사양:** sLLM은 WebGPU(그래픽카드)를 통해 구동됩니다. WebGPU 미지원 또는 사양 부족 시 구동 불가 또는 매우 느릴 수 있습니다.
- **STT 방식:** 실시간 스트리밍이 아닌 **"녹음 중지 시 전체 Blob 일괄 변환"** 배치 방식 — 연산 과부하 방지.

---

## 기술 스택

| 분류 | 선택 |
|---|---|
| Framework | Electron + Vite + React + TypeScript |
| Styling | Vanilla CSS (Premium Dark Mode, Glassmorphism) |
| 로컬 STT | `@xenova/transformers` — `whisper-tiny` 모델, Web Worker 기반 |
| 로컬 sLLM | `@mlc-ai/web-llm` — `gemma-2b-it-q4f16_1-MLC`, WebGPU 구동 |

---

## 프로세스 아키텍처

```
Main Process (Node.js)
  └─ WebGPU 하드웨어 가속 플래그 주입 (enable-unsafe-webgpu 등)
  └─ IPC save-file → dialog.showSaveDialog + fs.writeFile

Renderer Process (React)
  ├─ AILoadingBar     — STT/sLLM 모델 최초 다운로드 & 초기화 진행 바
  ├─ SpeechRecorder   — MediaRecorder 녹음 → Web Worker로 Whisper STT
  └─ SummaryBoard     — WebLLM 스트리밍 요약 + 저장 버튼

Web Worker (whisper.worker.ts)
  └─ @xenova/transformers Whisper 파이프라인 (메인 스레드 블로킹 방지)
```

**IPC 채널:** `save-file`
- 페이로드: `{ transcript: string, summary: string }`
- 반환: `{ success: boolean, filePath?: string }`

---

## 구현 상세

### 1. 패키지 설정

```bash
npm install @xenova/transformers @mlc-ai/web-llm
```

`vite.config.ts` 필수 설정 (수정 금지):

| 옵션 | 이유 |
|---|---|
| `resolve.conditions: ['browser']` | `@xenova/transformers` 브라우저 빌드 강제 |
| `define: { 'process.versions.node': 'undefined' }` | IS_NODE 감지 차단 |
| `optimizeDeps.exclude: ['@xenova/transformers', 'onnxruntime-web']` | WASM 경로 보호 + dep optimizer 충돌 방지 |
| `worker.format: 'es'` | Web Worker ES Module 형식 |
| `mock-node-builtins` 플러그인 | `onnxruntime-web`의 `require('fs')` throwing stub 문제 해결 — 가짜 ESM 모듈 제공. `node:fs` 등 prefixed 형태는 제외(Electron main 충돌 방지) |

### 2. CSP 설정

`index.html`에 `'unsafe-eval' 'wasm-unsafe-eval'` 필수 — 없으면 Wasm 엔진 동작 불가.

### 3. 핵심 기능

#### A. AI 모델 로딩 바 (AILoadingBar)
- 앱 최초 진입 시 STT/sLLM 모델 다운로드 진행률(%)을 프로그레스 바로 표시
- 에러 발생 시 dismiss 버튼으로 닫을 수 있음 (progress=100 처리)

#### B. 로컬 STT (SpeechRecorder + whisper.worker.ts)
- `MediaRecorder`로 `audio/webm` Blob 녹음
- 녹음 완료 후 "녹음 듣기(재생)" + "변환하기" 버튼 표시
- "변환하기" 클릭 시 Blob → `Float32Array` 변환 → Web Worker → Whisper 추론 → 텍스트 반환
- 녹음 중/마이크 테스트 중 실시간 음성 레벨 미터 표시

#### C. 오프라인 sLLM 요약 (SummaryBoard + llm.ts)
- `[로컬 AI로 요약하기]` 버튼 클릭 시 WebLLM 엔진 호출
- STT 텍스트 + 개조식 요약 프롬프트 → `chat.completions.create` 스트리밍
- WebGPU VRAM 연산, 타이핑 효과로 즉시 렌더링

#### D. 파일 저장
- `window.electronAPI.saveFile({ transcript, summary })` → IPC `save-file` → `dialog.showSaveDialog` → `.txt` 저장

---

## 실제 디렉토리 구조

```
meetManager/
├── package.json
├── vite.config.ts                 # Vite + Electron 통합 설정 (핵심 설정 포함)
├── index.html                     # CSP: unsafe-eval, wasm-unsafe-eval
├── electron/
│   ├── main/index.ts              # BrowserWindow, save-file IPC 핸들러
│   └── preload/index.ts           # contextBridge: window.electronAPI.saveFile
└── src/
    ├── worker/
    │   └── whisper.worker.ts      # Whisper 추론 Web Worker
    ├── components/
    │   ├── AILoadingBar.tsx       # 모델 다운로드 진행 바
    │   ├── SpeechRecorder.tsx     # 녹음 + STT 결과 표시
    │   └── SummaryBoard.tsx       # WebLLM 요약 + 저장
    ├── services/
    │   └── llm.ts                 # WebLLM 싱글턴 초기화 + 요약
    ├── App.tsx
    ├── App.css
    └── index.css
```

> `src/services/openai.ts` — 미사용 레거시, 삭제 예정

---

## 결정 사항 (Open Questions 해소)

| 질문 | 결정 |
|---|---|
| sLLM 모델 크기 | 2B 이하 — `gemma-2b-it-q4f16_1-MLC` 또는 `Qwen2-1.5B-Instruct-q4f16_1-MLC` |
| STT 동작 타이밍 | 배치 방식 — 녹음 완료 후 수동으로 "변환하기" 버튼 클릭 시 일괄 변환 |
