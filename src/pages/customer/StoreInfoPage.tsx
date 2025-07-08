// src/pages/customer/StoreInfoPage.tsx

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { getStoreInfo } from '../../firebase'; // FIX: import 경로 수정
import type { StoreInfo } from '../../types';
import './StoreInfoPage.css';

const StoreInfoPage: React.FC = () => {
  const navigate = useNavigate();
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStoreInformation = async () => {
      try {
        const fetchedInfo = await getStoreInfo();
        if (fetchedInfo) {
          setStoreInfo(fetchedInfo);
        } else {
          setError("매장 정보를 찾을 수 없습니다. (Firestore에 'settings/storeInfo' 문서가 없거나 비어있습니다.)");
        }
      } catch (err) {
        console.error("매장 정보 불러오기 오류:", err);
        setError("매장 정보를 불러오는 데 실패했습니다.");
      } finally {
        setLoading(false);
      }
    };
    fetchStoreInformation();
  }, []);

  const handleBack = () => {
    navigate(-1); // 이전 페이지로 돌아가기
  };

  const formatPhoneNumberForCall = (phoneNumber: string) => {
    return phoneNumber.replace(/[^0-9]/g, '');
  };

  const createKakaoMapLink = (address: string) => {
    return `https://map.kakao.com/link/search/${encodeURIComponent(address)}`;
  };

  const createKakaoTalkChatLink = (channelId: string) => {
    return `https://pf.kakao.com/_${channelId}/chat`;
  };


  if (loading) {
    return (
      <>
        <Header title="매장 정보" onBack={handleBack} />
        <div className="store-info-container">
          <div className="loading-message">매장 정보를 불러오는 중...</div>
        </div>
      </>
    );
  }

  if (error || !storeInfo) {
    return (
      <>
        <Header title="매장 정보" onBack={handleBack} />
        <div className="store-info-container">
          <div className="error-message">{error || "매장 정보를 찾을 수 없습니다."}</div>
          <p className="error-tip">관리자 페이지에서 매장 정보를 설정해 주세요.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="매장 정보"
        onBack={handleBack}
      />
      <div className="store-info-container">
        <section className="store-section about">
          <h2 className="section-title">{storeInfo.name}</h2>
          <p className="store-description">{storeInfo.description}</p>
        </section>

        <section className="store-section details">
          <h2 className="section-title">상세 정보</h2>
          <div className="info-item">
            <span className="info-label">상호</span>
            <span className="info-value">{storeInfo.name}</span>
          </div>
          <div className="info-item">
            <span className="info-label">사업자번호</span>
            <span className="info-value">{storeInfo.businessNumber}</span>
          </div>
          <div className="info-item">
            <span className="info-label">대표</span>
            <span className="info-value">{storeInfo.representative}</span>
          </div>
          <div className="info-item">
            <span className="info-label">주소</span>
            <a href={createKakaoMapLink(storeInfo.address)} target="_blank" rel="noopener noreferrer" className="info-value link-value">
              {storeInfo.address}
            </a>
          </div>
          <div className="info-item">
            <span className="info-label">연락처</span>
            <a href={`tel:${formatPhoneNumberForCall(storeInfo.phoneNumber)}`} className="info-value link-value">
              {storeInfo.phoneNumber}
            </a>
          </div>
          <div className="info-item">
            <span className="info-label">이메일</span>
            <a href={`mailto:${storeInfo.email}`} className="info-value link-value">
              {storeInfo.email}
            </a>
          </div>
        </section>

        <section className="store-section hours">
          <h2 className="section-title">운영 시간</h2>
          <ul className="operating-hours-list">
            {storeInfo.operatingHours.map((hour: string, index: number) => ( // FIX: hour 및 index에 타입 명시
              <li key={index}>{hour}</li>
            ))}
          </ul>
        </section>

        <div className="contact-buttons">
          <a href={`tel:${formatPhoneNumberForCall(storeInfo.phoneNumber)}`} className="contact-button primary">전화 문의</a>
          <a href={createKakaoTalkChatLink('YOUR_KAKAO_CHANNEL_ID')} target="_blank" rel="noopener noreferrer" className="contact-button secondary">카카오톡 문의</a>
        </div>
      </div>
    </>
  );
};

export default StoreInfoPage;