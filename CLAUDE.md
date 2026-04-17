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
  └─ IPC: save-file → dialog.showSaveDialog + fs.writeFile

Renderer Process (React)
  ├─ AILoadingBar     — STT/sLLM 모델 최초 다운로드 & 초기화 진행 바
  ├─ SpeechRecorder   — MediaRecorder 녹음 → Float32Array 변환 → Web Worker로 STT
  └─ SummaryBoard     — WebLLM 요약 트리거 + 스트리밍 결과 렌더링

Web Worker (whisper.worker.ts)
  └─ @xenova/transformers Whisper 파이프라인 (메인 스레드 블로킹 방지)
```

**IPC 채널:** `save-file`
- 페이로드: `{ transcript: string, summary: string }`
- 반환: `{ success: boolean, filePath?: string }`

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
    ├── worker/
    │   └── whisper.worker.ts      # Whisper 추론 (Web Worker)
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
| `worker/whisper.worker.ts` | @xenova/transformers Whisper 파이프라인 (백그라운드 추론) |
| `electron/main/index.ts` | BrowserWindow 생성 + `save-file` IPC 핸들러 |
| `electron/preload/index.ts` | contextBridge로 `window.electronAPI.saveFile` 노출 |

## 핵심 규칙

- **STT 동작 방식**: 실시간 스트리밍 X → "녹음 중지 시 전체 Blob 일괄 변환" 배치 방식 (연산 과부하 방지)
- **CSP 필수**: `index.html`에 `'unsafe-eval' 'wasm-unsafe-eval'` 없으면 Wasm 엔진 동작 불가
- **모델 최초 다운로드**: Whisper 100~300MB + sLLM 2~5GB — Electron 캐시에 저장, 재실행 시 스킵
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
