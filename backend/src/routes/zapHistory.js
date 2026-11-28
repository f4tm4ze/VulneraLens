import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { getZapHistory } from '../services/zap.js';

const router = Router();

router.get('/', authenticate, authorize('administrator', 'assessor'), async (req, res) => {
  const start = Math.max(0, Number(req.query.start) || 0);
  const count = Math.min(500, Math.max(1, Number(req.query.count) || 100));

  try {
    const messages = await getZapHistory(start, count);
    return res.json({ messages });
  } catch (err) {
    console.error('[ZAP history]', err.message);
    return res.status(502).json({ error: 'Failed to retrieve ZAP traffic history' });
  }
});

export default router;