// src/pages/customer/MyPage.tsx

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut, updateProfile } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/firebase/firebaseConfig';
import { useAuth } from '@/context/AuthContext';
import { FiLogOut } from 'react-icons/fi';
import { 
  Gem, Shield, BarChart2, Calendar, History, User, X, Edit, ChevronRight
} from 'lucide-react';
import './MyPage.css';
import toast from 'react-hot-toast';
import type { LoyaltyTier } from '@/types';

// 헬퍼 함수: 신뢰도 정보 계산
const getLoyaltyInfo = (points: number): { tier: LoyaltyTier; icon: string; nextTierPoints: number | null, color: string } => {
    if (points >= 300) return { tier: '다이아몬드', icon: '💎', nextTierPoints: null, color: 'var(--loyalty-diamond, #7e57c2)' };
    if (points >= 100) return { tier: '에메랄드', icon: '💚', nextTierPoints: 300, color: 'var(--loyalty-emerald, #4caf50)' };
    if (points >= 0) return { tier: '수정', icon: '⚪', nextTierPoints: 100, color: 'var(--loyalty-crystal, #2196f3)' };
    return { tier: '조약돌', icon: '⚫', nextTierPoints: 0, color: 'var(--loyalty-pebble, #9e9e9e)' };
};

// --- 하위 컴포넌트 ---

// [기능 추가] 프로필 수정 모달
const EditProfileModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  currentName: string;
}> = ({ isOpen, onClose, currentName }) => {
  const [newName, setNewName] = useState(currentName);

  const handleSave = async () => {
    if (!auth.currentUser) {
      toast.error("로그인 정보가 유효하지 않습니다.");
      return;
    }
    if (!newName.trim()) {
      toast.error("닉네임을 입력해주세요.");
      return;
    }

    const toastId = toast.loading("닉네임 변경 중...");
    try {
      // 1. Firebase Auth 프로필 업데이트
      await updateProfile(auth.currentUser, { displayName: newName });
      
      // 2. Firestore 'users' 컬렉션 업데이트
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userRef, { displayName: newName });
      
      toast.success("닉네임이 성공적으로 변경되었습니다.", { id: toastId });
      onClose();
    } catch (error) {
      console.error("닉네임 변경 오류:", error);
      toast.error("닉네임 변경에 실패했습니다.", { id: toastId });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button onClick={onClose} className="modal-close-button"><X size={24} /></button>
        <h3>닉네임 변경</h3>
        <input 
          type="text" 
          value={newName} 
          onChange={(e) => setNewName(e.target.value)}
          className="modal-input"
          placeholder="새 닉네임을 입력하세요"
        />
        <div className="modal-actions">
          <button onClick={onClose} className="modal-button cancel">취소</button>
          <button onClick={handleSave} className="modal-button save">저장</button>
        </div>
      </div>
    </div>
  );
};


// 프로필 및 신뢰도 카드
const ProfileCard: React.FC<{ user: any; userDocument: any; loyaltyInfo: any; onEdit: () => void; }> = ({ user, userDocument, loyaltyInfo, onEdit }) => (
  <div className="profile-section-v2">
    <div className="profile-greeting">
      <div className="profile-greeting-text">
          <h2>{userDocument?.displayName || user?.displayName || '고객'}님, 환영합니다!</h2>
          <p>오늘도 소도몰과 함께 즐거운 하루 보내세요.</p>
      </div>
      <button onClick={onEdit} className="edit-profile-button" aria-label="닉네임 변경">
          <Edit size={18} />
      </button>
    </div>
    
    {loyaltyInfo && userDocument && (
      <div className="loyalty-card" style={{ '--tier-color': loyaltyInfo.color } as React.CSSProperties}>
        <div className="loyalty-header">
          <Gem size={20} />
          <h3>나의 소도 점수</h3>
        </div>
        <div className="loyalty-body">
          <div className="loyalty-tier">
            <span className="tier-icon">{loyaltyInfo.icon}</span>
            <span className="tier-name">{loyaltyInfo.tier}</span>
          </div>
          <div className="loyalty-points">
            {(userDocument.loyaltyPoints || 0).toLocaleString()}점
          </div>
        </div>
        {loyaltyInfo.nextTierPoints !== null && (
          <div className="loyalty-progress">
            <progress 
              className="tier-progress-bar"
              value={userDocument.loyaltyPoints || 0} 
              max={loyaltyInfo.nextTierPoints}
            />
            <p>다음 등급까지 {loyaltyInfo.nextTierPoints - (userDocument.loyaltyPoints || 0)}점 남았어요!</p>
          </div>
        )}
        <div className="loyalty-stats">
          <span>픽업 {userDocument.pickupCount || 0}회</span>
          <span className="divider">|</span>
          <span>노쇼 {userDocument.noShowCount || 0}회</span>
        </div>
      </div>
    )}
  </div>
);

// 메뉴 아이템 카드
const MenuItem: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; isFullWidth?: boolean; }> = ({ icon, label, onClick, isFullWidth = false }) => (
  <div className={`menu-item-card ${isFullWidth ? 'full-width' : ''}`} onClick={onClick}>
    <div className="menu-item-content">
      {icon}
      <span>{label}</span>
    </div>
    <ChevronRight size={20} className="menu-item-arrow" />
  </div>
);

// 메뉴 그리드
const MenuGrid: React.FC<{ onEditProfile: () => void; }> = ({ onEditProfile }) => {
  const navigate = useNavigate();
  const menuItems = [
    { icon: <BarChart2 size={24} className="icon-history"/>, label: "예약 내역", path: "/mypage/history" },
    { icon: <Calendar size={24} className="icon-calendar"/>, label: "픽업 달력", path: "/mypage/orders" },
    { icon: <History size={24} className="icon-points"/>, label: "포인트 내역", path: "/mypage/points" },
    { icon: <User size={24} className="icon-profile"/>, label: "내 정보 수정", onClick: onEditProfile },
    { icon: <Shield size={24} className="icon-encore"/>, label: "마감 상품 (앵콜)", path: "/encore", isFullWidth: true },
    // { icon: <Info size={24} className="icon-info"/>, label: "매장 및 이용 안내", path: "/mypage/store-info" }, // 이 항목은 제거되었습니다.
  ];

  return (
    <nav className="mypage-nav-grid">
      {menuItems.map(item => (
        <MenuItem 
          key={item.label}
          icon={item.icon}
          label={item.label}
          onClick={() => item.onClick ? item.onClick() : navigate(item.path!)}
          isFullWidth={item.isFullWidth}
        />
      ))}
    </nav>
  );
};


// --- 메인 컴포넌트 ---
const MyPage = () => {
  const { user, userDocument } = useAuth();
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  const loyaltyInfo = useMemo(() => {
    if (!userDocument) return null;
    const points = userDocument.loyaltyPoints || 0;
    return getLoyaltyInfo(points);
  }, [userDocument]);

  return (
    <>
      <EditProfileModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currentName={userDocument?.displayName || user?.displayName || ''}
      />
      <div className="mypage-container">
        <ProfileCard 
          user={user} 
          userDocument={userDocument} 
          loyaltyInfo={loyaltyInfo} 
          onEdit={() => setIsModalOpen(true)}
        />
        
        <MenuGrid onEditProfile={() => setIsModalOpen(true)} />

        <div className="logout-section">
          <button onClick={handleLogout} className="logout-button">
            <FiLogOut />
            로그아웃
          </button>
        </div>
      </div>
    </>
  );
};

export default MyPage;