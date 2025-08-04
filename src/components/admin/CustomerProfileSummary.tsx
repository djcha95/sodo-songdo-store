// src/components/admin/CustomerProfileSummary.tsx

import React from 'react';
import { Link } from 'react-router-dom'; 
import type { UserDocument, LoyaltyTier } from '@/types';
import {
    Crown, Gem, Sparkles, ShieldAlert, ShieldX, User, Mail, Phone, BarChart3
} from 'lucide-react'; // ✅ [수정] 사용하지 않는 TrendingUp 아이콘 제거
import { formatPhoneNumber } from '@/utils/formatUtils';
import './CustomerProfileSummary.css';

const getLoyaltyInfo = (tier: LoyaltyTier) => {
    switch (tier) {
      case '공구의 신': return { icon: <Crown size={24} />, className: 'tier-god' };
      case '공구왕': return { icon: <Gem size={24} />, className: 'tier-king' };
      case '공구요정': return { icon: <Sparkles size={24} />, className: 'tier-fairy' };
      case '공구새싹': return { icon: <i className="seedling-icon-summary">🌱</i>, className: 'tier-sprout' };
      case '주의 요망': return { icon: <ShieldAlert size={24} />, className: 'tier-warning' };
      case '참여 제한': return { icon: <ShieldX size={24} />, className: 'tier-restricted' };
      default: return { icon: <i className="seedling-icon-summary">🌱</i>, className: 'tier-sprout' };
    }
};

interface CustomerProfileSummaryProps {
    user: UserDocument;
}

const CustomerProfileSummary: React.FC<CustomerProfileSummaryProps> = ({ user }) => {
    const { 
        loyaltyTier = '공구새싹', 
        pickupCount = 0, 
        noShowCount = 0,
    } = user;
    const loyaltyInfo = getLoyaltyInfo(loyaltyTier);

    const totalTransactions = pickupCount + noShowCount;
    const calculatedPickupRate = totalTransactions > 0 ? (pickupCount / totalTransactions) * 100 : 0;

    return (
        <div className={`cps-card ${loyaltyInfo.className}`}>
            <div className="cps-card-header">
                <div className="cps-tier-icon">{loyaltyInfo.icon}</div>
                <div className="cps-tier-info">
                    <span className="cps-tier-name">{loyaltyTier}</span>
                    <h3 className="cps-user-name">
                        {user.displayName}
                        {user.nickname && ` (${user.nickname})`}
                    </h3>
                </div>
            </div>
            
            <div className="cps-section">
                <h4 className="cps-section-title"><BarChart3 size={16} />주요 통계</h4>
                <div className="cps-stats-grid">
                    <div className="cps-grid-item">
                        <span>픽업</span>
                        <strong className="text-success">{pickupCount}건</strong>
                    </div>
                     <div className="cps-grid-item">
                        <span>노쇼</span>
                        <strong className="text-danger">{noShowCount}회</strong>
                    </div>
                     <div className="cps-grid-item">
                        <span>픽업률</span>
                        <strong className="text-primary">{calculatedPickupRate.toFixed(1)}%</strong>
                    </div>
                    <div className="cps-grid-item">
                        <span>신뢰도 포인트</span>
                        <strong className="text-points">{(user.points || 0).toLocaleString()} P</strong>
                    </div>
                </div>
            </div>

            <div className="cps-section">
                <h4 className="cps-section-title"><User size={16} />연락처 정보</h4>
                 <div className="cps-info-item">
                    <span className="cps-info-label"><Mail size={14} />이메일</span>
                    <span className="cps-info-value">{user.email || '정보 없음'}</span>
                </div>
                <div className="cps-info-item">
                    <span className="cps-info-label"><Phone size={14} />연락처</span>
                    <span className="cps-info-value">{formatPhoneNumber(user.phone)}</span>
                </div>
            </div>

            <div className="cps-card-footer">
                <Link to={`/admin/users/${user.uid}`} className="cps-detail-link">
                    <User size={16}/>
                    <span>상세 정보 및 전체 관리 페이지로 이동</span>
                </Link>
            </div>
        </div>
    );
};

export default CustomerProfileSummary;