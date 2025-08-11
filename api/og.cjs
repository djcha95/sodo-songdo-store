// --- CommonJS 방식으로 모듈 불러오기 ---
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');
const fs = require('fs');

// --- Firebase Admin SDK 초기화 ---
try {
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  );
  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
    });
  }
} catch (e) {
  console.error('Firebase Admin SDK 초기화 실패:', e);
}
const db = getFirestore();

// --- 기본 OG 정보 ---
const BASE_URL = 'https://www.sodo-songdo.store';
const DEFAULT_TITLE = '소도몰 - 초특가 공동구매마켓';
const DEFAULT_DESCRIPTION = '소비자도 도매가로! 송도 주민을 위한 특별한 공동구매';
const DEFAULT_IMAGE = `${BASE_URL}/sodomall_wel.png`;

// --- 'export default' 대신 'module.exports' 사용 ---
module.exports = async (req, res) => {
  console.log('[OG Handler] 함수 시작, 요청 URL:', req.url);

  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const pathname = url.pathname;
    console.log('[OG Handler] Pathname:', pathname);

    let ogTitle = DEFAULT_TITLE;
    let ogDescription = DEFAULT_DESCRIPTION;
    let ogImage = DEFAULT_IMAGE;
    let ogUrl = BASE_URL + pathname;

    const productPathMatch = pathname.match(/^\/product\/([a-zA-Z0-9]+)/);

    if (productPathMatch && productPathMatch[1]) {
      const productId = productPathMatch[1];
      console.log(`[OG Handler] 상품 페이지 감지, ID: ${productId}`);
      try {
        const productDoc = await db.collection('products').doc(productId).get();
        if (productDoc.exists) {
          const productData = productDoc.data();
          if (productData) {
            console.log('[OG Handler] Firebase에서 상품 데이터 찾음:', productData.groupName);
            ogTitle = `${productData.groupName} - 소도몰` || DEFAULT_TITLE;
            ogDescription = productData.description?.replace(/<br\s*\/?>/gi, ' ').substring(0, 100) + '...' || DEFAULT_DESCRIPTION;
            ogImage = productData.imageUrls?.[0] || DEFAULT_IMAGE;
            ogUrl = BASE_URL + pathname;
          }
        } else {
            console.log(`[OG Handler] Firebase에 상품 ID(${productId})가 존재하지 않음`);
        }
      } catch (error) {
        console.error(`[OG Handler] Firebase 오류 (${productId}):`, error);
      }
    } else {
        console.log('[OG Handler] 상품 페이지가 아님. 기본 OG 정보 사용.');
    }
    
    let html;
    try {
      const htmlFilePath = path.join(process.cwd(), 'dist', 'index.html');
      console.log('[OG Handler] index.html 파일 경로:', htmlFilePath);
      html = fs.readFileSync(htmlFilePath, 'utf-8');
      console.log('[OG Handler] index.html 파일 읽기 성공.');
    } catch (e) {
      console.error('[OG Handler] index.html 파일 읽기 실패!', e);
      return res.status(500).send('<h1>Error: Cannot read index.html</h1>');
    }

    console.log('[OG Handler] OG 태그 교체 시작...');
    html = html.replace(/__OG_TITLE__/g, ogTitle);
    html = html.replace(/__OG_DESCRIPTION__/g, ogDescription);
    html = html.replace(/__OG_IMAGE__/g, ogImage);
    html = html.replace(/__OG_URL__/g, ogUrl);
    console.log('[OG Handler] OG 태그 교체 완료. HTML 응답 전송.');

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);

  } catch (error) {
    console.error('[OG Handler] 핸들러 전체에서 심각한 오류 발생:', error);
    return res.status(500).send('<h1>Server Error</h1>');
  }
};