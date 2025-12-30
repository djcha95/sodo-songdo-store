# 관리자 페이지 UI/UX 개선 실제 적용 예시

**작성일**: 2025년 1월  
**목적**: 실제 코드 예시를 통한 적용 가이드

---

## 📋 예시 1: 대시보드 페이지 개선

### 현재 상태
- 테이블이 모바일에서 가로 스크롤만 가능
- 정보 밀도가 높아서 한눈에 파악하기 어려움

### 개선안 적용

```tsx
// src/pages/admin/DashboardPage.tsx 수정 예시

import AdminPageHeader from '@/components/admin/AdminPageHeader';
import ResponsiveTable from '@/components/admin/ResponsiveTable';
import { TrendingUp } from 'lucide-react';

const DashboardPage: React.FC = () => {
  // ... 기존 로직 ...

  // 테이블 컬럼 정의
  const tableColumns = [
    { 
      key: 'productName', 
      label: '상품명',
      mobileLabel: '상품',
      mobileRender: (item) => (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.productName}</div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{item.roundName}</div>
        </div>
      )
    },
    { 
      key: 'pendingPrepaymentQuantity', 
      label: '선입금 대기',
      mobileLabel: '선입금',
      render: (value) => value > 0 ? value : '-'
    },
    { 
      key: 'confirmedReservedQuantity', 
      label: '확정 수량',
      mobileLabel: '확정'
    },
    { 
      key: 'remainingStock', 
      label: '남은 수량',
      mobileLabel: '재고',
      render: (value, item) => {
        const remaining = item.configuredStock === -1 
          ? '무제한' 
          : item.configuredStock - item.confirmedReservedQuantity;
        return remaining === -1 ? '무제한' : `${remaining}`;
      }
    },
    { 
      key: 'actions', 
      label: '관리',
      mobileLabel: null, // 모바일에서 숨김
      render: (_, item) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <CopyLinkButton productId={item.productId} />
          <button onClick={() => setFixTarget({ id: item.productId, name: item.productName })}>
            수량 제한
          </button>
        </div>
      )
    },
  ];

  // 테이블 데이터 준비
  const tableData = Object.values(groupedItems).flat().map(item => ({
    ...item,
    remainingStock: item.configuredStock === -1 
      ? -1 
      : item.configuredStock - item.confirmedReservedQuantity
  }));

  return (
    <div className="dashboard-container">
      {/* 개선된 헤더 */}
      <AdminPageHeader
        title="통합 판매 현황 대시보드"
        subtitle="실시간 판매 현황을 한눈에 확인하세요"
        icon={<TrendingUp size={24} />}
        priority="high"
        actions={
          <button onClick={fetchData}>새로고침</button>
        }
      />

      {/* 개선된 테이블 (모바일 자동 대응) */}
      {sortedDateKeys.map(date => (
        <div key={date} className="dashboard-group">
          <h2 className="group-title">{date} 발행 상품</h2>
          <ResponsiveTable
            columns={tableColumns}
            data={groupedItems[date]}
            emptyMessage="표시할 상품이 없습니다."
          />
        </div>
      ))}
    </div>
  );
};
```

---

## 📋 예시 2: 주문 관리 페이지 개선

### 현재 상태
- 테이블이 모바일에서 사용 불가
- 필터와 검색이 복잡함

### 개선안 적용

```tsx
// src/pages/admin/OrderManagementPage.tsx 수정 예시

import AdminPageHeader from '@/components/admin/AdminPageHeader';
import ResponsiveTable from '@/components/admin/ResponsiveTable';
import FilterBar from '@/components/admin/FilterBar';
import { ShoppingCart, Search } from 'lucide-react';

const OrderManagementPage: React.FC = () => {
  // ... 기존 로직 ...

  const columns = [
    {
      key: 'orderDate',
      label: '예약일',
      mobileLabel: '날짜',
      render: (value) => formatDate(value),
      mobileRender: (item) => (
        <div>
          <div style={{ fontWeight: 600 }}>{formatDate(item.orderDate)}</div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            {item.customerName}
          </div>
        </div>
      )
    },
    {
      key: 'customerName',
      label: '고객명',
      mobileLabel: null, // 모바일 카드에서 이미 표시됨
    },
    {
      key: 'items',
      label: '품목',
      mobileLabel: '상품',
      render: (items) => items.map(i => i.productName).join(', '),
      mobileRender: (item) => (
        <div>
          {item.items.map((i, idx) => (
            <div key={idx} style={{ marginBottom: 4 }}>
              {i.productName} × {i.quantity}
            </div>
          ))}
        </div>
      )
    },
    {
      key: 'totalPrice',
      label: '합계',
      mobileLabel: '금액',
      render: (value) => `${value.toLocaleString()}원`
    },
    {
      key: 'status',
      label: '상태',
      mobileLabel: '상태',
      render: (value) => <StatusBadge status={value} />
    },
    {
      key: 'actions',
      label: '관리',
      mobileLabel: null,
      render: (_, item) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to={`/admin/orders/${item.id}`}>상세</Link>
        </div>
      )
    },
  ];

  return (
    <div className="admin-page-container">
      <AdminPageHeader
        title="주문 통합 관리"
        subtitle="모든 주문을 조회하고 관리합니다"
        icon={<ShoppingCart size={24} />}
        priority="high"
        actions={
          <Link to="/admin/quick-check">
            <button>빠른 확인</button>
          </Link>
        }
      />

      <FilterBar
        searchPlaceholder="고객명, 전화번호, 상품명으로 검색..."
        filters={[
          {
            key: 'status',
            label: '상태',
            options: [
              { value: '', label: '전체' },
              { value: 'RESERVED', label: '예약' },
              { value: 'PREPAID', label: '선입금' },
              { value: 'PICKED_UP', label: '픽업완료' },
            ]
          },
          {
            key: 'date',
            label: '날짜',
            options: [
              { value: 'today', label: '오늘' },
              { value: 'week', label: '이번 주' },
              { value: 'month', label: '이번 달' },
            ]
          }
        ]}
        onSearch={handleSearch}
        onFilterChange={handleFilterChange}
      />

      <ResponsiveTable
        columns={columns}
        data={filteredOrders}
        emptyMessage="조건에 맞는 주문이 없습니다."
      />
    </div>
  );
};
```

---

## 📋 예시 3: 위험 기능에 DangerButton 적용

### 시스템 도구 페이지

```tsx
// src/pages/admin/AdminToolsPage.tsx 수정 예시

import DangerButton from '@/components/admin/DangerButton';
import { AlertTriangle } from 'lucide-react';

const AdminToolsPage = () => {
  const handleRebuild = async () => {
    // 재구축 로직
  };

  return (
    <div className="admin-tools-container">
      <AdminPageHeader
        title="시스템 관리"
        subtitle="⚠️ 위험한 작업입니다. 신중하게 사용하세요"
        priority="high"
        icon={<AlertTriangle size={24} />}
      />

      <div className="tools-card">
        <h3>재고 통계 재구축</h3>
        <p>모든 주문 내역을 다시 계산하여 재고 통계를 재구축합니다.</p>
        
        {/* 기존 버튼 대신 DangerButton 사용 */}
        <DangerButton
          onClick={handleRebuild}
          variant="danger"
          confirmText="다시 클릭하여 확인"
        >
          <AlertTriangle size={16} />
          재구축 실행
        </DangerButton>
      </div>
    </div>
  );
};
```

---

## 📋 예시 4: 모바일 카드 뷰 커스터마이징

### 사용자 목록 페이지

```tsx
// src/pages/admin/UserListPage.tsx 수정 예시

import ResponsiveTable from '@/components/admin/ResponsiveTable';

const UserListPage = () => {
  const columns = [
    {
      key: 'displayName',
      label: '이름',
      mobileLabel: '고객',
      mobileRender: (user) => (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {user.displayName}
          </div>
          {user.nickname && (
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
              @{user.nickname}
            </div>
          )}
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 4 }}>
            {formatPhoneNumber(user.phone)}
          </div>
        </div>
      )
    },
    {
      key: 'phone',
      label: '전화번호',
      mobileLabel: null, // 모바일 카드에서 이미 표시됨
      render: (value) => formatPhoneNumber(value)
    },
    {
      key: 'email',
      label: '이메일',
      mobileLabel: '이메일',
      render: (value) => value || '-'
    },
    {
      key: 'noShowCount',
      label: '노쇼',
      mobileLabel: '노쇼',
      render: (value) => (
        <span style={{ color: value > 0 ? '#dc2626' : 'inherit' }}>
          {value || 0}
        </span>
      )
    },
    {
      key: 'actions',
      label: '관리',
      mobileLabel: null,
      render: (_, user) => (
        <Link to={`/admin/users/${user.uid}`}>
          <button>상세</button>
        </Link>
      )
    },
  ];

  return (
    <div className="admin-page-container">
      <AdminPageHeader
        title="전체 고객 관리"
        subtitle="고객 정보를 조회하고 관리합니다"
        icon={<Users size={24} />}
      />

      <FilterBar
        searchPlaceholder="고객명, 닉네임, 이메일, 전화번호로 검색..."
        onSearch={setSearchTerm}
      />

      <ResponsiveTable
        columns={columns}
        data={paginatedUsers}
        emptyMessage="표시할 고객이 없습니다."
      />
    </div>
  );
};
```

---

## 📋 예시 5: 시간대별 빠른 링크 (대시보드)

```tsx
// src/pages/admin/DashboardPage.tsx에 추가

import { Link } from 'react-router-dom';
import { Zap, Wallet, CalendarCheck, ShoppingCart, Package } from 'lucide-react';

const DashboardPage: React.FC = () => {
  const currentHour = new Date().getHours();
  const timeSlot = currentHour < 12 ? 'morning' : currentHour < 18 ? 'afternoon' : 'evening';

  const quickLinks = {
    morning: [
      { to: '/admin/quick-check', label: '빠른 예약확인', icon: <Zap size={20} />, color: '#0ea5e9' },
      { to: '/admin/prepaid-check', label: '선입금 관리', icon: <Wallet size={20} />, color: '#f59e0b' },
    ],
    afternoon: [
      { to: '/admin/pickup-check', label: '픽업 체크', icon: <CalendarCheck size={20} />, color: '#10b981' },
      { to: '/admin/stock', label: '재고 관리', icon: <Package size={20} />, color: '#6366f1' },
    ],
    evening: [
      { to: '/admin/orders', label: '주문 통합 관리', icon: <ShoppingCart size={20} />, color: '#8b5cf6' },
      { to: '/admin/products', label: '상품 관리', icon: <Package size={20} />, color: '#ec4899' },
    ],
  };

  const currentLinks = quickLinks[timeSlot];

  return (
    <div className="dashboard-container">
      <AdminPageHeader
        title="통합 판매 현황 대시보드"
        subtitle="실시간 판매 현황을 한눈에 확인하세요"
        icon={<TrendingUp size={24} />}
        priority="high"
      />

      {/* 시간대별 빠른 링크 */}
      <div className="quick-links-section">
        <h2 className="quick-links-title">지금 할 일</h2>
        <div className="quick-links-grid">
          {currentLinks.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className="quick-link-card"
              style={{ borderLeftColor: link.color }}
            >
              <div className="quick-link-icon" style={{ color: link.color }}>
                {link.icon}
              </div>
              <div className="quick-link-content">
                <div className="quick-link-label">{link.label}</div>
                <div className="quick-link-time">
                  {timeSlot === 'morning' ? '오전 업무' : timeSlot === 'afternoon' ? '오후 업무' : '저녁 업무'}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* 기존 대시보드 내용 */}
      {/* ... */}
    </div>
  );
};
```

```css
/* src/pages/admin/DashboardPage.css에 추가 */

.quick-links-section {
  margin-bottom: 32px;
}

.quick-links-title {
  font-size: 1.15rem;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 16px;
}

.quick-links-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.quick-link-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: white;
  border: 1px solid #e5e7eb;
  border-left: 4px solid;
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: all 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.quick-link-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transform: translateY(-2px);
}

.quick-link-icon {
  flex-shrink: 0;
}

.quick-link-content {
  flex: 1;
}

.quick-link-label {
  font-size: 1rem;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 4px;
}

.quick-link-time {
  font-size: 0.75rem;
  color: #6b7280;
}

@media (max-width: 768px) {
  .quick-links-grid {
    grid-template-columns: 1fr;
  }

  .quick-link-card {
    padding: 20px;
  }
}
```

---

## 📋 예시 6: 필터 바 컴포넌트

```tsx
// src/components/admin/FilterBar.tsx

import { Search } from 'lucide-react';
import './FilterBar.css';

interface FilterOption {
  value: string;
  label: string;
}

interface Filter {
  key: string;
  label: string;
  options: FilterOption[];
}

interface FilterBarProps {
  searchPlaceholder?: string;
  filters?: Filter[];
  onSearch?: (value: string) => void;
  onFilterChange?: (key: string, value: string) => void;
  className?: string;
}

const FilterBar: React.FC<FilterBarProps> = ({
  searchPlaceholder = '검색...',
  filters = [],
  onSearch,
  onFilterChange,
  className = ''
}) => {
  return (
    <div className={`filter-bar ${className}`}>
      <div className="filter-search">
        <Search size={20} className="search-icon" />
        <input
          type="text"
          placeholder={searchPlaceholder}
          onChange={(e) => onSearch?.(e.target.value)}
          className="search-input"
        />
      </div>
      {filters.length > 0 && (
        <div className="filter-selects">
          {filters.map(filter => (
            <select
              key={filter.key}
              onChange={(e) => onFilterChange?.(filter.key, e.target.value)}
              className="filter-select"
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
      )}
    </div>
  );
};

export default FilterBar;
```

```css
/* src/components/admin/FilterBar.css */

.filter-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
  align-items: center;
}

.filter-search {
  position: relative;
  flex: 1;
  min-width: 200px;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #9ca3af;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 10px 12px 10px 40px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: #0ea5e9;
  box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
}

.filter-selects {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-select {
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.9rem;
  background: white;
  cursor: pointer;
  outline: none;
  min-width: 120px;
  transition: border-color 0.2s;
}

.filter-select:focus {
  border-color: #0ea5e9;
}

@media (max-width: 768px) {
  .filter-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-search {
    min-width: auto;
  }

  .search-input {
    font-size: 16px; /* iOS 줌 방지 */
    min-height: 44px;
  }

  .filter-select {
    width: 100%;
    font-size: 16px;
    min-height: 44px;
  }

  .filter-selects {
    width: 100%;
    flex-direction: column;
  }
}
```

---

## 🎯 적용 순서 권장사항

### 1단계: 기본 구조 개선 (완료)
- ✅ MenuGroup 컴포넌트
- ✅ AdminMobileNav 컴포넌트
- ✅ AdminSidebar 메뉴 그룹핑

### 2단계: 공통 컴포넌트 적용
1. AdminPageHeader를 모든 페이지에 적용
2. FilterBar를 목록 페이지에 적용
3. ResponsiveTable을 테이블이 있는 페이지에 적용

### 3단계: 위험 기능 보호
1. DangerButton을 위험 기능에 적용
2. ConfirmModal 개선 및 적용

### 4단계: 모바일 최적화
1. 모든 테이블을 ResponsiveTable로 전환
2. 버튼 터치 영역 확보
3. 입력 필드 폰트 크기 조정

---

이 예시들을 참고하여 점진적으로 적용하시면 됩니다. 각 컴포넌트는 독립적으로 작동하므로, 한 번에 하나씩 적용해도 문제없습니다.





