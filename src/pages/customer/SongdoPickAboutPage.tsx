// src/pages/customer/SongdoPickAboutPage.tsx
import React from 'react';
import './SongdoPickAboutPage.css';

const SongdoPickAboutPage: React.FC = () => {
  return (
    <div className="customer-page-container songdo-info-page">
      <header className="songdo-info-header">
        <span className="songdo-info-chip">ABOUT US</span>
        <h1 className="songdo-info-title">송도픽이란 무엇인가요?</h1>
        <p className="songdo-info-subtitle">
          소도몰 공구를 더 편하게 보고, 예약할 수 있도록 돕는
          **프리미엄 로컬 공동구매 플랫폼**입니다.
        </p>
      </header>

      <section className="songdo-info-section">
        <h2 className="songdo-info-section-title">소도몰 × 송도픽 관계도</h2>
        <p className="songdo-info-text">
          소도몰 송도랜드마크점은 고객님들이 더 편하게 공구 정보를 보고 예약할 수 있도록
          <strong> ‘송도픽’이라는 외부 플랫폼과 전략적으로 협력</strong>하고 있습니다.
        </p>
        <ul className="songdo-info-list">
          <li>
            <span className="songdo-info-badge">소도몰</span>
            <span>본사 정식 상품 판매 및 매장 픽업 담당</span>
          </li>
          <li>
            <span className="songdo-info-badge songdo-info-badge-alt">송도픽</span>
            <span>공동구매 정보 정리, 공지 제공, 단독 상품 기획</span>
          </li>
        </ul>
      </section>

      <section className="songdo-info-section">
        <h2 className="songdo-info-section-title">송도픽이 제공하는 핵심 가치</h2>
        <ul className="songdo-info-bullet-list">
          <li>오늘 진행 중인 공동구매를 **가장 빠르게** 한눈에 정리합니다.</li>
          <li>픽업일, 마감 시간, 재고 정보를 **쉽고 정확하게** 안내합니다.</li>
          <li>
            가끔 <strong>송도픽이 직접 준비한 송도 지역 단독/제휴 상품</strong>도 소개합니다.
          </li>
        </ul>
        <p className="songdo-info-text small">
          *이때 송도픽 단독 상품은 <strong>소도몰 본사 상품이 아니며</strong>,
          소도몰은 해당 상품의 <strong>픽업 장소(수령처)</strong>만 제공하는 협력 구조입니다.
        </p>
      </section>

      <section className="songdo-info-section">
        <h2 className="songdo-info-section-title">고객을 위한 한 줄 요약</h2>
        <div className="songdo-info-highlight-box">
          <p>공구 정보 확인 및 예약은 <strong>송도픽</strong>에서,</p>
          <p>상품 수령은 예전처럼 **소도몰 매장**에서 하시면 됩니다. 😊</p>
        </div>
      </section>
    </div>
  );
};

export default SongdoPickAboutPage;