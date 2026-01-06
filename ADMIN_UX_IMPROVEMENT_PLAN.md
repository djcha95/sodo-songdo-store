# 관리자 페이지 UI/UX 개선 계획서

**작성일**: 2025년 1월  
**목표**: 실무용 관리자 대시보드 최적화, 모바일 대응, 실수 방지

---

## 📐 1. 정보 구조(IA) 재설계

### 현재 문제점
- 모든 메뉴가 동일한 위상으로 나열됨
- 실운영 필수/위험/불필요 기능 구분 없음
- 자주 쓰는 기능과 덜 쓰는 기능이 섞여 있음

### 개선안: 3단계 메뉴 구조

```
📱 사이드바 구조 (데스크톱)
├─ 🏠 일일 업무 (항상 접근 가능)
│  ├─ 대시보드
│  ├─ 픽업 체크
│  ├─ 빠른 예약확인
│  └─ 선입금 관리
│
├─ 📦 상품 & 주문 (자주 사용)
│  ├─ 상품 목록
│  ├─ 새 상품 등록
│  ├─ 주문 통합 관리
│  └─ 재고 관리
│
├─ 👥 고객 관리 (중간 빈도)
│  └─ 고객 관리
│
├─ ⚙️ 설정 (가끔 사용)
│  └─ 배너 관리
│
└─ 🔴 위험 기능 (접근 제한)
   ├─ 새 주문 생성 (⚠️)
   └─ 시스템 관리 (⚠️ 마스터만)
```

---

## 🎨 2. 메뉴 그룹핑 및 시각적 분리

### 구현 방법 (점진적 개선)

#### Step 1: AdminSidebar 컴포넌트 수정

```tsx
// src/components/admin/AdminSidebar.tsx 수정안

const AdminSidebar: React.FC<AdminSidebarProps> = ({ isSidebarOpen, toggleSidebar }) => {
  const { userDocument } = useAuth(); // 권한 확인용
  const isMaster = userDocument?.role === 'master';

  return (
    <aside className={`admin-sidebar ${!isSidebarOpen ? 'collapsed' : ''}`}>
      {/* ... 헤더 ... */}
      
      <nav className="sidebar-nav">
        {/* 1. 일일 업무 그룹 */}
        <MenuGroup 
          title="일일 업무" 
          icon={<CalendarCheck />}
          isSidebarOpen={isSidebarOpen}
          priority="high"
        >
          <MenuItem to="/admin/dashboard" icon={<Home />} text="대시보드" />
          <MenuItem to="/admin/pickup-check" icon={<CalendarCheck />} text="픽업 체크" />
          <MenuItem to="/admin/quick-check" icon={<Zap />} text="빠른 예약확인" />
          <MenuItem to="/admin/prepaid-check" icon={<Wallet />} text="선입금 관리" />
        </MenuGroup>

        {/* 2. 상품 & 주문 그룹 */}
        <MenuGroup 
          title="상품 & 주문" 
          icon={<Package />}
          isSidebarOpen={isSidebarOpen}
          priority="normal"
        >
          <MenuItem to="/admin/products" icon={<Package />} text="상품 목록" />
          <MenuItem to="/admin/products/add" icon={<PlusSquare />} text="새 상품 등록" />
          <MenuItem to="/admin/orders" icon={<ShoppingCart />} text="주문 통합 관리" />
          <MenuItem to="/admin/stock" icon={<ClipboardList />} text="재고 관리" />
        </MenuGroup>

        {/* 3. 고객 관리 그룹 */}
        <MenuGroup 
          title="고객 관리" 
          icon={<Users />}
          isSidebarOpen={isSidebarOpen}
          priority="normal"
        >
          <MenuItem to="/admin/users" icon={<Users />} text="고객 관리" />
        </MenuGroup>

        {/* 4. 설정 그룹 */}
        <MenuGroup 
          title="설정" 
          icon={<Settings />}
          isSidebarOpen={isSidebarOpen}
          priority="low"
        >
          <MenuItem to="/admin/banners" icon={<Image />} text="배너 관리" />
        </MenuGroup>

        {/* 5. 위험 기능 그룹 (시각적으로 분리) */}
        {isSidebarOpen && (
          <div className="menu-group-danger">
            <div className="menu-group-header danger">
              <AlertTriangle size={16} />
              <span>위험 기능</span>
            </div>
            <ul>
              <MenuItem 
                to="/admin/create-order" 
                icon={<PlusSquare />} 
                text="새 주문 생성" 
                variant="danger"
              />
              {isMaster && (
                <MenuItem 
                  to="/admin/tools" 
                  icon={<Settings />} 
                  text="시스템 관리" 
                  variant="danger"
                />
              )}
            </ul>
          </div>
        )}
      </nav>
    </aside>
  );
};
```

#### Step 2: CSS 스타일 추가

```css
/* src/components/admin/AdminSidebar.css 추가 */

/* 메뉴 그룹 스타일 */
.menu-group {
  margin-bottom: 24px;
}

.menu-group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #64748b;
  margin-bottom: 8px;
}

.menu-group-header.high {
  color: #0ea5e9;
}

.menu-group-header.normal {
  color: #64748b;
}

.menu-group-header.low {
  color: #94a3b8;
}

/* 위험 기능 그룹 (시각적으로 강조) */
.menu-group-danger {
  margin-top: 32px;
  padding-top: 24px;
  border-top: 2px solid #ef4444;
  background-color: rgba(239, 68, 68, 0.05);
  border-radius: 8px;
  padding: 16px;
}

.menu-group-danger .menu-group-header {
  color: #ef4444;
  font-weight: 700;
}

.menu-group-danger .menu-item a {
  color: #dc2626;
  border-left: 3px solid #ef4444;
}

.menu-group-danger .menu-item a:hover {
  background-color: rgba(239, 68, 68, 0.1);
}

/* 사이드바 접힘 상태에서도 그룹 구분 유지 */
.admin-sidebar.collapsed .menu-group {
  margin-bottom: 16px;
}

.admin-sidebar.collapsed .menu-group-header {
  display: none;
}
```

---

## 📱 3. 모바일 대응 전략

### 현재 문제점
- 테이블이 모바일에서 가로 스크롤만 가능 (사용 불편)
- 버튼과 입력폼이 작아서 터치하기 어려움
- 사이드바가 모바일에서 제대로 작동하지 않음

### 개선안: 모바일 우선 레이아웃

#### Step 1: 모바일 네비게이션 (하단 탭 바)

```tsx
// src/components/admin/AdminMobileNav.tsx (신규 생성)

import { NavLink } from 'react-router-dom';
import { Home, CalendarCheck, Zap, Wallet, Package, Users } from 'lucide-react';
import './AdminMobileNav.css';

const AdminMobileNav = () => {
  return (
    <nav className="admin-mobile-nav">
      <NavLink to="/admin/dashboard" className="mobile-nav-item">
        <Home size={20} />
        <span>대시보드</span>
      </NavLink>
      <NavLink to="/admin/pickup-check" className="mobile-nav-item">
        <CalendarCheck size={20} />
        <span>픽업</span>
      </NavLink>
      <NavLink to="/admin/quick-check" className="mobile-nav-item">
        <Zap size={20} />
        <span>빠른확인</span>
      </NavLink>
      <NavLink to="/admin/products" className="mobile-nav-item">
        <Package size={20} />
        <span>상품</span>
      </NavLink>
      <NavLink to="/admin/users" className="mobile-nav-item">
        <Users size={20} />
        <span>고객</span>
      </NavLink>
    </nav>
  );
};

export default AdminMobileNav;
```

```css
/* src/components/admin/AdminMobileNav.css */

.admin-mobile-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-around;
  align-items: center;
  background: #ffffff;
  border-top: 1px solid #e5e7eb;
  padding: 8px 0 calc(8px + env(safe-area-inset-bottom));
  z-index: 1000;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
}

.mobile-nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  color: #6b7280;
  text-decoration: none;
  font-size: 0.75rem;
  transition: color 0.2s;
  min-width: 60px;
}

.mobile-nav-item.active {
  color: #0ea5e9;
}

.mobile-nav-item span {
  font-size: 0.7rem;
  font-weight: 500;
}

@media (min-width: 769px) {
  .admin-mobile-nav {
    display: none;
  }
}
```

#### Step 2: AdminLayout 수정 (모바일 네비게이션 통합)

```tsx
// src/components/admin/AdminLayout.tsx 수정

const AdminLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className={`admin-layout ${!isSidebarOpen ? 'sidebar-collapsed' : ''}`}>
      {/* 데스크톱 사이드바 */}
      <AdminSidebar
        isSidebarOpen={isSidebarOpen}
        toggleSidebar={toggleSidebar}
      />
      
      {/* 모바일 메뉴 버튼 (상단) */}
      <button 
        className="mobile-menu-toggle"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        <Menu size={24} />
      </button>

      {/* 모바일 메뉴 오버레이 */}
      {isMobileMenuOpen && (
        <div className="mobile-menu-overlay" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="mobile-menu-content" onClick={(e) => e.stopPropagation()}>
            {/* 전체 메뉴 목록 */}
          </div>
        </div>
      )}

      <main className="admin-main-content">
        <Suspense fallback={<SodomallLoader />}>
          <Outlet />
        </Suspense>
      </main>

      {/* 모바일 하단 네비게이션 */}
      <AdminMobileNav />
    </div>
  );
};
```

#### Step 3: 테이블 모바일 대응 (카드 뷰 전환)

```tsx
// 공통 컴포넌트: src/components/admin/ResponsiveTable.tsx

import { useState, useEffect } from 'react';

interface ResponsiveTableProps {
  columns: Array<{ key: string; label: string; mobileLabel?: string }>;
  data: any[];
  renderRow: (item: any, isMobile: boolean) => React.ReactNode;
}

const ResponsiveTable: React.FC<ResponsiveTableProps> = ({ columns, data, renderRow }) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (isMobile) {
    // 모바일: 카드 뷰
    return (
      <div className="mobile-card-list">
        {data.map((item, index) => (
          <div key={index} className="mobile-card">
            {renderRow(item, true)}
          </div>
        ))}
      </div>
    );
  }

  // 데스크톱: 테이블 뷰
  return (
    <table className="desktop-table">
      <thead>
        <tr>
          {columns.map(col => (
            <th key={col.key}>{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((item, index) => (
          <tr key={index}>{renderRow(item, false)}</tr>
        ))}
      </tbody>
    </table>
  );
};
```

---

## ⚠️ 4. 실수 방지 UX 패턴

### 패턴 1: 위험 버튼 2단계 확인

```tsx
// src/components/admin/DangerButton.tsx (신규 생성)

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import './DangerButton.css';

interface DangerButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  confirmText?: string;
  variant?: 'danger' | 'warning';
}

const DangerButton: React.FC<DangerButtonProps> = ({ 
  onClick, 
  children, 
  confirmText = '정말 실행하시겠습니까?',
  variant = 'danger'
}) => {
  const [isConfirming, setIsConfirming] = useState(false);

  const handleClick = () => {
    if (!isConfirming) {
      setIsConfirming(true);
      setTimeout(() => setIsConfirming(false), 3000); // 3초 후 자동 취소
      return;
    }
    onClick();
    setIsConfirming(false);
  };

  return (
    <button
      className={`danger-button ${variant} ${isConfirming ? 'confirming' : ''}`}
      onClick={handleClick}
    >
      {isConfirming ? (
        <>
          <AlertTriangle size={16} />
          <span>다시 클릭하여 확인</span>
        </>
      ) : (
        children
      )}
    </button>
  );
};
```

```css
/* src/components/admin/DangerButton.css */

.danger-button {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.danger-button.danger {
  background-color: #fee2e2;
  color: #dc2626;
  border: 2px solid #dc2626;
}

.danger-button.warning {
  background-color: #fef3c7;
  color: #d97706;
  border: 2px solid #d97706;
}

.danger-button.confirming {
  background-color: #dc2626;
  color: white;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
```

### 패턴 2: 단계별 확인 모달

```tsx
// src/components/admin/ConfirmModal.tsx 개선안

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  dangerLevel?: 'low' | 'medium' | 'high';
  requireTyping?: string; // 입력해야 하는 텍스트
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = '확인',
  dangerLevel = 'low',
  requireTyping
}) => {
  const [typedText, setTypedText] = useState('');

  if (!isOpen) return null;

  const canConfirm = !requireTyping || typedText === requireTyping;

  return (
    <div className="confirm-modal-overlay">
      <div className={`confirm-modal ${dangerLevel}`}>
        <div className="confirm-modal-header">
          <AlertTriangle size={24} className={`icon-${dangerLevel}`} />
          <h3>{title}</h3>
        </div>
        <div className="confirm-modal-body">
          <p>{message}</p>
          {requireTyping && (
            <div className="confirm-typing">
              <label>
                확인을 위해 <strong>"{requireTyping}"</strong>를 입력하세요:
              </label>
              <input
                type="text"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                placeholder={requireTyping}
              />
            </div>
          )}
        </div>
        <div className="confirm-modal-footer">
          <button onClick={onClose} className="btn-cancel">취소</button>
          <button 
            onClick={onConfirm} 
            className={`btn-confirm ${dangerLevel}`}
            disabled={!canConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
```

### 패턴 3: 실행 전 요약 표시

```tsx
// 위험 작업 실행 전 변경 사항 요약 표시

const ExecuteWithSummary = ({ action, summary, onConfirm }) => {
  const [showSummary, setShowSummary] = useState(false);

  return (
    <>
      <button onClick={() => setShowSummary(true)}>실행</button>
      {showSummary && (
        <div className="action-summary-modal">
          <h3>실행 전 확인</h3>
          <div className="summary-content">
            {summary}
          </div>
          <div className="summary-actions">
            <button onClick={() => setShowSummary(false)}>취소</button>
            <button onClick={onConfirm} className="btn-confirm">
              확인하고 실행
            </button>
          </div>
        </div>
      )}
    </>
  );
};
```

---

## 🎯 5. 공통 관리자 UI 컴포넌트 패턴

### 컴포넌트 1: 페이지 헤더 (통일된 스타일)

```tsx
// src/components/admin/AdminPageHeader.tsx

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  priority?: 'high' | 'normal' | 'low';
}

const AdminPageHeader: React.FC<AdminPageHeaderProps> = ({
  title,
  subtitle,
  actions,
  priority = 'normal'
}) => {
  return (
    <header className={`admin-page-header priority-${priority}`}>
      <div className="header-content">
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="header-actions">{actions}</div>}
      </div>
    </header>
  );
};
```

### 컴포넌트 2: 통계 카드 (대시보드용)

```tsx
// src/components/admin/StatCard.tsx

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: { value: number; isPositive: boolean };
  icon?: React.ReactNode;
  onClick?: () => void;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, trend, icon, onClick }) => {
  return (
    <div className={`stat-card ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      <div className="stat-header">
        <span className="stat-label">{label}</span>
        {icon && <div className="stat-icon">{icon}</div>}
      </div>
      <div className="stat-value">{value}</div>
      {trend && (
        <div className={`stat-trend ${trend.isPositive ? 'positive' : 'negative'}`}>
          {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
        </div>
      )}
    </div>
  );
};
```

### 컴포넌트 3: 필터 바 (공통)

```tsx
// src/components/admin/FilterBar.tsx

interface FilterBarProps {
  searchPlaceholder?: string;
  filters?: Array<{ key: string; label: string; options: any[] }>;
  onSearch?: (value: string) => void;
  onFilterChange?: (key: string, value: any) => void;
}

const FilterBar: React.FC<FilterBarProps> = ({
  searchPlaceholder = '검색...',
  filters = [],
  onSearch,
  onFilterChange
}) => {
  return (
    <div className="filter-bar">
      <div className="filter-search">
        <Search size={20} />
        <input
          type="text"
          placeholder={searchPlaceholder}
          onChange={(e) => onSearch?.(e.target.value)}
        />
      </div>
      {filters.map(filter => (
        <select
          key={filter.key}
          onChange={(e) => onFilterChange?.(filter.key, e.target.value)}
        >
          <option value="">{filter.label}</option>
          {filter.options.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
};
```

---

## 📋 6. 실제 업무 흐름 기준 화면 재배치

### 업무 흐름 분석

**아침 업무 (09:00)**
1. 대시보드 확인 → 판매 현황 파악
2. 빠른 예약확인 → 오늘 주문 확인
3. 선입금 관리 → 미입금 확인

**점심 업무 (12:00)**
1. 픽업 체크 → 오후 픽업 준비
2. 재고 관리 → 현장 판매 재고 확인

**저녁 업무 (18:00)**
1. 주문 통합 관리 → 하루 정리
2. 상품 관리 → 내일 상품 준비

### 개선안: 업무 시간대별 빠른 접근

```tsx
// 대시보드에 업무 시간대별 빠른 링크 추가

const DashboardPage = () => {
  const currentHour = new Date().getHours();
  const timeSlot = currentHour < 12 ? 'morning' : currentHour < 18 ? 'afternoon' : 'evening';

  const quickLinks = {
    morning: [
      { to: '/admin/quick-check', label: '빠른 예약확인', icon: <Zap /> },
      { to: '/admin/prepaid-check', label: '선입금 관리', icon: <Wallet /> },
    ],
    afternoon: [
      { to: '/admin/pickup-check', label: '픽업 체크', icon: <CalendarCheck /> },
      { to: '/admin/stock', label: '재고 관리', icon: <ClipboardList /> },
    ],
    evening: [
      { to: '/admin/orders', label: '주문 통합 관리', icon: <ShoppingCart /> },
      { to: '/admin/products', label: '상품 관리', icon: <Package /> },
    ],
  };

  return (
    <div className="dashboard-container">
      {/* 시간대별 빠른 링크 */}
      <div className="quick-links-section">
        <h2>지금 할 일</h2>
        <div className="quick-links-grid">
          {quickLinks[timeSlot].map(link => (
            <Link key={link.to} to={link.to} className="quick-link-card">
              {link.icon}
              <span>{link.label}</span>
            </Link>
          ))}
        </div>
      </div>
      {/* ... 기존 대시보드 내용 ... */}
    </div>
  );
};
```

---

## 🚀 7. 점진적 적용 로드맵

### Phase 1: 즉시 적용 가능 (1주)
1. ✅ 메뉴 그룹핑 (AdminSidebar 수정)
2. ✅ 위험 기능 시각적 분리
3. ✅ 모바일 하단 네비게이션 추가
4. ✅ DangerButton 컴포넌트 생성

### Phase 2: 단기 개선 (2-3주)
1. ✅ ResponsiveTable 컴포넌트 생성 및 적용
2. ✅ ConfirmModal 개선 (단계별 확인)
3. ✅ AdminPageHeader 컴포넌트 통일
4. ✅ 대시보드에 시간대별 빠른 링크 추가

### Phase 3: 중기 개선 (1-2개월)
1. ✅ 모든 테이블을 ResponsiveTable로 전환
2. ✅ 모바일 카드 뷰 완성
3. ✅ 공통 컴포넌트 패턴 확립
4. ✅ 불필요 기능 완전 숨김 처리

---

## 📱 모바일 최적화 체크리스트

### 즉시 적용
- [ ] 하단 네비게이션 바 추가
- [ ] 버튼 최소 터치 영역 44x44px 확보
- [ ] 입력 필드 폰트 크기 16px 이상 (줌 방지)
- [ ] 테이블 → 카드 뷰 전환

### 단기 개선
- [ ] 모바일 메뉴 오버레이
- [ ] 스와이프 제스처 지원
- [ ] Pull-to-refresh 추가
- [ ] 모바일 전용 필터 UI

---

## ⚠️ 위험 기능 처리 가이드라인

### 시각적 표시
1. **색상**: 빨간색 계열 사용 (#ef4444)
2. **아이콘**: AlertTriangle 아이콘 필수
3. **테두리**: 두꺼운 빨간 테두리
4. **배경**: 연한 빨간 배경 (#fee2e2)

### 접근 제한
1. **마스터 권한**: 시스템 관리 도구
2. **2단계 확인**: 모든 위험 기능
3. **입력 확인**: 매우 위험한 기능은 텍스트 입력 필수
4. **로그 기록**: 모든 위험 작업 로그 남기기

---

## 🎨 디자인 원칙

### 색상 체계
- **일일 업무**: 파란색 (#0ea5e9) - 긴급/중요
- **일반 기능**: 회색 (#64748b) - 정상
- **설정**: 연한 회색 (#94a3b8) - 낮은 우선순위
- **위험 기능**: 빨간색 (#ef4444) - 주의 필요

### 간격 규칙
- **그룹 간**: 24px
- **메뉴 항목 간**: 8px
- **카드 내부**: 16px
- **페이지 여백**: 24px (데스크톱), 16px (모바일)

### 타이포그래피
- **페이지 제목**: 1.75rem, 700
- **섹션 제목**: 1.15rem, 600
- **본문**: 0.9rem, 400
- **라벨**: 0.75rem, 600

---

이 계획서는 점진적으로 적용 가능하도록 단계별로 나누어져 있습니다. 각 Phase를 순차적으로 진행하면서 사용자 피드백을 반영하여 개선해 나가시면 됩니다.


















