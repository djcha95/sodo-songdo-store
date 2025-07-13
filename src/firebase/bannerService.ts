// src/firebase/bannerService.ts

import { 
  db, 
  storage 
} from '@/firebase';
import { 
  collection, 
  addDoc, 
  doc, 
  updateDoc, 
  deleteDoc, 
  getDocs,
  getDoc, // [수정] getDoc 함수를 import 합니다.
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';
import type { Banner } from '@/types';

// Firestore 'banners' 컬렉션 참조
const bannersCollectionRef = collection(db, 'banners');

/**
 * 새 배너 추가
 */
export const addBanner = async (
  bannerData: Omit<Banner, 'id' | 'imageUrl' | 'createdAt'>, 
  imageFile: File
): Promise<void> => {
  // 1. 이미지 업로드
  const imageRef = ref(storage, `banners/${Date.now()}_${imageFile.name}`);
  await uploadBytes(imageRef, imageFile);
  const imageUrl = await getDownloadURL(imageRef);

  // 2. Firestore에 데이터 추가
  const bannersSnapshot = await getDocs(bannersCollectionRef);
  const newOrder = bannersSnapshot.size; 

  await addDoc(bannersCollectionRef, {
    ...bannerData,
    imageUrl,
    order: newOrder,
    createdAt: serverTimestamp() as Timestamp,
  });
};

/**
 * 기존 배너 업데이트
 */
export const updateBanner = async (
  bannerId: string, 
  bannerData: Omit<Banner, 'id' | 'imageUrl'>, 
  newImageFile?: File | null
): Promise<void> => {
  const bannerRef = doc(db, 'banners', bannerId);
  
  // [수정] Firestore에서 직접 기존 문서 정보를 가져옵니다.
  const oldDocSnap = await getDoc(bannerRef);
  if (!oldDocSnap.exists()) {
    throw new Error("수정할 배너를 찾을 수 없습니다.");
  }
  let imageUrl = oldDocSnap.data().imageUrl; // 기존 이미지 URL을 기본값으로 사용

  if (newImageFile) {
    // 1. 새 이미지 업로드
    const newImageRef = ref(storage, `banners/${Date.now()}_${newImageFile.name}`);
    await uploadBytes(newImageRef, newImageFile);
    imageUrl = await getDownloadURL(newImageRef);

    // 2. 기존 이미지 삭제
    const oldImageUrl = oldDocSnap.data().imageUrl;
    if (oldImageUrl) {
        try {
            const oldImageStorageRef = ref(storage, oldImageUrl);
            await deleteObject(oldImageStorageRef);
        } catch (error: any) {
            if (error.code !== 'storage/object-not-found') {
                console.error("기존 이미지 삭제 실패:", error);
            }
        }
    }
  }

  // 3. Firestore 데이터 업데이트
  const dataToUpdate = {
    ...bannerData,
    imageUrl, // 새 이미지가 있으면 교체된 URL, 없으면 기존 URL
  };
  // createdAt 필드는 수정 시 업데이트하지 않도록 Omit에서 제외된 그대로 둡니다.
  delete (dataToUpdate as any).createdAt; 

  await updateDoc(bannerRef, dataToUpdate);
};


/**
 * 배너 삭제
 */
export const deleteBanner = async (bannerId: string): Promise<void> => {
    const bannerRef = doc(db, 'banners', bannerId);
    
    // [수정] .get() 대신 getDoc() 함수를 사용합니다.
    const bannerDoc = await getDoc(bannerRef); 
    const data = bannerDoc.data();
    const imageUrl = data?.imageUrl;

    // Firestore 문서 삭제
    await deleteDoc(bannerRef);

    // Storage에서 이미지 파일 삭제
    if (imageUrl) {
        const imageStorageRef = ref(storage, imageUrl);
        try {
            await deleteObject(imageStorageRef);
        } catch (error: any) {
            if (error.code === 'storage/object-not-found') {
                console.warn("삭제할 이미지가 Storage에 없습니다:", imageUrl);
            } else {
                console.error("Storage 이미지 삭제 오류:", error);
                throw new Error("Firestore 데이터는 삭제되었으나, 이미지 파일 삭제에 실패했습니다.");
            }
        }
    }
};


/**
 * 배너 활성/비활성 토글
 */
export const toggleBannerActive = async (bannerId: string, isActive: boolean): Promise<void> => {
  const bannerRef = doc(db, 'banners', bannerId);
  await updateDoc(bannerRef, { isActive });
};