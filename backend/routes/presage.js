const express = require('express');
const { getPresageStatus, measureVitals } = require('../services/presage');
const { requireAuth } = require('../middleware/auth');
const { expensiveApiRateLimit } = require('../middleware/rateLimit');

const router = express.Router();
const MAX_IMAGE_DATA_URL_LENGTH = 6 * 1024 * 1024;

function isSafeSessionValue(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}

router.get('/status', requireAuth, (_req, res) => {
  res.json(getPresageStatus());
});

router.post('/measure', requireAuth, expensiveApiRateLimit, async (req, res) => {
  try {
    const { image, sessionId, timestamp } = req.body || {};

    if (typeof image !== 'string' || !image.startsWith('data:image/') || image.length > MAX_IMAGE_DATA_URL_LENGTH) {
      return res.status(400).json({ error: 'A valid image capture is required' });
    }
    if (sessionId !== undefined && !isSafeSessionValue(sessionId)) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }
    if (timestamp !== undefined && Number.isNaN(Date.parse(timestamp))) {
      return res.status(400).json({ error: 'Invalid timestamp' });
    }

    const result = await measureVitals(req.body || {});
    res.json(result);
  } catch (error) {
    console.error('Presage error:', error);
    res.status(error.statusCode || 500).json({
      error: error.message || 'Presage measurement failed',
      details: error.details || null,
    });
  }
});

module.exports = router;
