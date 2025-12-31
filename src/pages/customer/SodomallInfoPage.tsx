// src/pages/customer/SodomallInfoPage.tsx

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, MapPin, Clock, Phone, MessageCircle, 
  Star, X, Snowflake, ShoppingBag, Truck, ChevronRight 
} from 'lucide-react';
import { getPaginatedProductsWithStock } from '../../firebase/productService';
import { getDisplayRound, determineActionState } from '../../utils/productUtils';
import type { Product } from '../../shared/types';
import './SodomallInfoPage.css';

// Window 객체에 kakao가 있다고 타입 선언
declare global {
  interface Window {
    kakao: any;
  }
}

// -------------------- [DATA] --------------------

// 1. 매장 특징 카드
const FEATURES = [
  {
    icon: <Truck size={24} />,
    title: '공동구매 픽업 허브',
    desc: (
      <>
        송도픽에서 주문한 공구 상품을<br />
        <strong>가장 빠르고 편하게</strong> 수령할 수 있는 공간입니다.
      </>
    ),
  },
  {
    icon: <Snowflake size={24} />,
    title: '냉동·냉장 전문 보관',
    desc: (
      <>
        <strong>냉동·냉장 전용 쇼케이스</strong>로<br />
        신선함과 온도를 안정적으로 유지합니다.
      </>
    ),
  },
  {
    icon: <ShoppingBag size={24} />,
    title: '소비자도 도매가(소도몰)',
    desc: (
      <>
        ‘소비자가 도매가로 살 수 있는 몰’의 줄임말로,<br />
        <strong>인터넷가보다도 저렴한 제품</strong>을 엄선해 두고 있어요.
      </>
    ),
  },
];

// 2. 고객 리뷰
const REVIEWS = [
  {
    id: 1,
    text: '공구 물품 찾으러 갔다가 맨날 다른 제품까지 사오는 1인이에요. 가성비가 정말 좋아서 오래오래 열어주셨으면 좋겠어요 ♡',
    author: '고*****님',
    rating: 5,
  },
  {
    id: 2,
    text: '버스타고 일부러 들르는 곳이에요. 꼭 필요한 좋은 물건만 파셔서 이번 주에는 또 뭐 파나 항상 궁금해요.',
    author: '태*****님',
    rating: 5,
  },
  {
    id: 3,
    text: '처음 가봤는데 생각보다 제품이 정말 많아서 놀랐어요. 냉동식품부터 생활용품까지 있고, 무엇보다 인터넷보다 저렴한 가격이 매력적이에요.',
    author: '소***님',
    rating: 5,
  },
];

// 3. ✅ [수정] 갤러리 이미지 (실제 경로 연결)
// 파일명이 다르다면 여기서 수정해주세요 (예: gallery-1.png 등)
const GALLERY_IMAGES = [
  '/images/sodomall/gallery-1.jpg',
  '/images/sodomall/gallery-2.jpg',
  '/images/sodomall/gallery-3.jpg',
  '/images/sodomall/gallery-4.jpg',
];

const SodomallInfoPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  // 현재 진행 중인 상품 데이터 상태
  const [activeProducts, setActiveProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  // ✅ [수정] 매장 정보 상수 (로고 및 좌표)
  const STORE_INFO = {
    name: '소도몰 송도랜드마크점',
    address: '인천 연수구 랜드마크로 68 랜드마크시티센트럴더샵 상가 401동 1층 101호',
    phone: '010-6312-2767',
    kakaoUrl: 'http://pf.kakao.com/_CxjNKn',
    openChatUrl: 'https://open.kakao.com/o/g917Hh9g', // ✅ 찐 정보방 링크 연결 완료!
    lat: 37.41479492734981,
    lng: 126.61947334941975,
    logoSrc: '/images/sodomall/sodomall-logo.png',
  };

  // 모달 제어
  const openModal = (imgSrc: string) => setSelectedImage(imgSrc);
  const closeModal = () => setSelectedImage(null);

  // ✅ 진행 중인 상품 가져오기
  useEffect(() => {
    const fetchActiveProducts = async () => {
      try {
        setProductsLoading(true);
        // 조금 넉넉하게 30개 가져옴
        const { products: fetched } = await getPaginatedProductsWithStock(30, null, null, 'all');
        
        const nowActive = fetched
          .filter(p => {
            const round = getDisplayRound(p);
            if (!round) return false;

            const state = determineActionState(round as any, null as any) as any;
            
            // ✅ [필터] 실제 판매 중이거나 인기 상품(재고부족 포함) 노출
            return (
              state === 'PURCHASABLE' || 
              state === 'REQUIRE_OPTION' || 
              state === 'SCHEDULED' ||
              state === 'AWAITING_STOCK'
            ); 
          })
          .slice(0, 8); // 최대 8개까지

        setActiveProducts(nowActive);
      } catch (error) {
        console.error("상품 로드 실패:", error);
      } finally {
        setProductsLoading(false);
      }
    };

    fetchActiveProducts();
  }, []);

  // Kakao Map 로드 로직
  useEffect(() => {
    const container = document.getElementById('kakao-map');
    if (!container) return;

    const initMap = () => {
      window.kakao.maps.load(() => {
        const options = {
          center: new window.kakao.maps.LatLng(STORE_INFO.lat, STORE_INFO.lng),
          level: 3,
        };
        const map = new window.kakao.maps.Map(container, options);
        const markerPosition = new window.kakao.maps.LatLng(STORE_INFO.lat, STORE_INFO.lng);
        const marker = new window.kakao.maps.Marker({ position: markerPosition });
        marker.setMap(map);

        const iwContent =
          '<div style="padding:5px; font-size:12px; color:#1e3a8a; font-weight:bold;">소도몰 송도랜드마크점</div>';
        const infowindow = new window.kakao.maps.InfoWindow({ content: iwContent });
        infowindow.open(map, marker);
      });
    };

    if (window.kakao && window.kakao.maps) {
      initMap();
    } else {
      const scriptId = 'kakao-map-script';
      if (!document.getElementById(scriptId)) {
        const script = document.createElement('script');
        script.id = scriptId;
        // ⚠️ 본인의 카카오 JavaScript 키 확인 필요 (index.html에 있다면 자동 로드됨)
        script.src = '//dapi.kakao.com/v2/maps/sdk.js?appkey=YOUR_JS_KEY_HERE&autoload=false';
        script.onload = () => initMap();
        document.head.appendChild(script);
      } else {
        const checkInterval = setInterval(() => {
          if (window.kakao && window.kakao.maps) {
            initMap();
            clearInterval(checkInterval);
          }
        }, 500);
        setTimeout(() => clearInterval(checkInterval), 5000);
      }
    }
  }, [STORE_INFO.lat, STORE_INFO.lng]);

  return (
    <div className="customer-page-container modern-shell">
      <div className="modern-inner-shell">
        <div className="sodomall-page-container">
      {/* ✅ [수정] 헤더: 내부 래퍼(div) 추가 */}
      <header className="sodomall-header">
        <div className="header-inner">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={24} />
          </button>
          <h1 className="header-title">브랜드 정보</h1>
        </div>
      </header>

      {/* 2. HERO 섹션 */}
<section className="sodomall-hero">
  <div className="sodomall-hero-content">
    <div className="hero-text-col">
      <span className="hero-tag">SONGDOPICK PICK-UP SPOT</span>
      
      {/* 🔴 수정 포인트 1: 글자 사이에 공백을 직접 넣고 <br/> 유지 */}
      <h2 className="hero-title">
        소도몰 <br /> 송도랜드마크점
      </h2>

      <p className="hero-subtitle">
        <span className="text-highlight">소비자가 도매가로 살 수 있는</span>
        <br />
        송도 로컬 공동구매 매장
      </p>
      
      {/* 🔴 수정 포인트 2: 설명글도 <br/> 앞뒤로 띄어쓰기 엔터 말고 '스페이스바'로 띄워주세요 */}
      <p className="hero-desc">
        소도몰은 &quot;소비자가 도매가로 살 수 있는 오프라인 쇼핑몰&quot;이라는 의미에서
        시작된 이름이에요. <br /> 송도픽에서 주문하신 공구 상품을 가장 안전하게 보관·전달해 드리는 동시에,
        <br /> 냉동식품부터 생활용품까지 <span className="text-highlight">인터넷가보다 저렴한 상품</span>들을 한 곳에서 만나보실 수
        있습니다.
      </p>
    </div>
          <div className="hero-img-col">
            <div
              className="hero-img-wrapper"
              onClick={() =>
                // ✅ [수정] 모달 열 때도 실제 이미지 경로 사용
                openModal('/images/sodomall/store-main.jpg')
              }
            >
              {/* ✅ [수정] 메인 이미지 실제 경로 연결 */}
              <img
                src="/images/sodomall/store-main.jpg"
                alt="소도몰 매장 전경"
              />
              <div className="img-overlay">
                <span>크게 보기</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. 소도몰 특징 */}
      <section className="sodomall-section sodomall-features">
        <div className="section-header center">
          <h3>Why Sodomall?</h3>
          <p>송도픽 회원님들이 소도몰을 찾는 이유</p>
        </div>
        <div className="features-grid">
          {FEATURES.map((feature, idx) => (
            <div key={idx} className="feature-card">
              <div className="icon-box">{feature.icon}</div>
              <h4>{feature.title}</h4>
              <p>{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4. 진행 중인 공구 (자동 슬라이더) */}
      <section className="sodomall-section bg-gray">
        <div className="section-header center">
          <h3>Now on Sale</h3>
          <p>지금 소도몰에서 예약 가능한 공구 상품</p>
        </div>
        
        {productsLoading ? (
          <div className="loading-placeholder">공구 상품 불러오는 중...</div>
        ) : activeProducts.length > 0 ? (
          <div className="active-products-slider">
            {/* 🚀 데이터 2배 복제 -> 끊김 없는 무한 스크롤 */}
            <div className="products-track">
              {[...activeProducts, ...activeProducts].map((prod, index) => (
                <div 
                  key={`${prod.id}-${index}`} 
                  className="mini-product-card"
                  onClick={() => navigate(`/product/${prod.id}`)}
                >
                  <div className="mini-img-box">
                    <img src={prod.imageUrls?.[0]} alt={prod.groupName} />
                    <div className="mini-overlay">
                      <span>구매하기</span>
                    </div>
                  </div>
                  <h4 className="mini-prod-title">{prod.groupName}</h4>
                </div>
              ))}
              
              <div 
                className="mini-product-card see-more-card"
                onClick={() => navigate('/')}
              >
                <div className="see-more-circle">
                  <ChevronRight size={24} />
                </div>
                <span className="see-more-text">전체보기</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-products-msg">
            <p>현재 진행 중인 공구가 없습니다.<br/>다음 일정을 기대해주세요!</p>
          </div>
        )}
      </section>

      {/* 5. 고객 리뷰 */}
      <section className="sodomall-section">
        <div className="section-header center">
          <h3>Customer Reviews</h3>
          <p>이웃들이 직접 남겨주신 찐 방문 후기</p>
        </div>
        <div className="sodomall-reviews-grid">
          {REVIEWS.map((review) => (
            <div key={review.id} className="review-card">
              <div className="review-stars">
                {[...Array(review.rating)].map((_, i) => (
                  <Star key={i} size={14} fill="#FFB800" stroke="none" />
                ))}
              </div>
              <p className="review-text">&quot;{review.text}&quot;</p>
              <div className="review-author">
                <div className="avatar-circle">{review.author[0]}</div>
                <span>{review.author}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. 매장 갤러리 */}
      <section className="sodomall-section bg-gray">
        <div className="section-header center">
          <h3>Store Gallery</h3>
          <p>소도몰 송도랜드마크점 내부 모습</p>
        </div>
        <div className="sodomall-gallery-grid">
          {GALLERY_IMAGES.map((img, idx) => (
            <div key={idx} className="gallery-item" onClick={() => openModal(img)}>
              <img src={img} alt={`store scene ${idx + 1}`} />
              <div className="overlay" />
            </div>
          ))}
        </div>
      </section>

      {/* 7. 이용 안내 및 지도 */}
      <section className="sodomall-section sodomall-info-split">
        {/* 왼쪽: 이용 방법 */}
        <div className="info-guide-col">
          <h3>픽업 이용 방법</h3>
          <p className="guide-sub">송도픽에서 주문 후 소도몰로 방문해 주세요.</p>

          <ul className="guide-steps">
            <li>
              <div className="step-num">01</div>
              <div className="step-content">
                <strong>송도픽에서 상품 주문</strong>
                <p>송도픽 사이트에서 원하는 공구 상품을 <strong>예약·주문</strong>합니다.</p>
              </div>
            </li>
            <li>
              <div className="step-num">02</div>
              <div className="step-content">
                <strong>픽업 알림 확인</strong>
                <p>상품 준비가 완료되면 카카오톡 알림을 통해 <strong>픽업 가능 시간</strong>을 안내드립니다.</p>
              </div>
            </li>
            <li>
              <div className="step-num">03</div>
              <div className="step-content">
                <strong>소도몰 방문 후 수령</strong>
                <p>소도몰에서 <strong>주문자 이름</strong> 또는 닉네임을 말씀해 주시면 상품을 전달드립니다.</p>
              </div>
            </li>
          </ul>

          <div className="mobile-only-contacts" style={{ flexDirection: 'column', gap: '8px' }}>
             {/* 🔥 [추가] 오픈채팅방 (가장 중요!) */}
             <a
              href={STORE_INFO.openChatUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-simple-kakao"
              style={{ background: '#371d1e', color: '#fae100' }} // 색상 반전으로 강조
            >
              <MessageCircle size={18} /> 📣 입고/픽업 실시간 알림방 (참여)
            </a>

            <a
              href={STORE_INFO.kakaoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-simple-kakao"
            >
              <MessageCircle size={18} /> 소도몰 카카오 채널
            </a>
          </div>
        </div>

        {/* 오른쪽: 매장 정보 카드 */}
        <div className="info-map-col">
          <div className="store-info-card">
            <div className="store-card-header">
              <div className="store-title-block">
                <h4>{STORE_INFO.name}</h4>
                <span className="badge">영업중</span>
              </div>
              
              {/* ✅ [수정] 실제 로고 이미지 */}
              <div className="store-logo-wrap">
                <img
                  src={STORE_INFO.logoSrc}
                  alt="소도몰 로고"
                  className="store-logo-img"
                />
              </div>
            </div>

            <div className="info-row">
              <Clock size={18} className="icon" />
              <div>
                <p><strong>평일</strong> 13:00 ~ 20:00</p>
                <p><strong>토요일</strong> 13:00 ~ 18:00</p>
                <p className="holiday">일요일 및 공휴일 휴무</p>
              </div>
            </div>

            <div className="info-row">
              <MapPin size={18} className="icon" />
              <div>
                <p>{STORE_INFO.address}</p>
              </div>
            </div>

            <div className="map-wrapper">
              <div id="kakao-map" />
            </div>

            <div className="card-actions">
              <a href={`tel:${STORE_INFO.phone}`} className="btn-action btn-call">
                <Phone size={18} /> 전화 문의
              </a>
              
              {/* 🔥 [추가] 오픈채팅방 버튼 */}
              {STORE_INFO.openChatUrl && (
                <a
                  href={STORE_INFO.openChatUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-action btn-kakao"
                  style={{ fontWeight: 800 }} // 글자 더 굵게
                >
                  <MessageCircle size={18} /> 실시간 공구/입고 알림방
                </a>
              )}
              
              <a
                href={STORE_INFO.kakaoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-action btn-kakao"
                style={{ background: '#fee500', opacity: 0.8 }} // 오픈채팅보다 살짝 연하게 구분
              >
                <MessageCircle size={18} /> 소도몰 카카오 채널
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 8. 하단 안내 문구 */}
      <footer className="sodomall-footer">
        <p className="footer-title">안내사항</p>
        <p className="footer-desc">
          송도픽은 로컬 공동구매 정보를 모아 보여주는 플랫폼이며,&nbsp;
          &apos;소도몰 송도랜드마크점&apos;은 상품의 입고·보관·인도를 담당하는 공식 픽업
          파트너입니다. 상품의 재고, 품질, 환불 등에 대한 1차적인 책임은 판매처(소도몰)에
          있습니다.
        </p>
        <p className="copyright">© SODOMALL x SONGDOPICK. All rights reserved.</p>
      </footer>

      {/* 이미지 확대 모달 */}
      {selectedImage && (
        <div className="image-modal-overlay" onClick={closeModal}>
          <button className="modal-close-btn" onClick={closeModal}>
            <X size={32} />
          </button>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <img src={selectedImage} alt="Large View" />
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
};

export default SodomallInfoPage;