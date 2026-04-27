---
author: Kim Jeong-woong
date: 2026-04-17
description: Speech-to-Text (STT) Meeting Assistant with Bulleted Summaries
status: In Progress
---

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

회의 중 음성을 녹음하고, 온디바이스 AI(Whisper + sLLM)를 통해 **완전 오프라인**으로 텍스트 변환(STT) 및 개조식 요약 후 `.txt`로 저장하는 Electron 데스크톱 앱입니다. 외부 API 통신 없이 PC 내부 자원(CPU/GPU)만 사용합니다.

자세한 설계는 [implementation_plan.md](./implementation_plan.md) 참조.

## 기술 스택

- **Framework**: Electron + Vite + React + TypeScript (`electron-vite`)
- **Styling**: Vanilla CSS (Premium Dark Mode, Glassmorphism, 모델 로딩 프로그레스바)
- **로컬 STT**: `@xenova/transformers` (Hugging Face) — `whisper-tiny` / `whisper-small` 모델, Web Worker 기반
- **로컬 sLLM**: `@mlc-ai/web-llm` — `gemma-2b-it-q4f16_1-MLC` 등 초경량 모델, WebGPU 구동

## 빌드 & 실행

```bash
# 초기 설정 (최초 1회)
npm create @quick-start/electron meetManager -- --template react-ts
cd meetManager
npm install
npm install @xenova/transformers @mlc-ai/web-llm

# 개발 실행 (Hot Reload)
npm run dev

# 프로덕션 빌드
npm run build

# Windows 패키징
npm run build:win
```

## 아키텍처

### 프로세스 구조

```
Main Process (Node.js)
  └─ WebGPU 하드웨어 가속 옵션 주입 (enable-unsafe-webgpu)
  └─ IPC: whisper-load    → @xenova/transformers 파이프라인 초기화 (Node.js 네이티브)
  └─ IPC: whisper-transcribe → Float32Array 수신 → Whisper 추론 → 텍스트 반환
  └─ IPC: save-file       → dialog.showSaveDialog + fs.writeFile
  └─ Event: stt-progress / stt-ready / stt-error → Renderer로 push

Renderer Process (React)
  ├─ AILoadingBar     — STT/sLLM 모델 최초 다운로드 & 초기화 진행 바
  ├─ SpeechRecorder   — MediaRecorder 녹음 → Float32Array 변환 → IPC로 전달
  └─ SummaryBoard     — WebLLM 요약 트리거 + 스트리밍 결과 렌더링
```

> **Web Worker 제거됨** — Renderer/Worker 컨텍스트에서는 `require('fs')` 문제로 `@xenova/transformers` 구동 불가. Main Process(Node.js)로 이전하여 해결.

**IPC 채널:**

| 채널 | 방향 | 설명 |
|---|---|---|
| `whisper-load` | Renderer → Main | Whisper 모델 로딩 시작 |
| `whisper-transcribe` | Renderer → Main | ArrayBuffer 전달, 텍스트 반환 |
| `stt-progress` | Main → Renderer | 모델 다운로드 진행률 |
| `stt-ready` | Main → Renderer | 모델 준비 완료 |
| `stt-error` | Main → Renderer | 로딩/추론 에러 |
| `save-file` | Renderer → Main | 회의록 저장 |

## 디렉토리 구조

```
meetManager/
├── package.json
├── vite.config.ts                 # Vite + Electron 통합 설정
├── index.html                     # CSP: unsafe-eval, wasm-unsafe-eval 포함
├── electron/
│   ├── main/index.ts              # BrowserWindow 생성, save-file IPC 핸들러
│   └── preload/index.ts           # contextBridge: window.electronAPI.saveFile
└── src/
    ├── electron.d.ts              # window.electronAPI 타입 선언
    ├── components/
    │   ├── AILoadingBar.tsx       # 모델 다운로드/초기화 프로그레스 바
    │   ├── SpeechRecorder.tsx     # MediaRecorder 녹음 + STT 결과 표시
    │   └── SummaryBoard.tsx       # WebLLM 요약 트리거 + 저장 버튼
    ├── services/
    │   ├── llm.ts                 # WebLLM 인스턴스 초기화 + 요약 로직
    │   └── openai.ts              # ⚠️ 미사용 레거시 파일 (삭제 대상)
    ├── App.tsx
    ├── App.css
    └── index.css
```

## 컴포넌트 & 서비스 역할

| 파일 | 역할 |
|---|---|
| `App.tsx` | 전체 상태 관리 (`transcript`, `summary`, `isRecording`, `isLoading`) |
| `AILoadingBar.tsx` | STT·sLLM 모델 다운로드 퍼센트 콜백 수신 + 프로그레스 바 렌더링 |
| `SpeechRecorder.tsx` | MediaRecorder 제어, audio/webm Blob → Float32Array 변환, STT 결과 누적 출력 |
| `SummaryBoard.tsx` | `[로컬 AI로 요약하기]` 버튼, WebLLM 스트리밍 요약, 저장 버튼 |
| `services/llm.ts` | WebLLM 엔진 싱글턴 초기화 + `chat.completions.create` 스트리밍 요약 |
| `electron/main/index.ts` | BrowserWindow 생성 + Whisper 파이프라인 + IPC 핸들러 |
| `electron/preload/index.ts` | contextBridge로 `window.electronAPI.saveFile` 노출 |

## 핵심 규칙

- **STT 동작 방식**: 실시간 스트리밍 X → "녹음 중지 시 전체 Blob 일괄 변환" 배치 방식 (연산 과부하 방지)
- **CSP 필수**: `index.html`에 `'unsafe-eval' 'wasm-unsafe-eval'` 없으면 Wasm 엔진 동작 불가
- **모델 최초 다운로드**: Whisper ~750MB + sLLM 2~5GB — `app.getPath('userData')/hf-cache`에 저장, 재실행 시 스킵
- **sLLM 모델 선택**: VRAM 한계상 2B 이하 권장 (`gemma-2b-it-q4f16_1-MLC` 또는 `Qwen2-1.5B-Instruct-q4f16_1-MLC`)
- **저장 버튼**: 요약 결과 존재 시에만 활성화
- **상태 관리**: `useState` / `useRef` 만 사용 (전역 상태 라이브러리 없음)
- **OpenAI 관련 코드 전면 제거**: `ApiKeyModal`, `services/openai.ts`, `webkitSpeechRecognition` 삭제 대상

## vite.config.ts 핵심 설정 (건드리지 말 것)

| 설정 | 이유 |
|---|---|
| `resolve.conditions: ['browser']` | `@xenova/transformers` Node.js 빌드 대신 브라우저 빌드 강제 선택 |
| `resolve.mainFields: ['browser', 'module', 'main']` | 동일 목적 |
| `define: { 'process.versions.node': 'undefined' }` | `@xenova/transformers`의 IS_NODE 감지를 false로 강제 |
| `optimizeDeps.exclude: ['@xenova/transformers', 'onnxruntime-web']` | WASM 동적 import 경로 깨짐 방지 + dep optimizer가 require('fs') 먼저 변환하는 것 차단 |
| `worker.format: 'es'` | Web Worker를 ES Module로 번들 |
| `mock-node-builtins` 플러그인 (enforce: 'pre') | `onnxruntime-web`의 `require('fs')` 등 CJS 호출을 Vite throwing stub 대신 가짜 ESM 모듈로 해소. **`'node:fs'` 같은 prefixed 형태는 목록에서 제외** — Electron main의 `import path from 'node:path'` 등과 충돌하므로. |

---

## 기능 요청 이력

### 2026-04-17 / 사용자
**요청 내용:**
- 변환 후 새 녹음 시작 시 이전 텍스트가 남아있어 초기화 버튼 필요
- 녹음 완료 후 "녹음 듣기"와 "변환하기" 사이에 녹음 파일 다운로드 버튼 추가

**구현 위치:**
- `SpeechRecorder.tsx` — card-header에 `🗑 내용 초기화` 버튼 (transcript 있을 때만 표시), mic-check-bar에 `💾 파일 저장` 버튼 (녹음 완료 후 표시)
- `electron/main/index.ts` — `save-audio` IPC 핸들러 (dialog.showSaveDialog → .webm 저장)
- `electron/preload/index.ts` — `saveAudio` API 노출
- `src/electron.d.ts` — `saveAudio` 타입 추가
- `App.tsx` — `onClearTranscript={() => setTranscript('')}` prop 전달

### 2026-04-17 / 사용자
**요청 내용:**
- 한국어 인식률이 낮음 (`whisper-tiny` 한계)

**구현:**
- `electron/main/index.ts` — `Xenova/whisper-tiny` → `Xenova/whisper-medium` 변경 (~750MB, 한국어 정확도 대폭 개선)

### 2026-04-17 / 사용자
**요청 내용:**
- WebLLM(Gemma-2B WebGPU) 제거 → 외부 LLM 서버 연동으로 교체
- 제공자 선택 가능: Ollama(로컬), OpenAI API, Claude API
- 설정 변경 가능 (URL, API Key, 모델명)

**구현:**
- `src/services/llm.ts` — 완전 재작성. Ollama/OpenAI/Claude 스트리밍 지원. `localStorage`에 설정 저장
- `src/components/SettingsModal.tsx` — 신규. 제공자 선택 + URL/Key/모델 입력
- `src/components/AILoadingBar.tsx` — LLM 로딩 바 제거 (Ollama/API는 로딩 불필요)
- `App.tsx` — `initLLM` 제거, ⚙️ 설정 버튼 + SettingsModal 추가
- `App.css` — `.btn-settings`, `.settings-provider-*`, `.settings-field` 스타일 추가

### 2026-04-17 / 사용자
**요청 내용:**
- "로컬 AI로 요약" 버튼 텍스트 → "AI 요약"으로 변경
- 음성 녹취 텍스트 및 AI 요약 텍스트 모두 직접 편집 가능하게 변경

**구현:**
- `SummaryBoard.tsx` — 버튼 텍스트 변경, summary div → `<textarea className="editable-textarea">`, `onSummaryChange` prop 추가
- `SpeechRecorder.tsx` — transcript div → `<textarea className="editable-textarea">`, `onTranscriptChange` prop 추가 (변환 중엔 readOnly)
- `App.tsx` — `onTranscriptChange={setTranscript}`, `onSummaryChange={setSummary}` prop 전달
- `App.css` — `.editable-textarea` 스타일 추가
