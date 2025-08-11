import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';

// --- Firebase Admin SDK 초기화 ---
const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string
);

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}
const db = getFirestore();

// --- 기본 OG 정보 ---
const BASE_URL = 'https://www.sodo-songdo.store';
const DEFAULT_TITLE = '소도몰 - 초특가 공동구매마켓';
const DEFAULT_DESCRIPTION = '소비자도 도매가로! 송도 주민을 위한 특별한 공동구매';
const DEFAULT_IMAGE = `${BASE_URL}/sodomall_wel.png`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const url = new URL(req.url!, `https://${req.headers.host}`);
    const pathname = url.pathname;

    let ogTitle = DEFAULT_TITLE;
    let ogDescription = DEFAULT_DESCRIPTION;
    let ogImage = DEFAULT_IMAGE;
    let ogUrl = BASE_URL + pathname;

    // 상품 페이지 경로인지 확인 (예: /product/AOl5GUXz1gj3aKz9QWct)
    const productPathMatch = pathname.match(/^\/product\/([a-zA-Z0-9]+)/);

    if (productPathMatch && productPathMatch[1]) {
      const productId = productPathMatch[1];
      try {
        const productDoc = await db.collection('products').doc(productId).get();
        if (productDoc.exists) {
          const productData = productDoc.data();
          if (productData) {
            ogTitle = `${productData.groupName} - 소도몰` || DEFAULT_TITLE;
            ogDescription = productData.description?.replace(/<br\s*\/?>/gi, ' ').substring(0, 100) + '...' || DEFAULT_DESCRIPTION;
            ogImage = productData.imageUrls?.[0] || DEFAULT_IMAGE;
            ogUrl = BASE_URL + pathname;
          }
        }
      } catch (error) {
        console.error(`[OG Tag] Firebase에서 상품(${productId}) 정보 가져오기 실패:`, error);
      }
    }
    
    // 빌드된 index.html 파일을 읽어옵니다.
    const htmlFilePath = path.join(process.cwd(), '.vercel/output/static/index.html');
    let html = fs.readFileSync(htmlFilePath, 'utf-8');

    // 플레이스홀더를 실제 값으로 교체합니다.
    html = html.replace(/__OG_TITLE__/g, ogTitle);
    html = html.replace(/__OG_DESCRIPTION__/g, ogDescription);
    html = html.replace(/__OG_IMAGE__/g, ogImage);
    html = html.replace(/__OG_URL__/g, ogUrl);

    // 수정된 HTML을 응답으로 보냅니다.
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);

  } catch (error) {
    console.error('[OG Tag] 전체 핸들러 오류:', error);
    return res.status(500).send('<h1>서버에서 오류가 발생했습니다.</h1>');
  }
}