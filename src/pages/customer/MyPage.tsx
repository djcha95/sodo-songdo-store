// src/pages/customer/MyPage.tsx

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/firebase/firebaseConfig';
import { useAuth } from '@/context/AuthContext';
import { 
  Crown, Gem, Sparkles, ShieldAlert, ShieldX, LogOut,
  ChevronRight, Calendar, BarChart2, Shield, Copy, Gift, UserPlus, Info
} from 'lucide-react';
import './MyPage.css';
import toast from 'react-hot-toast';
import type { LoyaltyTier, UserDocument } from '@/types';
import InlineSodamallLoader from '@/components/common/InlineSodamallLoader';

// =================================================================
// 헬퍼 함수 및 데이터
// =================================================================

const getLoyaltyInfo = (points: number): { 
  tier: LoyaltyTier; 
  icon: React.ReactNode; 
  nextTierPoints: number | null;
  minPoints: number; 
  color: string 
} => {
    if (points >= 500) return { tier: '공구의 신', icon: <Crown size={24} />, nextTierPoints: null, minPoints: 500, color: 'var(--loyalty-god)' };
    if (points >= 200) return { tier: '공구왕', icon: <Gem size={24} />, nextTierPoints: 500, minPoints: 200, color: 'var(--loyalty-king)' };
    if (points >= 50) return { tier: '공구요정', icon: <Sparkles size={24} />, nextTierPoints: 200, minPoints: 50, color: 'var(--loyalty-fairy)' };
    if (points >= 0) return { tier: '공구새싹', icon: <i className="seedling-icon-mypage">🌱</i>, nextTierPoints: 50, minPoints: 0, color: 'var(--loyalty-sprout)' };
    if (points >= -299) return { tier: '주의 요망', icon: <ShieldAlert size={24} />, nextTierPoints: 0, minPoints: -299, color: 'var(--loyalty-warning)' };
    return { tier: '참여 제한', icon: <ShieldX size={24} />, nextTierPoints: 0, minPoints: -300, color: 'var(--loyalty-restricted)' };
};

// =================================================================
// 하위 컴포넌트
// =================================================================

const UnifiedProfileCard: React.FC<{ userDocument: UserDocument }> = ({ userDocument }) => {
  const navigate = useNavigate();
  const loyaltyInfo = useMemo(() => getLoyaltyInfo(userDocument?.points || 0), [userDocument?.points]);

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
    <div className="unified-profile-card" style={{ '--tier-color': loyaltyInfo.color } as React.CSSProperties}>
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
            toast.error("닉네임을 입력해주세요.");
            return;
        }
        setIsLoading(true);

        const userRef = doc(db, 'users', userDocument.uid);
        const promise = updateDoc(userRef, {
            nickname: nicknameInput.trim(),
            nicknameChanged: true,
        });

        toast.promise(promise, {
            loading: '닉네임을 저장하는 중...',
            success: '닉네임이 성공적으로 설정되었습니다!',
            error: '닉네임 저장에 실패했습니다. 다시 시도해주세요.'
        });

        try {
            await promise;
        } catch (error) {
            // 에러는 toast.promise가 처리
        } finally {
            setIsLoading(false);
        }
    };

    // 닉네임을 이미 변경했거나, (혹시 모를 레거시 데이터) 닉네임이 이미 있는 경우, 설정 UI를 보여주지 않음
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
      .then(() => toast.success('초대코드가 복사되었습니다!'))
      .catch(err => {
        toast.error('복사에 실패했습니다.');
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
  const { user, userDocument } = useAuth();
  const navigate = useNavigate();

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
      navigate('/login');
      toast.success("성공적으로 로그아웃 되었습니다.");
    } catch (error) {
      console.error("로그아웃 오류:", error);
      toast.error("로그아웃 중 오류가 발생했습니다.");
    }
  }, [navigate]);

  if (!user || !userDocument) {
    return (
      <div className="mypage-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <InlineSodamallLoader />
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