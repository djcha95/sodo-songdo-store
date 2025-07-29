// src/pages/customer/MyPage.tsx

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase/firebaseConfig';
import { useAuth } from '@/context/AuthContext';
import {
  Crown, Gem, Sparkles, ShieldAlert, ShieldX, LogOut,
  ChevronRight, Calendar, BarChart2, Shield, Copy, Gift, UserPlus, Info, TrendingUp
} from 'lucide-react';
import './MyPage.css';
import toast from 'react-hot-toast';
import type { LoyaltyTier, UserDocument } from '@/types';
import InlineSodomallLoader from '@/components/common/InlineSodomallLoader';

// =================================================================
// 헬퍼 함수 및 데이터 (기존과 동일)
// =================================================================

const getLoyaltyInfo = (tier: LoyaltyTier): {
  tierName: LoyaltyTier;
  icon: React.ReactNode;
} => {
    switch (tier) {
      case '공구의 신': return { tierName: '공구의 신', icon: <Crown size={24} /> };
      case '공구왕': return { tierName: '공구왕', icon: <Gem size={24} /> };
      case '공구요정': return { tierName: '공구요정', icon: <Sparkles size={24} /> };
      case '공구새싹': return { tierName: '공구새싹', icon: <i className="seedling-icon-mypage">🌱</i> };
      case '주의 요망': return { tierName: '주의 요망', icon: <ShieldAlert size={24} /> };
      case '참여 제한': return { tierName: '참여 제한', icon: <ShieldX size={24} /> };
      default: return { tierName: '공구새싹', icon: <i className="seedling-icon-mypage">🌱</i> };
    }
};

const getTierProgressInfo = (pickupCount: number, noShowCount: number): {
  currentRate: number;
  progressMessage: string;
} => {
  const totalTransactions = pickupCount + noShowCount;
  if (totalTransactions === 0) {
    return { currentRate: 0, progressMessage: "첫 픽업 완료 시 등급이 산정됩니다." };
  }

  const currentRate = Math.round((pickupCount / totalTransactions) * 100);

  if (noShowCount >= 3) return { currentRate, progressMessage: "누적 노쇼 3회로 참여가 제한되었습니다." };
  if (currentRate >= 98 && pickupCount >= 50) return { currentRate, progressMessage: "최고 등급입니다!👍" };
  if (currentRate >= 95 && pickupCount >= 20) {
    const neededPickups = 50 - pickupCount;
    return { currentRate, progressMessage: `다음 등급까지 픽업 ${neededPickups}회 남았어요!` };
  }
  if (currentRate >= 90 && pickupCount >= 5) {
    const neededPickups = 20 - pickupCount;
    return { currentRate, progressMessage: `다음 등급까지 픽업 ${neededPickups}회 남았어요!` };
  }
  return { currentRate, progressMessage: "성실한 픽업으로 등급을 올려보세요!" };
};

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

// ✅ [신설] 원형 프로그레스 바 컴포넌트
const CircularProgressBar: React.FC<{ percentage: number; tier: LoyaltyTier }> = ({ percentage, tier }) => {
  const [offset, setOffset] = useState(0);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const tierClassName = getTierClassName(tier);

  useEffect(() => {
    const progressOffset = ((100 - percentage) / 100) * circumference;
    setOffset(progressOffset);
  }, [percentage, circumference]);

  return (
    <div className="progress-ring-wrapper">
      <svg className="progress-ring" width="120" height="120">
        <circle
          className="progress-ring__circle-bg"
          strokeWidth="8"
          fill="transparent"
          r={radius}
          cx="60"
          cy="60"
        />
        <circle
          className={`progress-ring__circle ${tierClassName}`}
          strokeWidth="8"
          fill="transparent"
          r={radius}
          cx="60"
          cy="60"
          style={{ strokeDasharray: circumference, strokeDashoffset: offset }}
        />
      </svg>
      <div className="progress-ring__text">
        <span className="percentage">{percentage}%</span>
        <span className="label">픽업률</span>
      </div>
    </div>
  );
};


// ✅ [수정] 새로운 디자인을 적용한 프로필 카드
const UnifiedProfileCard: React.FC<{ userDocument: UserDocument }> = ({ userDocument }) => {
  const navigate = useNavigate();
  const loyaltyInfo = useMemo(() => getLoyaltyInfo(userDocument?.loyaltyTier || '공구새싹'), [userDocument?.loyaltyTier]);
  const progressInfo = useMemo(() => getTierProgressInfo(userDocument?.pickupCount || 0, userDocument?.noShowCount || 0), [userDocument?.pickupCount, userDocument?.noShowCount]);
  
  // ✅ [수정] role에 따라 클래스를 동적으로 결정하는 로직 추가
  const tierClassName = getTierClassName(loyaltyInfo.tierName);
  const isAdminOrMaster = userDocument.role === 'admin' || userDocument.role === 'master';
  const cardClassName = isAdminOrMaster ? `role-${userDocument.role}` : tierClassName;

  return (
    // ✅ [수정] 동적으로 결정된 클래스 이름 적용
    <div className={`unified-profile-card-v2 ${cardClassName}`}>
      <div className="card-v2-background"></div>
      <div className="card-v2-content">
        {/* --- 신뢰 등급 섹션 --- */}
        <div className="profile-tier-section-v2">
          <div className="tier-display">
            <div className="tier-icon-name">
              {/* ✅ [추가] 관리자/마스터일 경우 아이콘과 텍스트 변경 */}
              {isAdminOrMaster ? <Shield size={24} /> : loyaltyInfo.icon}
              <span className="tier-name">{isAdminOrMaster ? userDocument.role?.toUpperCase() : loyaltyInfo.tierName}</span>
            </div>
<span className="display-name">
  {userDocument.displayName || '고객'}님
  {userDocument.nickname && <span className="nickname-display"> ({userDocument.nickname})</span>}
</span>
            {/* ✅ [추가] 관리자/마스터는 진행률 메시지 대신 권한 텍스트 표시 */}
            <p className="progress-message">{isAdminOrMaster ? '모든 권한을 가지고 있습니다.' : progressInfo.progressMessage}</p>
          </div>
           {/* ✅ [추가] 관리자/마스터는 프로그레스 바 숨김 */}
          {!isAdminOrMaster && (
            <CircularProgressBar percentage={progressInfo.currentRate} tier={loyaltyInfo.tierName} />
          )}
        </div>

        {/* --- 활동 포인트 섹션 --- */}
        <div className="profile-points-section-v2" onClick={() => navigate('/mypage/points')}>
          <div className="points-label">
            <TrendingUp size={18} />
            <span>활동 포인트</span>
          </div>
          <div className="points-value">
            <span>{(userDocument?.points || 0).toLocaleString()} P</span>
            <ChevronRight size={16} className="arrow-icon" />
          </div>
        </div>
      </div>
    </div>
  );
};


// (NicknameSetupSection, ReferralCodeSection, MenuList는 이전과 동일)
// ... (생략) ...

// =================================================================
// 메인 컴포넌트
// =================================================================

const MyPage = () => {
  const { user, userDocument, logout } = useAuth();
  const navigate = useNavigate();

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
                  toast.success("성공적으로 로그아웃 되었습니다.", { duration: 3000 });
              }}>로그아웃</button>
          </div>
      </div>
    ), {
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

        <div className="mypage-menu-list-wrapper">
          <NicknameSetupSection userDocument={userDocument} />
          <ReferralCodeSection referralCode={userDocument?.referralCode} />
          <MenuList />
        </div>

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

// 이전 코드에서 생략되었던 컴포넌트들
const NicknameSetupSection: React.FC<{ userDocument: UserDocument }> = ({ userDocument }) => {
    const [nicknameInput, setNicknameInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSaveNickname = async () => {
        if (!nicknameInput.trim()) {
            toast.error("닉네임을 입력해주세요.", { duration: 3000 });
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
        }, {
            success: { duration: 3000 },
            error: { duration: 3000 }
        });

        try {
            await promise;
        } catch (error) {
            //
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
      .then(() => toast.success('초대코드가 복사되었습니다!', { duration: 3000 }))
      .catch(err => {
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

export default MyPage;