import { useEffect } from "react";
import { getApp } from "firebase/app";
import { getStorage, ref } from "firebase/storage";

export default function CheckBucket() {
  useEffect(() => {
    const storage = getStorage(getApp());
    console.log("현재 사용중인 버킷:", ref(storage).toString());
  }, []);

  return <div>콘솔에서 버킷 주소 확인하세요</div>;
}
