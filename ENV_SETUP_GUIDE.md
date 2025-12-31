# 🔐 환경변수 설정 가이드

## 📋 필수 환경변수 목록

프로젝트 루트에 `.env.local` 파일을 생성하고 다음 변수들을 설정하세요:

```bash
# =================================================================
# 🔒 Firebase 설정 (필수)
# =================================================================
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_REGION=asia-northeast3

# =================================================================
# 🔒 카카오 로그인 (필수)
# =================================================================
VITE_KAKAO_JS_KEY=

# =================================================================
# 🔒 App Check (선택)
# =================================================================
# VITE_APP_CHECK_SITE_KEY=
```

## 🔍 값 확인 방법

### Firebase 설정 값
1. [Firebase 콘솔](https://console.firebase.google.com) 접속
2. 프로젝트 선택
3. 프로젝트 설정 (⚙️) > 일반 탭
4. "내 앱" 섹션에서 웹 앱 선택
5. "SDK 설정 및 구성" 섹션에서 값 확인

### 카카오 JavaScript 키
1. [카카오 개발자 콘솔](https://developers.kakao.com) 접속
2. 내 애플리케이션 선택
3. 앱 설정 > 플랫폼 > Web 플랫폼 등록
4. JavaScript 키 확인

## 📝 파일 생성 방법

### Windows (PowerShell)
```powershell
# 프로젝트 루트에서 실행
New-Item -Path .env.local -ItemType File
# 메모장으로 열기
notepad .env.local
```

### macOS / Linux
```bash
# 프로젝트 루트에서 실행
touch .env.local
# 편집기로 열기
nano .env.local
# 또는
code .env.local  # VS Code 사용 시
```

## ⚠️ 주의사항

1. **절대 Git에 커밋하지 마세요!**
   - `.env.local` 파일은 `.gitignore`에 포함되어 있습니다.
   - 실수로 커밋했다면 즉시 삭제하고 Git 히스토리에서 제거하세요.

2. **파일 이름 확인**
   - `.env.local` 또는 `.env` 파일을 사용하세요.
   - Vite는 자동으로 `.env.local` 파일을 로드합니다.

3. **변경 후 재시작**
   - 환경변수를 변경한 후에는 개발 서버를 재시작해야 합니다.
   ```bash
   npm run dev
   ```

## 🚨 환경변수 누락 에러 해결

에러 메시지 예시:
```
❌ 필수 환경변수가 누락되었습니다: VITE_FIREBASE_API_KEY, VITE_FIREBASE_REGION

📝 해결 방법:
1. 프로젝트 루트에 .env.local 파일 (또는 .env 파일)을 생성하세요.
2. .env.example 파일을 참고하여 필요한 환경변수를 설정하세요.
3. 자세한 내용은 README.md의 "시크릿 & 환경 변수" 섹션을 참고하세요.

💡 파일 경로: 프로젝트 루트/.env.local 파일 (또는 .env 파일)
```

**해결 단계:**
1. 프로젝트 루트에 `.env.local` 파일이 있는지 확인
2. 누락된 환경변수를 추가
3. 개발 서버 재시작

## 📚 참고 문서

- [Vite 환경변수 문서](https://vitejs.dev/guide/env-and-mode.html)
- [Firebase 설정 가이드](https://firebase.google.com/docs/web/setup)
- [카카오 개발자 가이드](https://developers.kakao.com/docs)








