// src/components/common/SideMenu.tsx

import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  X,
  Home,
  Package,
  ListOrdered,
  HeartHandshake,
  Instagram,
  Info,
  ShieldCheck,
  MapPin,
  User,
  Sparkles // ✨ [추가] 럭셔리 아이콘
} from 'lucide-react';
import './SideMenu.css';

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenNotifications?: () => void;
}

const SideMenu: React.FC<SideMenuProps> = ({
  isOpen,
  onClose,
  onOpenNotifications,
}) => {
  const { isAdmin } = useAuth();

  const handleExternalClick = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    onClose();
  };

  const getNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    `side-menu-link ${isActive ? 'active' : ''}`;

  return (
    <div className={`side-menu-overlay ${isOpen ? 'open' : ''}`}>
      <div className="side-menu-panel">
        {/* 상단 헤더 */}
        <div className="side-menu-header">
          <div className="side-menu-title-area">
            <span className="side-menu-chip">LOCAL HUB</span>
            <h2 className="side-menu-title">SONGDOPICK</h2>
            <p className="side-menu-sub">
              송도 생활을 더 편하게, 더 풍성하게 만드는 로컬 픽 플랫폼
            </p>
          </div>
          <button
            className="side-menu-close-btn"
            onClick={onClose}
            aria-label="메뉴 닫기"
          >
            <X size={20} />
          </button>
        </div>

        {/* 링크 영역 */}
        <nav className="side-menu-links">
          {/* 🔥 서비스 섹션 */}
          <div className="side-menu-section-label">서비스</div>

          {/* 홈 / 오늘의 공구 */}
          <NavLink
            to="/"
            end
            className={getNavLinkClass}
            onClick={onClose}
          >
            <div className="side-menu-icon-wrap">
              <Home size={20} />
            </div>
            <div className="side-menu-text-wrap">
              <span className="side-menu-main-text">오늘의 PICK</span>
              <span className="side-menu-sub-text">
                오늘 진행 중인 공동구매 한눈에 보기
              </span>
            </div>
          </NavLink>

          {/* 베리맘 · 끌리글램 (강조됨) */}
          <NavLink
            to="/beauty"
            className={getNavLinkClass}
            onClick={onClose}
            style={{background: '#FFFBF0'}} // 💡 [추가] 살짝 강조된 배경색
          >
            <div className="side-menu-icon-wrap" style={{background: '#111', color: '#D4AF37'}}>
              <Sparkles size={18} />
            </div>
            <div className="side-menu-text-wrap">
              <span className="side-menu-main-text" style={{color: '#111'}}>
                베리맘(VERYMOM)
              </span>
              <span className="side-menu-sub-text">
                <span style={{color: '#D4AF37', fontWeight: 700}}>● PRE-ORDER OPEN</span>
              </span>
            </div>
          </NavLink>

          {/* 내 정보 (멤버십) */}
          <NavLink
            to="/mypage"
            end
            className={getNavLinkClass}
            onClick={onClose}
          >
            <div className="side-menu-icon-wrap">
              <User size={20} />
            </div>
            <div className="side-menu-text-wrap">
              <span className="side-menu-main-text">내 정보 (멤버십)</span>
              <span className="side-menu-sub-text">
                디지털 등급 카드 & 회원 인증
              </span>
            </div>
          </NavLink>

          {/* 예약 내역 */}
          <NavLink
            to="/mypage/history"
            className={getNavLinkClass}
            onClick={onClose}
          >
            <div className="side-menu-icon-wrap">
              <ListOrdered size={20} />
            </div>
            <div className="side-menu-text-wrap">
              <span className="side-menu-main-text">예약 내역</span>
              <span className="side-menu-sub-text">
                내가 예약한 상품과 픽업 일정 확인
              </span>
            </div>
          </NavLink>

          {/* 공구 이용 안내 */}
          <NavLink
            to="/guide"
            className={getNavLinkClass}
            onClick={onClose}
          >
            <div className="side-menu-icon-wrap">
              <Info size={20} />
            </div>
            <div className="side-menu-text-wrap">
              <span className="side-menu-main-text">공구 이용 안내</span>
              <span className="side-menu-sub-text">
                예약, 결제, 픽업 방법 한눈에 보기
              </span>
            </div>
          </NavLink>
          
          {/* 🎁 제휴 / 혜택 섹션 */}
          <div className="side-menu-section-label">제휴 / 혜택</div>

          {/* 헤이유뷰티룸 제휴 혜택 */}
          <NavLink
            to="/partner/hey-u-beauty"
            className={getNavLinkClass}
            onClick={onClose}
          >
            <div className="side-menu-icon-wrap">
              <Instagram size={20} />
            </div>
            <div className="side-menu-text-wrap">
              <span className="side-menu-main-text">
                헤이유뷰티룸 제휴 혜택
              </span>
              <span className="side-menu-sub-text">
                송도픽 회원 전용 할인 & 혜택 보기
              </span>
            </div>
          </NavLink>

          {/* 송도픽 제휴 안내 */}
          <NavLink
            to="/partner/benefits"
            className={getNavLinkClass}
            onClick={onClose}
          >
            <div className="side-menu-icon-wrap">
              <HeartHandshake size={20} />
            </div>
            <div className="side-menu-text-wrap">
              <span className="side-menu-main-text">송도픽 제휴 안내</span>
              <span className="side-menu-sub-text">
                로컬 상점 · 브랜드 제휴 문의
              </span>
            </div>
          </NavLink>

          {/* ℹ️ 브랜드 정보 섹션 */}
          <div className="side-menu-section-label">브랜드 정보</div>

          {/* 소도몰 소개 & 오시는 길 */}
          <NavLink
            to="/sodomall-info"
            className={getNavLinkClass}
            onClick={onClose}
          >
            <div className="side-menu-icon-wrap">
              <MapPin size={20} />
            </div>
            <div className="side-menu-text-wrap">
              <span className="side-menu-main-text">소도몰 소개 & 오시는 길</span>
              <span className="side-menu-sub-text">
                매장 위치, 운영 시간, 주차 안내
              </span>
            </div>
          </NavLink>

          {/* 송도픽 소개 페이지 */}
          <NavLink
            to="/about"
            className={getNavLinkClass}
            onClick={onClose}
          >
            <div className="side-menu-icon-wrap">
              <Info size={20} />
            </div>
            <div className="side-menu-text-wrap">
              <span className="side-menu-main-text">송도픽이란?</span>
              <span className="side-menu-sub-text">
                소도몰 × 송도픽 구조와 역할 안내
              </span>
            </div>
          </NavLink>
        </nav>

        {/* 하단 영역 */}
        <div className="side-menu-footer">
          {isAdmin && (
            <NavLink
              to="/admin"
              className="side-menu-footer-link"
              onClick={onClose}
            >
              <ShieldCheck size={16} />
              <span>관리자 페이지</span>
            </NavLink>
          )}
          <p className="side-menu-footer-copy">
            © {new Date().getFullYear()} SONGDOPICK
          </p>
        </div>
      </div>
    </div>
  );
};

export default SideMenu;