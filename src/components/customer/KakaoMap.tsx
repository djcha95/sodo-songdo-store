// src/components/customer/KakaoMap.tsx

import React from 'react';
import { Map, MapMarker } from 'react-kakao-maps-sdk';

interface KakaoMapProps {
  storeName: string;
  latitude?: number;
  longitude?: number;
}

const KakaoMap: React.FC<KakaoMapProps> = ({ storeName, latitude, longitude }) => {
  // ✅ [수정] 좌표값이 없으면 지도를 렌더링하지 않고 안내 메시지를 표시합니다.
  if (!latitude || !longitude) {
    return <div className="map-placeholder">정확한 위치 정보가 등록되지 않았습니다.</div>;
  }

  const location = {
    lat: latitude,
    lng: longitude,
  };

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