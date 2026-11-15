# Muse Elastic Planner

기존 Supabase 프로젝트(`agent-api` Edge Function)의 `/v1/schedules` 엔드포인트와 연동되는 **GitHub Pages용 정적 일간 타임라인 웹앱**입니다.  
한국 시간(`Asia/Seoul`, UTC+9) 기준으로 일정을 세로 타임라인에 표시하며, 현재 시각 강조(`NOW`), 지난 일정 흐리게 표시, 알림(`reminder`) 하이라이트, 드래그 앤 드롭 시간 변경, 완료 체크(`PATCH`), 날짜 전환, 일정 추가·삭제를 지원합니다.

---

## 1. 프로젝트 구조

```text
muse-planner/
├── index.html                   # 3단 Single-Viewport 타임라인 웹앱
├── css/style.css                # 다크/라이트 테마 및 타임라인/알림/체크박스 스타일
├── js/api.js                    # /v1/schedules REST 클라이언트 & KST 변환 어댑터
├── js/app.js                    # 인터랙티브 타임라인 · 완료 체크 · 모달 엔진
├── js/config.example.js         # 로컬 분리 설정 예시 (실제 비밀값은 포함하지 않음)
├── backend/
│   ├── schedules.sql            # Supabase Postgres `schedules` 테이블 마이그레이션 SQL
│   └── agent-api-index.ts       # `agent-api` Edge Function 전체 코드 (/v1/schedules 포함)
└── README.md
```

---

## 2. API 주소 및 인증 토큰 보안 분리 방법

정적 웹앱은 GitHub Pages 공개 저장소에 배포되므로, **API Base URL과 Bearer 토큰을 소스 코드(`index.html`, `js/api.js`, `js/config.example.js`)에 직접 넣지 않고 완전히 분리**했습니다.

1. **GitHub Pages 사용 시 (권장 — `localStorage` 분리)**
   - 웹앱 우측 상단 설정 배지(`로컬 모드` / `Agent API`)를 클릭합니다.
   - `가계부 통합 Agent API`를 선택한 뒤 본인의 **API Base URL**과 **Bearer 토큰**을 입력합니다.
   - 입력값은 사용자의 브라우저 `localStorage`(`muse_planner_api_settings_v2`)에만 저장되므로 GitHub 저장소나 빌드 결과물에 노출되지 않습니다.
2. **로컬 개발 시 (`.gitignore` 분리)**
   - `.gitignore`에 `js/config.local.js`, `*.local.js`, `.env`, `.env.*`가 등록되어 있습니다.
   - 로컬 테스트 시 `js/config.example.js`를 참고하되, 실제 키나 `.env` 파일은 절대 커밋하지 않습니다.

---

## 3. Supabase 연동 규격 (`agent-api`)

- `GET /v1/schedules?date=YYYY-MM-DD`: 해당 날짜(`date` 생략 시 KST 오늘)의 일정 배열 조회 (`start_at` 오름차순, `null` 뒤로)
- `GET /v1/schedules?from=YYYY-MM-DD&to=YYYY-MM-DD`: 기간 조회
- `POST /v1/schedules`: 일정 등록 (`201`)
- `PATCH /v1/schedules/:id`: 부분 수정 및 완료 체크 (`done: true` 시 `done_at` 자동 기록, `false` 시 `null`)
- `DELETE /v1/schedules/:id`: 일정 삭제 (`204`)


## 월간 리포트

플래너 상단의 📊 버튼 또는 `stats.html`에서 월간 리포트를 엽니다. 별도 빌드 없이 기존 정적 서버에서 실행하며 동일한 로그인 세션·로컬 데이터·테마 설정을 사용합니다.

- 월 선택, 날짜별 완료 현황, 날짜 상세, 주간 완료 추이, 지난 날짜 미완료 목록을 제공합니다.
- 한국 시간의 배치 날짜를 기준으로 오늘까지의 일정·할 일을 집계합니다. 미래 일정·알림·날짜 없는 백로그는 핵심 지표에서 제외합니다.
- 일정 완료 추적을 끄면 완료율에는 할 일만 포함됩니다. 시간 합계는 실제 작업 시간이 아닌 배정된 계획 시간이며 겹치는 항목도 각각 더합니다.
- 날짜 상세와 미완료 항목에서 `index.html?date=YYYY-MM-DD`로 해당 날짜의 플래너를 열 수 있습니다.
- 기록을 수정·이동·삭제하면 과거 통계도 달라집니다. 로컬 모드는 현재 브라우저의 기록만 표시합니다.
