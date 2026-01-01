# 🚫 송도픽 프로젝트 기능 비활성화 계획서

**작성일**: 2025년 1월  
**목표**: 운영 중인 서비스에서 불필요한 기능으로 인한 혼란/리스크 제거  
**원칙**: 코드 삭제 없이 UI/플로우/접근 경로만 차단

---

## 1️⃣ 비활성화 대상 기능 리스트 (확정)

### ✅ 1. 대기자 명단 (Waitlist) 기능
- **고객 화면**
  - 상품 카드의 "대기 신청" 버튼
  - 상품 상세 페이지의 "대기 신청" 버튼
  - 예약 내역 페이지의 "대기 목록" 탭
  - 장바구니의 대기 상태 아이템
- **관리자 화면**
  - 대시보드의 대기자 수량 표시
  - 사용자 상세 페이지의 "대기 목록" 탭
  - 상품 관리 페이지의 대기자 관련 정보

### ✅ 2. 등급/포인트/보상 관련 기능
- **고객 화면**
  - 마이페이지의 등급 배지 및 포인트 표시
  - 추천인 코드 기능
  - 포인트 적립/사용 내역
- **관리자 화면**
  - 사용자 목록의 등급/포인트 컬럼
  - 사용자 상세 페이지의 "포인트 관리" 버튼 및 탭
  - 사용자 상세 페이지의 "신뢰도 관리" 카드
  - 등급 직접 지정 기능

### ✅ 3. 실험적 추천/자동 노출 기능
- **관리자 화면**
  - AI 상품 추천 페이지 (`/admin/ai-product`)
  - 자동 추천 관련 기능

### ✅ 4. 고급 통계/분석 화면
- **관리자 화면**
  - 데이터 관리 페이지 (`/admin/data`)
  - 게시판 관리 페이지 (`/admin/board`)
  - 대시보드의 고급 통계 섹션 (대기자 수량 등)

### ✅ 5. 고도화된 조건부 알림
- **백엔드/기능**
  - 대기자 확정 알림 (`WAITLIST_CONFIRMED`)
  - 포인트 관련 알림
  - 등급 변경 알림

---

## 2️⃣ 각 기능별 비활성화 방법 요약

### 📋 방법론
1. **UI 요소 숨김**: `display: none` 또는 조건부 렌더링 제거
2. **버튼/링크 비활성화**: `disabled` 속성 또는 클릭 이벤트 차단
3. **라우팅 차단**: URL 직접 접근 시 404 또는 리다이렉트
4. **데이터 표시 제거**: 관련 데이터를 UI에서 렌더링하지 않음
5. **메뉴/탭 제거**: 네비게이션에서 관련 항목 제거

---

## 3️⃣ 영향 파일 목록

### 🎯 고객 화면 (Customer)

#### 대기자 명단 관련
- `src/components/customer/ProductCard.tsx` - 대기 신청 버튼 제거
- `src/components/customer/ProductCard.css` - 대기 버튼 스타일 제거
- `src/components/customer/SimpleProductCard.tsx` - 대기 신청 로직 제거
- `src/components/customer/SimpleProductCard.css` - 대기 버튼 스타일 제거
- `src/pages/customer/ProductDetailPage.tsx` - 대기 신청 버튼 제거
- `src/pages/customer/ProductDetailPage.css` - 대기 버튼 스타일 제거
- `src/pages/customer/OrderHistoryPage.tsx` - 대기 목록 탭 제거
- `src/pages/customer/OrderHistoryPage.css` - 대기 목록 스타일 제거

#### 등급/포인트 관련
- `src/pages/customer/MyPage.tsx` - 등급/포인트 표시 제거
- `src/pages/customer/MyPage.css` - 등급/포인트 스타일 제거
- `src/context/AuthContext.tsx` - 등급 관련 로직 확인 (필요시)

### 🛠️ 관리자 화면 (Admin)

#### 대기자 명단 관련
- `src/pages/admin/DashboardPage.tsx` - 대기자 수량 표시 제거
- `src/pages/admin/DashboardPage.css` - 대기자 관련 스타일 제거
- `src/pages/admin/UserDetailPage.tsx` - 대기 목록 탭 제거
- `src/pages/admin/UserDetailPage.css` - 대기 목록 스타일 제거
- `src/pages/admin/ProductListPageAdmin.tsx` - 대기자 정보 제거 (있는 경우)

#### 등급/포인트 관련
- `src/pages/admin/UserListPage.tsx` - 등급/포인트 컬럼 제거
- `src/pages/admin/UserListPage.css` - 등급/포인트 스타일 제거
- `src/pages/admin/UserDetailPage.tsx` - 포인트 관리/신뢰도 관리 제거
- `src/components/admin/PointManagementModal.tsx` - 모달 접근 차단
- `src/components/admin/CustomerActionTabs.tsx` - 신뢰도 관리 탭 제거

#### 통계/분석 관련
- `src/pages/admin/DataAdminPage.tsx` - 전체 페이지 비활성화
- `src/pages/admin/BoardAdminPage.tsx` - 전체 페이지 비활성화
- `src/pages/admin/AiProductPage.tsx` - 전체 페이지 비활성화

### 🔧 라우팅
- `src/main.tsx` - 비활성화된 페이지 라우트 제거 또는 404 처리

### 🎨 유틸리티/서비스
- `src/utils/productUtils.ts` - `WAITLISTABLE` 상태 처리 제거 (있는 경우)
- `src/firebase/productService.ts` - 대기자 관련 함수는 유지 (백엔드 호환성)

---

## 4️⃣ 상세 수정 계획

### 📱 고객 화면 수정

#### 1. ProductCard.tsx - 대기 신청 버튼 제거
**위치**: `src/components/customer/ProductCard.tsx`
**수정 내용**:
- `handleAddToWaitlist` 함수는 유지하되 호출하지 않음
- `actionState === 'WAITLISTABLE'` 조건 블록 제거
- 대기 버튼 렌더링 제거

#### 2. ProductDetailPage.tsx - 대기 신청 버튼 제거
**위치**: `src/pages/customer/ProductDetailPage.tsx`
**수정 내용**:
- 대기 신청 버튼 렌더링 제거
- `WAITLISTABLE` 상태 처리 제거

#### 3. OrderHistoryPage.tsx - 대기 목록 탭 제거
**위치**: `src/pages/customer/OrderHistoryPage.tsx`
**수정 내용**:
- 대기 목록 탭 제거
- 대기 관련 상태/로직은 유지 (데이터 호환성)

#### 4. MyPage.tsx - 등급/포인트 표시 제거
**위치**: `src/pages/customer/MyPage.tsx`
**수정 내용**:
- 등급 배지 제거
- 포인트 표시 제거
- 멤버십 카드에서 등급/포인트 관련 UI만 제거 (카드 자체는 유지)

### 🛠️ 관리자 화면 수정

#### 1. DashboardPage.tsx - 대기자 수량 제거
**위치**: `src/pages/admin/DashboardPage.tsx`
**수정 내용**:
- `waitlistedQuantity` 필드 제거 또는 0으로 표시
- 대기자 관련 통계 제거

#### 2. UserDetailPage.tsx - 대기 목록/포인트 관리 제거
**위치**: `src/pages/admin/UserDetailPage.tsx`
**수정 내용**:
- "대기 목록" 탭 제거
- "포인트 활동" 탭 제거
- "포인트 관리" 버튼 제거
- "신뢰도 관리" 카드 제거

#### 3. UserListPage.tsx - 등급/포인트 컬럼 제거
**위치**: `src/pages/admin/UserListPage.tsx`
**수정 내용**:
- 등급 컬럼 제거
- 포인트 컬럼 제거
- 포인트 관리 버튼 제거

#### 4. 라우팅 차단
**위치**: `src/main.tsx`
**수정 내용**:
- `/admin/data` → 404 또는 리다이렉트
- `/admin/board` → 404 또는 리다이렉트
- `/admin/ai-product` → 404 또는 리다이렉트

---

## 5️⃣ 수정 코드 예시

### 예시 1: ProductCard.tsx - 대기 버튼 제거

```typescript
// ❌ 제거할 부분
{actionState === 'WAITLISTABLE' && (
  <div className="card-action-section">
    <QuantityInput quantity={quantity} onUpdate={setQuantity} max={maxWaitlistQuantity} />
    {isJustAdded ? (
      <button className="waitlist-action-btn just-added" disabled>
        <Check size={18} /> 신청됨
      </button>
    ) : (
      <button className="waitlist-action-btn" onClick={handleAddToWaitlist}>
        <Hourglass size={16} /> 대기
      </button>
    )}
  </div>
)}

// ✅ 수정 후: 해당 블록 전체 제거
```

### 예시 2: MyPage.tsx - 등급/포인트 제거

```typescript
// ❌ 제거할 부분
<div className="user-tier-badge">
  {tierInfo.icon}
  <span>{tierInfo.label}</span>
</div>
// ...
<div className="user-points">
  <span>보유 포인트</span>
  <strong>{(userDocument.points || 0).toLocaleString()} P</strong>
</div>

// ✅ 수정 후: 해당 부분 제거 또는 주석 처리
```

### 예시 3: UserDetailPage.tsx - 탭 제거

```typescript
// ❌ 제거할 부분
<button 
  className={`tab-button ${activeTab === 'waitlist' ? 'active' : ''}`} 
  onClick={() => setActiveTab('waitlist')}
>
  <Hourglass size={16}/>대기 목록 ({waitlist.length})
</button>
<button 
  className={`tab-button ${activeTab === 'points' ? 'active' : ''}`} 
  onClick={() => setActiveTab('points')}
>
  <Activity size={16}/>포인트 활동
</button>

// ✅ 수정 후: 해당 버튼들 제거
```

### 예시 4: main.tsx - 라우팅 차단

```typescript
// ❌ 제거할 라우트
{ path: "data", element: <DataAdminPage /> },
{ path: "board", element: <BoardAdminPage /> },
{ path: "ai-product", element: <AiProductPage /> },

// ✅ 수정 후: 404 처리
{ 
  path: "data", 
  element: <Navigate to="/admin/dashboard" replace /> 
},
{ 
  path: "board", 
  element: <Navigate to="/admin/dashboard" replace /> 
},
{ 
  path: "ai-product", 
  element: <Navigate to="/admin/dashboard" replace /> 
},
```

---

## 6️⃣ 주의사항

### ⚠️ 절대 건드리지 말 것
- ✅ 예약/픽업 플로우 (`submitOrder`, `updateOrderStatus` 등)
- ✅ 주문 생성/조회 로직
- ✅ 재고 관리 로직
- ✅ 사용자 인증/권한 체크
- ✅ Firestore Rules
- ✅ Cloud Functions의 핵심 비즈니스 로직

### ✅ 안전하게 제거 가능
- UI 렌더링만 담당하는 컴포넌트
- 탭/버튼/메뉴 항목
- 데이터 표시 부분 (데이터 자체는 유지)

### 🔄 나중에 복구 가능하도록
- 함수는 주석 처리 또는 조건부로 비활성화
- 데이터 구조는 유지
- 백엔드 로직은 그대로 유지

---

## 7️⃣ 체크리스트

### 고객 화면
- [ ] ProductCard.tsx - 대기 버튼 제거
- [ ] ProductDetailPage.tsx - 대기 버튼 제거
- [ ] OrderHistoryPage.tsx - 대기 탭 제거
- [ ] MyPage.tsx - 등급/포인트 제거
- [ ] 관련 CSS 파일 정리

### 관리자 화면
- [ ] DashboardPage.tsx - 대기자 수량 제거
- [ ] UserDetailPage.tsx - 대기/포인트 탭 제거
- [ ] UserListPage.tsx - 등급/포인트 컬럼 제거
- [ ] DataAdminPage.tsx - 라우팅 차단
- [ ] BoardAdminPage.tsx - 라우팅 차단
- [ ] AiProductPage.tsx - 라우팅 차단

### 라우팅
- [ ] main.tsx - 비활성화된 페이지 라우트 처리

### 테스트
- [ ] 예약 플로우 정상 작동 확인
- [ ] 픽업 플로우 정상 작동 확인
- [ ] 관리자 기본 기능 정상 작동 확인
- [ ] 비활성화된 기능 접근 시도 → 차단 확인

---

## 8️⃣ 다음 단계

1. **1단계**: 고객 화면에서 대기자/등급/포인트 UI 제거
2. **2단계**: 관리자 화면에서 관련 기능 제거
3. **3단계**: 라우팅 차단 및 404 처리
4. **4단계**: 테스트 및 검증
5. **5단계**: 문서화 업데이트

---

**작성자**: AI Assistant (Cursor)  
**최종 업데이트**: 2025년 1월









