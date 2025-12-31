import React from 'react';
import './SongdoPickGuidePage.css';

const SongdoPickGuidePage: React.FC = () => {
  return (
    <div className="customer-page-container modern-shell">
      <div className="modern-inner-shell">
        <div className="songdo-guide-page">
      <header className="songdo-guide-header">
        <h1 className="songdo-guide-title">공구 이용 안내</h1>
        <p className="songdo-guide-subtitle">
          예약부터 픽업, 그리고 선입금 보관 제도까지 꼭 확인해주세요.
        </p>
      </header>

      <section className="songdo-guide-section">
        <h2 className="songdo-guide-section-title">1. 공구 진행 시간</h2>
        <p className="songdo-guide-text">
          공구는 보통 <strong>오후 2시 ~ 3시 사이</strong>에 오픈됩니다.
        </p>
        
        {/* 시간 정보 박스 분리 간격 축소 */}
        <div className="time-info-box" style={{ marginTop: '12px', padding: '8px 0', borderTop: '1px solid #e5e7eb' }}>
          <strong style={{ fontSize: '15px', color: '#000000' }}>① 1차 공구 (정규 예약)</strong>
          <ul className="songdo-guide-bullet">
            <li>오픈일 오후 2시 ~ 다음 날 오후 1시</li>
            <li>(토요일 공구는 월요일 오후 1시 마감)</li>
          </ul>
        </div>
        
        {/* 시간 정보 박스 분리 간격 축소 */}
        <div className="time-info-box" style={{ marginTop: '12px', padding: '8px 0', borderTop: '1px solid #e5e7eb' }}>
          <strong style={{ fontSize: '15px', color: '#000000' }}>② 2차 공구 (추가 예약)</strong>
          <ul className="songdo-guide-bullet">
            <li>1차 종료 후 여유 재고가 있을 때만 진행</li>
            <li>픽업 당일 오후 1시 마감 (재고 소진 시 즉시 종료)</li>
          </ul>
        </div>
      </section>

      <section className="songdo-guide-section">
        <h2 className="songdo-guide-section-title">2. 상품별 픽업 기한 (중요!)</h2>
        <p className="songdo-guide-text" style={{ marginBottom: '10px' }}> {/* 간격 축소 */}
          상품 유형(색상)에 따라 보관 가능 기간이 다릅니다.
          꼭 확인 후 방문해주세요.
        </p>
        
        <ul className="songdo-guide-bullet">
          <li>
            <strong>실온</strong> / <span className="text-frozen">냉동</span> 상품<br/>
            : 픽업일 <strong>다음 날까지</strong> 수령 가능
          </li>
          <li>
            <span className="text-cold">냉장</span> / <span className="text-fresh">신선</span> 상품<br/>
            : 신선도 유지를 위해 <strong>당일 픽업 원칙</strong>
          </li>
        </ul>
        <p className="songdo-guide-text small">
          * 매장 상황에 따라 냉장/신선 상품의 장기 보관은 어려울 수 있습니다.
        </p>
      </section>

      <section className="songdo-guide-section">
        <h2 className="songdo-guide-section-title">3. 픽업을 못 오신다면? ('선입금' 제도)</h2>
        <p className="songdo-guide-text">
          부득이하게 정해진 기간 내 픽업이 어려우신가요?
          <strong>'선입금'</strong>을 해주시면 상품을 보관해 드립니다.
        </p>

        <div className="bank-info-box">
          <span className="bank-name"><strong>우리은행</strong></span>
          <span className="account-number">1005-504-763060</span>
          <span className="account-owner"><strong>예금주: 차동진</strong></span>
        </div>

        <ul className="songdo-guide-bullet" style={{ marginTop: '15px' }}> {/* 간격 축소 */}
          <li>
            <strong>보관 기간:</strong> 픽업 마감일로부터 <strong>1주일간</strong> 보관
          </li>
          <li>
            <strong>장기 보관:</strong> 1주일 내 방문도 어려우실 경우, 
            별도로 연락 주시면 <strong>최대 한 달까지</strong> 보관해 드립니다.
          </li>
          <li style={{ marginTop: '10px', padding: '8px', border: '1px solid #fca5a5', borderRadius: '6px', backgroundColor: '#fef2f2' }}> {/* 간격 축소 */}
             🚨 <strong>주의사항:</strong> 선입금 처리된 상품은 이미 발주/확보가 끝난 상태이므로 <span className="refund-warning">환불이 불가능</span>합니다. 신중하게 입금해 주세요.
          </li>
        </ul>
      </section>

      <section className="songdo-guide-section">
        <h2 className="songdo-guide-section-title">4. 결제 및 매장 안내</h2>
        <p className="songdo-guide-text">
          기본 결제는 <strong>매장 방문 후 카운터</strong>에서 진행됩니다.
          (픽업 시 전화번호 뒷 4자리를 말씀해 주세요.)
        </p>
        <p className="songdo-guide-text small">
          * 송도픽 단독/제휴 상품은 소도몰 본사와 무관한 별도 기획 상품이며, 
          매장은 픽업 장소만 제공합니다.
        </p>
      </section>
        </div>
      </div>
    </div>
  );
};

export default SongdoPickGuidePage;