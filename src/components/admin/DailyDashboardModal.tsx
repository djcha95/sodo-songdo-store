// src/components/admin/DailyDashboardModal.tsx

import { useState, useEffect } from 'react';
import { getDailyDashboardData } from '../../firebase';
import type { TodayStockItem, TodayOrderItem, TodayPickupItem } from '../../root-types';
import { X, Truck, CalendarCheck } from 'lucide-react';
import './DailyDashboardModal.css';

interface DailyDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DailyDashboardModal = ({ isOpen, onClose }: DailyDashboardModalProps) => {
  const [stock, setStock] = useState<TodayStockItem[]>([]);
  const [prepaidOrders, setPrepaidOrders] = useState<TodayOrderItem[]>([]);
  const [pickupDeadlineProducts, setPickupDeadlineProducts] = useState<TodayPickupItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dontShowToday, setDontShowToday] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const fetchData = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const { todayStock, todayPrepaidOrders, todayPickupDeadlineProducts } = await getDailyDashboardData();
          
          setStock(todayStock || []);
          setPrepaidOrders(todayPrepaidOrders || []);
          setPickupDeadlineProducts(todayPickupDeadlineProducts || []);

        } catch (err) {
          console.error("대시보드 데이터 로딩 오류:", err);
          setError("대시보드 데이터를 불러오는 데 실패했습니다. 다시 시도해주세요.");
          setStock([]);
          setPrepaidOrders([]);
          setPickupDeadlineProducts([]);
        } finally {
          setIsLoading(false);
        }
      };
      fetchData();
    }
  }, [isOpen]);

  const handleClose = () => {
    if (dontShowToday) {
      const today = new Date().toISOString().split('T')[0];
      localStorage.setItem('hideDailyDashboard', today);
    }
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content admin-dashboard-modal">
        <button onClick={handleClose} className="modal-close-button">
          <X size={24} aria-label="닫기" />
        </button>
        <div className="modal-header">
          <h2>오늘의 주요 업무</h2>
          <p className="modal-date">{new Date().toLocaleDateString('ko-KR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        {error && <div className="modal-error-message">{error}</div>}

        {isLoading ? (
          <div className="modal-loading">데이터를 불러오는 중...</div>
        ) : (
          <div className="dashboard-sections-wrapper">
            <div className="dashboard-section section-card">
              <h3 className="section-title"><Truck size={20} className="section-icon" />오늘 입고 예정 물품 ({stock.length}건)</h3>
              {stock.length > 0 ? (
                <ul className="dashboard-list">
                  {stock.map((item) => <li key={item.name}>{item.name} <span className="item-quantity">({item.quantity}개)</span></li>)}
                </ul>
              ) : <p className="dashboard-empty-text">오늘 입고 예정 물품이 없습니다.</p>}
            </div>

            <div className="dashboard-section section-card">
              <h3 className="section-title"><CalendarCheck size={20} className="section-icon" />오늘 픽업 마감 공동구매 현황 ({pickupDeadlineProducts.length}건)</h3>
              {pickupDeadlineProducts.length > 0 ? (
                <ul className="dashboard-list">
                  {pickupDeadlineProducts.map((item) => (
                    <li key={item.id}>
                      <strong>{item.name}</strong><br />
                      <span className="pickup-info">픽업 마감: {item.pickupDeadlineDate.toDate().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                      {item.optionsSummary && item.optionsSummary.length > 0 && (
                        <ul className="option-stock-list">
                          {item.optionsSummary.map((opt) => (
                            <li key={`${item.id}-${opt.unit}`}>- {opt.unit}: 남은 재고 {opt.currentStock}개</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              ) : <p className="dashboard-empty-text">오늘 픽업 마감되는 공동구매 상품이 없습니다.</p>}
            </div>

            <div className="dashboard-section section-card">
              <h3 className="section-title">선입금 항목 (체크 필요) ({prepaidOrders.length}건)</h3>
              {prepaidOrders.length > 0 ? (
                <ul className="dashboard-list">
                  {prepaidOrders.map((orderItem) => (
                    <li key={`${orderItem.id}-${orderItem.productName}`}>
                      {orderItem.customerName} - {orderItem.productName} <span className="item-quantity">({orderItem.quantity}개)</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="dashboard-empty-text">오늘 선입금된 품목이 없습니다.</p>}
            </div>
          </div>
        )}

        <div className="modal-footer">
            <label className="dont-show-label">
                <input
                    type="checkbox"
                    checked={dontShowToday}
                    onChange={(e) => setDontShowToday(e.target.checked)}
                />
                오늘 하루 보지 않기
            </label>
        </div>
      </div>
    </div>
  );
};

export default DailyDashboardModal;