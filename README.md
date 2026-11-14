# Muse Elastic Planner

**GitHub Pages**에 그대로 올려서 쓰는 정적 커스텀 일정 관리 웹앱입니다.  
**드래그 앤 드롭 이동**, **상/하단 가장자리 시간 늘이기·줄이기(리사이즈)**, **연쇄 밀기(Cascade)**, **지금 하는 일(NOW) 실시간 하이라이트**, **완료 체크**, **유튜브 볼 리스트** 같은 커스텀 위젯을 지원합니다.

---

## 1. 프로젝트 구조

```text
muse-planner/
├── index.html                 # Single-Viewport 3단 대시보드 정적 페이지
├── css/style.css              # 다크/라이트 테마 및 인터랙티브 타임라인 스타일
├── js/api.js                  # 로컬 / Google Calendar / GAS / Supabase 통합 어댑터
├── js/app.js                  # 드래그, 리사이즈, 연쇄 밀기, 재정렬, 위젯 엔진
├── backend/
│   ├── gas-code.gs            # Google Apps Script (구글 캘린더 + 시트 통합 API)
│   └── supabase-schema.sql    # Supabase Postgres 테이블 생성 SQL
└── README.md
```

---

## 2. 데이터 소스 선택 가이드

우측 상단 **`로컬 모드 / API 설정`** 버튼에서 언제든지 데이터 소스를 바꿀 수 있습니다.

1. **Google Apps Script (GAS) 자체 API — ⭐ 가장 추천**
   - **장점**: GAS 내부의 `CalendarApp`으로 **구글 캘린더의 오늘 확정 일정을 별도 OAuth 토큰 만료 없이 자동으로 읽어오면서**, 동시에 구글 시트에 **완료 체크(`done`), 고정(`pinned`), 보류함(`staged`), 유튜브 볼 리스트(`youtubeList`), 메모(`memo`)**를 함께 저장할 수 있습니다.
   - **설정 방법**:
     1. Google Sheets 새 문서를 만들고 `[확장 프로그램] -> [Apps Script]` 열기
     2. `backend/gas-code.gs` 내용 붙여넣기 (필요시 `API_TOKEN` 설정)
     3. `[배포] -> [새 배포] -> 웹 앱` (`액세스 권한: 모든 사용자`) 배포 후 URL 복사
     4. 웹앱 설정 모달에서 `GAS` 선택 후 URL 붙여넣기

2. **Google Calendar API + Google Tasks API 직접 연동**
   - **장점**: 백엔드 구축 없이 `GET /calendars/primary/events?timeMin=...&timeMax=...`로 즉시 조회합니다.
   - **참고**: 완료 체크, 유튜브 리스트 등 캘린더에 없는 커스텀 필드는 브라우저 `localStorage`에 병합 저장됩니다.

3. **Supabase REST API**
   - `backend/supabase-schema.sql`을 Supabase SQL Editor에서 실행한 뒤 Project URL과 Anon Key를 입력해 사용합니다.

---

## 3. GitHub Pages 배포 방법

별도의 빌드(`npm run build` 등)가 필요 없는 순수 정적 웹앱입니다.

1. 이 폴더(`muse-planner`)의 파일들을 GitHub 저장소에 push
2. GitHub Repository `Settings` -> `Pages` -> `Deploy from a branch` (`main` / `/ (root)`) 선택
3. 발급된 `https://<username>.github.io/<repo>/` 주소로 접속

---

## 4. Muse에게 전달할 API 호출 규격 (GAS 기준)

Muse가 일정을 새로 넣거나 유튜브 볼 리스트를 추가할 때 아래 JSON으로 `POST` 요청을 보내도록 지정할 수 있습니다.

### ① 일정 추가/수정 (`upsertEvent`)
```json
{
  "action": "upsertEvent",
  "token": "설정한_토큰",
  "date": "2026-11-14",
  "syncToCalendar": false,
  "event": {
    "title": "Muse가 배정한 집중 작업",
    "startMin": 900,
    "endMin": 990,
    "category": "focus",
    "pinned": false,
    "note": "자동 등록됨"
  }
}
```
> `startMin`과 `endMin`은 `00:00` 기준 분 단위입니다. (예: `15:00` = `15 * 60 = 900`)

### ② 유튜브 볼 리스트 추가 (`addYoutube`)
```json
{
  "action": "addYoutube",
  "token": "설정한_토큰",
  "date": "2026-11-14",
  "item": {
    "title": "AI 에이전트 실전 워크플로우",
    "url": "https://www.youtube.com/watch?v=...",
    "durationMin": 30,
    "addedBy": "Muse"
  }
}
```

### ③ 미배치 할 일 추가 (`addStaged`)
```json
{
  "action": "addStaged",
  "token": "설정한_토큰",
  "date": "2026-11-14",
  "item": {
    "title": "견적서 회신하기",
    "durationMin": 30,
    "category": "meeting"
  }
}
```
