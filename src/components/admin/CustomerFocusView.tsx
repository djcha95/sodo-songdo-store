// src/components/admin/CustomerFocusView.tsx

import React from 'react';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import toast from 'react-hot-toast';
import type { UserDocument, Order, AggregatedOrderGroup } from '@/shared/types';
import CustomerProfileSummary from './CustomerProfileSummary';
import CustomerActionTabs from './CustomerActionTabs';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { showPromiseToast } from '@/utils/toastUtils';
import './CustomerFocusView.css';

const functions = getFunctions(getApp(), 'asia-northeast3');
const markOrderAsNoShowCallable = httpsCallable<{ orderId: string }, { success: boolean, message: string }>(functions, 'markOrderAsNoShow');

interface CustomerFocusViewProps {
    user: UserDocument;
    orders: Order[];
    onBack: () => void;
    onStatUpdate: (updates: { pickup?: number; noshow?: number; points?: number }) => void;
    onActionSuccess: () => void;
    reviewCount?: number;
    onAddReview?: () => void;
    onOpenReviews?: () => void;
}

const CustomerFocusView: React.FC<CustomerFocusViewProps> = ({ 
    user, 
    orders, 
    onBack, 
    onStatUpdate, 
    onActionSuccess,
    reviewCount,
    onAddReview,
    onOpenReviews
}) => {

    const handleMarkAsNoShow = (group: AggregatedOrderGroup) => {
        const orderId = group.originalOrders[0]?.orderId;
        if (!orderId) {
            toast.error("처리할 주문 ID를 찾을 수 없습니다.");
            return;
        }

        const promise = markOrderAsNoShowCallable({ orderId });

        showPromiseToast(promise, {
            loading: `${group.customerInfo.name}님의 주문을 '노쇼' 처리 중...`,
            success: (result) => {
                onActionSuccess(); 
                return result.data.message;
            },
            error: (err) => err.message || "노쇼 처리에 실패했습니다.",
        });
    };

    return (
        <motion.div 
            className="cfv-container"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3 }}
        >
            <div className="cfv-header">
                <button onClick={onBack} className="cfv-back-button">
                    <ArrowLeft size={20} />
                    <span>전체 검색으로 돌아가기</span>
                </button>
            </div>
            <div className="cfv-body">
                <aside className="cfv-left-column">
                    <CustomerProfileSummary
                        user={user}
                        reviewCount={reviewCount}
                        onAddReview={onAddReview}
                        onOpenReviews={onOpenReviews}
                    />
                </aside>
                <main className="cfv-right-column">
                    <CustomerActionTabs 
                        user={user} 
                        orders={orders} 
                        onStatUpdate={onStatUpdate}
                        onActionSuccess={onActionSuccess}
                        onMarkAsNoShow={handleMarkAsNoShow}
                        reviewCount={reviewCount}
                    />
                </main>
            </div>
        </motion.div>
    );
};

export default CustomerFocusView;