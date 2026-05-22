# CMS Content Analyzer

CMS 컨텐츠의 CDN 로딩 성능을 분석하고 개선 우선순위를 도출하는 도구입니다.
Playwright Headless Chromium으로 각 컨텐츠를 실제로 열어서 **로딩 시간**, **메모리 사용량**, **네트워크 전송량**을 측정하고 객관적인 기준으로 등급을 부여합니다.

---

## 기능

- **URL 목록 동기화**: 외부 API에서 CMS 컨텐츠 URL 목록을 자동으로 가져옵니다.
- **선택적 분석**: 체크박스로 분석 대상을 직접 선택하거나, 랜덤으로 지정한 개수만큼 자동 선택할 수 있습니다.
- **실시간 진행률**: 분석 중 진행률, 남은 예상 시간, 서버 로그를 실시간으로 확인할 수 있습니다 (SSE 스트리밍).
- **객관적 등급 평가**: 실제 웹 콘텐츠 성능 체감 기준표를 적용하여 각 지표별로 🟢쾌적 / 🟡중간 / 🟠나쁨 / 🔴매우 나쁨 등급을 부여합니다.
- **개선 우선순위**: 등급 점수 합계를 기준으로 정렬하여 어떤 컨텐츠를 먼저 개선해야 할지 한눈에 보여줍니다.
- **스크린샷 캡처**: 컨텐츠가 렌더링된 상태를 이미지로 저장합니다.

---

## 측정 메트릭 및 등급 기준

각 컨텐츠는 아래 3가지 지표를 측정하고, **절대적 기준(임계값)**에 따라 등급이 부여됩니다.

> 📌 등급은 해당 컨텐츠와 다른 컨텐츠를 비교한 상대값이 아니라, 실제 웹 성능 체감 기준에 따른 **객관적 지표**입니다.

| 지표 | 🟢 쾌적 | 🟡 중간 | 🟠 나쁨 | 🔴 매우 나쁨 |
|------|---------|---------|---------|-------------|
| **로딩 시간** | ≤ 1.8초 | 1.8~3.0초 | 3.0~5.5초 | > 5.5초 |
| **JS 메모리 사용량** | ≤ 50MB | 50~100MB | 100~150MB | > 150MB |
| **리소스 다운로드 크기** | ≤ 1.5MB | 1.5~3.5MB | 3.5~6.0MB | > 6.0MB |

### 지표별 설명

| 메트릭 | 설명 | 계산 방식 | 주의사항 |
|--------|------|-----------|----------|
| **로딩 시간** | 페이지가 열려서 컨텐츠가 완전히 렌더링될 때까지 걸린 시간 | `page.goto` `load` 이벤트 → `LOAD_COMPLETE` postMessage 수신까지. <br>3초 내에 오지 않으면 `load` + 1.5초 폴백 | iframe 기반 CMS에서는 `LOAD_COMPLETE`를 받아 정확히 측정. <br>단독 페이지에서는 폴백 적용 |
| **JS 메모리 사용량** | Chromium 브라우저의 V8 JS Heap 사용량 | `performance.memory.usedJSHeapSize` (바이트) → MB 변환 | **브라우저 전체 Heap**을 측정하므로, 컨텐츠 간 차이가 적을 수 있습니다. <br>단일 컨텐츠의 정확한 메모리가 아닌 **상대적 비교 지표**로 활용하세요. |
| **리소스 다운로드 크기** | 페이지 로드 중 네트워크로 전송된 모든 리소스의 누적 크기 | Chrome DevTools Protocol (CDP) `Network.loadingFinished`의 `encodedDataLength` 합계 (바이트) → MB 변환 | **누적값**입니다. HTML, CSS, JS, 이미지, 폰트 등 **모든 네트워크 요청**의 전체 합계. <br>CDN 캐시 상태에 따라 값이 달라질 수 있습니다. |

### 개선 필요도 (Priority Score)

| 등급 | 점수 |
|------|------|
| 🟢 쾌적 (Good) | 0 |
| 🟡 중간 (Moderate) | 1 |
| 🟠 나쁨 (Poor) | 2 |
| 🔴 매우 나쁨 (Critical) | 3 |

**개선 필요도 = 3가지 지표의 점수 합계 (0~9)**

- **0점**: 모든 지표가 쾌적한 최상위 상태
- **9점**: 모든 지표가 매우 나쁨 → 가장 시급하게 개선 필요
- 정렬 기준: 높은 점수 순 (점수가 같으면 단일 최악 지표 기준으로 정렬)

---

## 아키텍처

```
┌─────────────────┐     ┌─────────────────────┐     ┌──────────────────┐
│   Next.js App   │────▶│  API Routes (Node)  │────▶│  Playwright      │
│  (Dashboard)    │◄────│  - /api/urls/sync   │     │  Headless Chrome │
│                 │     │  - /api/analyze     │     │                  │
│  (SSE Events)   │◄────│    (SSE Streaming)  │     │                  │
└─────────────────┘     └─────────────────────┘     └──────────────────┘
        │                        │                            │
        ▼                        ▼                            ▼
   URL 체크박스 목록        data/urls.json 저장           스크린샷 + 메트릭
   분석 버튼 클릭           외부 API 동기화               data/results.json
```

---

## 시작하기

### 1. 환경 변수 설정

`.env.local` 파일을 생성하고 인증 정보를 입력합니다.

```env
# CMS 환경: test 또는 prod
CMS_ENV=test

# 인증 방식 1: 직접 토큰 (빠름, 추천)
ACCESS_TOKEN=eyJhbGciOiJIUzI1NiIs...

# 인증 방식 2: 로그인 ID/PW (API 호출로 토큰 자동 획득)
USER_ID=your_id
PASSWORD=your_password
```

> `ACCESS_TOKEN`이 설정되어 있으면 **로그인 API 호출 없이 바로 사용**됩니다. <br>
> `USER_ID`/`PASSWORD`만 설정하면 `/auth/signin` API를 호출해 토큰을 자동으로 받아옵니다.

### 2. 개발 서버 실행

```bash
npm install
npm run dev
```

### 3. 브라우저에서 접속

[http://localhost:3000](http://localhost:3000)

---

## 사용 흐름

1. **URL 목록 동기화** — `Sync URLs` 버튼으로 외부 API에서 최신 목록을 가져옵니다.
2. **URL 목록 펼치기** — 분석할 컨텐츠를 체크합니다.
   - **전체 선택**: 헤더 체크박스 클릭
   - **랜덤 선택**: 원하는 개수 입력 후 "랜덤 적용" 버튼 클릭
   - **개별 선택**: 행을 클릭해서 체크/해제
3. **불필요한 항목 제거** — "체크된 항목 제거" 버튼으로 목록에서 삭제
4. **분석 시작** — 선택된 URL 개수가 표시된 "분석 시작" 버튼을 클릭
   - 진행률 바, 남은 예상 시간, 실시간 서버 로그가 표시됩니다.

---

## 데이터 저장

| 파일/디렉토리 | 설명 |
|-------------|------|
| `data/urls.json` | 동기화된 URL 목록 (`{ url, checked }` 배열) |
| `data/results.json` | 마지막 분석 결과 캐시 |
| `public/screenshots/` | 스크린샷 이미지 (파일명: `{timestamp}_{random}_{slug}.png`) |

> `.gitignore`에 `data/results.json`과 `public/screenshots/*`가 포함되어 있어, 민감 데이터와 생성물은 Git에 올라가지 않습니다.

---

## 알려진 제한사항

1. **JS 메모리**: `performance.memory`는 브라우저 전체 V8 Heap을 반환합니다. CMS 컨텐츠 HTML 하나의 정확한 메모리 사용량이 아니라, **상대적 비교**에 적합합니다.
2. **리소스 크기**: `encodedDataLength`는 페이지 로드 시점의 **누적 네트워크 전송량**입니다. CDN 캐시가 활성화된 리소스는 실제 전송 크기가 0에 가까울 수 있습니다.
3. **LOAD_COMPLETE**: iframe 기반 CMS 컨텐츠에서만 정상적으로 수신됩니다. 단독 페이지로 로드되는 경우 3초 timeout 후 1.5초 추가 대기(fallback)를 적용합니다.
4. **인증**: `.env.local`의 토큰/비밀번호가 유효하지 않으면 CDN Access Denied 에러(XML)가 발생할 수 있습니다.

---

## 기술 스택

- [Next.js](https://nextjs.org/) 16 (App Router)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Playwright](https://playwright.dev/) (Headless Chromium)
