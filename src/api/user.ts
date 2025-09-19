// src/api/user.ts

import { doc, getDoc } from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db, auth } from '@/firebase/firebaseConfig';

/**
 * 현재 로그인된 사용자의 '마이페이지' 데이터를 Firestore에서 가져옵니다.
 * 이 데이터에는 사용자 정보, 포인트 등이 포함될 수 있습니다.
 * @returns {Promise<DocumentData | null>} 사용자 데이터 객체 또는 null
 */
export const fetchMyPageData = async (): Promise<DocumentData | null> => {
  const user = auth.currentUser;

  // 사용자가 로그인하지 않은 경우
  if (!user) {
    console.log("사용자가 로그인되어 있지 않아 마이페이지 데이터를 가져올 수 없습니다.");
    return null;
  }

  try {
    const userDocRef = doc(db, 'users', user.uid);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists()) {
      // 문서가 존재하면 해당 데이터를 반환합니다.
      return { id: userDocSnap.id, ...userDocSnap.data() };
    } else {
      console.warn("해당 사용자의 문서를 찾을 수 없습니다.");
      return null;
    }
  } catch (error) {
    console.error("마이페이지 데이터 조회 중 오류 발생:", error);
    // 오류 발생 시 에러를 다시 던져 react-query의 onError에서 처리하도록 합니다.
    throw new Error("마이페이지 정보를 불러오는 데 실패했습니다.");
  }
};