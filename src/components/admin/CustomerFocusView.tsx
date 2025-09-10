// src/components/admin/CustomerFocusView.tsx

import React from 'react';
// [삭제] Firebase Functions 관련 import 제거
import type { UserDocument, Order } from '@/types'; // [수정] AggregatedOrderGroup 타입 제거
import CustomerProfileSummary from './CustomerProfileSummary';
import CustomerActionTabs from './CustomerActionTabs';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
// [삭제] showPromiseToast 유틸리티 import 제거
import './CustomerFocusView.css';

// [삭제] Firebase Functions 인스턴스 및 callable function 선언 제거

interface CustomerFocusViewProps {
    user: UserDocument;
    orders: Order[];
    onBack: () => void;
    onStatUpdate: (updates: { pickup?: number; noshow?: number; points?: number }) => void;
    onActionSuccess: () => void;
}

const CustomerFocusView: React.FC<CustomerFocusViewProps> = ({ 
    user, 
    orders, 
    onBack, 
    onStatUpdate, 
    onActionSuccess 
}) => {

    // [삭제] handleMarkAsNoShow 함수 제거

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
                    <CustomerProfileSummary user={user} />
                </aside>
                <main className="cfv-right-column">
                    <CustomerActionTabs 
                        user={user} 
                        orders={orders} 
                        onStatUpdate={onStatUpdate}
                        onActionSuccess={onActionSuccess}
                        // [삭제] onMarkAsNoShow prop 전달 제거
                    />
                </main>
            </div>
        </motion.div>
    );
};

export default CustomerFocusView;