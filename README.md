# 🛍️ 소도몰 프로젝트

이 문서는 '소도몰' 프로젝트의 구조와 주요 코드의 역할을 정리하기 위해 작성되었습니다.

## 🚀 프로젝트 소개

-   **목표:** React와 Firebase를 사용하여 간단한 상품 쇼핑몰 웹사이트를 구축합니다.
-   **주요 기능:** 회원가입, 로그인, 상품 목록 보기, 상품 상세 정보 보기, 관리자 페이지 등

## 🛠️ 사용된 기술 스택

-   **프론트엔드:** React, TypeScript, Vite
-   **백엔드 & 데이터베이스:** Firebase (Firestore, Authentication)
-   **스타일링:** 일반 CSS 파일 및 모듈 (CSS Modules)
-   **배포:** Vercel

## 📁 디렉토리(폴더) 구조 설명

프로젝트의 주요 폴더와 파일 역할은 다음과 같습니다.

SODOMALL-APP/
├── public/              # 이미지, 폰트 등 정적 파일 보관
├── scripts/             # 프로젝트 관련 보조 스크립트 파일 보관
├── src/                 # ✅ 핵심 소스 코드가 있는 폴더
│   ├── assets/          # 로고, 아이콘 등 작은 이미지 파일 보관
│   ├── components/      # 여러 곳에서 재사용되는 작은 UI 조각들
│   │   ├── admin/       # 관리자 페이지용 컴포넌트
│   │   └── customer/    # 고객 페이지용 컴포넌트
│   ├── context/         # 앱 전역 상태 관리를 위한 Context API 파일들 (인증, 장바구니 등)
│   ├── firebase/        # Firebase 초기 설정 및 관련 함수 모음
│   ├── layouts/         # 페이지들의 공통적인 레이아웃(헤더, 푸터 등)을 정의
│   ├── pages/           # 웹사이트의 각 페이지 단위 컴포넌트
│   │   ├── admin/       # 관리자 관련 페이지
│   │   └── customer/    # 고객 관련 페이지
│   └── styles/          # 전역적으로 사용되는 CSS 스타일 파일 보관
├── .env                 # API 키 등 민감한 정보 보관 (Git에 올리면 안 됨)
├── firebase.json        # Firebase 호스팅, Firestore 규칙 등 설정
├── index.html           # 앱의 진입점이 되는 메인 HTML 파일
├── package.json         # 프로젝트 정보 및 의존성 라이브러리 목록
├── README.md            # 바로 이 파일! 프로젝트 설명서
├── tsconfig.json        # TypeScript 컴파일러 설정
└── vite.config.ts       # Vite 빌드 도구 설정