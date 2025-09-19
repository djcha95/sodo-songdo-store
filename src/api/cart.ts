// src/api/cart.ts

import { collection, getDocs } from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db, auth } from '@/firebase/firebaseConfig';

/**
 * 현재 로그인된 사용자의 장바구니 데이터를 Firestore에서 가져옵니다.
 * @returns {Promise<DocumentData[]>} 장바구니 아이템 객체의 배열
 */
export const fetchCartData = async (): Promise<DocumentData[]> => {
  const user = auth.currentUser;

  // 사용자가 로그인하지 않은 경우
  if (!user) {
    console.log("사용자가 로그인되어 있지 않아 장바구니 데이터를 가져올 수 없습니다.");
    return []; // 빈 배열 반환
  }

  try {
    const cartCollectionRef = collection(db, 'users', user.uid, 'cart');
    const cartSnapshot = await getDocs(cartCollectionRef);

    if (cartSnapshot.empty) {
      return []; // 장바구니가 비어있으면 빈 배열 반환
    }

    // 각 문서의 데이터와 id를 포함하는 배열로 변환하여 반환
    const cartItems = cartSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return cartItems;

  } catch (error) {
    console.error("장바구니 데이터 조회 중 오류 발생:", error);
    // 오류 발생 시 에러를 다시 던져 react-query의 onError에서 처리하도록 합니다.
    throw new Error("장바구니 정보를 불러오는 데 실패했습니다.");
  }
};