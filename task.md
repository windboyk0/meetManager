# STT Meeting Assistant (meetManager) 작업 목록

- `[x]` 1. 프로젝트 초기화 및 환경 구성
  - `[x]` 1-1. `npm create @quick-start/electron` 템플릿으로 프로젝트 생성
  - `[x]` 1-2. 필수 패키지(`openai` 등) 설치
- `[x]` 2. IPC 통신 레이어 구현 (Main & Preload)
  - `[x]` 2-1. `src/preload/index.ts`에 `window.electronAPI.saveFile` 노출
  - `[x]` 2-2. `src/main/index.ts`에 `save-file` 핸들러 및 `dialog.showSaveDialog` 연동
- `[x]` 3. React UI 컴포넌트 개발
  - `[x]` 3-1. `SpeechRecorder` (Web Speech API 연동 실시간 STT)
  - `[x]` 3-2. `SummaryBoard` (요약 요청 및 결과 렌더링 영역)
  - `[x]` 3-3. `ApiKeyModal` (OpenAI Key 입력 모달 및 localStorage 관리)
- `[x]` 4. API 및 로직 통합
  - `[x]` 4-1. `services/openai.ts` 추상화 및 텍스트 요약 프롬프트 적용
  - `[x]` 4-2. `App.tsx`에서 전체 상태 관리 연동
- `[x]` 5. 스타일링 및 마무리
  - `[x]` 5-1. Premium Dark Mode & Glassmorphism 전역 CSS (`App.css`, `index.css`)
  - `[x]` 5-2. `npm run dev` 실행 및 기능 정상 동작 확인
