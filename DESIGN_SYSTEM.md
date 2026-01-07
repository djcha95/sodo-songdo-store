# 송도픽(SONGDOPICK) 프리미엄 커머스 디자인 시스템

## 1) 컨셉 요약 (Tone & Mood)

**모던 미니멀리즘 × 프리미엄 커머스**
- 깔끔하고 세련된 화이트 기반 레이아웃
- 블랙 악센트로 고급스러움 강조
- 부드러운 회색 톤으로 계층 구조 명확화
- 럭셔리 상품은 골드(#D4AF37) 포인트로 차별화
- 모바일 퍼스트, 터치 친화적 인터랙션

---

## 2) 컬러 토큰 (HEX)

### 기본 컬러
- **Background (페이지 배경)**: `#F9FAFB` (슬레이트-50)
- **Surface (카드/컨테이너)**: `#FFFFFF` (완전 불투명 화이트)
- **Text (기본 텍스트)**: `#111111` (거의 블랙)
- **Text Muted (보조 텍스트)**: `#64748B` (슬레이트-500)
- **Text Light (비활성 텍스트)**: `#9CA3AF` (슬레이트-400)
- **Border (기본 테두리)**: `#E5E7EB` (슬레이트-200)
- **Border Light (연한 테두리)**: `#F1F5F9` (슬레이트-100)

### 액센트 컬러
- **Primary (주요 액션)**: `#111111` (블랙)
- **Primary Hover**: `#333333`
- **Accent (강조)**: `#8E1E20` (버건디 레드)
- **Accent Hover**: `#6B1517`
- **Luxury (프리미엄 상품)**: `#D4AF37` (골드)
- **Luxury Hover**: `#B8860B`

### 상태 컬러
- **Success (성공/예약완료)**: `#059669` (에메랄드-600), 배경 `#ECFDF5`
- **Warning (경고/선입금필요)**: `#EA580C` (오렌지-600), 배경 `#FFF7ED`
- **Error (에러/취소)**: `#DC2626` (레드-600), 배경 `#FEF2F2`
- **Info (정보)**: `#2563EB` (블루-600), 배경 `#EFF6FF`

### 사용 규칙
- 배경: 페이지 전체는 `#F9FAFB`, 컨텐츠 영역은 `#FFFFFF`
- 텍스트: 제목/강조는 `#111`, 설명은 `#64748B`, 비활성은 `#9CA3AF`
- 테두리: 기본 `#E5E7EB`, 호버 시 `#D1D5DB`
- 버튼: Primary는 블랙(`#111`), Secondary는 회색 배경(`#F3F4F6`)
- 배지: 인기상품은 그라데이션(레드→오렌지), 일반은 단색

---

## 3) 타이포그래피 스케일

### 폰트 패밀리
- **기본**: `'Pretendard', -apple-system, sans-serif`
- **제목/럭셔리**: `'Playfair Display', 'Noto Serif KR', serif` (명조체 계열)
- **HTML 기본 크기**: `106.25%` (17px 기준)

### 스케일 정의

#### H1 (페이지 메인 타이틀)
- **Font-size**: `22px` (1.375rem)
- **Font-weight**: `800` (Extrabold)
- **Line-height**: `1.2`
- **Letter-spacing**: `-0.5px`
- **Color**: `#111111`
- **사용처**: 탭 배너 제목, 섹션 대제목

#### H2 (섹션 제목)
- **Font-size**: `18px` (1.125rem)
- **Font-weight**: `800` (Extrabold)
- **Line-height**: `1.3`
- **Letter-spacing**: `-0.3px`
- **Color**: `#111111`
- **사용처**: 섹션 헤더, 이벤트 배너 제목

#### H3 (카드/서브 제목)
- **Font-size**: `16px` (1rem)
- **Font-weight**: `900` (Black)
- **Line-height**: `1.3`
- **Letter-spacing**: `-0.3px`
- **Color**: `#111111`
- **사용처**: 상품 카드 제목, 섹션 타이틀

#### Body (본문)
- **Font-size**: `14px` (0.875rem)
- **Font-weight**: `600-700` (Semibold-Bold)
- **Line-height**: `1.5`
- **Letter-spacing**: `-0.2px`
- **Color**: `#111111` (기본), `#64748B` (보조)
- **사용처**: 상품 설명, 일반 텍스트

#### Small (보조 텍스트)
- **Font-size**: `12px` (0.75rem)
- **Font-weight**: `600-700`
- **Line-height**: `1.4`
- **Letter-spacing**: `-0.2px`
- **Color**: `#6B7280` (슬레이트-500)
- **사용처**: 입고일, 설명 텍스트, 배지 내부

#### X-Small (캡션)
- **Font-size**: `11px` (0.6875rem)
- **Font-weight**: `700-800`
- **Line-height**: `1.2`
- **Letter-spacing**: `-0.02em`
- **Color**: `#64748B` 또는 배경 대비 색상
- **사용처**: 배지, 칩, 인기지수

---

## 4) 레이아웃 규칙

### 컨테이너
- **Max-width**: `900px` (모바일/데스크탑 공통)
- **Margin**: `0 auto` (중앙 정렬)
- **Background**: `#FFFFFF` (컨텐츠 영역), `#F9FAFB` (페이지 배경)
- **Padding**: 페이지별 상이 (아래 상세)

### 그리드 시스템
- **모바일 (< 1024px)**: 2열 그리드
  - Gap: `10-12px`
  - Padding: `14px 16px` (섹션), `10px 12px` (그리드)
- **데스크탑 (≥ 1024px)**: 3열 그리드
  - Gap: `16px`
  - Padding: `20px`

### 간격 (Spacing)
- **XS**: `4px`
- **SM**: `8px`
- **MD**: `16px`
- **LG**: `24px`
- **XL**: `32px`
- **Section Padding**: `14px 16px` (모바일), `20px` (데스크탑)

### 카드 스타일
- **Border-radius**: `12px` (기본), `16px` (배너), `20px` (이벤트 배너)
- **Border**: `1.5px solid #D1D5DB` (기본), `1px solid #E5E7EB` (연한)
- **Shadow**: 
  - 기본: `0 4px 12px rgba(0,0,0,0.03)`
  - 호버: `0 10px 22px rgba(0,0,0,0.06)`
  - 배너: `0 10px 30px rgba(0,0,0,0.08)`
- **Padding**: `8px` (상품 카드), `16px` (주문 카드), `20-24px` (배너)

### 헤더/푸터
- **Header 높이**: `56px` (상단), `46px` (탭바, 총 102px)
- **Sticky**: `position: sticky; top: 0; z-index: 1000`
- **Background**: `#FFFFFF` (불투명)
- **Border-bottom**: `1px solid rgba(0,0,0,0.03)` (헤더), `1px solid #F1F5F9` (탭바)

### 사이드 메뉴
- **Width**: `min(80%, 320px)` (모바일), `360px` (데스크탑)
- **Position**: `fixed`, 왼쪽에서 슬라이드 (`translateX(-100%)` → `0`)
- **Background**: `#FFFFFF`
- **Shadow**: `8px 0 30px rgba(15, 23, 42, 0.35)`
- **Overlay**: `rgba(15, 23, 42, 0.55)` (딤드)

---

## 5) 컴포넌트 스펙

### Header
**구조**:
- 상단 행: 햄버거 메뉴 + 로고 + 예약내역 버튼 (56px)
- 하단 행: 탭 네비게이션 (46px, 스크롤 가능)

**로고**:
- Font: `'Playfair Display', 'Pretendard', serif`
- Size: `21px`
- Weight: `800`
- Color: `#111`
- Decoration: 이모지 장식 (🎉 ✨)

**탭 네비게이션**:
- Gap: `18px`
- Font-size: `15px`
- Weight: `600` (기본), `800` (활성)
- Color: `#9CA3AF` (기본), `#111` (활성)
- 인디케이터: `2px` 높이, `#111` 배경, `bottom: 6px`
- Transition: `transform 0.22s ease, width 0.22s ease`

**버튼**:
- Primary (예약내역): `#111` 배경, `#fff` 텍스트, `6px` radius
- Secondary (홈으로): `#fff` 배경, `#4B5563` 텍스트, `#E5E7EB` 테두리

### Button
**Primary (주요 액션)**:
- Background: `#111111`
- Color: `#FFFFFF`
- Padding: `12px 24px` (Large), `10px 20px` (Medium), `6px 12px` (Small)
- Border-radius: `8px` (Medium), `6px` (Small)
- Font-weight: `600-700`
- Hover: `#333333` 배경, `transform: translateY(-1px)`

**Secondary (보조 액션)**:
- Background: `#F3F4F6`
- Color: `#374151`
- Border: `1px solid #E5E7EB` (선택적)
- Hover: `#E5E7EB` 배경

**Ghost (테두리만)**:
- Background: `transparent`
- Color: `#111` 또는 Primary 색상
- Border: `1px solid` (색상 상속)
- Hover: `rgba(0,0,0,0.05)` 배경

**Danger (취소/삭제)**:
- Background: `#DC2626` 또는 `#8E1E20`
- Color: `#FFFFFF`
- Hover: 더 진한 레드

### Card (상품 카드)
**구조**:
```
┌─────────────────────┐
│ [뱃지] [인기지수]   │ (상단 행, 22px)
│                     │
│   [이미지 1:1]      │ (aspect-ratio: 1/1)
│                     │
│ 제목 (2줄 말줄임)   │
│ 입고일 | 가격       │
└─────────────────────┘
```

**스펙**:
- Width: `200px` (row), `100%` (grid)
- Padding: `8px`
- Border: `1.5px solid #D1D5DB`
- Border-radius: `12px`
- Shadow: `0 4px 12px rgba(0,0,0,0.03)`
- Gap: `8px` (내부 요소 간)

**이미지**:
- Aspect-ratio: `1:1`
- Border-radius: `8px` (내부)
- Background: `#F3F4F6` (플레이스홀더)

**메타 정보**:
- 제목: `14px`, `700`, `#111`, 2줄 말줄임
- 입고일: `12px`, `600`, `#6B7280`
- 가격: `15px`, `800`, `#111`
- 정상가: `11px`, 취소선, `#9CA3AF`

**순번 뱃지** (그리드 전용):
- Position: `absolute`, `top: -8px`, `left: -4px`
- Size: `28px × 28px`
- Background: `#111` (기본), 골드 그라데이션 (럭셔리)
- Font: `'Playfair Display'`, `14px`, `800`, italic
- Color: `#fff`
- Border-radius: `8px`
- Shadow: `2px 2px 6px rgba(0,0,0,0.2)`

### Badge/Tag
**인기상품 (BEST)**:
- Background: `linear-gradient(135deg, rgba(255, 59, 92, 0.98), rgba(255, 140, 0, 0.98))`
- Color: `#FFFFFF`
- Padding: `4px 9px`
- Border-radius: `999px`
- Font-size: `11px`, Weight: `800`
- Shadow: `0 10px 22px rgba(239, 68, 68, 0.22)`
- 애니메이션: Shine 효과 (2.8s)

**한정/신상품**:
- Background: `rgba(색상, 0.95)` (반투명)
- Color: 배경 대비 색상
- Padding: `4px 9px`
- Border-radius: `999px`
- Font-size: `11px`, Weight: `800`
- Shadow: `0 6px 14px rgba(0,0,0,0.10)`
- Backdrop-filter: `blur(6px)`

**인기지수**:
- Background: `rgba(17, 17, 17, 0.55)`
- Color: `rgba(255,255,255,0.95)`
- Padding: `4px 8px`
- Border-radius: `999px`
- Font-size: `11px`, Weight: `800`
- Backdrop-filter: `blur(8px)`

**마지막 찬스 (재고)**:
- Background: `#FEF2F2`
- Color: `#EF4444`
- Padding: `3px 8px`
- Border-radius: `6px`
- Font-size: `11px`, Weight: `700`

### Form Input/Select
**Input 기본**:
- Padding: `8px 16px`
- Border: `1px solid #CED4DA`
- Border-radius: `4px`
- Font-size: `16px` (기본)
- Background: `#FFFFFF`
- Focus: `border-color: #007BFF`, `box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.25)`

**Select**:
- 동일 스타일, 드롭다운 화살표 포함

### Table (관리자)
- Border: `1px solid #E5E7EB`
- Header: `#F9FAFB` 배경, `#111` 텍스트, `600` weight
- Cell: `#FFFFFF` 배경, `#1F2937` 텍스트
- Hover: `#F3F4F6` 배경

---

## 6) 화면별 요약

### Home (스토어 홈, `/?tab=home` 또는 `/`)

**정보 구조 (상단 → 하단)**:

1. **헤더** (Sticky)
   - 햄버거 메뉴 + 로고 "🎉 송도PICK ✨" + 예약내역 버튼
   - 탭 네비게이션: 스토어홈 | 🚀 내일픽업 | 🔥 오늘공구 | ...

2. **이벤트 배너 슬라이더** (자동 전환 5초)
   - 배경: 그라데이션 (배너별 상이)
   - 구조: 칩 + 제목 + 설명 + CTA 버튼 + 이미지(우측)
   - 도트 네비게이션 (하단 중앙)
   - Border-radius: `20px`
   - Margin: `16px 20px 24px`
   - Shadow: `0 10px 30px rgba(0,0,0,0.08)`

3. **🔥 오늘의 공구 섹션**
   - 헤더: 제목 + 설명 + "전체보기" 버튼
   - 가로 스크롤 카드 리스트 (DragHScroll)
   - 카드: `200px` 고정 너비, 인기순 정렬
   - 인기상품 뱃지: 상위 3개

4. **🚀 내일 픽업 가능** (조건부 표시)
   - 동일 구조, 내일 픽업 상품만 필터링

5. **✨ 기획전**
   - 동일 구조, 이벤트 타입 상품만 필터링

6. **🔁 추가공구**
   - 동일 구조, Secondary phase 상품만

7. **🏢 현장판매**
   - 동일 구조, Onsite 상품만

8. **⚡ 마지막 찬스**
   - 동일 구조, 재고 3개 이하만

**UX 의도**:
- 첫 화면에서 모든 카테고리를 한눈에 파악
- 가로 스크롤로 빠른 탐색 (드래그 지원)
- 인기상품 우선 노출로 전환율 향상
- 배너로 이벤트/프로모션 강조

---

### List (개별 탭 화면, `/?tab=today` 등)

**정보 구조**:

1. **헤더** (동일)

2. **탭 배너** (조건부)
   - 배경색: 탭별 상이 (`#FFF1F2`, `#ECFEFF` 등)
   - 제목 + 설명
   - Border-radius: `16px` (이미지 있음), `0` (없음)
   - Margin: `0 16px 16px` (이미지 있음), `0 0 8px` (없음)

3. **상품 그리드**
   - 2열 (모바일), 3열 (데스크탑)
   - Gap: `10px` (모바일), `16px` (데스크탑)
   - Padding: `10px 12px 40px` (모바일), `20px 20px 40px` (데스크탑)
   - 카드에 순번 뱃지 표시 (좌측 상단 외부)

4. **무한 스크롤 트리거**
   - 높이 `1px` div, `600px` rootMargin으로 미리 로드

5. **로딩/에러 상태**
   - 에러: 아이콘 + 메시지 + "다시 시도" 버튼
   - 빈 상태: 아이콘 + 메시지

**UX 의도**:
- 탭별 집중된 탐색 경험
- 그리드로 많은 상품을 효율적으로 표시
- 순번으로 인지적 부담 감소
- 무한 스크롤로 자연스러운 탐색

---

### Detail (상품 상세, `/product/:id`)

**정보 구조** (추정):
1. 헤더 (뒤로가기 + 공유)
2. 이미지 갤러리 (가로 스와이프)
3. 상품 정보 (제목, 가격, 옵션)
4. 상세 설명
5. 하단 고정 버튼 (예약하기)

**UX 의도**:
- 이미지 중심의 몰입형 레이아웃
- 옵션 선택 → 즉시 예약 가능한 플로우

---

### Cart/Checkout (예약 내역, `/mypage/history`)

**정보 구조**:

1. **헤더**
   - "홈으로" 버튼 (히스토리 페이지 전용)

2. **과거 내역 토글**
   - "취소/노쇼 포함 보기" 버튼 (우측 상단)
   - Background: `#F3F4F6`, Border: `#E5E7EB`

3. **날짜별 그룹핑**
   - 날짜 헤더: `M/D(요일) 픽업상품`
   - Border-bottom: `1px solid #E5E7EB`
   - 첫 그룹에 안내 문구: "카드를 클릭하여 취소할 항목을 선택하세요."

4. **주문 카드 그리드**
   - Grid: `repeat(auto-fill, minmax(320px, 1fr))`
   - Gap: `16px`
   - 카드 구조:
     - 이미지 (72×72px, `12px` radius)
     - 상품명 + 상태 배지
     - 옵션명 + 수량 (또는 수량 조절 컨트롤)
     - 취소 불가 안내 (조건부)

5. **수량 조절** (취소 가능 시에만)
   - Background: `#F1F5F9`
   - Border-radius: `8px`
   - 버튼: `24×24px`, `#FFFFFF` 배경
   - Debounce: `800ms`

6. **FAB (플로팅 액션 버튼)**
   - 조건: 선택된 항목이 있을 때
   - Position: `fixed`, `bottom: 2rem`, `right: 1.5rem`
   - Background: `#D42426`
   - Border-radius: `9999px`
   - Shadow: `0 6px 20px rgba(0,0,0,0.4)`

7. **더보기 버튼** (하단)
   - "지난 내역 더보기"
   - Background: `#F3F4F6`, Border: `#E5E7EB`

**UX 의도**:
- 날짜별 그룹핑으로 픽업 일정 파악 용이
- 카드 선택 방식으로 일괄 취소 지원
- 수량 조절은 즉시 반영 (debounce로 서버 부하 감소)
- 취소된 항목은 흑백 처리로 시각적 구분

---

### Admin (관리자 페이지)

**정보 구조** (추정):
1. 사이드바 (다크 테마, `#111827`)
2. 메인 컨텐츠 영역 (화이트)
3. 테이블/폼 컴포넌트

**UX 의도**:
- 관리 기능 중심의 효율적 레이아웃
- 다크 사이드바로 브랜드 일관성 유지

---

## 추가 사양

### 애니메이션
- **Transition 기본**: `0.2s ease` 또는 `0.15s ease`
- **카드 호버**: `transform: translateY(-2px)`, `0.15s ease`
- **버튼 클릭**: `transform: scale(0.95)` 또는 `translateY(0)`
- **배너 슬라이드**: `transform: translateX(-${index * 100}%)`, `0.5s cubic-bezier(0.25, 1, 0.5, 1)`
- **인기상품 뱃지 Shine**: `2.8s ease-in-out infinite`

### 반응형 브레이크포인트
- **모바일**: `< 1024px` (2열 그리드)
- **데스크탑**: `≥ 1024px` (3열 그리드)
- **태블릿**: `768px` 기준 (일부 컴포넌트 조정)

### 접근성
- **ARIA 레이블**: 버튼, 링크에 명시
- **포커스 표시**: `outline` 또는 `box-shadow` (키보드 네비게이션)
- **터치 영역**: 최소 `44×44px` (모바일)

---

## 구현 시 주의사항

1. **배경색 계층**: 페이지(`#F9FAFB`) → 컨테이너(`#FFFFFF`) → 카드(`#FFFFFF` + shadow)
2. **폰트 로딩**: Pretendard는 CDN, Playfair Display는 Google Fonts (또는 로컬)
3. **이미지 최적화**: `OptimizedImage` 컴포넌트 사용, `200x200` 크기
4. **스크롤 성능**: `-webkit-overflow-scrolling: touch`, `will-change` 활용
5. **드래그 스크롤**: 마우스만 활성화, 모바일은 기본 스와이프 유지

---

**문서 버전**: 1.0  
**최종 업데이트**: 2026-01-XX  
**기반 코드**: `src/pages/customer/ModernProductList.tsx` 및 관련 CSS 파일

