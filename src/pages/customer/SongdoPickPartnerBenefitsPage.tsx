// src/pages/customer/SongdoPickPartnerBenefitsPage.tsx
import React from 'react';
import './SongdoPickPartnerBenefitsPage.css';

const SongdoPickPartnerBenefitsPage: React.FC = () => {
  return (
    <div className="customer-page-container songdo-partner-page">
      <header className="songdo-partner-header">
        <span className="songdo-partner-chip">PARTNER</span>
        <h1 className="songdo-partner-title">송도픽 제휴 안내 ✨</h1>
        <p className="songdo-partner-subtitle">
          송도 인근 로컬 상점, 브랜드, 서비스와 함께하는
          **프리미엄 로컬 제휴 프로그램**을 소개합니다.
        </p>
      </header>

      <section className="songdo-partner-section">
        <h2 className="songdo-partner-section-title">🤝 송도픽 제휴란?</h2>
        <p className="songdo-partner-text">
          송도픽 제휴는 <strong>지역 고객에게 꼭 필요한 상품/서비스</strong>를 소개하고,
          <strong> 소도몰 매장을 픽업 거점</strong>으로 활용하는 로컬 제휴 프로그램입니다.
        </p>
        <p className="songdo-partner-text small">
          💡 예: 뷰티 시술 제휴, 육아용품/생활용품 체험, 한정 기획 상품 등
        </p>
      </section>

      <section className="songdo-partner-section">
        <h2 className="songdo-partner-section-title">🔍 이런 파트너와 잘 맞아요</h2>
        <ul className="songdo-partner-bullet">
          <li>송도 근처에서 뷰티/헬스/교육/생활 서비스를 운영 중인 사장님</li>
          <li>체험/이벤트/상품을 지역 주민에게 알리고 싶은 소상공인</li>
          <li>“온라인 홍보 + 오프라인 픽업/상담”이 필요한 브랜드</li>
        </ul>
      </section>

      <section className="songdo-partner-section">
        <h2 className="songdo-partner-section-title">🎁 제휴 시 제공되는 것</h2>
        <ul className="songdo-partner-bullet">
          <li>송도픽 공구·알림 채널을 통한 **확실한 타겟 노출**</li>
          <li>소도몰 송도랜드마크점 매장을 활용한 쿠폰/샘플 픽업 연계</li>
          <li>필요 시 공동 프로모션/이벤트 **전략 기획 및 실행**</li>
        </ul>
      </section>

      <section className="songdo-partner-section">
        <h2 className="songdo-partner-section-title">🚀 기본 진행 구조</h2>
        <ol className="songdo-partner-ordered">
          <li>제휴 상품/서비스 내용 간단 공유</li>
          <li>송도픽에 안내 페이지 및 예약/신청 방식 설계</li>
          <li>고객은 송도픽을 통해 신청/예약</li>
          <li>소도몰 매장에서 픽업 또는 방문/상담 연계</li>
        </ol>
      </section>

      <section className="songdo-partner-section">
        <h2 className="songdo-partner-section-title">📞 제휴 문의</h2>
        <p className="songdo-partner-text">
          제휴 문의는 카카오 채널 **「소도몰 송도랜드마크점(송도픽 운영)」**으로 메시지 주세요.
        </p>
        <ul className="songdo-partner-bullet">
          <li>
            카카오 채널에서 **“소도몰 송도랜드마크점(송도픽 운영)”** 검색 후 채팅
          </li>
        </ul>
        {/* === 수정된 부분 끝 === */}
      </section>
    </div>
  );
};

export default SongdoPickPartnerBenefitsPage;