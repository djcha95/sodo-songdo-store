import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { 
  Crown, Gem, Sparkles, User, ShieldAlert, ShieldX, 
  LogOut, ChevronRight, Clock, ShieldCheck, MessageSquare, MapPin, Info, Handshake, Sparkles as SparklesIcon
} from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import SodomallLoader from '@/components/common/SodomallLoader';
// ✅ [수정] UserDocument 타입을 명시적으로 import 합니다.
import type { LoyaltyTier, UserDocument } from '@/shared/types';
import { getReviewCountByUserId } from '@/firebase/reviewService';
import './MyPage.css';

// --- 등급별 아이콘 및 정보 (기존 로직 유지) ---
const getLoyaltyInfo = (tier: LoyaltyTier) => {
    switch (tier) {
      case '공구의 신': return { label: '공구의 신', icon: <Crown size={20} />, styleClass: 'tier-god' };
      case '공구왕': return { label: '공구왕', icon: <Gem size={20} />, styleClass: 'tier-king' };
      case '공구요정': return { label: '공구요정', icon: <Sparkles size={20} />, styleClass: 'tier-fairy' };
      case '공구새싹': return { label: '공구새싹', icon: <i className="emoji-icon">🌱</i>, styleClass: 'tier-sprout' };
      case '공구초보': return { label: '공구초보', icon: <User size={20} />, styleClass: 'tier-rookie' };
      case '공구제한': return { label: '참여 제한', icon: <ShieldX size={20} />, styleClass: 'tier-restricted' };
      default: return { label: '공구초보', icon: <User size={20} />, styleClass: 'tier-rookie' };
    }
};

// --- 실시간 시계 컴포넌트 (스크린샷 방지용) ---
const LiveClock = () => {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="live-clock">
            <Clock size={14} className="spinning-icon" />
            <span>{format(time, 'MM월 dd일 HH:mm:ss', { locale: ko })}</span>
            <span className="live-indicator">LIVE</span>
        </div>
    );
};

const MyPage = () => {
  // ✅ [수정] context에서 가져온 userDocument를 contextUserDoc으로 이름 변경 후,
  // 최신 UserDocument 타입으로 캐스팅(as)하여 사용합니다.
  const { user, userDocument: contextUserDoc, logout } = useAuth();
  const navigate = useNavigate();

  // 여기서 타입을 강제로 지정해줍니다. (AuthContext가 구버전 타입을 참조하는 경우 방지)
  const userDocument = contextUserDoc as UserDocument | null;

  // 유저 데이터가 로딩 안됐을 때 처리
  if (!user || !userDocument) {
    return (
      <div className="mypage-loading-container">
        <SodomallLoader />
      </div>
    );
  }

  // 이제 userDocument.loyaltyTier와 userDocument.points에 접근해도 오류가 나지 않습니다.
  const tierInfo = getLoyaltyInfo(userDocument.loyaltyTier || '공구초보');

  const handleLogout = () => {
    if (window.confirm('정말 로그아웃 하시겠습니까?')) {
        logout();
        navigate('/login');
        toast.success('로그아웃 되었습니다.');
    }
  };

  const [reviewCount, setReviewCount] = useState<number | null>(null);
  useEffect(() => {
    const load = async () => {
      try {
        if (!user?.uid) return;
        const cnt = await getReviewCountByUserId(user.uid);
        setReviewCount(cnt);
      } catch (e) {
        // 고객 마이페이지에서는 조용히 실패 처리 (권한/네트워크 등)
        setReviewCount(null);
      }
    };
    load();
  }, [user?.uid]);

  return (
    <div className="customer-page-container modern-shell">
      <div className="modern-inner-shell">
        <div className="mypage-page">
          <header className="mypage-header">
            <h2>마이페이지</h2>
            <p>예약·후기·안내를 한 곳에서 확인하세요.</p>
          </header>

      {/* --- 디지털 멤버십 카드 --- */}
      <motion.div 
        className={`membership-card ${tierInfo.styleClass}`}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="card-bg-animation"></div> {/* 배경 웨이브 효과 */}
        
        <div className="card-top">
            <span className="brand-logo">SONGDO PICK</span>
            <LiveClock /> {/* 실시간 시계 */}
        </div>

        <div className="card-body">
            {/* ❌ [비활성화] 등급/포인트 표시 제거 */}
            {/* <div className="user-tier-badge">
                {tierInfo.icon}
                <span>{tierInfo.label}</span>
            </div> */}
            <h1 className="user-name">
                {userDocument.displayName} 
                <span className="user-suffix">님</span>
            </h1>
            <p className="user-nickname">{userDocument.nickname ? `@${userDocument.nickname}` : '닉네임 없음'}</p>
        </div>

        <div className="card-footer">
            <div className="auth-status">
                <ShieldCheck size={16} />
                <span>회원 인증 완료</span>
            </div>
            {/* ❌ [비활성화] 등급/포인트 표시 제거 */}
            {/* <div className="user-points">
                <span>보유 포인트</span>
                <strong>{(userDocument.points || 0).toLocaleString()} P</strong>
            </div> */}
        </div>
      </motion.div>

          {/* --- 빠른 메뉴 --- */}
          <section className="mypage-section">
            <div className="mypage-section-title">빠른 메뉴</div>
            <div className="mypage-quick-grid">
              <button type="button" className="mypage-quick-card primary" onClick={() => navigate('/mypage/history')}>
                <div className="mypage-quick-top">
                  <span className="mypage-quick-icon">📦</span>
                  <ChevronRight size={18} className="mypage-quick-arrow" />
                </div>
                <div className="mypage-quick-title">주문/픽업 내역</div>
                <div className="mypage-quick-sub">내 예약을 한 번에 확인</div>
              </button>

              <button type="button" className="mypage-quick-card" onClick={() => navigate('/reviews')}>
                <div className="mypage-quick-top">
                  <MessageSquare size={18} />
                  <ChevronRight size={18} className="mypage-quick-arrow" />
                </div>
                <div className="mypage-quick-title">
                  후기 이벤트
                  {typeof reviewCount === 'number' && (
                    <span className="mypage-pill">내 후기 {reviewCount}개</span>
                  )}
                </div>
                <div className="mypage-quick-sub">이번 달 랭킹/베스트 보기</div>
              </button>
            </div>
          </section>

          {/* --- 안내/바로가기 --- */}
          <section className="mypage-section">
            <div className="mypage-section-title">안내 / 바로가기</div>
            <div className="simple-menu-list">
              <div className="menu-item" onClick={() => navigate('/sodomall-info')}>
                <div className="menu-label"><MapPin size={18} /> <span>소도몰 오시는길/매장 안내</span></div>
                <ChevronRight size={20} className="arrow" />
              </div>
              <div className="menu-item" onClick={() => navigate('/guide')}>
                <div className="menu-label"><Info size={18} /> <span>공구 이용 안내</span></div>
                <ChevronRight size={20} className="arrow" />
              </div>
              <div className="menu-item" onClick={() => navigate('/about')}>
                <div className="menu-label"><SparklesIcon size={18} /> <span>송도픽 안내</span></div>
                <ChevronRight size={20} className="arrow" />
              </div>
              <div className="menu-item" onClick={() => navigate('/partner/benefits')}>
                <div className="menu-label"><Handshake size={18} /> <span>송도픽 제휴 안내</span></div>
                <ChevronRight size={20} className="arrow" />
              </div>
              <div className="menu-item" onClick={() => navigate('/partner/hey-u-beauty')}>
                <div className="menu-label"><Sparkles size={18} /> <span>HEY, U 뷰티룸 제휴 혜택</span></div>
                <ChevronRight size={20} className="arrow" />
              </div>
              <div className="menu-item" onClick={() => navigate('/beauty')}>
                <div className="menu-label"><Sparkles size={18} /> <span>베리맘 (PREMIUM COLLECTION)</span></div>
                <ChevronRight size={20} className="arrow" />
              </div>
            </div>
          </section>

      <div className="mypage-footer-actions">
          <button onClick={handleLogout} className="simple-logout-btn">
            <LogOut size={16} /> 로그아웃
          </button>
      </div>
        </div>
      </div>
    </div>
  );
};

export default MyPage;