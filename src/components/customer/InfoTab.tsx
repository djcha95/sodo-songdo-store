// src/components/customer/InfoTab.tsx

import React from 'react';
import type { StoreInfo } from '@/types';
import { EditableField } from '@/pages/customer/CustomerCenterPage';
import KakaoMap from './KakaoMap';
import { Phone, Mail, Building, User, Info, Clock, MessageSquare } from 'lucide-react';

interface InfoTabProps {
  editableInfo: StoreInfo;
  updateField: (field: keyof StoreInfo, value: any) => void;
  isAdmin: boolean;
}

const InfoTab: React.FC<InfoTabProps> = ({ editableInfo, updateField, isAdmin }) => {
  return (
    <section className="service-section">
      <div className="info-item">
        <span className="info-label"><Building size={14} /> 상호</span>
        <EditableField value={editableInfo.name} onSave={(v) => updateField('name', v)} isAdmin={isAdmin} className="info-value"/>
      </div>
      <div className="info-item">
        <span className="info-label"><Info size={14} /> 한 줄 설명</span>
        <EditableField value={editableInfo.description} onSave={(v) => updateField('description', v)} isAdmin={isAdmin} as="textarea" className="info-value"/>
      </div>
       <div className="info-item">
        <span className="info-label"><User size={14} /> 대표자명</span>
        <EditableField value={editableInfo.representative} onSave={(v) => updateField('representative', v)} isAdmin={isAdmin} className="info-value"/>
      </div>
       <div className="info-item">
        <span className="info-label"><Info size={14} /> 사업자등록번호</span>
        <EditableField value={editableInfo.businessNumber} onSave={(v) => updateField('businessNumber', v)} isAdmin={isAdmin} className="info-value"/>
      </div>
      <div className="info-item">
        <span className="info-label"><Phone size={14} /> 연락처</span>
        {isAdmin ? (
          <EditableField value={editableInfo.phoneNumber} onSave={(v) => updateField('phoneNumber', v)} isAdmin={isAdmin} className="info-value"/>
        ) : (
          <a href={`tel:${editableInfo.phoneNumber}`} className="info-value link-value">{editableInfo.phoneNumber}</a>
        )}
      </div>
      <div className="info-item">
        <span className="info-label"><Mail size={14} /> 이메일</span>
         {isAdmin ? (
          <EditableField value={editableInfo.email} onSave={(v) => updateField('email', v)} isAdmin={isAdmin} className="info-value"/>
         ) : (
          <a href={`mailto:${editableInfo.email}`} className="info-value link-value">{editableInfo.email}</a>
         )}
      </div>
       <div className="info-item">
        <span className="info-label"><MessageSquare size={14} /> 카카오톡 채널 ID</span>
        <EditableField value={editableInfo.kakaotalkChannelId || ''} onSave={(v) => updateField('kakaotalkChannelId', v)} isAdmin={isAdmin} className="info-value"/>
      </div>
      <div className="info-item">
        <span className="info-label"><Clock size={14} /> 운영 시간</span>
        <EditableField value={editableInfo.operatingHours.join('\n')} onSave={(v) => updateField('operatingHours', v.split('\n'))} isAdmin={isAdmin} as="textarea" className="info-value operating-hours-list"/>
      </div>
      <div className="info-item">
        <span className="info-label">주소</span>
        <EditableField value={editableInfo.address} onSave={(v) => updateField('address', v)} isAdmin={isAdmin} className="info-value"/>
      </div>

      {/* ✅ [추가] 관리자에게만 위도/경도 수정 필드가 보이도록 추가합니다. */}
      {isAdmin && (
        <>
          <div className="info-item">
            <span className="info-label">위도 (Latitude)</span>
            <EditableField 
              value={String(editableInfo.latitude || '')} 
              onSave={(v) => updateField('latitude', Number(v) || null)} 
              isAdmin={isAdmin} 
              className="info-value"
            />
          </div>
          <div className="info-item">
            <span className="info-label">경도 (Longitude)</span>
            <EditableField 
              value={String(editableInfo.longitude || '')} 
              onSave={(v) => updateField('longitude', Number(v) || null)} 
              isAdmin={isAdmin} 
              className="info-value"
            />
          </div>
        </>
      )}

      <div className="map-container">
        <KakaoMap 
          storeName={editableInfo.name} 
          latitude={editableInfo.latitude} 
          longitude={editableInfo.longitude} 
        />
      </div>
    </section>
  );
};

export default InfoTab;