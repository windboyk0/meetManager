---
author: Kim Jeong-woong
date: 2026-04-17
description: Speech-to-Text (STT) Meeting Assistant with Bulleted Summaries
status: In Progress
---

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

회의 중 음성을 녹음하고, **로컬 Whisper STT**로 텍스트 변환 후 **외부 LLM(Ollama / OpenAI / Claude)**으로 개조식 요약하여 `.txt`로 저장하는 Electron 데스크톱 앱입니다.

- STT: 완전 오프라인 (Main Process Node.js에서 Whisper 실행)
- 요약: 설정에 따라 Ollama(로컬) 또는 클라우드 API 선택 가능

자세한 설계는 [implementation_plan.md](./implementation_plan.md) 참조.

## 기술 스택

- **Framework**: Electron + Vite + React + TypeScript
- **Styling**: Vanilla CSS (Premium Dark Mode, Glassmorphism)
- **STT**: `@xenova/transformers` — `Xenova/whisper-medium` 모델, **Main Process(Node.js)** 실행
- **요약 LLM**: Ollama(로컬 서버) / OpenAI API / Claude API — 앱 내 ⚙️ 설정에서 선택

## 빌드 & 실행

```powershell
# 의존성 설치 (최초 1회)
cd meetManager
npm install

# 개발 실행 (Hot Reload)
npm run dev

# Windows 패키징 (release/{version}/ 에 .exe 인스톨러 생성)
npm run build
```

## 아키텍처

### 프로세스 구조

```
Main Process (Node.js)
  └─ IPC: whisper-load    → @xenova/transformers 파이프라인 초기화 (Node.js 네이티브)
  └─ IPC: whisper-transcribe → Float32Array 수신 → Whisper 추론 → 텍스트 반환
  └─ IPC: save-file       → dialog.showSaveDialog + fs.writeFile (.txt)
  └─ IPC: save-audio      → dialog.showSaveDialog + fs.writeFile (.webm)
  └─ Event: stt-progress / stt-ready / stt-error → Renderer로 push

Renderer Process (React)
  ├─ AILoadingBar     — Whisper 모델 최초 다운로드 & 초기화 진행 바
  ├─ SpeechRecorder   — MediaRecorder 녹음 → Float32Array 변환 → IPC로 전달, 텍스트 편집 가능
  ├─ SummaryBoard     — 외부 LLM 요약 트리거 + 스트리밍 결과 렌더링, 텍스트 편집 가능
  └─ SettingsModal    — LLM 제공자(Ollama/OpenAI/Claude) + URL/Key/모델 설정
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
| `save-file` | Renderer → Main | 회의록 텍스트 저장 (.txt) |
| `save-audio` | Renderer → Main | 녹음 파일 저장 (.webm) |

## 디렉토리 구조

```
meetManager/
├── package.json
├── vite.config.ts                 # Vite + Electron 통합 설정
├── index.html                     # CSP: unsafe-eval, wasm-unsafe-eval 포함
├── electron/
│   ├── main/index.ts              # BrowserWindow 생성, Whisper 파이프라인, 모든 IPC 핸들러
│   └── preload/index.ts           # contextBridge: window.electronAPI 전체 API 노출
└── src/
    ├── electron.d.ts              # window.electronAPI 타입 선언
    ├── components/
    │   ├── AILoadingBar.tsx       # Whisper 모델 다운로드/초기화 프로그레스 바
    │   ├── SpeechRecorder.tsx     # MediaRecorder 녹음 + STT 결과 편집 가능 textarea
    │   ├── SummaryBoard.tsx       # 외부 LLM 요약 + 결과 편집 가능 textarea + 저장 버튼
    │   └── SettingsModal.tsx      # LLM 제공자/URL/Key/모델 설정 모달
    ├── services/
    │   └── llm.ts                 # Ollama/OpenAI/Claude 스트리밍 요약, localStorage 설정 관리
    ├── App.tsx
    ├── App.css
    └── index.css
```

## 컴포넌트 & 서비스 역할

| 파일 | 역할 |
|---|---|
| `App.tsx` | 전체 상태 관리 (`transcript`, `summary`, `isRecording`, `isTranscribing`, `isLoadingSummary`) |
| `AILoadingBar.tsx` | Whisper 모델 다운로드 진행률 표시 (sttProgress === 100 시 숨김) |
| `SpeechRecorder.tsx` | MediaRecorder 제어, audio/webm Blob → Float32Array 변환, STT 결과 편집 가능 textarea, 내용 초기화·오디오 저장 버튼, 외부 오디오 파일 업로드 STT |
| `SummaryBoard.tsx` | `[AI 요약]` 버튼, 외부 LLM 스트리밍 요약, 결과 편집 가능 textarea, 텍스트 저장 버튼 |
| `SettingsModal.tsx` | LLM 제공자(Ollama/OpenAI/Claude) 선택 + URL/API Key/모델명 입력, localStorage 저장 |
| `services/llm.ts` | `LLMSettings` 로드/저장, Ollama NDJSON · OpenAI SSE · Claude SSE 스트리밍 요약 |
| `electron/main/index.ts` | BrowserWindow 생성 + `@xenova/transformers` Whisper 파이프라인 + 모든 IPC 핸들러 |
| `electron/preload/index.ts` | contextBridge로 `window.electronAPI` (whisperLoad/Transcribe/onStt*/saveFile/saveAudio) 노출 |

## 핵심 규칙

- **STT 동작 방식**: 실시간 스트리밍 X → "녹음 중지 시 전체 Blob 일괄 변환" 배치 방식. 장시간 오디오는 Float32Array를 30초 chunk로 분할 → 순차 IPC 호출 → 텍스트 누적 (UI 블로킹 방지)
- **CSP 필수**: `index.html`에 `'unsafe-eval' 'wasm-unsafe-eval'` 없으면 Wasm 엔진 동작 불가
- **Whisper 모델 캐시**: 최초 다운로드 ~750MB — `app.getPath('userData')/hf-cache`에 저장, 재실행 시 스킵
- **LLM 설정 저장**: `localStorage`에 `{ provider, url, apiKey, model }` 형태로 저장, 기본값 Ollama
- **저장 버튼**: 요약 결과 존재 시에만 활성화
- **상태 관리**: `useState` / `useRef` 만 사용 (전역 상태 라이브러리 없음)

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
