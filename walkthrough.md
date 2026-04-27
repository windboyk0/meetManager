# STT Meeting Assistant (meetManager) 구현 현황

## ✅ 완료된 구현

### 1. 오프라인 아키텍처 전환
- `webkitSpeechRecognition` (Web Speech API) 및 OpenAI API 연동 코드 전면 제거
- `@xenova/transformers` (Whisper STT) + `@mlc-ai/web-llm` (Gemma-2B sLLM) 으로 교체
- 외부 네트워크 0% — 완전 오프라인 동작

### 2. Vite 설정 (`vite.config.ts`)
- `resolve.conditions: ['browser']` + `process.versions.node: undefined` — `@xenova/transformers` Node.js 코드 경로 차단
- `optimizeDeps.exclude` — WASM 동적 import 경로 보호
- `mock-node-builtins` 플러그인 — `onnxruntime-web`의 `require('fs')` throwing stub 충돌 해결
- `worker.format: 'es'` — Web Worker ES Module 번들

### 3. AI 모델 로딩 바 (AILoadingBar)
- 앱 최초 실행 시 Whisper + sLLM 모델 다운로드 진행률 표시
- 에러 발생 시 dismiss 버튼 (freeze 방지)

### 4. 음성 녹음 (SpeechRecorder)
- MediaRecorder로 `audio/webm` 녹음
- 녹음 중 실시간 음성 레벨 미터 (빨강/노랑/회색)
- `● REC` 블링크 인디케이터
- 녹음 완료 후 **"녹음 듣기"** + **"변환하기"** 버튼 (자동 변환 X)
- 녹음 전 마이크 테스트 기능 (레벨 미터 공유)

### 5. Whisper STT (Main Process)
- **Renderer/Worker → Main Process 이전** (Node.js 네이티브 환경, `require('fs')` 이슈 없음)
- `electron/main/index.ts`에 파이프라인 + IPC 핸들러 (`whisper-load`, `whisper-transcribe`)
- 진행률은 `win.webContents.send('stt-progress/ready/error')` 로 Renderer에 push
- 모델 캐시: `app.getPath('userData')/hf-cache` (파일시스템)
- `src/worker/whisper.worker.ts` 삭제됨

### 6. sLLM 요약 (SummaryBoard + llm.ts)
- WebGPU 사전 체크 (`navigator.gpu`, `requestAdapter`)
- `gemma-2b-it-q4f16_1-MLC` WebGPU 스트리밍 요약
- 결과 존재 시에만 저장 버튼 활성화

### 7. 파일 저장
- IPC `save-file` → `dialog.showSaveDialog` → `.txt`
- 내용: `[회의 녹취 내용]` + `[회의 요약]`

### 8. UI/UX
- 창 크기 1280×900 (최소 900×600)
- Premium Dark Mode + Glassmorphism
- 한국어 터미널 인코딩 (`chcp 65001`)

---

## ⏳ 미해결 / 테스트 대기

| 이슈 | 상태 |
|---|---|
| Whisper STT "Dynamic require of 'fs' is not supported" | ✅ Main Process 이전으로 해결 |
| Gemma-2B WebGPU "shader-f16 not enabled" | 하드웨어 문제 (집 PC GPU로 재테스트 필요) |
| `src/services/openai.ts` 삭제 | 미사용 레거시, 삭제 예정 |

---

## ▶️ 실행 방법

```powershell
cd meetManager
# Vite 캐시 초기화 (설정 변경 후)
Remove-Item -Recurse -Force node_modules\.vite -ErrorAction SilentlyContinue
npm run dev
```
