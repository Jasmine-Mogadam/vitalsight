const express = require('express');
const { getPresageStatus, measureVitals } = require('../services/presage');

const router = express.Router();

router.get('/status', (_req, res) => {
  res.json(getPresageStatus());
});

router.post('/measure', async (req, res) => {
  try {
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
