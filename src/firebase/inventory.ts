// src/firebase/inventory.ts

import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  addDoc, 
  query, 
  where, 
  serverTimestamp,
  orderBy
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from '@/firebase'; // 기존 firebase 설정 파일 import (경로 확인 필요)

export interface InventoryItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  costPrice: number;
  salePrice: number;
  expiryDate: string;
  memo: string;
  isArchived: boolean;
  updatedAt?: any;
  isTaxFree?: boolean; // ✅ [추가] 비과세 여부
}

// 1. 재고 목록 불러오기 (보관되지 않은 항목만)
export const getInventoryItems = async (): Promise<InventoryItem[]> => {
  try {
    const q = query(
      collection(db, 'inventory'),
      where('isArchived', '==', false)
      // orderBy는 복합 인덱스가 필요할 수 있어, 클라이언트에서 정렬하는 것을 권장합니다.
    );
    
    const querySnapshot = await getDocs(q);
    const items: InventoryItem[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data() as DocumentData;
      items.push({
        id: doc.id,
        productId: data.productId ?? '',
        productName: data.productName ?? '이름 없음',
        quantity: typeof data.quantity === 'number' ? data.quantity : 0,
        costPrice: typeof data.costPrice === 'number' ? data.costPrice : 0,
        salePrice: typeof data.salePrice === 'number' ? data.salePrice : 0,
        expiryDate: data.expiryDate ?? '',
        memo: data.memo ?? '',
        isArchived: data.isArchived ?? false,
        updatedAt: data.updatedAt
      });
    });

    return items;
  } catch (error) {
    console.error('Error getting inventory items:', error);
    throw error;
  }
};

// 2. 재고 항목 업데이트 (단일 행 저장)
export const updateInventoryItem = async (
  inventoryId: string, 
  updates: Partial<Omit<InventoryItem, 'id'>>
): Promise<void> => {
  try {
    const docRef = doc(db, 'inventory', inventoryId);
    await updateDoc(docRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating inventory item:', error);
    throw error;
  }
};

// 3. 현장판매 전환 시 재고 데이터 보장 (없으면 생성, 있으면 복구)
export const ensureInventoryItem = async (
  productId: string,
  productName: string,
  defaultPrice: number
): Promise<void> => {
  try {
    // 이미 존재하는지 확인 (productId 기준)
    const q = query(collection(db, 'inventory'), where('productId', '==', productId));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      // 이미 존재한다면: 혹시 아카이브(삭제) 처리되어 있었다면 복구
      const existDoc = querySnapshot.docs[0];
      if (existDoc.data().isArchived) {
        await updateDoc(doc(db, 'inventory', existDoc.id), {
          isArchived: false,
          productName: productName, // 이름이 바뀌었을 수 있으니 갱신
          updatedAt: serverTimestamp()
        });
      }
    } else {
      // 존재하지 않는다면: 신규 생성
      await addDoc(collection(db, 'inventory'), {
        productId,
        productName,
        quantity: 0,        // 초기 재고 0 (관리자가 수동 입력해야 노출됨)
        costPrice: 0,
        salePrice: defaultPrice,
        expiryDate: '',
        memo: '',
        isArchived: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.error('Error ensuring inventory item:', error);
    throw error;
  }
};

// 4. (선택적) 현장판매 해제 시 재고 숨김 처리 (삭제 대신 아카이브)
export const archiveInventoryItem = async (productId: string): Promise<void> => {
  try {
    const q = query(collection(db, 'inventory'), where('productId', '==', productId));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const docId = querySnapshot.docs[0].id;
      await updateDoc(doc(db, 'inventory', docId), {
        isArchived: true,
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.error('Error archiving inventory item:', error);
    throw error;
  }
};