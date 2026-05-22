# CMS Content Analyzer

CMS 컨텐츠의 CDN 로딩 성능을 분석하고 개선 우선순위를 도출하는 도구입니다.

## 기능

- 외부 API에서 CMS 컨텐츠 URL 목록 동기화
- 체크박스 기반 분석 대상 선택
- 로딩 시간 / JS 메모리 사용량 / 리소스 다운로드 크기 측정
- 컨텐츠 스크린샷 자동 캡처
- 성능 점수화 및 개선 우선순위 정렬

## 시작하기

### 1. 환경 변수 설정

`.env.local` 파일을 생성하고 인증 정보를 입력합니다.

```env
CMS_ENV=test
ACCESS_TOKEN=your_token_here
# 또는
USER_ID=your_id
PASSWORD=your_password
```

### 2. 개발 서버 실행

```bash
npm install
npm run dev
```

### 3. 브라우저에서 접속

[http://localhost:3000](http://localhost:3000)

### 사용 흐름

1. **URL 목록 동기화** — 외부 API에서 최신 목록 가져오기
2. **URL 목록 펼치기** — 분석할 컨텐츠 체크 (전체 선택 / 랜덤 선택 / 개별 선택 가능)
3. **체크된 항목 제거** — 불필요한 URL 삭제
4. **분석 시작** — 선택된 URL만 분석 실행

## 기술 스택

- Next.js 16 + TypeScript
- Tailwind CSS
- Playwright (Headless Chromium)
