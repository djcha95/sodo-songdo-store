// src/pages/admin/components/BannerForm.tsx

import React, { useState, useEffect, useRef } from 'react';
import type { Banner } from '../../../root-types';
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

  useEffect(() => {
    if (currentBanner) {
      setLinkTo(currentBanner.linkTo || '');
      setIsActive(currentBanner.isActive);
      setPreviewImageUrl(currentBanner.imageUrl);
      setNewBannerImage(null);
    } else {
      setLinkTo('');
      setIsActive(true);
      setPreviewImageUrl(null);
      setNewBannerImage(null);
    }
  }, [currentBanner]);

  useEffect(() => {
    return () => {
      if (previewImageUrl && previewImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewImageUrl);
      }
    };
  }, [previewImageUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewBannerImage(file);
      setPreviewImageUrl(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
          <label htmlFor="link-to">링크 URL (선택)</label>
          <div className="input-with-icon">
            <Link2 size={18} className="input-icon" />
            <input
              id="link-to"
              type="text"
              value={linkTo}
              onChange={(e) => setLinkTo(e.target.value)}
              placeholder="예: /products/상품ID 또는 https://event.com"
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
          <button type="submit" className="common-button button-primary" disabled={isSubmitting}>
            {isSubmitting ? '저장 중...' : (currentBanner ? '배너 수정' : '배너 추가')}
          </button>
          {currentBanner && (
            <button type="button" onClick={onReset} className="common-button button-secondary" disabled={isSubmitting}>
              취소
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default BannerForm;