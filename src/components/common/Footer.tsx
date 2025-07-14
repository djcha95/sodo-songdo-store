// src/components/common/Footer/Footer.tsx

import React from 'react';
import { Link } from 'react-router-dom'; // 페이지 이동을 위해 Link를 사용합니다.
import './Footer.css';
import logo from '../../../assets/logo.png'; // 로고 이미지 경로 (예시)

const Footer: React.FC = () => {
  // 푸터에 들어갈 정보입니다. 나중에 실제 정보로 수정하세요.
  const businessInfo = {
    companyName: '(주)소도몰',
    ceo: '김소도',
    businessNumber: '123-45-67890',
    mailOrderNumber: '제2025-인천남동-0123호',
    address: '인천광역시 남동구 소도로 123, 1층',
    contact: '032-123-4567',
    copyright: 'Copyright © 2025 Sodomall. All right reserved.',
  };

  return (
    <footer className="app-footer">
      <div className="footer-content">
        <div className="footer-logo">
          <img src={logo} alt="소도몰 로고" />
        </div>
        <div className="footer-info">
          <p><strong>{businessInfo.companyName}</strong></p>
          <p>
            <span>대표: {businessInfo.ceo}</span>
            <span>주소: {businessInfo.address}</span>
          </p>
          <p>
            <span>사업자등록번호: {businessInfo.businessNumber}</span>
            <span>통신판매업신고: {businessInfo.mailOrderNumber}</span>
          </p>
          <p>
            <span>고객센터: {businessInfo.contact}</span>
          </p>
          <div className="footer-links">
            <Link to="/privacy-policy">개인정보처리방침</Link>
            <Link to="/terms-of-service">이용약관</Link>
          </div>
          <p className="copyright">{businessInfo.copyright}</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;