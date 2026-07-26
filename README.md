# 우리집 분석기 (Phase 1)

주소를 입력하면 다음을 보여주는 웹앱입니다.

- 건축물대장 기준 대지면적 / 건축면적 / 연면적 / 사용승인일
- 최근 6개월 내 같은 지번(아파트)의 실거래가 내역

아직 포함 안 된 것 (다음 단계): 5년치 공시지가 추이, 입지분석(버스/지하철 거리), 재건축 도달연수, 연립·단독·토지 실거래가.

---

## 1. 코드 개발자 없이 배포하는 순서 (Vercel 무료 플랜 기준)

### 1) GitHub에 코드 올리기
1. [github.com](https://github.com) 가입 (이미 있으면 생략)
2. 우측 상단 `+` → `New repository` → 이름은 아무거나 (예: `address-analyzer`) → `Create repository`
3. 지금 받으신 이 폴더 전체(zip 압축 풀린 것)를 그 저장소에 업로드
   - 저장소 페이지에서 `Add file` → `Upload files` → 폴더 안의 파일들을 통째로 드래그해서 넣고 `Commit changes`
   - **주의: `.env.local` 파일은 만들지 마시고 절대 업로드하지 마세요.** (`.env.local.example`만 참고용으로 올라갑니다)

### 2) Vercel에 연결
1. [vercel.com](https://vercel.com) 가입 → "Continue with GitHub"으로 로그인 (같은 계정으로 편함)
2. `Add New...` → `Project` → 방금 만든 GitHub 저장소 선택 → `Import`
3. 프레임워크는 Next.js가 자동으로 인식됩니다. 그대로 두시면 됩니다.

### 3) 환경변수(API 키) 등록 — 배포 전 필수
Import 화면(또는 Project → Settings → Environment Variables)에서 아래 3개를 추가하세요.

| Key | Value |
|---|---|
| `KAKAO_REST_API_KEY` | 카카오에서 받으신 REST API 키 |
| `DATA_GO_KR_KEY` | 공공데이터포털 일반 인증키 (Decoding 키) |
| `VWORLD_KEY` | VWorld 키 (Phase 1에서는 아직 안 쓰지만 미리 등록) |

등록 후 `Deploy` 누르면 1~2분 후 `https://무작위이름.vercel.app` 같은 주소가 생성됩니다. 여기 들어가서 주소 하나 넣고 조회 버튼을 눌러보세요.

### 4) 갖고 계신 도메인 연결 (선택, 나중에 해도 됨)
Vercel Project → Settings → Domains → 이사님 도메인 입력 → 안내되는 DNS 레코드(보통 A 레코드 또는 CNAME)를 도메인 구매처(가비아/후이즈 등) 관리 화면에 그대로 등록하시면 됩니다. 이 단계는 스크린샷 주시면 같이 봐드릴게요.

---

## 2. 티스토리에 넣는 방법

배포된 주소(Vercel 기본 주소든, 연결한 도메인이든)가 생기면, 티스토리 글쓰기에서 **HTML 편집 모드**로 전환한 뒤 아래처럼 넣으시면 됩니다.

```html
<iframe
  src="https://이사님의-배포주소.vercel.app"
  style="width:100%; max-width:720px; height:900px; border:none;"
></iframe>
```

높이(height)는 실제로 넣어보시고 결과가 잘리면 숫자를 늘려주시면 됩니다.

---

## 3. 로컬 컴퓨터에서 미리 테스트해보고 싶다면 (선택사항)

Node.js가 설치되어 있어야 합니다 ([nodejs.org](https://nodejs.org)에서 LTS 버전 설치).

```bash
npm install
cp .env.local.example .env.local
# .env.local 파일을 열어서 실제 키 3개를 채워넣기
npm run dev
```

브라우저에서 `http://localhost:3000` 접속.

---

## 4. 알아두실 점

- 실거래가 API는 "지번" 단위로 매칭합니다. 신축이라 아직 실거래가 없거나, 지번이 여러 필지로 쪼개진 경우 결과가 안 나올 수 있습니다.
- 아파트만 지원합니다 (연립다세대/단독다가구/토지는 다음 단계에서 추가).
- 계약 해제(취소)된 거래는 자동으로 제외하고 보여줍니다.
