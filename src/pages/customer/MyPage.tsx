// src/pages/customer/MyPage.tsx (수정 완료)
// src/pages/customer/MyPage.tsx (수정 완료)

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase/firebaseConfig';
import { useAuth } from '@/context/AuthContext';
import { useTutorial } from '@/context/TutorialContext';
import { myPageTourSteps } from '@/components/customer/AppTour';
import {
  Crown, Gem, Sparkles, ShieldAlert, ShieldX, LogOut,
  ChevronRight, Calendar, BarChart2, Shield, Copy, Gift, UserPlus, Info, TrendingUp, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import './MyPage.css';
import toast from 'react-hot-toast';
import type { LoyaltyTier, UserDocument } from '@/types';
import InlineSodomallLoader from '@/components/common/InlineSodomallLoader';

// ✅ [추가] 새로 만든 컴포넌트를 import 합니다.
import ReferralCodeInputSection from '@/components/customer/ReferralCodeInputSection';

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

const getTierProgressInfo = (tier: LoyaltyTier, pickupCount: number, noShowCount: number): {
  currentRate: number;
  progressMessage: string;
} => {
  const totalTransactions = pickupCount + noShowCount;
  const currentRate = totalTransactions > 0 ? Math.round((pickupCount / totalTransactions) * 100) : 0;

  if (tier === '참여 제한') {
    return { currentRate, progressMessage: "누적 노쇼 3회 이상으로 참여가 제한되었습니다." };
  }
  
  if (totalTransactions === 0) {
      return { currentRate: 0, progressMessage: `첫 픽업 완료 시 등급이 산정됩니다.` };
  }

  switch (tier) {
    case '주의 요망':
      const pickupsToEscape = Math.max(0, Math.ceil((noShowCount * 7/3) - pickupCount));
      return { currentRate, progressMessage: `'공구새싹'으로 복귀하려면 약 ${pickupsToEscape}회의 추가 픽업이 필요해요.` };
    case '공구새싹':
      const neededForFairy = Math.max(0, 30 - pickupCount);
      return { currentRate, progressMessage: `다음 등급 '공구요정'까지 픽업 ${neededForFairy}회 남았습니다. (픽업 30회 & 픽업률 90%↑)` };
    case '공구요정':
      const neededForKing = Math.max(0, 100 - pickupCount);
      return { currentRate, progressMessage: `다음 등급 '공구왕'까지 픽업 ${neededForKing}회 남았습니다. (픽업 100회 & 픽업률 95%↑)` };
    case '공구왕':
      const neededForGod = Math.max(0, 250 - pickupCount);
      return { currentRate, progressMessage: `다음 등급 '공구의 신'까지 픽업 ${neededForGod}회 남았습니다. (픽업 250회 & 픽업률 98%↑)` };
    case '공구의 신':
      return { currentRate, progressMessage: "최고 등급 '공구의 신'입니다! 언제나 감사드립니다. 💖" };
    default:
      return { currentRate, progressMessage: "성실한 픽업으로 등급을 올려보세요!" };
  }
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
// 하위 컴포넌트 (기존과 동일)
// =================================================================

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
        <circle className="progress-ring__circle-bg" strokeWidth="8" fill="transparent" r={radius} cx="60" cy="60" />
        <circle className={`progress-ring__circle ${tierClassName}`} strokeWidth="8" fill="transparent" r={radius} cx="60" cy="60" style={{ strokeDasharray: circumference, strokeDashoffset: offset }} />
      </svg>
      <div className="progress-ring__text">
        <span className="percentage">{percentage}%</span>
        <span className="label">픽업률</span>
      </div>
    </div>
  );
};

const tierDetails = [
    { tier: '공구의 신', icon: <Crown size={24} />, criteria: '픽업률 98% 이상 & 누적 픽업 250회 이상' },
    { tier: '공구왕', icon: <Gem size={24} />, criteria: '픽업률 95% 이상 & 누적 픽업 100회 이상' },
    { tier: '공구요정', icon: <Sparkles size={24} />, criteria: '픽업률 90% 이상 & 누적 픽업 30회 이상' },
    { tier: '공구새싹', icon: <i className="seedling-icon-mypage">🌱</i>, criteria: '픽업률 70% 이상 (첫 픽업 완료 시 달성)' },
    { tier: '주의 요망', icon: <ShieldAlert size={24} />, criteria: '픽업률 70% 미만' },
    { tier: '참여 제한', icon: <ShieldX size={24} />, criteria: '누적 노쇼 3회 이상 시 즉시 적용' }
];

const TierGuideModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const guideIntroText = "소도몰의 등급은 포인트와 무관하며, 오직 **'픽업 약속 이행'**으로만 결정됩니다.\n\n**'주문 건'**을 기준으로, 1건의 주문을 정상 픽업하면 `픽업 1회`가 기록됩니다. (주문한 상품의 개수와는 무관합니다)";
  const guideOutroText = "높은 신뢰 등급을 가진 고객님들께는 **'선주문'** 이나 **'시크릿 상품'** 참여 기회처럼 특별한 혜택이 가장 먼저 주어집니다! ✨";
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div className="modal-content tier-guide-modal" initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 30 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h4>👑 신뢰 등급 안내</h4>
              <button onClick={onClose} className="modal-close-button"><X size={24} /></button>
            </div>
            <div className="modal-body">
              <div className="guide-intro"><ReactMarkdown>{guideIntroText}</ReactMarkdown></div>
              <div className="tier-details-list">
                {tierDetails.map(detail => (
                  <div key={detail.tier} className={`tier-detail-item ${getTierClassName(detail.tier as LoyaltyTier)}`}>
                    <div className="tier-detail-icon-name"><div className="tier-item-icon">{detail.icon}</div><div className="tier-item-name">{detail.tier}</div></div>
                    <div className="tier-detail-criteria">{detail.criteria}</div>
                  </div>
                ))}
              </div>
              <div className="guide-outro"><ReactMarkdown>{guideOutroText}</ReactMarkdown></div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const UnifiedProfileCard: React.FC<{ userDocument: UserDocument; onTierClick: () => void; }> = ({ userDocument, onTierClick }) => {
  const navigate = useNavigate();
  const loyaltyInfo = useMemo(() => getLoyaltyInfo(userDocument?.loyaltyTier || '공구새싹'), [userDocument?.loyaltyTier]);
  const progressInfo = useMemo(() => getTierProgressInfo(userDocument?.loyaltyTier || '공구새싹', userDocument?.pickupCount || 0, userDocument?.noShowCount || 0), [userDocument?.loyaltyTier, userDocument?.pickupCount, userDocument?.noShowCount]);
  const tierClassName = getTierClassName(loyaltyInfo.tierName);
  const isAdminOrMaster = userDocument.role === 'admin' || userDocument.role === 'master';
  const cardClassName = isAdminOrMaster ? `role-${userDocument.role}` : tierClassName;

  return (
    <div className={`unified-profile-card-v2 ${cardClassName}`}>
      <div className="card-v2-background"></div>
      <div className="card-v2-content">
        <div className="profile-tier-section-v2" onClick={onTierClick} data-tutorial-id="mypage-profile-card">
          <div className="tier-display">
            <div className="tier-icon-name">
              {isAdminOrMaster ? <Shield size={24} /> : loyaltyInfo.icon}
              <span className="tier-name">{isAdminOrMaster ? userDocument.role?.toUpperCase() : loyaltyInfo.tierName}</span>
            </div>
            <span className="display-name">{userDocument.displayName || '고객'}님{userDocument.nickname && <span className="nickname-display"> ({userDocument.nickname})</span>}</span>
            <p className="progress-message">{isAdminOrMaster ? '모든 권한을 가지고 있습니다.' : progressInfo.progressMessage}</p>
          </div>
          {!isAdminOrMaster && (<CircularProgressBar percentage={progressInfo.currentRate} tier={loyaltyInfo.tierName} />)}
        </div>
        <div className="profile-points-section-v2" onClick={() => navigate('/mypage/points')}>
          <div className="points-label"><TrendingUp size={18} /><span>활동 포인트</span></div>
          <div className="points-value"><span>{(userDocument?.points || 0).toLocaleString()} P</span><ChevronRight size={16} className="arrow-icon" /></div>
        </div>
      </div>
    </div>
  );
};

const NicknameSetupSection: React.FC<{ userDocument: UserDocument }> = ({ userDocument }) => {
    const [nicknameInput, setNicknameInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const handleSaveNickname = async () => {
        if (!nicknameInput.trim()) { toast.error("닉네임을 입력해주세요.", { duration: 3000 }); return; }
        setIsLoading(true);
        const userRef = doc(db, 'users', userDocument.uid);
        const promise = updateDoc(userRef, { nickname: nicknameInput.trim(), nicknameChanged: true, });
        toast.promise(promise, { loading: '닉네임을 저장하는 중...', success: '닉네임이 성공적으로 설정되었습니다!', error: '닉네임 저장에 실패했습니다. 다시 시도해주세요.' }, { success: { duration: 3000 }, error: { duration: 3000 } });
        try { await promise; } catch (error) { /* */ } finally { setIsLoading(false); }
    };

    if (userDocument.nicknameChanged || userDocument.nickname) { return null; }

    return (
        <div className="nickname-setup-card" data-tutorial-id="mypage-nickname-setup">
            <div className="nickname-setup-header"><UserPlus size={24} /><h4>닉네임 설정 (최초 1회)</h4></div>
            <p className="nickname-setup-guide"><Info size={14} />카카오톡 오픈채팅방에서 사용하는 닉네임으로 설정하시면 소통이 원활합니다.</p>
            <div className="nickname-setup-form">
                <input type="text" value={nicknameInput} onChange={(e) => setNicknameInput(e.target.value)} placeholder="사용하실 닉네임을 입력하세요" disabled={isLoading} />
                <button onClick={handleSaveNickname} className="common-button button-primary" disabled={isLoading}>{isLoading ? '저장 중...' : '저장'}</button>
            </div>
        </div>
    );
};

const ReferralCodeSection: React.FC<{ referralCode?: string }> = ({ referralCode }) => {
  const handleCopy = () => {
    if (!referralCode) return;
    navigator.clipboard.writeText(referralCode)
      .then(() => toast.success('초대코드가 복사되었습니다!', { duration: 3000 }))
      .catch(err => { toast.error('복사에 실패했습니다.', { duration: 3000 }); console.error('클립보드 복사 실패:', err); });
  };
  if (!referralCode) return null;
  return (
    <div className="referral-card" data-tutorial-id="mypage-referral-code">
        <div className="referral-info">
            <div className="referral-icon"><Gift size={24} /></div>
            <div>
                <h4>친구 초대하고 포인트 받기</h4>
                <p>친구가 내 코드를 입력하고 첫 픽업을 완료하면 <strong>30P</strong>가 적립됩니다.</p>
            </div>
        </div>
        <div className="referral-action">
            <span className="referral-code">{referralCode}</span>
            <button onClick={handleCopy} className="copy-button"><Copy size={16} />복사</button>
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
    <nav className="mypage-menu-list" data-tutorial-id="mypage-menu-list">
      {menuItems.map(item => (
        <div className="menu-list-item" key={item.label} onClick={() => navigate(item.path!)}>
          <div className="menu-item-content">{item.icon}<span>{item.label}</span></div>
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
  const { user, userDocument, logout } = useAuth();
  const { runPageTourIfFirstTime } = useTutorial();
  const navigate = useNavigate();
  const [isTierGuideOpen, setIsTierGuideOpen] = useState(false);

  useEffect(() => {
    if (userDocument) {
      runPageTourIfFirstTime('hasSeenMyPage', myPageTourSteps);
    }
  }, [userDocument, runPageTourIfFirstTime]);

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
    ), { duration: Infinity });
  }, [logout, navigate]);

  if (!user || !userDocument) {
    return (
      <div className="mypage-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <InlineSodomallLoader />
      </div>
    )
  }

  // ✅ [추가] 추천인 코드를 입력하지 않았고 건너뛰지도 않았을 때만 true
  const showReferralInput = userDocument.referredBy === null;

  const showNicknameInput = !userDocument.nicknameChanged && !userDocument.nickname;


return (
    <>
      <div className="customer-page-container mypage-container">
        
        <UnifiedProfileCard userDocument={userDocument} onTierClick={() => setIsTierGuideOpen(true)} />

        <div className="mypage-menu-list-wrapper">
          {/* 자신의 초대 코드를 보여주는 섹션과 메인 메뉴 리스트 */}
          <ReferralCodeSection referralCode={userDocument?.referralCode} />
          <MenuList />

          {/* ✅ [위치 변경] 닉네임, 초대코드 입력 섹션을 하단으로 이동시키고 그룹으로 묶음 */}
          {(showNicknameInput || showReferralInput) && (
            <div className="mypage-task-section">
              {showNicknameInput && <NicknameSetupSection userDocument={userDocument} />}
              {showReferralInput && <ReferralCodeInputSection />}
            </div>
          )}
        </div>

        <div className="logout-section">
          <button onClick={handleLogout} className="logout-button">
            <LogOut size={16} />
            로그아웃
          </button>
        </div>
      </div>

      <TierGuideModal isOpen={isTierGuideOpen} onClose={() => setIsTierGuideOpen(false)} />
    </>
  );
};

export default MyPage;
