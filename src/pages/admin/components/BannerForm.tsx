// src/pages/admin/components/BannerForm.tsx
// Blob URL 오류 해결을 위한 개선된 버전

import React, { useState, useEffect, useRef } from 'react';
import type { Banner } from '../../../types';
import { UploadCloud, Link2, ToggleLeft, ToggleRight, ImageIcon } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';

interface BannerFormProps {
  currentBanner: Banner | null;
  isSubmitting: boolean;
  onSubmit: (formData: Omit<Banner, 'id' | 'imageUrl'>, imageFile?: File | null) => Promise<void>;
  onReset?: () => void;
}

const BannerForm: React.FC<BannerFormProps> = ({ currentBanner, isSubmitting, onSubmit, onReset = () => {} }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [linkTo, setLinkTo] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [newBannerImage, setNewBannerImage] = useState<File | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // 이 useEffect는 currentBanner가 변경될 때만 실행되어 폼을 초기화합니다.
  // Blob URL 생성과는 독립적으로 관리됩니다.
  useEffect(() => {
    if (currentBanner) {
      setLinkTo(currentBanner.linkTo || '');
      setIsActive(currentBanner.isActive);
      // 기존 배너의 Firestore URL을 미리보기로 설정
      setPreviewImageUrl(currentBanner.imageUrl);
      setNewBannerImage(null);
    } else {
      // 새 배너 추가 모드로 전환될 때 폼 초기화
      setLinkTo('');
      setIsActive(true);
      setPreviewImageUrl(null);
      setNewBannerImage(null);
    }
    // 이 훅은 return 클린업 함수를 가지지 않습니다.
    // Blob URL 해제는 아래의 전용 훅에서 처리됩니다.
  }, [currentBanner]);

  // 이 useEffect는 `previewImageUrl`이 변경될 때 이전 Blob URL을 정리합니다.
  useEffect(() => {
    // 이 훅의 클린업 함수
    return () => {
      // `previewImageUrl`이 Blob URL이고, 컴포넌트가 언마운트되거나 
      // 상태가 변경되어 훅이 다시 실행될 때 이전 URL을 해제합니다.
      if (previewImageUrl && previewImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewImageUrl);
        // console.log('Previous Blob URL revoked:', previewImageUrl); // 디버깅용
      }
    };
  }, [previewImageUrl]); // previewImageUrl이 변경될 때마다 클린업 함수가 실행됩니다.

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewBannerImage(file);
      // 새 파일 선택 시, 즉시 새로운 Blob URL 생성
      setPreviewImageUrl(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkTo.trim()) {
      alert('링크 URL을 입력해주세요.');
      return;
    }
    
    if (!currentBanner && !newBannerImage) {
      alert('새 배너는 이미지가 반드시 필요합니다.');
      return;
    }

    const formDataToSubmit: Omit<Banner, 'id' | 'imageUrl'> = {
      linkTo,
      isActive,
      order: currentBanner?.order ?? 0, 
      createdAt: currentBanner?.createdAt || Timestamp.now(), 
    };
    
    // 파일 업로드 전에 URL을 해제하면 안 됩니다.
    await onSubmit(formDataToSubmit, newBannerImage);
  };

  return (
    <div className="banner-form-section section-card">
      <h3>{currentBanner ? '배너 수정' : '새 배너 추가'}</h3>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="banner-image-input">배너 이미지 *</label>
          <div className="file-input-container">
            <label htmlFor="banner-image-input" className="file-input-label common-button">
              <UploadCloud size={18} />
              <span>{newBannerImage ? '이미지 변경' : '이미지 선택'}</span>
            </label>
            <input
              id="banner-image-input"
              className="file-input"
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
            />
            <span className="file-name-display">
              {newBannerImage ? newBannerImage.name : (currentBanner ? '기존 이미지 유지' : '선택된 파일 없음')}
            </span>
          </div>
          <div className="image-preview-wrapper">
            {previewImageUrl ? (
              <img src={previewImageUrl} alt="배너 미리보기" />
            ) : (
              <div className="placeholder-text">
                <ImageIcon size={48} /><br/>
                <span>이미지 미리보기</span>
              </div>
            )}
          </div>
          <p className="help-text">JPG, PNG 등 이미지 파일을 선택해주세요.</p>
        </div>

        <div className="form-group">
          <label htmlFor="link-to">링크 URL *</label>
          <div className="input-with-icon">
            <Link2 size={18} className="input-icon" />
            <input
              id="link-to"
              type="text"
              value={linkTo}
              onChange={(e) => setLinkTo(e.target.value)}
              placeholder="예: /products/상품ID 또는 https://event.com"
              required
            />
          </div>
          <p className="help-text">배너 클릭 시 이동할 주소 (앱 내 경로 또는 외부 URL)</p>
        </div>

        <div className="form-group">
          <label>활성화 여부</label>
          <div className="toggle-container" onClick={() => setIsActive(prev => !prev)}>
            <div className={`toggle-icon ${isActive ? 'active' : ''}`}>
              {isActive ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
            </div>
            <span className={`toggle-label ${isActive ? 'active' : ''}`}>{isActive ? '활성' : '비활성'}</span>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="common-button button-submit" disabled={isSubmitting}>
            {isSubmitting ? '저장 중...' : (currentBanner ? '배너 수정' : '배너 추가')}
          </button>
          {currentBanner && (
            <button type="button" onClick={onReset} className="common-button button-cancel" disabled={isSubmitting}>
              취소
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default BannerForm;