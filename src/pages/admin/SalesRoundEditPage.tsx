// src/pages/admin/SalesRoundEditPage.tsx

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import ProductForm from '@/components/admin/ProductForm';
import SodomallLoader from '@/components/common/SodomallLoader';
import toast from 'react-hot-toast';

const SalesRoundEditPage: React.FC = () => {
    useDocumentTitle('판매 회차 수정');
    const { productId, roundId } = useParams<{ productId: string; roundId: string }>();
    const navigate = useNavigate();

    if (!productId || !roundId) {
        toast.error("잘못된 접근입니다. 상품 ID 또는 회차 ID가 없습니다.");
        navigate('/admin/products');
        return <SodomallLoader />;
    }

    return (
        <ProductForm 
            mode="editRound"
            productId={productId}
            roundId={roundId}
        />
    );
};

export default SalesRoundEditPage;