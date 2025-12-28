# 관리자 페이지 UX 점검 결과 (전체)

> 목표: **관리자 업무를 “더 빠르게/덜 실수하게/모바일에서도 가능하게”** 만들기  
> 기준: 모바일(≤768px) 조작성, 정보 밀도, 위험 기능 실수 방지, 작업 흐름(검색→처리→확인) 단축

## 1) 현재 “실제로 연결된” 관리자 라우트(운영 경로)

`src/main.tsx` 기준, 현재 운영 중인 관리자 라우트는 아래 **13개**입니다.

- `/admin` (index) → 대시보드
- `/admin/dashboard`
- `/admin/pickup-check`
- `/admin/quick-check`
- `/admin/prepaid-check`
- `/admin/products`
- `/admin/products/add`
- `/admin/products/edit/:productId/:roundId`
- `/admin/stock`
- `/admin/orders`
- `/admin/create-order`
- `/admin/users`
- `/admin/users/:userId`
- `/admin/tools`

## 2) 활성 페이지(운영 경로)별 개선 포인트

### 표: 페이지별 “수정 필요 항목” 요약

| 우선 | 라우트 | 파일 | 핵심 목적 | 모바일/조작성 이슈(요약) | 권장 수정(요약) |
|---:|---|---|---|---|---|
| P0 | *(삭제됨)* | *(삭제됨)* | 배너 관리 | 불필요 | ✅ 사용자 요청으로 배너 관리자 페이지/라우트/메뉴를 모두 삭제 |
| P0 | `/admin/orders` | `src/pages/admin/OrderManagementPage.tsx` | 주문 전체 관리 | 모바일에서 테이블 폭 과다, 주요 액션(상태/삭제) 실수 위험 | `ResponsiveTable` 카드뷰 적용, “상태 변경” 영역 터치 확대/스티키, 일괄처리 바 고정 |
| P0 | `/admin/users` | `src/pages/admin/UserListPage.tsx` | 고객 목록/검색 | 모바일 테이블 가독성/터치 어려움 | `ResponsiveTable` 카드뷰 적용(핵심 필드만), 상세 버튼을 1차 액션으로 크게 |
| P0 | `/admin/stock` | `src/pages/admin/AdminStockPage.tsx` | 현장판매 재고 입력 | 모바일에서 테이블 편집(숫자 입력) 피로, 가로 스크롤 | (단기) 스크롤/입력 UX 보강, (중기) `ResponsiveTable` + 인라인 에디터를 “모달 편집” 옵션 제공 |
| P0 | `/admin/create-order` | `src/pages/admin/CreateOrderPage.tsx` | 관리자 강제 주문 생성(위험) | 오동작/중복 생성 위험, 실수 방지 장치 필요 | ✅ `DangerButton`(2클릭 확인) 적용 + 비활성 상태(필수 선택 전) 차단 |
| P1 | `/admin/pickup-check` | `src/pages/admin/PickupCheckPage.tsx` | 픽업일 캘린더/공지 생성 | 모바일에서 컨트롤 밀집(월 이동/모드/복사/캡쳐) | ✅ 공통 헤더 적용. 다음: 컨트롤을 “상단 스티키 바 + 큰 버튼”으로 재배치 |
| P1 | `/admin/prepaid-check` | `src/pages/admin/PrepaidCheckPage.tsx` | 선입금 미픽업 처리 | 선택/일괄처리 바가 모바일에서 밀림 가능 | ✅ 공통 헤더+검색바 통일. 다음: 일괄처리 바 하단 고정, 선택 상태 명확화 |
| P1 | `/admin/quick-check` | `src/pages/admin/QuickCheckPage.tsx` | 빠른 고객조회/처리 | “전체 사용자 로딩→클라 필터”는 느려질 수 있음 | ✅ 공통 헤더 적용. 다음: 서버검색/인덱싱 기반 검색으로 전환 + 최근검색 |
| P1 | `/admin/products` | `src/pages/admin/ProductListPageAdmin.tsx` | 상품/회차 간편 편집 | 모바일에서 인라인 편집/다중 컬럼 피로 | (중기) 모바일은 카드뷰(핵심 필드만), 편집은 “상세 패널/모달”로 |
| P1 | `/admin/products/add` | `src/pages/admin/ProductAddAdminPage.tsx` | 새 상품/회차 등록 | 폼 길이/입력 피로, 실수 방지(검증) | `ProductForm`에 “스텝퍼/진행률/스티키 저장바/필수값 요약” 추가 권장 |
| P1 | `/admin/products/edit/...` | `src/pages/admin/SalesRoundEditPage.tsx` | 판매 회차 수정 | 동일 | 동일 |
| P1 | `/admin/users/:userId` | `src/pages/admin/UserDetailPage.tsx` | 고객 상세/권한/통계 | 위험 작업(회원 삭제) 실수 위험 | ✅ 삭제 버튼 `DangerButton` 적용. 다음: 중요 작업은 “하단 위험구역” 고정 + 로그/리커버리 안내 |
| P2 | `/admin/tools` | `src/pages/admin/AdminToolsPage.tsx` | 시스템 도구(위험) | 마스터 전용이어야 함(직접 URL 접근) | UI 숨김은 되어있음. 다음: 라우트 레벨에서 master 가드 추가 권장 |

## 3) 라우트에 “연결되지 않은” 관리자 페이지(정리 대상)

✅ 사용자 요청으로 “미연결(권장 처리) 관리자 페이지들”은 **전부 삭제**했습니다. (유지보수 부담/실수 위험 감소 목적)

### 삭제된 미연결 페이지 목록(참고)

- `AiProductPage.tsx`
- `BoardAdminPage.tsx`, `BoardAdminPage.css`
- `CategoryManagementPage.tsx`, `CategoryManagementPage.css`
- `CouponAdminPage.tsx`
- `EncoreAdminPage.tsx`
- `RaffleEventAdminPage.tsx`, `RaffleEventAdminPage.css`
- `DataAdminPage.tsx`, `DataAdminPage.css`
- `PickupProcessingPage.tsx`
- `OrderListPage.tsx`
- `MinimalTestPage.tsx`

## 4) “모바일에서 특히 효과 큰” 공통 개선 제안(추가 기능 제안)

- **(P0) 테이블 → 모바일 카드뷰 자동 전환**: `ResponsiveTable`을 적극 사용해서 “핵심 3~5개 필드 + 주요 액션 1~2개”만 노출
- **(P0) 스티키 액션 바**: 선입금/주문관리/재고처럼 “선택/일괄처리”가 있는 화면은 하단에 고정
- **(P1) 전역 검색**: “고객/주문”을 한 곳에서 검색 후 각 페이지로 딥링크
- **(P1) 최근 작업/즐겨찾기**: 대시보드에 “최근 처리한 고객/주문/픽업일” 카드
- **(P1) 위험 기능 보호**: `DangerButton` + “실행 로그(누가/언제/무엇을)” 기록 화면


