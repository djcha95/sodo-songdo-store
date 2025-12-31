// src/pages/customer/HeyUBeautyPage.tsx
import React, { useState } from "react";
import "./HeyUBeautyPage.css";

// =================================================================
// 🔧 데이터 설정
// =================================================================

const heyuData = {
  logo: "/images/heyu/heyu-logo-main.png",
  heroImage: "/images/heyu/heyu-room-main.jpg",
  galleryImages: [
    "/images/heyu/heyu-room-1.jpg",
    "/images/heyu/heyu-room-2.jpg",
    "/images/heyu/heyu-room-3.jpg",
    "/images/heyu/heyu-room-4.jpg",
  ],
  address: "인천 연수구 인천타워대로 365 힐스테이트송도더스카이 오피스텔 A동 2층 210호",
  locationNote: "인천1호선 국제업무지구역 3번 출구에서 41m",
  hours: (
    <>
      평일 10:30 - 21:00 (목요일 ~22:00)<br/>
      토요일 10:30 - 17:30<br/>
      <span style={{ color: "#ef4444" }}>일요일 정기휴무</span>
    </>
  ),
  phone: "0507-1376-9094",
  instagramLink: "https://www.instagram.com/hey.u_beautyroom",
  parkingGuide: (
    <>
      <strong>[주차/찾아오시는 길]</strong><br/>
      '힐스테이트송도더스카이 오피스텔' 검색 후 <strong>GATE 3</strong>으로 진입하세요.<br/>
      주차장으로 내려오시면 <strong>왼쪽 상가동</strong>으로 입차하시면 됩니다.
    </>
  ),
  mapLink: "https://map.naver.com/p/search/인천%20연수구%20인천타워대로%20365%20오피스텔%20A동%202층%20210호",
};

// ⭐ 요약된 리뷰 데이터
const reviews = [
  {
    user: "vnf*****",
    text: "세 번째 방문인데 올 때마다 만족도가 높아져요. 이번엔 속눈썹이랑 눈썹 같이 정리했는데 진짜 너무 잘한 선택이었어요! 👍",
  },
  {
    user: "sho******",
    text: "직모이신 분들 아이브로우펌 꼭 하세요, 신세계입니다! 사장님 너무 친절하시고 '마약 침대'라서 눕자마자 꿀잠 자고 일어나니 예뻐져 있네요. 😍",
  },
  {
    user: "혜******",
    text: "인상부터 달라져서 깜짝 놀랐어요! 상담도 하나하나 친절하게 해주시고 고민인 부분도 싹 해결해주셔서 할 때마다 만족할 것 같아요. 🥹",
  },
];

const HeyUBeautyPage: React.FC = () => {
  // 이미지 모달 상태 관리
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const openModal = (src: string) => setSelectedImage(src);
  const closeModal = () => setSelectedImage(null);

  return (
    <div className="customer-page-container modern-shell">
      <div className="modern-inner-shell">
        <div className="heyu-page">
      {/* 상단 콜라보 태그 */}
      <div className="heyu-breadcrumb">
        <span>SONGDOPICK COLLABORATION</span>
      </div>

      {/* HERO 섹션 */}
      <section className="heyu-hero">
        <div className="heyu-hero-left">
          <div className="heyu-collab-tag">
            SONGDOPICK × HEY, U BEAUTYROOM
          </div>
          <h1 className="heyu-hero-title">
            송도 픽 고객 전용
            <br />
            <span>프리미엄 뷰티 케어 혜택</span>
          </h1>
          <p className="heyu-hero-desc">
            <span className="highlight-yellow">기미·잡티 개선 전문 클리닉급 케어</span>부터<br /> 
            속눈썹, 브로우, 르멜라 시술까지.<br />
            송도 프리미엄 뷰티룸 <strong>HEY, U BEAUTYROOM</strong>을<br />
            전용 혜택으로 만나보세요.
          </p>

          <div className="heyu-hero-highlight">
            <div className="heyu-hero-highlight-item">
              <div className="heyu-highlight-label">송도픽 전용</div>
              <div className="heyu-highlight-main">전 시술 10% 할인</div>
              <p className="heyu-highlight-sub">
                <span className="highlight-yellow">"송도픽 보고 왔어요"</span>라고<br/>
                말씀해 주시면 적용됩니다.
              </p>
            </div>
            <div className="heyu-hero-highlight-item">
              <div className="heyu-highlight-label">스페셜 이벤트</div>
              <ul className="heyu-highlight-list">
                <li>
                  멜라즈마 풀페이스{" "}
                  <span className="price-emphasis">50% OFF</span>
                </li>
                <li>
                  르멜라(착색) 시술{" "}
                  <span className="price-emphasis">25% OFF</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="heyu-hero-right">
          <div className="heyu-hero-image-card">
            {heyuData.heroImage && (
              <img
                src={heyuData.heroImage}
                alt="HEY U BEAUTYROOM 인테리어"
                className="heyu-hero-image"
                onClick={() => openModal(heyuData.heroImage)}
              />
            )}
            <div className="heyu-logo-badge">
              {heyuData.logo && (
                <img
                  src={heyuData.logo}
                  alt="로고"
                  className="heyu-logo-img"
                />
              )}
              <span className="heyu-logo-text">HEY, U BEAUTYROOM</span>
            </div>
          </div>
        </div>
      </section>

      {/* 샵 소개 섹션 */}
      <section className="heyu-section">
        <h2 className="heyu-section-title">HEY, U BEAUTYROOM 소개</h2>
        <p className="heyu-section-sub">
          “방문해 주시는 한 분 한 분께 가장 <span className="highlight-yellow">세련되고 고급스러운 서비스</span>를 약속드립니다.”
        </p>

        <div className="heyu-intro-grid">
          <div className="heyu-intro-card">
            <h3>기미·잡티 개선 전문 클리닉급 케어</h3>
            <p>
              클리닉 수준의 관리로 <span className="highlight-yellow">기미, 주근깨, 잡티, 점</span> 등을 집중적으로
              케어합니다. 멜라닌·색소 고민이 있으신 분들께 강력 추천합니다.
            </p>
          </div>
          <div className="heyu-intro-card">
            <h3>프리미엄 뷰티케어 & 속눈썹 전문샵</h3>
            <p>
              내추럴하면서도 세련된 <span className="highlight-yellow">속눈썹 디자인과 브로우 케어</span>로, 얼굴
              전체의 인상을 부드럽고 깔끔하게 정돈해 드립니다.
            </p>
          </div>
          <div className="heyu-intro-card">
            <h3>송도 프리미엄 뷰티룸</h3>
            <p>
              <span className="highlight-yellow">화이트&글라스 톤의 모던한 인테리어</span>. 프라이빗한 케어룸에서
              편안하게 시술을 받으실 수 있는 힐링 공간입니다.
            </p>
          </div>
        </div>
      </section>

      {/* ⭐ [NEW] 고객 리얼 리뷰 섹션 */}
      <section className="heyu-section">
        <h2 className="heyu-section-title">고객 리얼 리뷰</h2>
        <p className="heyu-section-sub">실제 방문 고객님들의 솔직한 후기입니다.</p>
        <div className="heyu-review-grid">
          {reviews.map((review, idx) => (
            <div className="heyu-review-card" key={idx}>
              <div className="review-text">"{review.text}"</div>
              <div className="review-user">{review.user}님</div>
            </div>
          ))}
        </div>
      </section>

      {/* 혜택 요약 섹션 */}
      <section className="heyu-section">
        <h2 className="heyu-section-title">송도픽 고객 전용 혜택</h2>

        <div className="heyu-benefit-grid">
          <div className="heyu-benefit-card primary">
            <div className="heyu-benefit-label">BASIC BENEFIT</div>
            <h3>전 시술 10% 할인</h3>
            <p>
              송도픽 페이지를 보고 방문하셨다면,
              <br />
              어떤 시술이든 <span className="highlight-strong">기본 10% 할인</span> 혜택이 적용됩니다.
            </p>
          </div>

          <div className="heyu-benefit-card">
            <div className="heyu-benefit-label">SPECIAL EVENT 01</div>
            <h3>멜라즈마 풀페이스 50% OFF</h3>
            <p>
              <span className="highlight-yellow">기미·주근깨·잡티·점</span>까지 한 번에 케어하는
              <br />
              멜라즈마 풀페이스 시술
            </p>
            <p className="heyu-benefit-price">
              <span className="before">600,000원</span>
              <span className="arrow">→</span>
              <span className="after">300,000원</span>
            </p>
          </div>

          <div className="heyu-benefit-card">
            <div className="heyu-benefit-label">SPECIAL EVENT 02</div>
            <h3>르멜라(착색) 시술 25% 할인</h3>
            <p>
              유륜, 무릎, 팔꿈치 등 <span className="highlight-yellow">어둡거나 착색된 피부색</span>을 환하게 돌려주는 <strong>르멜라 시술</strong>
            </p>
            <p className="heyu-benefit-price">
              <span className="after">전 부위 25% 할인 적용</span>
            </p>
          </div>
        </div>
      </section>

      {/* 갤러리 섹션 */}
      <section className="heyu-section">
        <h2 className="heyu-section-title">공간 미리 보기</h2>
        <p className="heyu-section-sub">이미지를 클릭하면 크게 보실 수 있습니다.</p>
        <div className="heyu-gallery-grid">
          {heyuData.galleryImages.map((src, idx) => (
            <div 
              className="heyu-gallery-item" 
              key={idx}
              onClick={() => openModal(src)}
            >
              <img
                src={src}
                alt={`매장 사진 ${idx + 1}`}
                className="heyu-gallery-img"
              />
              <div className="zoom-icon">🔍</div>
            </div>
          ))}
        </div>
      </section>

      {/* 이용 안내 및 매장 정보 */}
      <section className="heyu-section">
        <div className="heyu-info-container">
          <div className="heyu-info-left">
            <h2 className="heyu-section-title">혜택 받는 방법</h2>
            <ol className="heyu-guide-list">
              <li>
                <span className="step-num">01</span>
                <div>
                  <span className="highlight-yellow">이 페이지를 캡처</span>하시거나,<br/>
                  “송도픽에서 봤어요”라고 기억해 주세요.
                </div>
              </li>
              <li>
                <span className="step-num">02</span>
                <div>
                  <span className="highlight-strong">예약 문의 시 언급</span>해 주세요.<br/>
                  (인스타그램 DM, 문자, 전화 등)
                </div>
              </li>
              <li>
                <span className="step-num">03</span>
                <div>
                  <strong>방문 후 1:1 맞춤 상담</strong>을 통해<br/>
                  피부 상태 확인 후 시술을 진행합니다.
                </div>
              </li>
              <li>
                <span className="step-num">04</span>
                <div>
                  <span className="highlight-strong">결제 시 할인가 적용!</span><br/>
                  기본 10% 및 이벤트 혜택을 받으세요.
                </div>
              </li>
            </ol>
          </div>

          <div className="heyu-info-right">
            <div className="heyu-shop-card">
              <h3 className="shop-name">HEY, U BEAUTYROOM</h3>
              
              <div className="shop-detail-item">
                <div className="icon-box">📍</div>
                <div className="text-box">
                  <div className="label">LOCATION</div>
                  <div className="value">
                    {heyuData.address}
                    <br/>
                    <span className="sub-note">
                      {heyuData.locationNote}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="shop-detail-item guide-box">
                <div className="text-box full-width">
                  <div className="value">
                    {heyuData.parkingGuide}
                  </div>
                </div>
              </div>

              <div className="shop-detail-item">
                <div className="icon-box">⏰</div>
                <div className="text-box">
                  <div className="label">HOURS</div>
                  <div className="value">{heyuData.hours}</div>
                </div>
              </div>

              <div className="shop-actions">
                <a href={`tel:${heyuData.phone}`} className="action-btn">
                  전화 문의하기
                </a>
                <a 
                  href={heyuData.mapLink}
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="action-btn map"
                >
                  네이버 지도로 보기
                </a>
                <a 
                  href={heyuData.instagramLink} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="action-btn insta"
                >
                  인스타그램 구경가기
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

{/* 마무리 문구 및 유의사항 (업데이트) */}
      <section className="heyu-footer-section">
        <p className="heyu-footer-title">
          SONGDOPICK × HEY, U BEAUTYROOM
        </p>
        <p className="heyu-footer-text">
          송도에서 프리미엄 뷰티 케어를 고민하고 계셨다면,<br />
          <span className="highlight-yellow">이번 콜라보 혜택을 놓치지 마세요.</span><br />
          <strong>“송도픽에서 보고 왔어요”</strong> 한 마디면 충분합니다. ✨
        </p>

        {/* 👇 [추가된 부분] 운영 정책 및 면책 조항 */}
        <div className="heyu-disclaimer">
          <ul>
            <li>
              본 이벤트 혜택 및 가격은 제휴사(HEY, U BEAUTYROOM)의 사정에 따라 예고 없이 변경되거나 조기 종료될 수 있습니다.
            </li>
            <li>
              방문 전 인스타그램 또는 유선 문의를 통해 최신 혜택 내용을 확인해주시기 바랍니다.
            </li>
            <li>
              '송도픽(SongdoPick)'은 제휴 혜택 정보를 소개하는 중개 플랫폼입니다.
              시술 서비스, 의학적 부작용, 시술 결과 및 환불 등에 대한 모든 책임은 서비스 제공 업체인 'HEY, U BEAUTYROOM'에 있습니다.
            </li>
          </ul>
        </div>
      </section>
      
      {/* 이미지 모달 */}
      {selectedImage && (
        <div className="heyu-modal-overlay" onClick={closeModal}>
          <div className="heyu-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="heyu-modal-close" onClick={closeModal}>
              &times;
            </button>
            <img src={selectedImage} alt="확대된 매장 사진" />
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
};

export default HeyUBeautyPage;