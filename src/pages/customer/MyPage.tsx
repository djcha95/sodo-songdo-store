// src/pages/customer/MyPage.tsx

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
// ✅ [수정] signOut 관련 import는 AuthContext에서 처리하므로 제거합니다.
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase/firebaseConfig';
import { useAuth } from '@/context/AuthContext';
import { 
  Crown, Gem, Sparkles, ShieldAlert, ShieldX, LogOut,
  ChevronRight, Calendar, BarChart2, Shield, Copy, Gift, UserPlus, Info
} from 'lucide-react';
import './MyPage.css';
import toast from 'react-hot-toast';
import type { LoyaltyTier, UserDocument } from '@/types';
import InlineSodomallLoader from '@/components/common/InlineSodomallLoader';

// =================================================================
// 헬퍼 함수 및 데이터
// =================================================================

const getLoyaltyInfo = (points: number): { 
  tier: LoyaltyTier; 
  icon: React.ReactNode; 
  nextTierPoints: number | null;
  minPoints: number; 
  color: string // 이 color는 이제 사용되지 않지만, 다른 곳에서 쓸 수 있으니 유지합니다.
} => {
    if (points >= 500) return { tier: '공구의 신', icon: <Crown size={24} />, nextTierPoints: null, minPoints: 500, color: 'var(--loyalty-god)' };
    if (points >= 200) return { tier: '공구왕', icon: <Gem size={24} />, nextTierPoints: 500, minPoints: 200, color: 'var(--loyalty-king)' };
    if (points >= 50) return { tier: '공구요정', icon: <Sparkles size={24} />, nextTierPoints: 200, minPoints: 50, color: 'var(--loyalty-fairy)' };
    if (points >= 0) return { tier: '공구새싹', icon: <i className="seedling-icon-mypage">🌱</i>, nextTierPoints: 50, minPoints: 0, color: 'var(--loyalty-sprout)' };
    if (points >= -299) return { tier: '주의 요망', icon: <ShieldAlert size={24} />, nextTierPoints: 0, minPoints: -299, color: 'var(--loyalty-warning)' };
    return { tier: '참여 제한', icon: <ShieldX size={24} />, nextTierPoints: 0, minPoints: -300, color: 'var(--loyalty-restricted)' };
};

// ✅ [추가] 등급에 따른 CSS 클래스 이름을 반환하는 헬퍼 함수
const getTierClassName = (tier: LoyaltyTier): string => {
  switch (tier) {
    case '공구의 신': return 'tier-god';
    case '공구왕': return 'tier-king';
    case '공구요정': return 'tier-fairy';
    case '공구새싹': return 'tier-sprout';
    case '주의 요망': return 'tier-warning';
    case '참여 제한': return 'tier-restricted';
    default: return 'tier-default';
  }
};


// =================================================================
// 하위 컴포넌트
// =================================================================

const UnifiedProfileCard: React.FC<{ userDocument: UserDocument }> = ({ userDocument }) => {
  const navigate = useNavigate();
  const loyaltyInfo = useMemo(() => getLoyaltyInfo(userDocument?.points || 0), [userDocument?.points]);
  // ✅ [추가] 등급별 CSS 클래스 이름 생성
  const tierClassName = getTierClassName(loyaltyInfo.tier);

  const progressPercent = useMemo(() => {
    if (!loyaltyInfo || loyaltyInfo.nextTierPoints === null) return 100;
    const currentPoints = userDocument?.points || 0;
    if (loyaltyInfo.nextTierPoints === 0) {
        const range = loyaltyInfo.minPoints * -1;
        const progress = (currentPoints - loyaltyInfo.minPoints);
        return (progress / range) * 100;
    }
    const range = loyaltyInfo.nextTierPoints - loyaltyInfo.minPoints;
    const progress = currentPoints - loyaltyInfo.minPoints;
    return (progress / range) * 100;
  }, [loyaltyInfo, userDocument?.points]);
  
  const pointsToNextTier = loyaltyInfo?.nextTierPoints !== null ? loyaltyInfo.nextTierPoints - (userDocument?.points || 0) : null;
  
  return (
    // ✅ [수정] 인라인 스타일 대신 동적 CSS 클래스를 적용합니다.
    <div className={`unified-profile-card ${tierClassName}`}>
      <div className="profile-card-header">
        <div className="profile-info">
          <span className="display-name">
            {userDocument.displayName || '고객'}님
            {userDocument.nickname && <span className="nickname-display"> ({userDocument.nickname})</span>}
          </span>
          <div className="tier-info">
            {loyaltyInfo.icon}
            <span className="tier-name">{loyaltyInfo.tier}</span>
          </div>
        </div>
      </div>
      
      <div className="profile-card-body" onClick={() => navigate('/mypage/points')}>
        <span className="current-points-label">신뢰도 포인트</span>
        <span className="current-points-value">{(userDocument?.points || 0).toLocaleString()} P</span>
      </div>

      <div className="profile-card-footer">
        <div className="progress-bar-container">
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }}></div>
          </div>
        </div>
        <span className="progress-bar-label">
          {pointsToNextTier !== null && pointsToNextTier > 0 
            ? `다음 등급까지 ${pointsToNextTier.toLocaleString()}P 남았어요!`
            : "최고 등급에 도달하셨어요!"
          }
        </span>
      </div>
    </div>
  );
};

const NicknameSetupSection: React.FC<{ userDocument: UserDocument }> = ({ userDocument }) => {
    const [nicknameInput, setNicknameInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSaveNickname = async () => {
        if (!nicknameInput.trim()) {
            // ✅ [수정] 토스트가 3초 후 자동으로 사라지도록 duration 옵션을 추가합니다.
            toast.error("닉네임을 입력해주세요.", { duration: 3000 });
            return;
        }
        setIsLoading(true);

        const userRef = doc(db, 'users', userDocument.uid);
        const promise = updateDoc(userRef, {
            nickname: nicknameInput.trim(),
            nicknameChanged: true,
        });
        
        // ✅ [수정] 성공 및 에러 토스트가 3초 후 자동으로 사라지도록 duration 옵션을 추가합니다.
        toast.promise(promise, {
            loading: '닉네임을 저장하는 중...',
            success: '닉네임이 성공적으로 설정되었습니다!',
            error: '닉네임 저장에 실패했습니다. 다시 시도해주세요.'
        }, {
            success: { duration: 3000 },
            error: { duration: 3000 }
        });

        try {
            await promise;
        } catch (error) {
            // 에러는 toast.promise가 처리
        } finally {
            setIsLoading(false);
        }
    };

    if (userDocument.nicknameChanged || userDocument.nickname) {
        return null;
    }

    return (
        <div className="nickname-setup-card">
            <div className="nickname-setup-header">
                <UserPlus size={24} />
                <h4>닉네임 설정 (최초 1회)</h4>
            </div>
            <p className="nickname-setup-guide">
                <Info size={14} />
                카카오톡 오픈채팅방에서 사용하는 닉네임으로 설정하시면 소통이 원활합니다.
            </p>
            <div className="nickname-setup-form">
                <input
                    type="text"
                    value={nicknameInput}
                    onChange={(e) => setNicknameInput(e.target.value)}
                    placeholder="사용하실 닉네임을 입력하세요"
                    disabled={isLoading}
                />
                <button onClick={handleSaveNickname} className="common-button button-primary" disabled={isLoading}>
                    {isLoading ? '저장 중...' : '저장'}
                </button>
            </div>
        </div>
    );
};


const ReferralCodeSection: React.FC<{ referralCode?: string }> = ({ referralCode }) => {
  const handleCopy = () => {
    if (!referralCode) return;
    navigator.clipboard.writeText(referralCode)
      // ✅ [수정] 성공 토스트가 3초 후 자동으로 사라지도록 duration 옵션을 추가합니다.
      .then(() => toast.success('초대코드가 복사되었습니다!', { duration: 3000 }))
      .catch(err => {
        // ✅ [수정] 에러 토스트가 3초 후 자동으로 사라지도록 duration 옵션을 추가합니다.
        toast.error('복사에 실패했습니다.', { duration: 3000 });
        console.error('클립보드 복사 실패:', err);
      });
  };

  if (!referralCode) return null;

  return (
    <div className="referral-card">
        <div className="referral-info">
            <div className="referral-icon">
                <Gift size={24} />
            </div>
            <div>
                <h4>친구 초대하고 포인트 받기</h4>
                <p>친구가 내 코드를 입력하고 첫 픽업을 완료하면 <strong>30P</strong>가 적립됩니다.</p>
            </div>
        </div>
        <div className="referral-action">
            <span className="referral-code">{referralCode}</span>
            <button onClick={handleCopy} className="copy-button">
                <Copy size={16} />
                복사
            </button>
        </div>
    </div>
  );
};


const MenuList: React.FC = () => {
  const navigate = useNavigate();
  const menuItems = [
    { icon: <BarChart2 size={22} className="icon-history"/>, label: "주문/대기 내역", path: "/mypage/history" },
    { icon: <Calendar size={22} className="icon-calendar"/>, label: "픽업 달력", path: "/mypage/orders" },
    { icon: <Shield size={22} className="icon-encore"/>, label: "마감 상품 (앵콜)", path: "/encore" },
  ];

  return (
    <nav className="mypage-menu-list">
      {menuItems.map(item => (
        <div className="menu-list-item" key={item.label} onClick={() => navigate(item.path!)}>
          <div className="menu-item-content">
            {item.icon}
            <span>{item.label}</span>
          </div>
          <ChevronRight size={20} className="menu-item-arrow" />
        </div>
      ))}
    </nav>
  );
};


// =================================================================
// 메인 컴포넌트
// =================================================================

const MyPage = () => {
  // ✅ [수정] AuthContext에서 user, userDocument와 함께 logout 함수를 가져옵니다.
  const { user, userDocument, logout } = useAuth();
  const navigate = useNavigate();

  // ✅ [수정] 로그아웃 로직을 AuthContext의 공통 함수를 사용하도록 변경합니다.
  const handleLogout = useCallback(() => {
    toast((t) => (
      <div className="confirmation-toast">
          <h4>로그아웃</h4>
          <p>정말 로그아웃 하시겠습니까?</p>
          <div className="toast-buttons">
              <button className="common-button button-secondary button-medium" onClick={() => toast.dismiss(t.id)}>취소</button>
              <button className="common-button button-danger button-medium" onClick={async () => {
                  toast.dismiss(t.id);
                  await logout();
                  navigate('/login');
                  // ✅ [수정] 로그아웃 성공 토스트가 3초 후 자동으로 사라지도록 duration 옵션을 추가합니다.
                  toast.success("성공적으로 로그아웃 되었습니다.", { duration: 3000 });
              }}>로그아웃</button>
          </div>
      </div>
    ), {
        // 대화형 토스트는 사용자가 직접 닫아야 하므로 무한 지속 시간을 유지합니다.
        duration: Infinity
    });
  }, [logout, navigate]);

  if (!user || !userDocument) {
    return (
      <div className="mypage-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <InlineSodomallLoader />
      </div>
    )
  }

  return (
    <>
      <div className="mypage-container">
        
        <UnifiedProfileCard userDocument={userDocument} />

        <NicknameSetupSection userDocument={userDocument} />
        
        <ReferralCodeSection referralCode={userDocument?.referralCode} />

        <MenuList />

        <div className="logout-section">
          <button onClick={handleLogout} className="logout-button">
            <LogOut size={16} />
            로그아웃
          </button>
        </div>

      </div>
    </>
  );
};

export default MyPage;