// src/components/customer/AppTour.tsx

import React from 'react';
import Joyride, { type Step, type CallBackProps, STATUS, ACTIONS, EVENTS } from 'react-joyride'; // ✅ ACTIONS, EVENTS 추가
import { useAuth } from '@/context/AuthContext';
import { useTutorial } from '@/context/TutorialContext';
import { doc, updateDoc } from 'firebase/firestore/lite';
import { getFirebaseServices } from '@/firebase/firebaseInit'; // ✅ '관리자' 함수 import

// 1. 메인 페이지 (ProductListPage) 튜토리얼 단계
export const mainTourSteps: Step[] = [
  {
    target: '[data-tutorial-id="header-notifications"]',
    content: '새로운 알림이나 오늘 픽업할 상품이 있으면 여기에 표시돼요!',
    disableBeacon: true,
  },
  {
    target: '[data-tutorial-id="main-banner"]',
    content: '가장 먼저 보이는 메인 배너에서는 최신 소식과 이벤트 정보를 확인할 수 있어요!',
  },
  {
    target: '[data-tutorial-id="primary-sale-section"]',
    content: '🔥오늘의 공동구매! 매일 오후 2시에 오픈되는 상품들을 예약할 수 있는 핵심 공간입니다. 옆으로 스크롤해서 더 많은 상품을 확인해보세요!',
  },
  {
    target: '[data-tutorial-id="secondary-sale-section"]',
    content: '⏰마감임박 추가공구! 아쉽게 놓친 상품이 있다면, 픽업일 점심까지 여기서 마지막으로 예약할 수 있어요.',
  },
  {
    target: '[data-tutorial-id="past-sale-section"]',
    content: '최근에 마감된 상품들이 날짜별로 정리되어 있어요. 다른 분들이 어떤 상품을 샀는지 구경하고, 앵콜을 요청할 수도 있답니다.',
    placement: 'top',
  },
  {
    target: '[data-tutorial-id="bottom-nav-cart"]',
    content: '상품을 담았다면 여기서 확인! 예약할 상품과 대기 상품을 모두 관리할 수 있어요.',
    placement: 'top',
  },
  {
    target: '[data-tutorial-id="bottom-nav-customer-center"]',
    content: '문의사항이 있거나 매장 정보가 궁금할 땐 고객센터를 이용해주세요.',
    placement: 'top',
  },
  {
    target: '[data-tutorial-id="bottom-nav-mypage"]',
    content: '나의 등급, 포인트, 주문 내역 등 모든 내 정보를 여기서 확인하세요. 튜토리얼이 끝나면 마이페이지로 이동해볼까요?',
    placement: 'top',
  },
];

// 2. 상품 상세 페이지 (ProductDetailPage) 튜토리얼 단계
export const detailPageTourSteps: Step[] = [
    {
        target: '[data-tutorial-id="detail-image-gallery"]',
        content: '상품 이미지를 클릭하면 전체 화면으로 크게 볼 수 있어요.',
        disableBeacon: true,
    },
    {
        target: '[data-tutorial-id="detail-key-info"]',
        content: '판매 회차, 마감일, 픽업일 등 중요한 정보는 여기서 확인하세요!',
    },
    {
        target: '[data-tutorial-id="detail-options"]',
        content: '옵션이 여러 개인 경우, 여기서 원하는 옵션을 선택할 수 있습니다.',
    },
    {
        target: '[data-tutorial-id="detail-quantity-controls"]',
        content: '여기서 구매할 수량을 조절할 수 있어요. 버튼을 길게 누르면 수량이 빠르게 변경됩니다.',
    },
    {
        target: '[data-tutorial-id="detail-action-button"]',
        content: '모든 선택이 끝났다면, 이 버튼을 눌러 장바구니에 담거나 대기 신청을 할 수 있습니다.',
    },
];

// 3. 장바구니 페이지 (CartPage) 튜토리얼 단계
export const cartPageTourSteps: Step[] = [
    {
        target: '[data-tutorial-id="cart-reservation-list"]',
        content: '장바구니에 담은 예약 상품들이 여기에 표시됩니다. 상품을 길게 누르면 삭제할 수 있어요.',
        disableBeacon: true,
    },
    {
        target: '[data-tutorial-id="cart-waitlist-list"]',
        content: '품절 상품에 대기 신청을 하면 여기에 표시돼요. 재고가 확보되면 자동으로 예약으로 전환됩니다!',
    },
    {
        target: '[data-tutorial-id="cart-checkout-button"]',
        content: '모든 상품을 확인했다면, 이 버튼을 눌러 최종적으로 예약을 확정하세요!',
    },
];

// 4. 픽업 캘린더 페이지 (OrderCalendar) 튜토리얼 단계
export const calendarPageTourSteps: Step[] = [
    {
        target: '[data-tutorial-id="calendar-main"]',
        content: '이 캘린더에서 나의 픽업 일정을 한눈에 확인할 수 있어요. 날짜에 표시된 색깔은 픽업 상태를 의미합니다.',
        disableBeacon: true,
    },
    {
        target: '[data-tutorial-id="calendar-legend"]',
        content: '픽업 예정, 완료, 노쇼 등 각 색상이 어떤 상태를 나타내는지 여기서 확인할 수 있습니다.',
    },
    {
        target: '[data-tutorial-id="calendar-challenge"]',
        content: '매달 주어지는 간단한 픽업 챌린지에 도전하고, 나의 활동을 점검해보세요!',
    },
    {
        target: '[data-tutorial-id="calendar-main"]',
        content: '픽업 일정이 있는 날짜를 클릭하면, 그날 찾아가야 할 상품 목록을 아래에서 바로 확인할 수 있답니다.',
    },
];

// 5. 고객센터 페이지 (CustomerCenterPage) 튜토리얼 단계
export const customerCenterTourSteps: Step[] = [
    {
        target: '[data-tutorial-id="customer-center-quick-links"]',
        content: '가장 자주 사용하는 기능이에요! 버튼을 눌러 소도몰 카카오톡 채널로 이동하거나, 사장님과 1:1 문의를 시작할 수 있습니다.',
        disableBeacon: true,
    },
    {
        target: '[data-tutorial-id="customer-center-tabs"]',
        content: '매장 정보, 이용 안내, 자주 묻는 질문 등 궁금한 정보를 탭해서 확인해보세요.',
    },
    {
        target: '[data-tutorial-id="customer-center-map"]',
        content: '매장 위치가 궁금하다면 지도를 확인해주세요!',
        placement: 'top',
    },
];

// 6. 마이페이지 (MyPage) 튜토리얼 단계
export const myPageTourSteps: Step[] = [
    {
        target: '[data-tutorial-id="mypage-profile-card"]',
        content: '이곳에서 나의 신뢰 등급과 활동 포인트를 한눈에 확인할 수 있어요. 카드를 클릭하면 등급별 혜택을 볼 수 있습니다.',
        disableBeacon: true,
    },
    {
        target: '[data-tutorial-id="mypage-nickname-setup"]',
        content: '아직 닉네임을 설정하지 않으셨다면, 여기서 설정해주세요! 소통이 훨씬 원활해집니다.',
    },
    {
        target: '[data-tutorial-id="mypage-referral-code"]',
        content: '친구에게 내 초대코드를 공유하고 함께 포인트를 받아보세요!',
    },
    {
        target: '[data-tutorial-id="mypage-menu-list"]',
        content: '주문/대기 내역, 픽업 달력 등 나의 모든 활동 내역은 여기서 확인할 수 있습니다.',
    },
];

// 7. 주문/대기 내역 페이지 (OrderHistoryPage) 튜토리얼 단계
export const orderHistoryTourSteps: Step[] = [
    {
        target: '[data-tutorial-id="history-view-toggle"]',
        content: '주문일순, 픽업일순, 대기목록으로 나누어 내역을 편리하게 확인해보세요.',
        disableBeacon: true,
    },
    {
        target: '[data-tutorial-id="history-cancel-info"]',
        content: '예약을 취소하고 싶으신가요? 취소하고 싶은 상품 카드를 1.5초간 길게 누르면 취소할 수 있습니다.',
    },
    {
        target: '[data-tutorial-id="history-waitlist-ticket"]',
        content: '대기 목록에서는 50포인트를 사용해 \'순서 올리기\'가 가능해요. 인기 상품을 더 빨리 받아보세요!',
    },
];


interface AppTourProps {
  steps: Step[];
  tourKey: string;
}

const AppTour: React.FC<AppTourProps> = ({ steps, tourKey }) => {
  const { user, userDocument } = useAuth();
  const { stopTour } = useTutorial();

  const handleJoyrideCallback = async (data: CallBackProps) => {
    const { status, action, type } = data; // ✅ action, type 추가
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

    // ✅ 툴팁의 'x' 버튼을 눌렀을 때도 투어를 종료시키도록 처리
    if (action === ACTIONS.CLOSE && type === EVENTS.TOOLTIP) {
      stopTour();
      return;
    }

    if (finishedStatuses.includes(status)) {
      stopTour();

      // ✅ 기존 로직 유지: 메인 튜토리얼을 한 번이라도 완료했는지 기록
      if (user?.uid && userDocument && !userDocument.hasCompletedTutorial) {
        try {
          const { db } = await getFirebaseServices(); // ✅ 함수 내에서 db 받아오기
          const userRef = doc(db, 'users', user.uid);
          await updateDoc(userRef, { hasCompletedTutorial: true });
        } catch (error) {

          console.error("튜토리얼 완료 상태 업데이트 실패:", error);
        }
      }
    }
  };

  if (!steps || steps.length === 0) {
    return null;
  }

  return (
    <Joyride
      key={tourKey}
      steps={steps}
      run={steps.length > 0}
      callback={handleJoyrideCallback}
      continuous
      showProgress
      showSkipButton
      // ✅ [수정/추가] 핵심 기능 구현을 위한 props
      disableOverlayClose={true}   // 오버레이 클릭으로 닫기 방지
      disableCloseOnEsc={true}     // ESC 키로 닫기 방지
      spotlightClicks={true}       // 하이라이트된 요소 클릭 시 다음 단계로 진행
      scrollOffset={150}
      floaterProps={{
        styles: {
          arrow: {
            length: 8,
            spread: 12,
          },
        },
      }}
      locale={{
        back: '이전',
        close: '닫기',
        last: '완료',
        next: '다음',
        skip: '건너뛰기',
      }}
      styles={{
        options: {
          zIndex: 10000,
          arrowColor: '#fff',
          backgroundColor: '#fff',
          primaryColor: 'var(--accent-color)',
          textColor: 'var(--text-color-primary)',
        },
        tooltip: {
          borderRadius: '12px',
          padding: '16px 20px',
          width: '340px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
        },
        tooltipContent: {
            padding: '8px 0',
        },
        buttonNext: {
          fontWeight: 600,
          fontSize: '15px',
          padding: '10px 16px',
        },
        buttonBack: {
            marginRight: 10,
            fontWeight: 500,
        },
        buttonSkip: {
            fontSize: '14px',
            color: 'var(--text-color-secondary)',
        }
      }}
    />
  );
};

export default AppTour;