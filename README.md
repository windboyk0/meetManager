# meetManager v1.0

오프라인 로컬 AI 회의록 앱 — 네트워크 패킷 유출 제로!

## 개요

회의 중 음성을 녹음하고, 로컬 Whisper STT로 텍스트 변환 후 외부 LLM(Ollama / OpenAI / Claude)으로 개조식 요약하여 `.txt`로 저장하는 Electron 데스크톱 앱입니다.

- **STT**: 완전 오프라인 (Whisper medium 모델, Main Process Node.js에서 실행)
- **요약**: Ollama(로컬) 또는 OpenAI / Claude API 선택 가능

## 기술 스택

- **Framework**: Electron + Vite + React + TypeScript
- **Styling**: Vanilla CSS (Dark Mode, Glassmorphism)
- **STT**: `@xenova/transformers` — `Xenova/whisper-medium` (~750MB)
- **요약 LLM**: Ollama / OpenAI API / Claude API

## 빌드 & 실행

```powershell
# 의존성 설치 (최초 1회)
npm install

# 개발 실행 (Hot Reload)
npm run dev

# Windows 패키징 (release/{version}/ 에 .exe 인스톨러 생성)
npm run build
```

## 디렉토리 구조

```
meetManager/
├── electron/
│   ├── main/index.ts       # Whisper 파이프라인 + IPC 핸들러
│   └── preload/index.ts    # contextBridge API 노출
└── src/
    ├── components/
    │   ├── AILoadingBar.tsx     # Whisper 로딩 진행 바
    │   ├── SpeechRecorder.tsx   # 녹음 + STT
    │   ├── SummaryBoard.tsx     # LLM 요약
    │   └── SettingsModal.tsx    # LLM 설정
    └── services/
        └── llm.ts               # Ollama/OpenAI/Claude 스트리밍
```

## 주요 기능

- 음성 녹음 및 로컬 STT 변환 (Whisper medium, 한국어 최적화)
- 마이크 테스트 / 녹음 파일 저장 / 녹음 재생
- 외부 LLM 연동 개조식 요약 (Ollama / OpenAI / Claude)
- 녹취 텍스트 & 요약 텍스트 직접 편집 가능
- 회의록 `.txt` 저장

---

made by 김정웅
