import { ImageResponse } from '@vercel/og';

export const config = {
  runtime: 'edge',
};

// ✅ 수정된 부분: req 뒤에 ': Request'를 붙여서 정체를 밝혀줌
export default function handler(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const src = searchParams.get('src');

    // 이미지가 없으면 기본값 처리
    if (!src) {
      return new Response('No image provided', { status: 400 });
    }

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
              maxHeight: '100%',
              maxWidth: '100%',
              objectFit: 'contain',
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