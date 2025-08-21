// src/components/test/SwiperCenteringTest.tsx (최종 완성본)

import React, { useState, useEffect } from 'react';

// Swiper 관련 import
import { Swiper, SwiperSlide } from 'swiper/react';
// ✅ [수정 2] FreeMode 모듈을 import 합니다.
import { Thumbs, Navigation, FreeMode } from 'swiper/modules';
import type { Swiper as SwiperCore } from 'swiper';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/thumbs';
import 'swiper/css/free-mode'; // FreeMode CSS 추가

// 테스트를 위한 CSS (이전과 동일)
const testStyles = `
  .test-container { background-color: #2d3436; padding: 2rem; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; box-sizing: border-box; }
  .my-main-swiper { width: 100%; max-width: 500px; height: 300px; background-color: #636e72; border-radius: 10px; margin-bottom: 1rem; }
  .my-main-swiper .swiper-slide { color: white; display: flex; justify-content: center; align-items: center; font-size: 2rem; font-weight: bold; }
  .my-main-swiper .swiper-button-next, .my-main-swiper .swiper-button-prev { color: #fff; }
  .my-thumbs-swiper { width: 100%; max-width: 500px; height: 100px; padding: 10px 0; box-sizing: border-box; }
  .my-thumbs-swiper .swiper-slide { width: 80px; height: 80px; opacity: 0.5; background-color: #0984e3; color: white; cursor: pointer; border-radius: 8px; transition: opacity 0.3s; display: flex; justify-content: center; align-items: center; font-weight: bold; }
  .my-thumbs-swiper .swiper-slide:hover { opacity: 0.8; }
  .my-thumbs-swiper .swiper-slide-thumb-active { opacity: 1; }
`;

// 테스트용 데이터
const mockImages = Array.from({ length: 15 }, (_, i) => `Image ${i + 1}`);

const SwiperCenteringTest: React.FC = () => {
  const [mainSwiper, setMainSwiper] = useState<SwiperCore | null>(null);
  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperCore | null>(null);

  // [큰 사진 -> 작은 사진] 동기화 로직 (이전과 동일)
  useEffect(() => {
    if (mainSwiper && thumbsSwiper && !mainSwiper.destroyed && !thumbsSwiper.destroyed) {
      const handleSlideChange = () => {
        thumbsSwiper.slideToLoop(mainSwiper.realIndex);
      };
      mainSwiper.on('slideChange', handleSlideChange);
      return () => {
        mainSwiper.off('slideChange', handleSlideChange);
      };
    }
  }, [mainSwiper, thumbsSwiper]);

  return (
    <>
      <style>{testStyles}</style>
      <div className="test-container">
        {/* 메인 Swiper */}
        <Swiper
          onSwiper={setMainSwiper}
          modules={[Thumbs, Navigation]}
          className="my-main-swiper"
          navigation={true}
          spaceBetween={10}
          loop={true}
        >
          {mockImages.map((img, index) => (
            <SwiperSlide key={index}>{img}</SwiperSlide>
          ))}
        </Swiper>

        {/* 썸네일 Swiper */}
        <Swiper
          onSwiper={setThumbsSwiper}
          // ✅ [수정 2] FreeMode 모듈을 등록합니다.
          modules={[Thumbs, FreeMode]}
          className="my-thumbs-swiper"
          slidesPerView="auto"
          centeredSlides={true}
          spaceBetween={10}
          watchSlidesProgress={true}
          loop={true}
          
          // ✅ [수정 2] freeMode 옵션을 활성화합니다.
          freeMode={true}

          // ❌ slideToClickedSlide 옵션은 freeMode와 함께 사용할 때
          // 의도치 않은 동작을 유발할 수 있어 제거하는 것이 더 안정적입니다.
          // slideToClickedSlide={true}
          
          // ✅ [수정 1] 인덱스 불일치 문제를 해결하는 새로운 onClick 로직
          onClick={(swiper, event) => {
            if (!mainSwiper || mainSwiper.destroyed) return;

            // 클릭된 HTML 요소를 찾습니다.
            const clickedSlide = (event.target as HTMLElement).closest('.swiper-slide');
            if (!clickedSlide) return;

            // 해당 요소의 '진짜' 인덱스 번호를 가져옵니다.
            const realIndex = clickedSlide.getAttribute('data-swiper-slide-index');
            if (realIndex !== null) {
              mainSwiper.slideToLoop(parseInt(realIndex, 10));
            }
          }}
        >
          {mockImages.map((img, index) => (
            <SwiperSlide key={index}>Slide {index + 1}</SwiperSlide>
          ))}
        </Swiper>
      </div>
    </>
  );
};

export default SwiperCenteringTest;