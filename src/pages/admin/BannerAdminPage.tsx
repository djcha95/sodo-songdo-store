// src/pages/admin/BannerAdminPage.tsx

import React, { useState, useEffect } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import { onSnapshot, collection, query, orderBy, writeBatch, doc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '@/firebase';
import type { Banner } from '@/types';
import * as bannerService from '@/firebase/bannerService';

import BannerForm from '@/pages/admin/components/BannerForm';
import BannerList from '@/pages/admin/components/BannerList';
import Notification from '@/pages/admin/components/Notification';
import SodamallLoader from '@/components/common/SodamallLoader'; // ✅ [수정] SodamallLoader로 변경

import './BannerAdminPage.css';

const BannerAdminPage: React.FC = () => {
  useDocumentTitle('배너 관리');
  const [banners, setBanners] = useState<Banner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentBanner, setCurrentBanner] = useState<Banner | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'banners'), orderBy('order', 'asc'));
    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        const bannersData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Banner));
        setBanners(bannersData);
        setIsLoading(false);
      },
      (error) => {
        console.error("배너 데이터 로딩 오류:", error);
        toast.error("배너 목록을 불러오는 데 실패했습니다.");
        setIsLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
    switch (type) {
      case 'success':
        toast.success(message);
        break;
      case 'error':
        toast.error(message);
        break;
      case 'info':
        toast(message);
        break;
    }
  };

  const handleFormSubmit = async (formData: Omit<Banner, 'id' | 'imageUrl'>, imageFile?: File | null) => {
    setIsSubmitting(true);
    try {
      if (currentBanner) {
        await bannerService.updateBanner(currentBanner.id, formData, imageFile);
        showNotification('배너가 성공적으로 수정되었습니다.', 'success');
      } else {
        await bannerService.addBanner(formData, imageFile as File);
        showNotification('새 배너가 성공적으로 추가되었습니다.', 'success');
      }
      handleResetForm();
    } catch (error) {
      console.error('배너 처리 오류:', error);
      showNotification(`오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (banner: Banner) => {
    setCurrentBanner(banner);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    const confirmationPromise = new Promise<boolean>((resolve) => {
      toast(
        (t) => (
          <div className="custom-toast-container">
            <p className="toast-message">
              정말로 이 배너를 삭제하시겠습니까?
              <br />
              이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="toast-button-group">
              <button
                className="toast-button toast-button-cancel"
                onClick={() => {
                  toast.dismiss(t.id);
                  resolve(false);
                }}
              >
                취소
              </button>
              <button
                className="toast-button toast-button-confirm"
                onClick={() => {
                  toast.dismiss(t.id);
                  resolve(true);
                }}
              >
                삭제
              </button>
            </div>
          </div>
        ),
        {
          duration: 6000,
          style: {
            background: 'white',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            padding: '16px',
            borderRadius: '10px',
            border: '1px solid #e0e0e0',
            width: '350px',
          },
        }
      );
    });

    const confirmed = await toast.promise(confirmationPromise, {
      loading: '삭제 여부를 확인 중...',
      success: '선택이 확인되었습니다.',
      error: '오류가 발생했습니다.',
    });

    if (confirmed) {
      const deletePromise = bannerService.deleteBanner(id);
      toast.promise(deletePromise, {
        loading: '배너를 삭제하는 중...',
        success: '배너가 성공적으로 삭제되었습니다.',
        error: '배너 삭제에 실패했습니다.',
      });
      setBanners((prevBanners) => prevBanners.filter((b) => b.id !== id));
    }
  };

  const handleToggleActive = async (banner: Banner) => {
    const promise = bannerService.toggleBannerActive(banner.id, !banner.isActive);
    toast.promise(promise, {
      loading: '상태를 변경하는 중...',
      success: `배너가 성공적으로 ${!banner.isActive ? '활성화' : '비활성화'}되었습니다.`,
      error: '상태 변경에 실패했습니다.',
    });
  };

  const handleReorder = async (activeId: string, overId: string | null) => {
    if (!overId) return;

    const oldIndex = banners.findIndex((b) => b.id === activeId);
    const newIndex = banners.findIndex((b) => b.id === overId);

    if (oldIndex === -1 || newIndex === -1) return;

    const newBanners = Array.from(banners);
    const [movedItem] = newBanners.splice(oldIndex, 1);
    newBanners.splice(newIndex, 0, movedItem);
    setBanners(newBanners);

    const batch = writeBatch(db);
    newBanners.forEach((banner, index) => {
      const bannerRef = doc(db, 'banners', banner.id);
      batch.update(bannerRef, { order: index });
    });

    try {
      await batch.commit();
      toast.success('배너 순서가 저장되었습니다.');
    } catch (error) {
      console.error("순서 저장 오류:", error);
      toast.error('순서 저장에 실패했습니다. 페이지를 새로고침해주세요.');
      setBanners(banners);
    }
  };

  const handleResetForm = () => {
    setCurrentBanner(null);
  };

  if (isLoading) {
    return <SodamallLoader />;
  }

  return (
    <div className="banner-admin-page-container">
      <h1>배너 관리</h1>
      <div className="admin-page-grid-container">
        <BannerForm
          currentBanner={currentBanner}
          isSubmitting={isSubmitting}
          onSubmit={handleFormSubmit}
          onReset={handleResetForm}
        />
        <BannerList
          banners={banners}
          currentBannerId={currentBanner?.id || null}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggleActive={handleToggleActive}
          onReorder={handleReorder}
        />
      </div>
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}
    </div>
  );
};

export default BannerAdminPage;