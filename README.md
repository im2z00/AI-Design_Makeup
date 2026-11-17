# 로그인 없이 AI가 동작하는 버전 배포하기

claude.ai 아티팩트 링크에서는 내장 Claude 기능으로 AI가 동작해요. 이 폴더는 **claude.ai 밖(내 웹사이트)** 에서도 누구나 로그인 없이 AI 기능과 실제 상품 사진·최저가를 쓰도록 하는 배포용 폴더예요.

```
deploy/
├─ index.html        ← 프로토타입 페이지 (서버 주소가 /api 로 설정된 복사본)
├─ api/ai.js         ← Claude API 중계: 고민 정리, 화장대·얼굴 사진 분석, 제품·색상 찾기
├─ api/shop.js       ← 네이버 쇼핑 검색: 실제 상품명, 상품 이미지, 최저가, 판매처 링크
├─ package.json
└─ .env.example      ← 넣어야 할 환경변수 목록 (실제 키는 여기에 적지 마세요)
```

## 1. 키 발급

| 무엇 | 어디서 | 비용 |
|---|---|---|
| Claude API 키 (`ANTHROPIC_API_KEY`) | https://platform.claude.com → API Keys | 쓴 만큼 과금. 콘솔에서 **월 사용 한도(spend limit)** 를 꼭 걸어두세요 |
| 네이버 검색 API (`NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`) | https://developers.naver.com → 애플리케이션 등록 → 사용 API에 **검색** 선택 | 무료 (하루 25,000회) |

네이버 키가 없어도 AI 기능은 동작해요. 그때는 상품 사진·실시간 최저가 대신 예시 가격이 나와요.

## 2. Vercel에 배포

1. https://vercel.com 에 GitHub 계정으로 가입해요.
2. 이 `deploy` 폴더를 GitHub 저장소로 올려요. (저장소 루트에 `index.html`, `api/`, `package.json`이 바로 보이게)
3. Vercel → **Add New → Project** → 그 저장소 선택 → Framework Preset은 **Other** → Deploy.
4. 배포된 프로젝트 → **Settings → Environment Variables** 에 `.env.example`의 값을 넣어요.
   - `ANTHROPIC_API_KEY` (필수), `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` (선택)
5. **Deployments → 최신 배포 → Redeploy** (환경변수는 다시 배포해야 반영돼요).
6. `https://프로젝트이름.vercel.app` 을 열면 로그인 없이 AI가 동작해요.

GitHub 없이 하려면 Node.js를 설치한 뒤 이 폴더에서 `npx vercel` 을 실행해도 돼요.

## 3. 프로토타입을 고친 뒤

claude.ai 쪽 원본(`makefit-onboarding.html`)을 고쳤다면 `deploy/index.html`을 다시 만들어야 해요. Claude에게 "deploy 폴더 index.html 다시 만들어줘"라고 하면 돼요. 직접 할 때는:

1. `makefit-onboarding.html`을 복사해 `deploy/index.html`로 저장
2. 맨 위 `<meta name="api-base" content="">` 를 `<meta name="api-base" content="/api">` 로 수정
3. 파일 맨 앞뒤를 `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>` … `</body></html>` 로 감싸기

## 보안·비용 주의

- **API 키는 Vercel 환경변수에만** 두세요. HTML이나 GitHub에 올리면 누구나 가져다 쓸 수 있어요.
- 서버는 같은 사이트(또는 `ALLOWED_ORIGINS`에 적은 사이트)에서 온 요청만 받아요. 그래도 페이지 자체는 공개라 방문자가 많으면 비용이 늘어요. **Claude 콘솔의 사용 한도**를 꼭 설정하세요.
- 기본 모델은 `claude-opus-5-5`예요. 비용을 줄이려면 환경변수 `CLAUDE_MODEL`에 `claude-sonnet-5-5`나 `claude-haiku-5-5`를 넣으면 돼요(정확도는 조금 낮아질 수 있어요).
- 사진은 서버를 거쳐 Claude API로 전송돼요. 서버는 사진을 저장하지 않아요.

## 웹 검색 (제품 찾기)

- 제품을 검색하면 서버가 Claude의 **웹 검색 기능**을 켜고 물어봐요. Claude가 올리브영·브랜드 공식몰·네이버 쇼핑 등을 실제로 검색한 뒤 제품명과 색상 라인업을 답하고, 참고한 페이지는 제품 확인 화면에 **웹 검색 출처** 링크로 보여줘요.
- **배포한 사이트에서만** 동작해요. claude.ai 아티팩트 링크에서는 지금처럼 AI가 알고 있는 지식으로 답해요.
- 비용: 웹 검색은 검색 1회마다 요금이 추가돼요(Claude 콘솔의 가격표 참고). 요청 1번에 최대 `WEB_SEARCH_MAX_USES`회(기본 4회)까지만 검색해요. 끄려면 환경변수 `WEB_SEARCH=off`.
- 웹 검색은 Claude 콘솔의 조직 설정에서 허용돼 있어야 해요(Settings → Privacy/Features에서 web search). 꺼져 있으면 일반 답변으로 돌아가요.
- 검색 때문에 답변이 5~20초 걸릴 수 있어요. Vercel 무료 플랜은 함수 실행 시간이 짧을 수 있으니, 시간 초과가 나면 플랜의 최대 실행 시간을 확인하세요(`vercel.json`에서 `api/ai.js`를 60초로 설정해 뒀어요).
