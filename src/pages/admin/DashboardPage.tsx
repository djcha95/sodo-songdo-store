// src/pages/admin/DashboardPage.tsx - 본사 예약 시스템에 맞춘 대시보드

import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { getProducts } from '@/firebase/productService';
import { db } from '@/firebase/firebaseConfig';
import { 
  collection, query, where, getDocs, Timestamp, 
  orderBy, limit
} from 'firebase/firestore';
import type { Product, Order, SalesRound, VariantGroup } from '@/shared/types';
import SodomallLoader from '@/components/common/SodomallLoader';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import toast from 'react-hot-toast';
import { 
  TrendingUp, ShoppingCart, DollarSign, AlertTriangle, 
  Calendar, Zap, Wallet, PlusSquare, 
  ArrowRight, Clock, Bell, Eye
} from 'lucide-react';
import './DashboardPage.css';
import { reportError } from '@/utils/logger';
import dayjs from 'dayjs';

interface DashboardStats {
  todayOrders: number;
  todayRevenue: number;
  prepaidPending: number;
  todayPickupCount: number;
  recentReservations: number; // 최근 1시간 내 예약
}

interface RecentOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  productName: string;
  totalPrice: number;
  status: string;
  createdAt: Date;
  timeAgo: string;
}

interface DateGroupedProduct {
  date: string;
  dateFormatted: string;
  products: {
    productId: string;
    productName: string;
    roundId: string;
    roundName: string;
    variantGroupId: string;
    imageUrl: string;
    confirmedReserved: number;
    pendingPrepayment: number;
    totalReserved: number;
  }[];
}

interface UrgentItem {
  type: 'prepaid' | 'pickup';
  title: string;
  count: number;
  link: string;
  icon: React.ReactNode;
  color: string;
}

const DashboardPage: React.FC = () => {
  useDocumentTitle('대시보드');
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    todayOrders: 0,
    todayRevenue: 0,
    prepaidPending: 0,
    todayPickupCount: 0,
    recentReservations: 0,
  });
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [dateGroupedProducts, setDateGroupedProducts] = useState<DateGroupedProduct[]>([]);

  const convertToDate = (dateSource: any): Date | null => {
    if (!dateSource) return null;
    if (dateSource instanceof Date) return dateSource;
    if (typeof dateSource.toDate === 'function') return dateSource.toDate();
    if (typeof dateSource === 'object' && dateSource.seconds !== undefined) {
      return new Timestamp(dateSource.seconds, dateSource.nanoseconds).toDate();
    }
    const d = new Date(dateSource);
    if (!isNaN(d.getTime())) return d;
    return null;
  };

  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}시간 전`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}일 전`;
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const oneHourAgo = new Date();
        oneHourAgo.setHours(oneHourAgo.getHours() - 1);

        // 1. 오늘의 주문과 매출 계산
        const todayOrdersQuery = query(
          collection(db, 'orders'),
          where('createdAt', '>=', Timestamp.fromDate(today)),
          where('createdAt', '<', Timestamp.fromDate(tomorrow))
        );
        const todayOrdersSnapshot = await getDocs(todayOrdersQuery);
        
        let todayOrdersCount = 0;
        let todayRevenueSum = 0;
        let recentReservationsCount = 0;
        const recentOrdersList: RecentOrder[] = [];
        
        todayOrdersSnapshot.forEach(doc => {
          const order = doc.data() as Order;
          const createdAt = convertToDate(order.createdAt);
          
          todayOrdersCount++;
          
          // 최근 1시간 내 예약 확인
          if (createdAt && createdAt >= oneHourAgo) {
            recentReservationsCount++;
          }
          
          if (order.status === 'PREPAID' || order.status === 'PICKED_UP') {
            todayRevenueSum += order.totalPrice || 0;
          }
          
          // 최근 주문 목록에 추가 (최근 10건)
          if (recentOrdersList.length < 10 && createdAt) {
            const firstItem = order.items?.[0];
            if (firstItem) {
              recentOrdersList.push({
                id: doc.id,
                orderNumber: order.orderNumber || 'N/A',
                customerName: order.customerName || '고객',
                productName: firstItem.productName || '상품',
                totalPrice: order.totalPrice || 0,
                status: order.status,
                createdAt,
                timeAgo: getTimeAgo(createdAt),
              });
            }
          }
        });

        // 시간순 정렬
        recentOrdersList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        // 2. 선입금 대기 주문 수
        const prepaidPendingQuery = query(
          collection(db, 'orders'),
          where('status', '==', 'RESERVED'),
          where('wasPrepaymentRequired', '==', true)
        );
        const prepaidPendingSnapshot = await getDocs(prepaidPendingQuery);
        const prepaidPendingCount = prepaidPendingSnapshot.size;

        // 3. 오늘 픽업 예정 주문 수
        const todayPickupQuery = query(
          collection(db, 'orders'),
          where('pickupDate', '>=', Timestamp.fromDate(today)),
          where('pickupDate', '<', Timestamp.fromDate(tomorrow)),
          where('status', 'in', ['RESERVED', 'PREPAID'])
        );
        const todayPickupSnapshot = await getDocs(todayPickupQuery);
        const todayPickupCount = todayPickupSnapshot.size;

        // 4. 날짜별 상품 예약 현황
        const productsResponse = await getProducts();
        const allPendingOrders = await getDocs(
          query(collection(db, 'orders'), where('status', 'in', ['RESERVED', 'PREPAID']))
        );

        // 주문 데이터를 그룹별로 집계
        const reservationMap = new Map<string, { confirmed: number; pending: number }>();
        
        allPendingOrders.forEach(doc => {
          const order = doc.data() as Order;
          (order.items || []).forEach((item) => {
            const groupKey = `${item.productId}-${item.roundId}-${item.variantGroupId}`;
            const current = reservationMap.get(groupKey) || { confirmed: 0, pending: 0 };
            
            // ✅ 수정: stockDeductionAmount를 곱하여 실제 낱개 수량을 계산
            const actualQuantity = item.quantity * (item.stockDeductionAmount || 1);
            if (order.status === 'RESERVED' && order.wasPrepaymentRequired) {
              current.pending += actualQuantity;
            } else {
              current.confirmed += actualQuantity;
            }
            reservationMap.set(groupKey, current);
          });
        });

        // 날짜별로 상품 그룹화
        const dateGroups = new Map<string, DateGroupedProduct['products']>();
        
        productsResponse.products.forEach((product: Product) => {
          const latestRound = product.salesHistory?.[product.salesHistory.length - 1];
          
          if (latestRound) {
            const publishDateObj = convertToDate(latestRound.publishAt) || convertToDate(product.createdAt);
            const publishDateStr = publishDateObj ? formatDate(publishDateObj) : '날짜 없음';
            
            latestRound.variantGroups?.forEach((vg: VariantGroup) => {
              const variantGroupId = vg.id || vg.groupName;
              const groupKey = `${product.id}-${latestRound.roundId}-${variantGroupId}`;
              const reservation = reservationMap.get(groupKey) || { confirmed: 0, pending: 0 };
              
              if (!dateGroups.has(publishDateStr)) {
                dateGroups.set(publishDateStr, []);
              }
              
              dateGroups.get(publishDateStr)!.push({
                productId: product.id,
                productName: product.groupName,
                roundId: latestRound.roundId,
                roundName: latestRound.roundName,
                variantGroupId,
                imageUrl: product.imageUrls?.[0] || '/sodomall-logo.png',
                confirmedReserved: reservation.confirmed,
                pendingPrepayment: reservation.pending,
                totalReserved: reservation.confirmed + reservation.pending,
              });
            });
          }
        });

        // 날짜별 그룹을 배열로 변환하고 정렬
        const dateGroupedList: DateGroupedProduct[] = Array.from(dateGroups.entries())
          .map(([date, products]) => ({
            date,
            dateFormatted: dayjs(date).format('YYYY년 M월 D일 (ddd)'),
            products: products.sort((a, b) => b.totalReserved - a.totalReserved), // 예약 수 많은 순
          }))
          .sort((a, b) => b.date.localeCompare(a.date)) // 최신 날짜 순
          .slice(0, 7); // 최근 7일만 표시

        setStats({
          todayOrders: todayOrdersCount,
          todayRevenue: todayRevenueSum,
          prepaidPending: prepaidPendingCount,
          todayPickupCount: todayPickupCount,
          recentReservations: recentReservationsCount,
        });
        setRecentOrders(recentOrdersList);
        setDateGroupedProducts(dateGroupedList);

      } catch (error) {
        reportError("대시보드 데이터 로딩 실패", error);
        toast.error("데이터를 불러오는 데 실패했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
    
    // 실시간 업데이트를 위해 30초마다 새로고침
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const urgentItems: UrgentItem[] = useMemo(() => {
    const items: UrgentItem[] = [];
    
    if (stats.prepaidPending > 0) {
      items.push({
        type: 'prepaid',
        title: '선입금 미완료 주문',
        count: stats.prepaidPending,
        link: '/admin/prepaid-check',
        icon: <Wallet size={20} />,
        color: '#f59e0b',
      });
    }
    
    if (stats.todayPickupCount > 0) {
      items.push({
        type: 'pickup',
        title: '오늘 픽업 예정',
        count: stats.todayPickupCount,
        link: '/admin/pickup-check',
        icon: <Calendar size={20} />,
        color: '#3b82f6',
      });
    }
    
    return items;
  }, [stats]);

  const quickActions = [
    { title: '픽업 체크', icon: <Calendar size={24} />, link: '/admin/pickup-check', color: '#3b82f6' },
    { title: '빠른 예약확인', icon: <Zap size={24} />, link: '/admin/quick-check', color: '#10b981' },
    { title: '선입금 관리', icon: <Wallet size={24} />, link: '/admin/prepaid-check', color: '#f59e0b' },
    { title: '상품 등록', icon: <PlusSquare size={24} />, link: '/admin/products/add', color: '#8b5cf6' },
  ];

  if (loading) return <SodomallLoader />;

  return (
    <div className="dashboard-container">
      <AdminPageHeader 
        title="대시보드"
        icon={<TrendingUp size={28} />}
        priority="high"
      />

      {/* 핵심 지표 카드 */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' }}>
            <ShoppingCart size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-label">오늘의 주문</div>
            <div className="stat-value">{stats.todayOrders.toLocaleString()}</div>
            <div className="stat-unit">건</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
            <DollarSign size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-label">오늘의 매출</div>
            <div className="stat-value">{Math.floor(stats.todayRevenue).toLocaleString()}</div>
            <div className="stat-unit">원</div>
          </div>
        </div>

        <div className="stat-card highlight">
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' }}>
            <Bell size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-label">실시간 예약</div>
            <div className="stat-value">{stats.recentReservations.toLocaleString()}</div>
            <div className="stat-unit">최근 1시간</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}>
            <Wallet size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-label">선입금 대기</div>
            <div className="stat-value">{stats.prepaidPending.toLocaleString()}</div>
            <div className="stat-unit">건</div>
          </div>
        </div>
      </div>

      {/* 긴급 처리 필요 섹션 */}
      {urgentItems.length > 0 && (
        <div className="dashboard-section">
          <div className="section-header">
            <AlertTriangle size={20} className="section-icon urgent" />
            <h2 className="section-title">⚠️ 긴급 처리 필요</h2>
          </div>
          <div className="urgent-items-grid">
            {urgentItems.map((item, index) => (
              <Link 
                key={index} 
                to={item.link} 
                className="urgent-item-card"
                style={{ borderLeftColor: item.color }}
              >
                <div className="urgent-item-icon" style={{ color: item.color }}>
                  {item.icon}
                </div>
                <div className="urgent-item-content">
                  <div className="urgent-item-title">{item.title}</div>
                  <div className="urgent-item-count" style={{ color: item.color }}>
                    {item.count}건
                  </div>
                </div>
                <ArrowRight size={20} className="urgent-item-arrow" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 실시간 예약 현황 */}
      <div className="dashboard-section">
        <div className="section-header">
          <Eye size={20} className="section-icon" />
          <h2 className="section-title">👁️ 실시간 예약 현황</h2>
          <Link to="/admin/orders" className="section-link">
            전체 보기 <ArrowRight size={16} />
          </Link>
        </div>
        <div className="recent-orders-table">
          {recentOrders.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>시간</th>
                  <th>주문번호</th>
                  <th>고객명</th>
                  <th>상품명</th>
                  <th>금액</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr 
                    key={order.id} 
                    onClick={() => navigate(`/admin/orders?orderId=${order.id}`)}
                    className="recent-order-row"
                  >
                    <td className="time-ago">
                      <Clock size={14} />
                      {order.timeAgo}
                    </td>
                    <td className="order-number">{order.orderNumber}</td>
                    <td>{order.customerName}</td>
                    <td className="product-name">{order.productName}</td>
                    <td className="price">{order.totalPrice.toLocaleString()}원</td>
                    <td>
                      <span className={`status-badge status-${order.status.toLowerCase()}`}>
                        {order.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <ShoppingCart size={48} />
              <p>최근 예약 내역이 없습니다.</p>
            </div>
          )}
        </div>
      </div>

      {/* 날짜별 상품 예약 현황 */}
      <div className="dashboard-section">
        <div className="section-header">
          <Calendar size={20} className="section-icon" />
          <h2 className="section-title">📅 날짜별 상품 예약 현황</h2>
          <Link to="/admin/products" className="section-link">
            전체 보기 <ArrowRight size={16} />
          </Link>
        </div>
        <div className="date-grouped-products">
          {dateGroupedProducts.length > 0 ? (
            dateGroupedProducts.map((group) => (
              <div key={group.date} className="date-group">
                <div className="date-group-header">
                  <h3 className="date-title">{group.dateFormatted}</h3>
                  <span className="date-product-count">{group.products.length}개 상품</span>
                </div>
                <div className="products-grid">
                  {group.products.map((product) => (
                    <Link
                      key={`${product.productId}-${product.roundId}-${product.variantGroupId}`}
                      to={`/admin/products/edit/${product.productId}/${product.roundId}`}
                      className="product-card"
                    >
                      <img 
                        src={product.imageUrl} 
                        alt={product.productName}
                        className="product-thumbnail"
                      />
                      <div className="product-info">
                        <div className="product-name">{product.productName}</div>
                        <div className="product-round">{product.roundName}</div>
                        <div className="product-stats">
                          <div className="stat-item">
                            <span className="stat-label">확정</span>
                            <span className="stat-value confirmed">{product.confirmedReserved}</span>
                          </div>
                          <div className="stat-item">
                            <span className="stat-label">대기</span>
                            <span className="stat-value pending">{product.pendingPrepayment}</span>
                          </div>
                          <div className="stat-item total">
                            <span className="stat-label">총</span>
                            <span className="stat-value total">{product.totalReserved}</span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <Calendar size={48} />
              <p>등록된 상품이 없습니다.</p>
            </div>
          )}
        </div>
      </div>

      {/* 빠른 액세스 */}
      <div className="dashboard-section">
        <div className="section-header">
          <Zap size={20} className="section-icon" />
          <h2 className="section-title">🚀 빠른 액세스</h2>
        </div>
        <div className="quick-actions-grid">
          {quickActions.map((action, index) => (
            <Link 
              key={index} 
              to={action.link} 
              className="quick-action-card"
              style={{ '--action-color': action.color } as React.CSSProperties}
            >
              <div className="quick-action-icon" style={{ color: action.color }}>
                {action.icon}
              </div>
              <div className="quick-action-title">{action.title}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
