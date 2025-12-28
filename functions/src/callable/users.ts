// functions/src/callable/users.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { dbAdmin as db, allowedOrigins } from "../firebase/admin.js";
import { UserDocument } from "@/shared/types";

export const searchUsers = onCall({
  region: "asia-northeast3",
  cors: allowedOrigins,
}, async (request) => {
  // ✅ [보안 강화] 관리자 권한 검증 추가
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "관리자 로그인이 필요합니다.");
  }
  
  const userRole = request.auth.token.role;
  if (!userRole || !['admin', 'master'].includes(userRole)) {
    throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
  }

  const { searchTerm } = request.data;
  if (!searchTerm || typeof searchTerm !== 'string' || searchTerm.length < 2) {
    throw new HttpsError("invalid-argument", "검색어는 2자 이상이어야 합니다.");
  }

  try {
    const usersRef = db.collection("users");
    const searchResults = new Map<string, UserDocument>();

    // 전화번호 뒷자리로 검색
    const phoneQuerySnapshot = await usersRef.where('phoneLast4', '==', searchTerm).get();
    phoneQuerySnapshot.forEach(doc => {
        searchResults.set(doc.id, { uid: doc.id, ...doc.data() } as UserDocument);
    });

    // 이름으로 검색 (초성 검색 등은 추후 확장 가능)
    const nameQuerySnapshot = await usersRef
      .where('displayName', '>=', searchTerm)
      .where('displayName', '<=', searchTerm + '\uf8ff')
      .limit(10)
      .get();
      
    nameQuerySnapshot.forEach(doc => {
      if (!searchResults.has(doc.id)) {
        searchResults.set(doc.id, { uid: doc.id, ...doc.data() } as UserDocument);
      }
    });

    return Array.from(searchResults.values());

  } catch (error) {
    console.error("Error searching users:", error);
    throw new HttpsError("internal", "사용자 검색 중 오류가 발생했습니다.");
  }
});