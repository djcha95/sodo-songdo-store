// src/components/admin/BannerAddModal.tsx

import React, { useState, useEffect, useMemo } from 'react';
import type { Banner, Product, SalesRound } from '@/shared/types';
import { Loader } from 'lucide-react';
import toast from 'react-hot-toast';
import './BannerAddModal.css';

// [추가] ProductCard 등에서 사용하는 것과 동일한 로직의 헬퍼 함수
const getDisplayRound = (product: Product): SalesRound | null => {
  if (!product.salesHistory || product.salesHistory.length === 0) return null;
  const activeRounds = product.salesHistory.filter(r => r.status === 'selling' || r.status === 'scheduled');
  if (activeRounds.length > 0) {
    return activeRounds.sort((a, b) => (b.createdAt.toMillis() - a.createdAt.toMillis()))[0];
  }
  const nonDraftRounds = product.salesHistory.filter(r => r.status !== 'draft');
  if (nonDraftRounds.length > 0) {
    return nonDraftRounds.sort((a, b) => (b.createdAt.toMillis() - a.createdAt.toMillis()))[0];
  }
  return null;
};

interface BannerAddModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (bannerData: Omit<Banner, 'id' | 'createdAt'>, imageFile: File | null) => Promise<void>;
    product?: Product | null;
    imageFile?: File | null; // [수정] imageFile prop 추가
}

const BannerAddModal: React.FC<BannerAddModalProps> = ({ isOpen, onClose, onSave, product, imageFile }) => {
    const [linkTo, setLinkTo] = useState('');
    const [order, setOrder] = useState(1);
    const [isActive, setIsActive] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [localImageFile, setLocalImageFile] = useState<File | null>(null);

    // [수정] product prop을 기반으로 표시할 데이터를 계산합니다.
    const displayData = useMemo(() => {
        if (!product) return null;
        
        const displayRound = getDisplayRound(product);
        if (!displayRound) return null;

        const representativePrice = displayRound.variantGroups?.[0]?.items?.[0]?.price ?? 0;
        
        const totalStock = displayRound.variantGroups?.reduce((acc, vg) => {
            if (vg.totalPhysicalStock != null && vg.totalPhysicalStock !== -1) return acc + vg.totalPhysicalStock;
            return acc + (vg.items?.reduce((itemAcc, item) => itemAcc + (item.stock === -1 ? Infinity : (item.stock || 0)), 0) || 0);
        }, 0) ?? 0;

        return {
            name: product.groupName,
            price: representativePrice,
            stock: totalStock,
        };
    }, [product]);


    useEffect(() => {
        if (product) {
            setLinkTo(`/product/${product.id}`);
            if (product.imageUrls && product.imageUrls.length > 0) {
                setPreviewImage(product.imageUrls[0]);
            }
            setLocalImageFile(null);
        } else {
            setLinkTo('');
            if (imageFile) {
                setPreviewImage(URL.createObjectURL(imageFile));
                setLocalImageFile(imageFile);
            } else {
                setPreviewImage(null);
                setLocalImageFile(null);
            }
        }
        setOrder(1);
        setIsActive(true);
        setIsLoading(false);
    }, [isOpen, product, imageFile]);

    const handleSave = async () => {
        if (!previewImage) {
            toast.error('배너 이미지가 필요합니다.');
            return;
        }
        if (!localImageFile && !product) {
            toast.error('배너로 등록할 이미지 파일을 선택해주세요.');
            return;
        }

        setIsLoading(true);
        try {
            const bannerData = {
                imageUrl: product ? product.imageUrls[0] : '', // 상품 배너는 기존 URL 사용, 새 배너는 onSave에서 처리
                linkTo,
                order,
                isActive,
                productId: product?.id || undefined,
            };
            await onSave(bannerData, localImageFile);
            onClose();
            toast.success('배너가 성공적으로 저장되었습니다!');
        } catch (error) {
            console.error("배너 저장 오류:", error);
            toast.error('배너 저장 중 오류가 발생했습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-backdrop">
            <div className="modal-content">
                <div className="modal-header">
                    <h2>{product ? '상품으로 배너 만들기' : '새 배너 추가'}</h2>
                    <button className="modal-close-btn" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    {product && displayData && (
                        <div className="modal-product-info">
                            <img src={previewImage || ''} alt="상품 이미지" className="product-image-preview" />
                            {/* [수정] displayData에서 올바른 값을 참조합니다. */}
                            <div className="product-details">
                                <h3>{displayData.name}</h3>
                                <p>가격: {displayData.price.toLocaleString()}원</p>
                                <p>재고: {displayData.stock < Infinity ? `${displayData.stock}개` : '무제한'}</p>
                            </div>
                        </div>
                    )}
                     {!product && previewImage && (
                        <div className="modal-product-info">
                            <img src={previewImage} alt="배너 미리보기" className="product-image-preview" />
                        </div>
                    )}
                    <div className="form-group">
                        <label htmlFor="linkTo">연결 링크</label>
                        <input
                            id="linkTo"
                            type="text"
                            value={linkTo}
                            onChange={(e) => setLinkTo(e.target.value)}
                            placeholder="예: /products/abcde123"
                            disabled={!!product}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="order">표시 순서</label>
                        <input
                            id="order"
                            type="number"
                            value={order}
                            onChange={(e) => setOrder(Number(e.target.value))}
                            min="1"
                        />
                    </div>
                    <div className="form-group-checkbox">
                        <input
                            id="isActive"
                            type="checkbox"
                            checked={isActive}
                            onChange={(e) => setIsActive(e.target.checked)}
                        />
                        <label htmlFor="isActive">활성화</label>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn-cancel" onClick={onClose} disabled={isLoading}>취소</button>
                    <button className="btn-save" onClick={handleSave} disabled={isLoading}>
                        {isLoading ? <Loader className="spin" size={20} /> : '저장'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BannerAddModal;