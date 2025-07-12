// src/components/customer/KakaoMap.tsx

import React, { useEffect, useState } from 'react';
import { Map, MapMarker } from 'react-kakao-maps-sdk';

declare global {
  interface Window {
    kakao: any;
  }
}

interface KakaoMapProps {
  address: string;
  storeName: string;
}

interface MapLocation {
  lat: number;
  lng: number;
}

const KakaoMap: React.FC<KakaoMapProps> = ({ address, storeName }) => {
  const [location, setLocation] = useState<MapLocation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // ✅ [추가] 컴포넌트가 받은 주소를 확인하는 로그
    console.log('[KakaoMap] 컴포넌트가 받은 주소:', address);

    if (!window.kakao || !window.kakao.maps || !address) {
      // ✅ [추가] 실행 조건이 충족되지 않았을 때 로그
      console.log('[KakaoMap] 카카오맵 SDK 또는 주소가 준비되지 않아 실행을 중단합니다.');
      return;
    }

    const geocoder = new window.kakao.maps.services.Geocoder();
    geocoder.addressSearch(address, (result: any, status: any) => {
      // ✅ [추가] 카카오 API의 응답 상태를 확인하는 로그
      console.log('[KakaoMap] 지오코더 응답 상태:', status);

      if (status === window.kakao.maps.services.Status.OK) {
        const newLocation = {
          lat: parseFloat(result[0].y),
          lng: parseFloat(result[0].x),
        };
        // ✅ [추가] 성공 시 좌표를 확인하는 로그
        console.log('[KakaoMap] 주소 변환 성공! 좌표:', newLocation);
        setLocation(newLocation);
        setError(null);
      } else {
        // ✅ [추가] 실패 시 에러 상태를 확인하는 로그
        console.log('[KakaoMap] 주소 변환 실패! 에러:', status);
        setError('주소를 찾을 수 없습니다. 주소 형식을 확인해주세요.');
        setLocation(null);
      }
    });
  }, [address]);

  // ... 이하 코드는 동일 ...
  if (error) {
    return <div className="map-error">{error}</div>;
  }
  
  if (!location) {
    return <div>지도를 불러오는 중...</div>;
  }

  return (
    <Map
      center={location}
      style={{ width: '100%', height: '250px', borderRadius: 'var(--border-radius-md)' }}
      level={3}
    >
      <MapMarker position={location}>
        <div style={{ padding: '5px', color: '#000' }}>{storeName}</div>
      </MapMarker>
    </Map>
  );
};

export default KakaoMap;