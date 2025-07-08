// src/components/admin/BannerAddModal.tsx

import React, { useState, useEffect } from 'react';
import type { Banner, Product } from '@/types';
import { Loader } from 'lucide-react';
import toast from 'react-hot-toast'; // [추가] react-hot-toast 임포트
import './BannerAddModal.css';

interface BannerAddModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (bannerData: Omit<Banner, 'id' | 'createdAt'>) => Promise<void>;
    product?: Product | null; // [수정] product prop의 타입을 Product | null | undefined로 변경
}

const BannerAddModal: React.FC<BannerAddModalProps> = ({ isOpen, onClose, onSave, product }) => {
    const [linkTo, setLinkTo] = useState('');
    const [order, setOrder] = useState(1);
    const [isActive, setIsActive] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    useEffect(() => {
        if (product) {
            // 상품 정보로 모달 초기화
            setLinkTo(`/products/${product.id}`);
            if (product.imageUrls && product.imageUrls.length > 0) {
                setPreviewImage(product.imageUrls[0]);
            }
        } else {
            // 일반 배너 추가 시 초기화
            setLinkTo('');
            setPreviewImage(null);
        }
        setOrder(1);
        setIsActive(true);
        setIsLoading(false);
    }, [isOpen, product]);

    const handleSave = async () => {
        if (!previewImage) {
            toast.error('배너 이미지가 필요합니다. (상품 이미지 사용)'); // [수정] alert 대신 toast 알림
            return;
        }

        setIsLoading(true);
        try {
            // Firestore에 저장할 배너 데이터
            const bannerData = {
                imageUrl: previewImage,
                linkTo,
                order,
                isActive,
                productId: product?.id, // 상품 ID 추가
            };
            await onSave(bannerData);
            onClose();
            toast.success('배너가 성공적으로 저장되었습니다!'); // [추가] 성공 toast 알림
        } catch (error) {
            console.error("배너 저장 오류:", error);
            toast.error('배너 저장 중 오류가 발생했습니다.'); // [수정] alert 대신 toast 알림
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
                    {product && (
                        <div className="modal-product-info">
                            <img src={previewImage || ''} alt="상품 이미지" className="product-image-preview" />
                            <div className="product-details">
                                <h3>{product.name}</h3>
                                <p>가격: {product.pricingOptions[0]?.price.toLocaleString()}원</p>
                                <p>재고: {product.stock}개</p>
                            </div>
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
                            disabled={!!product} // 상품으로 만들 때는 수정 불가
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