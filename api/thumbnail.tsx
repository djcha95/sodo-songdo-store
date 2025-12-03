// /api/thumbnail.tsx

import { ImageResponse } from '@vercel/og';

export const config = {
  runtime: 'edge',
};

// ✅ Firebase URL alt=media 보정 함수 추가 (img.js와 동일 컨셉)
function normalizeFirebaseUrl(u: string): string {
  try {
    const url = new URL(u);
    if (
      url.hostname === 'firebasestorage.googleapis.com' ||
      url.hostname.endsWith('.firebasestorage.app')
    ) {
      if (!url.searchParams.has('alt')) {
        url.searchParams.set('alt', 'media');
      }
      return url.toString();
    }
  } catch {
    // URL 파싱 실패하면 그냥 원본 사용
  }
  return u;
}

// ✅ 수정된 부분: req 뒤에 ': Request'를 붙여서 정체를 밝혀줌
export default function handler(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get('src'); // 보정 전 raw URL

    // 이미지가 없으면 기본값 처리
    if (!raw) {
      return new Response('No image provided', { status: 400 });
    }
    
    // ✅ URL 보정 적용
    const src = normalizeFirebaseUrl(raw);

    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            height: '100%',
            width: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#ffffff',
          }}
        >
          {/* 이미지: 비율 유지하며 꽉 차게 (contain) */}
          <img
            src={src}
            style={{
              width: '100%', // 캔버스 영역 꽉 채우기
              height: '100%', // 캔버스 영역 꽉 채우기
              objectFit: 'contain', // 비율 유지 + 여백 허용
            }}
          />
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (e) {
    return new Response(`Failed to generate image`, { status: 500 });
  }
}