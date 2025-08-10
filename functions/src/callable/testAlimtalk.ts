import { onRequest } from 'firebase-functions/v2/https';

export const testAlimtalk = onRequest(
  { region: 'asia-northeast3' },
  async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    try {
      if (req.method !== 'POST' && req.method !== 'GET') {
        res.status(405).send({ ok: false, error: 'Method Not Allowed' });
        return;
      }
      const payload = req.method === 'POST' ? req.body : req.query;
      res.status(200).send({
        ok: true,
        message: 'testAlimtalk is alive',
        method: req.method,
        payload,
      });
    } catch (err) {
      console.error('[testAlimtalk] Error:', err);
      res.status(500).send({ ok: false, error: (err as Error)?.message ?? String(err) });
    }
  }
);
