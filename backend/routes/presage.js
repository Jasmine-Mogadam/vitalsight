const express = require('express');
const { getPresageStatus, measureVitals } = require('../services/presage');
const { requireAuth } = require('../middleware/auth');
const { expensiveApiRateLimit } = require('../middleware/rateLimit');

const router = express.Router();
const MAX_IMAGE_DATA_URL_LENGTH = 6 * 1024 * 1024;
const MAX_VIDEO_DATA_URL_LENGTH = 50 * 1024 * 1024;

function isSafeSessionValue(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}

router.get('/status', requireAuth, async (_req, res) => {
  try {
    res.json(await getPresageStatus());
  } catch (error) {
    console.error('Presage status error:', error);
    res.status(error.statusCode || 500).json({
      provider: 'demo',
      ready: false,
      message: error.message || 'Presage status check failed',
      details: error.details || null,
    });
  }
});

router.post('/measure', requireAuth, expensiveApiRateLimit, async (req, res) => {
  try {
    const { image, video, sessionId, timestamp } = req.body || {};

    const hasImage = typeof image === 'string' && image.startsWith('data:image/') && image.length <= MAX_IMAGE_DATA_URL_LENGTH;
    const hasVideo = typeof video === 'string' && video.startsWith('data:video/') && video.length <= MAX_VIDEO_DATA_URL_LENGTH;

    if (!hasImage && !hasVideo) {
      return res.status(400).json({ error: 'A valid image capture or recorded video is required' });
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
