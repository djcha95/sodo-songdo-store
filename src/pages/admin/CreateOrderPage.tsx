// src/pages/admin/CreateOrderPage.tsx

import React, { useState, useEffect, useMemo } from 'react';
import useDocumentTitle from '@/hooks/useDocumentTitle';
import toast from 'react-hot-toast';
import { getAllUsersForQuickCheck } from '@/firebase/userService';
import { getAllProducts } from '@/firebase';
// ✅ [수정] firebase 라이브러리가 아닌, 우리가 설정한 config 파일에서 'functions'를 가져옵니다.
import { functions } from '@/firebase/firebaseConfig';
import { httpsCallable } from 'firebase/functions';
import type { UserDocument, Product, OrderItem, SalesRound, VariantGroup, ProductItem } from '@/shared/types';
import { Search, User, Package, X, CheckCircle, PlusCircle } from 'lucide-react';
import SodomallLoader from '@/components/common/SodomallLoader';
import AdminPageHeader from '@/components/admin/AdminPageHeader';
import ConfirmModal from '@/components/admin/ConfirmModal';
import './CreateOrderPage.css';

// ❌ const functions = getFunctions(); // 이 라인을 삭제하고
// ✅ 우리가 만든 'functions' 인스턴스를 사용하도록 변경합니다.
const createOrderAsAdminCallable = httpsCallable(functions, 'createOrderAsAdmin');

const CreateOrderPage: React.FC = () => {
    useDocumentTitle('관리자 주문 생성');

    // (이하 나머지 코드는 이전과 동일)
    // State variables
    const [allUsers, setAllUsers] = useState<UserDocument[]>([]);
    const [allProducts, setAllProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [userSearch, setUserSearch] = useState('');
    const [productSearch, setProductSearch] = useState('');

    const [selectedUser, setSelectedUser] = useState<UserDocument | null>(null);
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [selectedRound, setSelectedRound] = useState<SalesRound | null>(null);
    const [selectedVg, setSelectedVg] = useState<VariantGroup | null>(null);
    const [selectedItem, setSelectedItem] = useState<ProductItem | null>(null);
    const [quantity, setQuantity] = useState(1);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Data fetching
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [users, products] = await Promise.all([
                    getAllUsersForQuickCheck(),
                    getAllProducts()
            ]);
            setAllUsers(users);
            // ✅ [수정] products.products.filter로 수정
            setAllProducts(products.products.filter(p => !p.isArchived));
        } catch (error) {
                toast.error("필수 데이터를 불러오는 데 실패했습니다.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, []);

    // Memoized search results
    const filteredUsers = useMemo(() => {
        if (!userSearch) return [];
        return allUsers.filter(u =>
            (u.displayName || '').toLowerCase().includes(userSearch.toLowerCase()) ||
            u.phoneLast4?.includes(userSearch)
        ).slice(0, 5);
    }, [userSearch, allUsers]);

    const filteredProducts = useMemo(() => {
        if (!productSearch) return [];
        return allProducts.filter(p =>
            p.groupName.toLowerCase().includes(productSearch.toLowerCase())
        ).slice(0, 5);
    }, [productSearch, allProducts]);

    // Reset functions
    const resetProductSelection = () => {
        setSelectedProduct(null);
        setSelectedRound(null);
        setSelectedVg(null);
        setSelectedItem(null);
        setQuantity(1);
        setProductSearch('');
    };

    const resetUserSelection = () => {
        setSelectedUser(null);
        setUserSearch('');
    };
    
    // Handlers
    const handleSelectRound = (roundId: string) => {
        const round = selectedProduct?.salesHistory.find(r => r.roundId === roundId) || null;
        setSelectedRound(round);
        setSelectedVg(null);
        setSelectedItem(null);
    };

    const handleSelectVg = (vgId: string) => {
        const vg = selectedRound?.variantGroups.find(v => v.id === vgId) || null;
        setSelectedVg(vg);
        setSelectedItem(null);
    };

    const handleCreateOrder = async () => {
        if (!selectedUser || !selectedProduct || !selectedRound || !selectedVg || !selectedItem || quantity < 1) {
            toast.error("모든 항목을 선택해주세요.");
            return;
        }

        const orderItem: OrderItem = {
            id: `${selectedProduct.id}-${selectedItem.id}-${Date.now()}`,
            productId: selectedProduct.id,
            productName: selectedProduct.groupName,
            roundId: selectedRound.roundId,
            roundName: selectedRound.roundName,
            variantGroupId: selectedVg.id,
            variantGroupName: selectedVg.groupName,
            itemId: selectedItem.id,
            itemName: selectedItem.name,
            quantity: quantity,
            unitPrice: selectedItem.price,
            stock: selectedItem.stock || -1,
            stockDeductionAmount: selectedItem.stockDeductionAmount || 1,
            imageUrl: selectedProduct.imageUrls?.[0] || '',
            deadlineDate: selectedRound.deadlineDate,
            pickupDate: selectedRound.pickupDate,
            isPrepaymentRequired: selectedRound.isPrepaymentRequired || false,
            arrivalDate: null,
        };

        const toastId = toast.loading(`${selectedUser.displayName}님의 주문을 생성하는 중...`);
        setIsSubmitting(true);
        try {
            const result = await createOrderAsAdminCallable({ targetUserId: selectedUser.uid, item: orderItem });
            if ((result.data as any).success) {
                toast.success("주문이 성공적으로 생성되었습니다!", { id: toastId });
                resetUserSelection();
                resetProductSelection();
            } else {
                throw new Error((result.data as any).message || "백엔드에서 오류가 발생했습니다.");
            }
        } catch (error: any) {
            console.error("Admin order creation failed:", error);
            toast.error(`주문 생성 실패: ${error.message}`, { id: toastId });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) return <SodomallLoader message="데이터 로딩 중..." />;

    const isFormComplete = selectedUser && selectedProduct && selectedRound && selectedVg && selectedItem && quantity > 0;

    return (
        <div className="admin-page-container create-order-page">
            <AdminPageHeader
                title="관리자 주문 생성"
                subtitle="실운영에서는 최소화 권장(오류/중복 생성 위험). 꼭 필요할 때만 사용하세요."
                icon={<Package size={28} />}
                priority="low"
            />

            <div className="form-section">
                <h2><User size={20}/> 1. 고객 선택</h2>
                {selectedUser ? (
                    <div className="selection-display">
                        <CheckCircle size={16} className="check-icon" />
                        <span>{selectedUser.displayName} ({selectedUser.phoneLast4})</span>
                        <button onClick={resetUserSelection} className="reset-button"><X size={14} /></button>
                    </div>
                ) : (
                    <div className="search-container">
                        <input
                            type="text"
                            placeholder="고객 이름 또는 전화번호 4자리로 검색..."
                            value={userSearch}
                            onChange={(e) => setUserSearch(e.target.value)}
                        />
                        {filteredUsers.length > 0 && (
                            <div className="search-results">
                                {filteredUsers.map(user => (
                                    <div key={user.uid} className="result-item" onClick={() => { setSelectedUser(user); setUserSearch(''); }}>
                                        {user.displayName} ({user.phoneLast4})
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className={`form-section ${!selectedUser ? 'disabled' : ''}`}>
                <h2><Package size={20}/> 2. 상품 및 옵션 선택</h2>
                {selectedProduct ? (
                     <div className="selection-display">
                        <CheckCircle size={16} className="check-icon" />
                        <span>{selectedProduct.groupName}</span>
                        <button onClick={resetProductSelection} className="reset-button"><X size={14} /></button>
                    </div>
                ) : (
                    <div className="search-container">
                        <input
                            type="text"
                            placeholder="상품명으로 검색..."
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            disabled={!selectedUser}
                        />
                         {filteredProducts.length > 0 && (
                            <div className="search-results">
                                {filteredProducts.map(product => (
                                    <div key={product.id} className="result-item" onClick={() => { setSelectedProduct(product); setProductSearch(''); }}>
                                        {product.groupName}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                
                {selectedProduct && (
                    <div className="options-grid">
                        <select value={selectedRound?.roundId || ''} onChange={(e) => handleSelectRound(e.target.value)} disabled={!selectedProduct}>
                            <option value="">판매 회차 선택</option>
                            {selectedProduct.salesHistory.filter(r => r.status !== 'draft').map(r => <option key={r.roundId} value={r.roundId}>{r.roundName}</option>)}
                        </select>

                        <select value={selectedVg?.id || ''} onChange={(e) => handleSelectVg(e.target.value)} disabled={!selectedRound}>
                            <option value="">옵션 그룹 선택</option>
                            {selectedRound?.variantGroups.map(vg => <option key={vg.id} value={vg.id}>{vg.groupName}</option>)}
                        </select>

                        <select value={selectedItem?.id || ''} onChange={(e) => setSelectedItem(selectedVg?.items.find(i => i.id === e.target.value) || null)} disabled={!selectedVg}>
                            <option value="">세부 항목 선택</option>
                            {selectedVg?.items.map(item => <option key={item.id} value={item.id}>{item.name} ({item.price.toLocaleString()}원)</option>)}
                        </select>

                        <input type="number" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} min="1" placeholder="수량" disabled={!selectedItem} />
                    </div>
                )}
            </div>
            
            <div className="form-actions">
                <button
                    type="button"
                    className="danger-button warning"
                    disabled={!isFormComplete || isSubmitting}
                    onClick={() => setIsConfirmOpen(true)}
                >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <PlusCircle size={18} /> 주문 생성하기
                    </span>
                </button>
            </div>

            <ConfirmModal
                isOpen={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                onConfirm={async () => {
                    setIsConfirmOpen(false);
                    await handleCreateOrder();
                }}
                title="관리자 주문을 생성할까요?"
                variant="warning"
                requirePhrase="생성"
                confirmLabel="주문 생성"
                cancelLabel="취소"
                isLoading={isSubmitting}
                description={
                    <>
                        <p style={{ margin: 0 }}>
                            아래 내용으로 주문을 생성합니다. <strong>중복 생성/재고 영향</strong>이 있을 수 있으니 마지막으로 확인하세요.
                        </p>
                        <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: "rgba(245, 158, 11, 0.12)", color: "#7c2d12" }}>
                            <div><strong>고객</strong>: {selectedUser?.displayName} ({selectedUser?.phoneLast4})</div>
                            <div><strong>상품</strong>: {selectedProduct?.groupName}</div>
                            <div><strong>회차</strong>: {selectedRound?.roundName}</div>
                            <div><strong>옵션</strong>: {selectedVg?.groupName} / {selectedItem?.name}</div>
                            <div><strong>수량</strong>: {quantity}</div>
                        </div>
                        <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "rgba(220,38,38,0.08)", color: "#7f1d1d" }}>
                            <strong>주의:</strong> 이 작업은 고객에게 “예약/주문”으로 기록됩니다. 실운영에서는 꼭 필요한 경우에만 사용하세요.
                        </div>
                    </>
                }
            />
        </div>
    );
};

export default CreateOrderPage;