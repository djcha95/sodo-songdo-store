import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import type { Request, Response } from 'express';

if (!admin.apps.length) {
  admin.initializeApp();
}

// v2 전역 옵션(서울 리전)
setGlobalOptions({ region: 'asia-northeast3' });

/**
 * GET /api/product?id=<상품ID>
 * Firestore products/<id>의 미리보기 메타(title/description/image) 반환
 */
export const product = onRequest(async (req: Request, res: Response): Promise<void> => {
  try {
    // CORS
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return; // ← void 반환 보장
    }

    const id = String(req.query.id || '').trim();
    if (!id) {
      res.status(400).json({ error: 'missing id' });
      return;
    }

    const snap = await admin.firestore().collection('products').doc(id).get();
    if (!snap.exists) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const data = snap.data() || {};

    const title: string = data.title || data.groupName || data.name || '상품';
    const rawDesc: string = data.description || data.summary || data.subtitle || '';
    const description = String(rawDesc || '').slice(0, 140);

    let image: string =
      (Array.isArray(data.imageUrls) && data.imageUrls[0]) ||
      data.mainImage ||
      data.thumbnail ||
      '';

    // 필요 시 상대경로 → 절대경로 변환 로직 추가 가능
    // if (image && !/^https?:\/\//i.test(image)) {
    //   image = `https://www.sodo-songdo.store${image.startsWith('/') ? '' : '/'}${image}`;
    // }

    res.json({ id, title, description, image }); // ← 응답만 보내고
    return; // ← 아무 것도 반환하지 않음(타입 만족)
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal' });
    return;
  }
});
