// src/firebase/bannerService.ts

import {
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore/lite';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from 'firebase/storage';
import type { Banner } from '@/types';
import { getFirebaseServices } from './firebaseInit'; // ✅ firebaseInit import

/**
 * 새 배너 추가
 */
export const addBanner = async (
  bannerData: Omit<Banner, 'id' | 'imageUrl' | 'createdAt'>,
  imageFile: File
): Promise<void> => {
  const { db, storage } = await getFirebaseServices(); // ✅ 함수 내에서 db, storage 호출
  const bannersCollectionRef = collection(db, 'banners');

  const imageRef = ref(storage, `banners/${Date.now()}_${imageFile.name}`);
  await uploadBytes(imageRef, imageFile);
  const imageUrl = await getDownloadURL(imageRef);

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
  const { db, storage } = await getFirebaseServices(); // ✅ 함수 내에서 db, storage 호출
  const bannerRef = doc(db, 'banners', bannerId);

  const oldDocSnap = await getDoc(bannerRef);
  if (!oldDocSnap.exists()) {
    throw new Error("수정할 배너를 찾을 수 없습니다.");
  }
  let imageUrl = oldDocSnap.data().imageUrl;

  if (newImageFile) {
    const newImageRef = ref(storage, `banners/${Date.now()}_${newImageFile.name}`);
    await uploadBytes(newImageRef, newImageFile);
    imageUrl = await getDownloadURL(newImageRef);

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

  const dataToUpdate = {
    ...bannerData,
    imageUrl,
  };
  delete (dataToUpdate as any).createdAt;

  await updateDoc(bannerRef, dataToUpdate);
};


/**
 * 배너 삭제
 */
export const deleteBanner = async (bannerId: string): Promise<void> => {
  const { db, storage } = await getFirebaseServices(); // ✅ 함수 내에서 db, storage 호출
  const bannerRef = doc(db, 'banners', bannerId);

  const bannerDoc = await getDoc(bannerRef);
  const data = bannerDoc.data();
  const imageUrl = data?.imageUrl;

  await deleteDoc(bannerRef);

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
  const { db } = await getFirebaseServices(); // ✅ 함수 내에서 db 호출
  const bannerRef = doc(db, 'banners', bannerId);
  await updateDoc(bannerRef, { isActive });
};