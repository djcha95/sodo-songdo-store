// src/components/admin/CustomerFocusView.tsx

import React from 'react';
import type { UserDocument, Order } from '@/types';
import CustomerProfileSummary from './CustomerProfileSummary';
import CustomerActionTabs from './CustomerActionTabs';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import './CustomerFocusView.css'; // CSS 파일은 나중에 생성합니다.

interface CustomerFocusViewProps {
    user: UserDocument;
    orders: Order[];
    onBack: () => void;
    onActionComplete: () => void;
}

const CustomerFocusView: React.FC<CustomerFocusViewProps> = ({ user, orders, onBack, onActionComplete }) => {
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
                    <CustomerActionTabs user={user} orders={orders} onActionComplete={onActionComplete} />
                </main>
            </div>
        </motion.div>
    );
};

export default CustomerFocusView;