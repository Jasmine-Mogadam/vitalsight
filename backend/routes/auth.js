const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, createMessage, createUserWithProfile, getUserByEmail, getUserWithProfile } = require('../db');
const { authRateLimit } = require('../middleware/rateLimit');
const { requireAuth } = require('../middleware/auth');
const { getJwtSecret } = require('../config/security');

const router = express.Router();

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || '');
}

function getRequestOrigin(req) {
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  return `${protocol}://${req.get('host')}`;
}

function cookieOptions(req) {
  const requestOrigin = getRequestOrigin(req);
  const callerOrigin = typeof req.headers.origin === 'string' ? req.headers.origin.trim().replace(/\/+$/, '') : '';
  const isCrossOrigin = Boolean(callerOrigin) && callerOrigin !== requestOrigin;

  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: isCrossOrigin ? 'none' : 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function setAuthCookie(req, res, user) {
  const token = jwt.sign({ id: user.id, role: user.role }, getJwtSecret(), {
    expiresIn: '7d',
  });
  res.cookie('token', token, cookieOptions(req));
}

function clearAuthCookie(req, res) {
  res.clearCookie('token', {
    ...cookieOptions(req),
    maxAge: undefined,
  });
}

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/register', authRateLimit, async (req, res) => {
  const { name, email, password, role, trialIds, profile } = req.body || {};
  if (!name?.trim() || !isEmail(email) || !password || !['patient', 'coordinator'].includes(role)) {
    return res.status(400).json({ error: 'Invalid registration payload' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (getUserByEmail(email)) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = createUserWithProfile({ email, passwordHash, role, name, profile });

  if (role === 'patient' && Array.isArray(trialIds)) {
    for (const trialId of trialIds.map(Number).filter(Boolean)) {
      const trial = db.prepare('SELECT id, coordinator_id, name FROM trials WHERE id = ?').get(trialId);
      if (!trial) continue;
      db.prepare(`
        INSERT OR IGNORE INTO trial_enrollments (trial_id, patient_id, status)
        VALUES (?, ?, 'pending')
      `).run(trial.id, user.id);
      createMessage({
        recipient_id: trial.coordinator_id,
        sender_id: user.id,
        type: 'join_request',
        subject: `New join request for ${trial.name}`,
        body: `${user.name} requested to join your trial.`,
        related_id: trial.id,
      });
    }
  }

  setAuthCookie(req, res, user);
  res.status(201).json({ user });
});

router.post('/login', authRateLimit, async (req, res) => {
  const { email, password } = req.body || {};
  if (!isEmail(email) || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = getUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const hydrated = getUserWithProfile(user.id);
  setAuthCookie(req, res, hydrated);
  res.json({ user: hydrated });
});

router.post('/logout', (req, res) => {
  clearAuthCookie(req, res);
  res.json({ success: true });
});

router.delete('/account', requireAuth, (req, res) => {
  const actor = req.user;

  const deletePatient = db.transaction(() => {
    const coordinators = db.prepare(`
      SELECT DISTINCT t.coordinator_id
      FROM trial_enrollments te
      JOIN trials t ON t.id = te.trial_id
      WHERE te.patient_id = ? AND te.status = 'approved'
    `).all(actor.id);

    db.prepare('DELETE FROM form_submissions WHERE patient_id = ?').run(actor.id);
    db.prepare('DELETE FROM trial_enrollments WHERE patient_id = ?').run(actor.id);
    db.prepare('DELETE FROM messages WHERE recipient_id = ? OR sender_id = ?').run(actor.id, actor.id);
    db.prepare('DELETE FROM patient_profiles WHERE user_id = ?').run(actor.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(actor.id);

    for (const coordinator of coordinators) {
      createMessage({
        recipient_id: coordinator.coordinator_id,
        sender_id: null,
        type: 'participant_left',
        subject: 'A participant left one of your trials',
        body: 'A participant has left one of your trials. Their data has been permanently deleted.',
        related_id: null,
      });
    }
  });

  const deleteCoordinator = db.transaction(() => {
    const trials = db.prepare('SELECT id, name FROM trials WHERE coordinator_id = ?').all(actor.id);
    const patients = db.prepare(`
      SELECT DISTINCT te.patient_id, t.name AS trial_name
      FROM trial_enrollments te
      JOIN trials t ON t.id = te.trial_id
      WHERE t.coordinator_id = ? AND te.status = 'approved'
    `).all(actor.id);

    for (const trial of trials) {
      const formIds = db.prepare('SELECT id FROM forms WHERE trial_id = ?').all(trial.id).map((row) => row.id);
      for (const formId of formIds) {
        db.prepare('DELETE FROM form_submissions WHERE form_id = ?').run(formId);
        db.prepare('DELETE FROM form_schedules WHERE form_id = ?').run(formId);
      }
      db.prepare('DELETE FROM forms WHERE trial_id = ?').run(trial.id);
      db.prepare('DELETE FROM trial_invites WHERE trial_id = ?').run(trial.id);
      db.prepare('DELETE FROM trial_enrollments WHERE trial_id = ?').run(trial.id);
      db.prepare('DELETE FROM trials WHERE id = ?').run(trial.id);
    }

    for (const patient of patients) {
      createMessage({
        recipient_id: patient.patient_id,
        sender_id: null,
        type: 'trial_update',
        subject: 'A trial you joined has been closed',
        body: `The trial "${patient.trial_name}" was closed by its coordinator.`,
        related_id: null,
      });
    }

    db.prepare('DELETE FROM messages WHERE recipient_id = ? OR sender_id = ?').run(actor.id, actor.id);
    db.prepare('DELETE FROM coordinator_profiles WHERE user_id = ?').run(actor.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(actor.id);
  });

  if (actor.role === 'patient') {
    deletePatient();
  } else {
    deleteCoordinator();
  }

  clearAuthCookie(req, res);
  res.json({ success: true });
});

module.exports = router;
