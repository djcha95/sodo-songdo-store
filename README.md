# 🛍️ 소도몰 프로젝트

이 문서는 '소도몰' 프로젝트의 개요를 설명하고, 상세 문서로 안내하는 역할을 합니다.

## 🚀 프로젝트 소개

-   **목표:** React와 Firebase를 사용하여 간단한 상품 쇼핑몰 웹사이트를 구축합니다.
-   **주요 기능:** 회원가입/로그인, 상품 목록 및 상세 보기, 장바구니, 주문 관리, **신뢰도와 활동 포인트를 분리한 이중 트랙 보상 시스템**, 친구 초대, 관리자 페이지, **AI 상품 정보 자동 등록**, 지능형 알림톡 시스템 등

## 🛠️ 사용된 기술 스택

-   **Core:** React, TypeScript, Vite
-   **Backend & Database:** Firebase (Firestore, Authentication, Storage)
    -   **Cloud Functions (v2):** 서버리스 백엔드 로직
    -   **Firebase Extensions:** 이미지 리사이징 자동화 (Resize Images)
-   **External Services:**
    -   **Google Gemini API:** AI 상품 정보 자동 추출
    -   **Google Cloud Secret Manager:** API 키 보안 관리
    -   **NHN Cloud:** 카카오톡 알림톡 발송 중계 서비스
-   **Routing & State Management:**
    -   `react-router-dom`: 클라이언트 사이드 라우팅
    -   `React Context API`: 전역 상태 관리 (`useAuth`, `useCart` 등)
-   **Styling & UI:**
    -   `CSS Modules`: 컴포넌트 단위 스타일링
    -   `lucide-react`: 경량 SVG 아이콘
    -   `react-hot-toast`: 전역 알림(Toast) 메시지
    -   `react-beautiful-dnd`: 드래그앤드롭(순서 변경) 기능
    -   `react-joyride`: 인터랙티브 튜토리얼 기능
-   **Utilities:**
    -   `dayjs`: 날짜 및 시간 처리
-   **Testing & Deployment:**
    -   `Vitest` & `React Testing Library`: 컴포넌트 및 유닛 테스트
    -   `Vercel`: 프론트엔드 배포

---

## 📄 상세 문서 안내

프로젝트의 더 자세한 내용은 아래 문서를 참고하세요.

-   **[📂 프로젝트 구조 및 아키텍처 (Architecture)](./ARCHITECTURE.md)**
    > 폴더 구조, 주요 파일 및 컴포넌트의 역할에 대한 상세 설명서입니다.

-   **[✨ 주요 기능 명세 (Features)](./FEATURES.md)**
    > 회원가입부터 상품 관리, 포인트 시스템까지 각 기능의 상세한 동작 흐름을 설명합니다.

-   **[💡 트러블슈팅 및 개선 이력 (Troubleshooting)](./TROUBLESHOOTING.md)**
    > 프로젝트 진행 중 발생했던 주요 문제들과 해결 과정을 기록한 개발 회고록입니다.

---

## 🚀 앞으로의 개선 방향

### 1. 테스트 코드 작성: "미래의 버그를 예방하는 보험" (진행 중)
-   **내용**: **Vitest**와 **React Testing Library**를 도입하여 자동화된 테스트를 구축하고 있습니다. 현재 유틸리티 함수(유닛 테스트)와 일부 UI 컴포넌트(컴포넌트 테스트)에 대한 테스트를 완료했으며, 점차 테스트 커버리지를 넓혀나갈 예정입니다.
-   **기대 효과**: 코드 변경에 대한 자신감을 높이고, 장기적으로 훨씬 안정적인 서비스를 운영할 수 있습니다.

### 2. UI/UX 일관성 확보: "체계적인 디자인 시스템 구축"
-   **내용**: **Storybook** 같은 도구를 사용하여 재사용 가능한 UI 컴포넌트들을 모아놓은 독립적인 **디자인 시스템**을 구축합니다.
-   **기대 효과**: 일관된 사용자 경험을 제공하고, 이미 만들어진 부품을 조립하듯 새로운 페이지를 매우 빠르게 개발할 수 있습니다.