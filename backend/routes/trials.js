const crypto = require('crypto');
const express = require('express');
const { db, createMessage, parseJSON } = require('../db');
const { optionalAuth, requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function hydrateTrial(trial) {
  if (!trial) return null;
  return {
    ...trial,
    is_private: Boolean(trial.is_private),
  };
}

function getOwnedTrial(trialId, coordinatorId) {
  return db.prepare('SELECT * FROM trials WHERE id = ? AND coordinator_id = ?').get(trialId, coordinatorId);
}

router.get('/', optionalAuth, (req, res) => {
  const { type, reward_type, search } = req.query;
  const clauses = ['t.status = \'active\''];
  const params = [];

  if (!req.user || req.user.role !== 'coordinator') {
    clauses.push('t.is_private = 0');
  }
  if (type) {
    clauses.push('t.type = ?');
    params.push(type);
  }
  if (reward_type) {
    clauses.push('t.reward_type = ?');
    params.push(reward_type);
  }
  if (search) {
    clauses.push('(t.name LIKE ? OR t.description LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const trials = db.prepare(`
    SELECT t.*, u.name AS coordinator_name
    FROM trials t
    JOIN users u ON u.id = t.coordinator_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY t.created_at DESC
  `).all(...params);

  res.json({ trials: trials.map(hydrateTrial) });
});

router.get('/mine', requireAuth, (req, res) => {
  if (req.user.role === 'coordinator') {
    const trials = db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM trial_enrollments te WHERE te.trial_id = t.id AND te.status = 'pending') AS pending_requests,
        (SELECT COUNT(*) FROM trial_enrollments te WHERE te.trial_id = t.id AND te.status = 'approved') AS approved_count
      FROM trials t
      WHERE t.coordinator_id = ?
      ORDER BY t.created_at DESC
    `).all(req.user.id);
    return res.json({ trials: trials.map(hydrateTrial) });
  }

  const enrollments = db.prepare(`
    SELECT te.*, t.name, t.description, t.type, t.reward_type, t.reward_desc, t.coordinator_id,
           u.name AS coordinator_name
    FROM trial_enrollments te
    JOIN trials t ON t.id = te.trial_id
    JOIN users u ON u.id = t.coordinator_id
    WHERE te.patient_id = ?
    ORDER BY te.joined_at DESC
  `).all(req.user.id);

  res.json({ enrollments });
});

router.get('/:id', requireAuth, (req, res) => {
  const trial = db.prepare(`
    SELECT t.*, u.name AS coordinator_name
    FROM trials t
    JOIN users u ON u.id = t.coordinator_id
    WHERE t.id = ?
  `).get(req.params.id);

  if (!trial) {
    return res.status(404).json({ error: 'Trial not found' });
  }

  if (req.user.role === 'coordinator' && trial.coordinator_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.user.role === 'patient') {
    const enrollment = db.prepare(`
      SELECT *
      FROM trial_enrollments
      WHERE trial_id = ? AND patient_id = ?
    `).get(trial.id, req.user.id);
    if (!enrollment && trial.is_private) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  const enrollments = req.user.role === 'coordinator'
    ? db.prepare(`
        SELECT te.*, u.name AS patient_name, u.email AS patient_email
        FROM trial_enrollments te
        JOIN users u ON u.id = te.patient_id
        WHERE te.trial_id = ?
        ORDER BY te.joined_at DESC
      `).all(trial.id)
    : [];

  const invites = req.user.role === 'coordinator'
    ? db.prepare('SELECT * FROM trial_invites WHERE trial_id = ? ORDER BY created_at DESC').all(trial.id).map((invite) => ({
        ...invite,
        prefill_data: parseJSON(invite.prefill_data, null),
      }))
    : [];

  res.json({
    trial: hydrateTrial(trial),
    enrollments,
    invites,
  });
});

router.post('/', requireRole('coordinator'), (req, res) => {
  const { name, description, type, reward_type, reward_desc, is_private, status } = req.body || {};
  if (!name?.trim()) {
    return res.status(400).json({ error: 'Trial name is required' });
  }

  const result = db.prepare(`
    INSERT INTO trials (coordinator_id, name, description, type, reward_type, reward_desc, is_private, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    name.trim(),
    description || null,
    type || null,
    reward_type || 'none',
    reward_desc || null,
    is_private ? 1 : 0,
    status || 'active'
  );

  const trial = db.prepare('SELECT * FROM trials WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ trial: hydrateTrial(trial) });
});

router.patch('/:id', requireRole('coordinator'), (req, res) => {
  const trial = getOwnedTrial(req.params.id, req.user.id);
  if (!trial) {
    return res.status(404).json({ error: 'Trial not found' });
  }

  const next = {
    id: trial.id,
    name: req.body.name ?? trial.name,
    description: req.body.description ?? trial.description,
    type: req.body.type ?? trial.type,
    reward_type: req.body.reward_type ?? trial.reward_type,
    reward_desc: req.body.reward_desc ?? trial.reward_desc,
    is_private: req.body.is_private === undefined ? trial.is_private : (req.body.is_private ? 1 : 0),
    status: req.body.status ?? trial.status,
  };

  db.prepare(`
    UPDATE trials
    SET name = @name,
        description = @description,
        type = @type,
        reward_type = @reward_type,
        reward_desc = @reward_desc,
        is_private = @is_private,
        status = @status
    WHERE id = @id
  `).run(next);

  const patients = db.prepare(`
    SELECT patient_id
    FROM trial_enrollments
    WHERE trial_id = ? AND status = 'approved'
  `).all(trial.id);

  for (const patient of patients) {
    createMessage({
      recipient_id: patient.patient_id,
      sender_id: req.user.id,
      type: 'trial_update',
      subject: `Trial updated: ${next.name}`,
      body: 'A coordinator updated one of your trial records.',
      related_id: trial.id,
    });
  }

  const updated = db.prepare('SELECT * FROM trials WHERE id = ?').get(trial.id);
  res.json({ trial: hydrateTrial(updated) });
});

router.delete('/:id', requireRole('coordinator'), (req, res) => {
  const trial = getOwnedTrial(req.params.id, req.user.id);
  if (!trial) {
    return res.status(404).json({ error: 'Trial not found' });
  }

  const participants = db.prepare(`
    SELECT patient_id
    FROM trial_enrollments
    WHERE trial_id = ? AND status = 'approved'
  `).all(trial.id);

  const formIds = db.prepare('SELECT id FROM forms WHERE trial_id = ?').all(trial.id).map((row) => row.id);
  for (const formId of formIds) {
    db.prepare('DELETE FROM form_submissions WHERE form_id = ?').run(formId);
    db.prepare('DELETE FROM form_schedules WHERE form_id = ?').run(formId);
  }

  db.prepare('DELETE FROM forms WHERE trial_id = ?').run(trial.id);
  db.prepare('DELETE FROM trial_invites WHERE trial_id = ?').run(trial.id);
  db.prepare('DELETE FROM trial_enrollments WHERE trial_id = ?').run(trial.id);
  db.prepare('DELETE FROM trials WHERE id = ?').run(trial.id);

  for (const participant of participants) {
    createMessage({
      recipient_id: participant.patient_id,
      sender_id: null,
      type: 'trial_update',
      subject: 'A trial was closed',
      body: `The trial "${trial.name}" has been closed.`,
      related_id: null,
    });
  }

  res.json({ success: true });
});

router.post('/:id/join', requireRole('patient'), (req, res) => {
  const trial = db.prepare('SELECT * FROM trials WHERE id = ? AND status = \'active\'').get(req.params.id);
  if (!trial) {
    return res.status(404).json({ error: 'Trial not found' });
  }
  if (trial.is_private) {
    return res.status(403).json({ error: 'This trial requires an invite' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO trial_enrollments (trial_id, patient_id, status)
      VALUES (?, ?, 'pending')
    `).run(trial.id, req.user.id);

    createMessage({
      recipient_id: trial.coordinator_id,
      sender_id: req.user.id,
      type: 'join_request',
      subject: `New join request for ${trial.name}`,
      body: `${req.user.name} requested to join your trial.`,
      related_id: result.lastInsertRowid,
    });

    const enrollment = db.prepare('SELECT * FROM trial_enrollments WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ enrollment });
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'You already requested or joined this trial' });
    }
    throw error;
  }
});

router.patch('/enrollments/:id', requireRole('coordinator'), (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'approved', 'rejected', 'withdrawn'].includes(status)) {
    return res.status(400).json({ error: 'Invalid enrollment status' });
  }

  const enrollment = db.prepare(`
    SELECT te.*, t.coordinator_id, t.name AS trial_name
    FROM trial_enrollments te
    JOIN trials t ON t.id = te.trial_id
    WHERE te.id = ?
  `).get(req.params.id);

  if (!enrollment || enrollment.coordinator_id !== req.user.id) {
    return res.status(404).json({ error: 'Enrollment not found' });
  }

  db.prepare('UPDATE trial_enrollments SET status = ? WHERE id = ?').run(status, enrollment.id);
  createMessage({
    recipient_id: enrollment.patient_id,
    sender_id: req.user.id,
    type: 'trial_update',
    subject: `Enrollment ${status}: ${enrollment.trial_name}`,
    body: `Your enrollment for ${enrollment.trial_name} is now ${status}.`,
    related_id: enrollment.trial_id,
  });

  const updated = db.prepare('SELECT * FROM trial_enrollments WHERE id = ?').get(enrollment.id);
  res.json({ enrollment: updated });
});

router.post('/:id/invites', requireRole('coordinator'), (req, res) => {
  const trial = getOwnedTrial(req.params.id, req.user.id);
  if (!trial) {
    return res.status(404).json({ error: 'Trial not found' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const { uses_remaining = null, prefill_data = null, expires_at = null } = req.body || {};
  const result = db.prepare(`
    INSERT INTO trial_invites (trial_id, token, uses_remaining, prefill_data, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    trial.id,
    token,
    uses_remaining === null || uses_remaining === undefined ? null : Number(uses_remaining),
    prefill_data ? JSON.stringify(prefill_data) : null,
    expires_at || null
  );

  const invite = db.prepare('SELECT * FROM trial_invites WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({
    invite: {
      ...invite,
      prefill_data: parseJSON(invite.prefill_data, null),
      join_url: `/join/${invite.token}`,
    },
  });
});

router.get('/join/:token', (req, res) => {
  const invite = db.prepare(`
    SELECT ti.*, t.id AS trial_id, t.name, t.description, t.type, t.reward_type, t.reward_desc, t.status
    FROM trial_invites ti
    JOIN trials t ON t.id = ti.trial_id
    WHERE ti.token = ?
  `).get(req.params.token);

  if (!invite) {
    return res.status(404).json({ error: 'Invite not found' });
  }
  if (invite.status !== 'active') {
    return res.status(400).json({ error: 'Trial is no longer active' });
  }
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Invite expired' });
  }
  if (invite.uses_remaining !== null && invite.uses_remaining <= 0) {
    return res.status(400).json({ error: 'Invite exhausted' });
  }

  res.json({
    invite: {
      id: invite.id,
      token: invite.token,
      trial_id: invite.trial_id,
      uses_remaining: invite.uses_remaining,
      expires_at: invite.expires_at,
      prefill_data: parseJSON(invite.prefill_data, null),
    },
    trial: {
      id: invite.trial_id,
      name: invite.name,
      description: invite.description,
      type: invite.type,
      reward_type: invite.reward_type,
      reward_desc: invite.reward_desc,
    },
  });
});

router.post('/join/:token/enroll', requireRole('patient'), (req, res) => {
  const invite = db.prepare(`
    SELECT ti.*, t.id AS trial_id, t.name, t.coordinator_id, t.status
    FROM trial_invites ti
    JOIN trials t ON t.id = ti.trial_id
    WHERE ti.token = ?
  `).get(req.params.token);

  if (!invite) {
    return res.status(404).json({ error: 'Invite not found' });
  }
  if (invite.status !== 'active') {
    return res.status(400).json({ error: 'Trial is no longer active' });
  }
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Invite expired' });
  }
  if (invite.uses_remaining !== null && invite.uses_remaining <= 0) {
    return res.status(400).json({ error: 'Invite exhausted' });
  }

  const enroll = db.transaction(() => {
    const existing = db.prepare('SELECT * FROM trial_enrollments WHERE trial_id = ? AND patient_id = ?').get(invite.trial_id, req.user.id);
    if (existing) return existing;

    const result = db.prepare(`
      INSERT INTO trial_enrollments (trial_id, patient_id, status)
      VALUES (?, ?, 'approved')
    `).run(invite.trial_id, req.user.id);

    if (invite.uses_remaining !== null) {
      db.prepare('UPDATE trial_invites SET uses_remaining = uses_remaining - 1 WHERE id = ?').run(invite.id);
    }

    createMessage({
      recipient_id: invite.coordinator_id,
      sender_id: req.user.id,
      type: 'join_request',
      subject: `Participant joined via invite: ${invite.name}`,
      body: `${req.user.name} joined your private trial using an invite.`,
      related_id: invite.trial_id,
    });

    return db.prepare('SELECT * FROM trial_enrollments WHERE id = ?').get(result.lastInsertRowid);
  });

  res.status(201).json({ enrollment: enroll() });
});

module.exports = router;
