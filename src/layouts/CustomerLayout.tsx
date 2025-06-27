// src/layouts/CustomerLayout.tsx

import React, { Suspense } from 'react';
import { Routes, Route, useParams, useNavigate } from 'react-router-dom';
import BottomNav from '../components/BottomNav';

// 로딩 스피너
const LoadingSpinner = () => <div className="loading-spinner">로딩 중...</div>;

// 고객용 페이지 컴포넌트들 (Lazy Loading)
const ProductListPage = React.lazy(() => import('../pages/customer/ProductListPage'));
const ProductDetailPage = React.lazy(() => import('../pages/customer/ProductDetailPage'));
const MyPage = React.lazy(() => import('../pages/customer/MyPage'));
const CartPage = React.lazy(() => import('../pages/customer/CartPage'));
// BoardPage를 OnsiteSalePage로 변경합니다.
const OnsiteSalePage = React.lazy(() => import('../pages/customer/OnsiteSalePage'));
// [추가] MyPage 하위 메뉴들을 위한 컴포넌트들을 Lazy Loading으로 추가
const OrderHistoryPage = React.lazy(() => import('../pages/customer/OrderHistoryPage'));
const OrderCalendar = React.lazy(() => import('../components/customer/OrderCalendar'));
// [삭제] 관리자용 컴포넌트이므로 CustomerLayout에서 제거
// const ProductArrivalCalendar = React.lazy(() => import('../components/customer/ProductArrivalCalendar'));
const StoreInfoPage = React.lazy(() => import('../pages/customer/StoreInfoPage'));

// FIX: ProductDetailPage를 페이지로 렌더링하기 위한 Wrapper 컴포넌트
const ProductDetailPageWrapper = () => {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();

  if (!productId) {
    navigate('/');
    return null;
  }

  return (
    <ProductDetailPage
      productId={productId}
      isOpen={true}
      onClose={() => navigate('/')}
    />
  );
};

const CustomerLayout = () => {
  return (
    <div className="app-layout">
      <main className="main-content">
        <Suspense fallback={<LoadingSpinner />}>
            <Routes>
                {/* 메인 페이지 */}
                <Route index element={<ProductListPage />} />

                {/* 상품 상세 페이지 */}
                <Route path="products/:productId" element={<ProductDetailPageWrapper />} />

                {/* 장바구니 페이지 */}
                <Route path="cart" element={<CartPage />} />

                {/* 현장 판매 페이지 (기존 board 경로 유지) */}
                <Route path="board" element={<OnsiteSalePage />} />

                {/* 마이페이지 및 하위 라우트들 */}
                <Route path="mypage" element={<MyPage />} />
                <Route path="mypage/history" element={<OrderHistoryPage />} />
                <Route path="mypage/orders" element={<OrderCalendar />} />
                {/* [삭제] 관리자용 컴포넌트이므로 CustomerLayout에서 라우팅 제거 */}
                {/* <Route path="mypage/arrivals" element={<ProductArrivalCalendar />} /> */}
                <Route path="mypage/store-info" element={<StoreInfoPage />} />
            </Routes>
        </Suspense>
      </main>
      <BottomNav />
    </div>
  );
};

export default CustomerLayout;