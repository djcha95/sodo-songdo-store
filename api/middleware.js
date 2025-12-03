// /middleware.js
import { NextResponse } from 'next/server';

export function middleware(req) {
  const ua = req.headers.get('user-agent') || '';
  const url = new URL(req.url);

  // /product/:id 인지 확인
  if (url.pathname.startsWith('/product/')) {
    const id = url.pathname.split('/').pop();

    // 카카오톡/페북/트위터/디스코드 같은 미리보기용 봇 UA
    const isBot = /kakaotalk|facebookexternalhit|twitterbot|slackbot|discordbot/i.test(
      ua
    );

    if (isBot && id) {
      // 👉 봇이면 /api/og?id=... 로 내부 rewrite
      return NextResponse.rewrite(
        new URL(`/api/og?id=${encodeURIComponent(id)}`, req.url)
      );
    }
  }

  // 그 외(사람 브라우저)는 원래대로 페이지 보여주기
  return NextResponse.next();
}

// 이 미들웨어를 적용할 경로 (product 페이지에만)
export const config = {
  matcher: ['/product/:path*'],
};
