// src/pages/admin/ProductAddAdminPage.tsx

import React from 'react';
import { useLocation } from 'react-router-dom';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import ProductForm from '@/components/admin/ProductForm';
import type { ProductFormMode } from '@/components/admin/ProductForm';
// ✅ [경로 정상] tsconfig.json 수정 후 이 경로는 정상 작동합니다.
import type { SalesRound } from '@/shared/types';

const ProductAddAdminPage: React.FC = () => {
    const location = useLocation();
    const { productId, productGroupName, lastRound } = (location.state as {
        productId?: string;
        productGroupName?: string;
        lastRound?: SalesRound;
    }) || {};

    const mode: ProductFormMode = productId ? 'newRound' : 'newProduct';
    
    useDocumentTitle(mode === 'newProduct' ? '새 상품 등록' : `'${productGroupName}' 새 회차 추가`);

    return (
        <ProductForm 
            mode={mode}
            productId={productId}
            initialState={{
                productGroupName: productGroupName || '',
                lastRound: lastRound
            }}
        />
    );
};

export default ProductAddAdminPage;