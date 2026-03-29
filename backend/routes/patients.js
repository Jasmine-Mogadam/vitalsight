const express = require('express');
const { requireRole } = require('../middleware/auth');
const { updatePatientProfile } = require('../db');

const router = express.Router();

router.use(requireRole('patient'));

router.get('/profile', (req, res) => {
  res.json({ profile: req.user.profile || null });
});

router.put('/profile', (req, res) => {
  const { date_of_birth, ethnicity, location, conditions, notification_prefs } = req.body || {};
  const user = updatePatientProfile(req.user.id, {
    date_of_birth,
    ethnicity: Array.isArray(ethnicity)
      ? ethnicity
      : typeof ethnicity === 'string'
        ? ethnicity.split(',').map((item) => item.trim()).filter(Boolean)
        : undefined,
    location,
    conditions: Array.isArray(conditions)
      ? conditions
      : typeof conditions === 'string'
        ? conditions.split(',').map((item) => item.trim()).filter(Boolean)
        : undefined,
    notification_prefs,
  });

  res.json({ profile: user.profile, user });
});

router.get('/notifications', (req, res) => {
  res.json({ preferences: req.user.profile?.notification_prefs || {} });
});

router.put('/notifications', (req, res) => {
  const user = updatePatientProfile(req.user.id, {
    notification_prefs: req.body || {},
  });

  res.json({ preferences: user.profile?.notification_prefs || {}, user });
});

module.exports = router;
