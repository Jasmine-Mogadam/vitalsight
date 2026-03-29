const express = require('express');
const { db, parseJSON } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

function coordinatorOwnsTrial(trialId, coordinatorId) {
  return db.prepare('SELECT * FROM trials WHERE id = ? AND coordinator_id = ?').get(trialId, coordinatorId);
}

router.get('/:id', requireAuth, (req, res) => {
  const form = db.prepare(`
    SELECT f.*
    FROM forms f
    WHERE f.id = ?
  `).get(req.params.id);

  if (!form) {
    return res.status(404).json({ error: 'Form not found' });
  }

  if (req.user.role === 'coordinator') {
    if (!coordinatorOwnsTrial(form.trial_id, req.user.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  } else {
    const enrollment = db.prepare(`
      SELECT *
      FROM trial_enrollments
      WHERE trial_id = ? AND patient_id = ? AND status = 'approved'
    `).get(form.trial_id, req.user.id);
    if (!enrollment) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }

  const schedules = db.prepare('SELECT * FROM form_schedules WHERE form_id = ?').all(form.id).map((schedule) => ({
    ...schedule,
    schedule_config: parseJSON(schedule.schedule_config, {}),
  }));

  res.json({
    form: {
      ...form,
      fields: parseJSON(form.fields, []),
      schedules,
    },
  });
});

router.get('/trial/:trialId', requireAuth, (req, res) => {
  const trialId = Number(req.params.trialId);

  if (req.user.role === 'coordinator') {
    if (!coordinatorOwnsTrial(trialId, req.user.id)) {
      return res.status(404).json({ error: 'Trial not found' });
    }
  } else {
    const enrollment = db.prepare(`
      SELECT *
      FROM trial_enrollments
      WHERE trial_id = ? AND patient_id = ? AND status = 'approved'
    `).get(trialId, req.user.id);
    if (!enrollment) {
      return res.status(403).json({ error: 'Not enrolled in this trial' });
    }
  }

  const forms = db.prepare('SELECT * FROM forms WHERE trial_id = ? ORDER BY created_at DESC').all(trialId).map((form) => ({
    ...form,
    fields: parseJSON(form.fields, []),
    schedules: db.prepare('SELECT * FROM form_schedules WHERE form_id = ?').all(form.id).map((schedule) => ({
      ...schedule,
      schedule_config: parseJSON(schedule.schedule_config, {}),
    })),
  }));

  res.json({ forms });
});

router.post('/', requireRole('coordinator'), (req, res) => {
  const { trial_id, title, description, fields, schedules = [] } = req.body || {};
  if (!trial_id || !title?.trim() || !Array.isArray(fields) || !fields.length) {
    return res.status(400).json({ error: 'trial_id, title, and fields are required' });
  }
  if (!coordinatorOwnsTrial(trial_id, req.user.id)) {
    return res.status(404).json({ error: 'Trial not found' });
  }

  const result = db.prepare(`
    INSERT INTO forms (trial_id, title, description, fields)
    VALUES (?, ?, ?, ?)
  `).run(trial_id, title.trim(), description || null, JSON.stringify(fields));

  for (const schedule of schedules) {
    db.prepare(`
      INSERT INTO form_schedules (form_id, schedule_type, schedule_config, notify_email)
      VALUES (?, ?, ?, ?)
    `).run(
      result.lastInsertRowid,
      schedule.schedule_type,
      JSON.stringify(schedule.schedule_config || {}),
      schedule.notify_email === false ? 0 : 1
    );
  }

  const form = db.prepare('SELECT * FROM forms WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ form: { ...form, fields } });
});

router.patch('/:id', requireRole('coordinator'), (req, res) => {
  const form = db.prepare(`
    SELECT f.*, t.coordinator_id
    FROM forms f
    JOIN trials t ON t.id = f.trial_id
    WHERE f.id = ?
  `).get(req.params.id);

  if (!form || form.coordinator_id !== req.user.id) {
    return res.status(404).json({ error: 'Form not found' });
  }

  const next = {
    id: form.id,
    title: req.body.title ?? form.title,
    description: req.body.description ?? form.description,
    fields: JSON.stringify(req.body.fields ?? parseJSON(form.fields, [])),
  };

  db.prepare(`
    UPDATE forms
    SET title = @title,
        description = @description,
        fields = @fields
    WHERE id = @id
  `).run(next);

  const updated = db.prepare('SELECT * FROM forms WHERE id = ?').get(form.id);
  res.json({ form: { ...updated, fields: parseJSON(updated.fields, []) } });
});

router.delete('/:id', requireRole('coordinator'), (req, res) => {
  const form = db.prepare(`
    SELECT f.id, t.coordinator_id
    FROM forms f
    JOIN trials t ON t.id = f.trial_id
    WHERE f.id = ?
  `).get(req.params.id);

  if (!form || form.coordinator_id !== req.user.id) {
    return res.status(404).json({ error: 'Form not found' });
  }

  db.prepare('DELETE FROM form_submissions WHERE form_id = ?').run(form.id);
  db.prepare('DELETE FROM form_schedules WHERE form_id = ?').run(form.id);
  db.prepare('DELETE FROM forms WHERE id = ?').run(form.id);
  res.json({ success: true });
});

router.post('/:id/schedules', requireRole('coordinator'), (req, res) => {
  const form = db.prepare(`
    SELECT f.id, t.coordinator_id
    FROM forms f
    JOIN trials t ON t.id = f.trial_id
    WHERE f.id = ?
  `).get(req.params.id);

  if (!form || form.coordinator_id !== req.user.id) {
    return res.status(404).json({ error: 'Form not found' });
  }

  const { schedule_type, schedule_config, notify_email } = req.body || {};
  if (!schedule_type || !schedule_config) {
    return res.status(400).json({ error: 'schedule_type and schedule_config are required' });
  }

  const result = db.prepare(`
    INSERT INTO form_schedules (form_id, schedule_type, schedule_config, notify_email)
    VALUES (?, ?, ?, ?)
  `).run(form.id, schedule_type, JSON.stringify(schedule_config), notify_email === false ? 0 : 1);

  const schedule = db.prepare('SELECT * FROM form_schedules WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ schedule: { ...schedule, schedule_config } });
});

router.delete('/schedules/:id', requireRole('coordinator'), (req, res) => {
  const schedule = db.prepare(`
    SELECT fs.id, t.coordinator_id
    FROM form_schedules fs
    JOIN forms f ON f.id = fs.form_id
    JOIN trials t ON t.id = f.trial_id
    WHERE fs.id = ?
  `).get(req.params.id);

  if (!schedule || schedule.coordinator_id !== req.user.id) {
    return res.status(404).json({ error: 'Schedule not found' });
  }

  db.prepare('DELETE FROM form_schedules WHERE id = ?').run(schedule.id);
  res.json({ success: true });
});

router.post('/:id/submit', requireRole('patient'), (req, res) => {
  const form = db.prepare(`
    SELECT f.*
    FROM forms f
    JOIN trial_enrollments te ON te.trial_id = f.trial_id
    WHERE f.id = ? AND te.patient_id = ? AND te.status = 'approved'
  `).get(req.params.id, req.user.id);

  if (!form) {
    return res.status(403).json({ error: 'You are not allowed to submit this form' });
  }

  if (!req.body?.data || typeof req.body.data !== 'object') {
    return res.status(400).json({ error: 'Submission data is required' });
  }

  const result = db.prepare(`
    INSERT INTO form_submissions (form_id, patient_id, data)
    VALUES (?, ?, ?)
  `).run(form.id, req.user.id, JSON.stringify(req.body.data));

  const submission = db.prepare('SELECT * FROM form_submissions WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ submission: { ...submission, data: req.body.data } });
});

router.get('/:id/submissions', requireRole('coordinator'), (req, res) => {
  const form = db.prepare(`
    SELECT f.id, t.coordinator_id
    FROM forms f
    JOIN trials t ON t.id = f.trial_id
    WHERE f.id = ?
  `).get(req.params.id);

  if (!form || form.coordinator_id !== req.user.id) {
    return res.status(404).json({ error: 'Form not found' });
  }

  const submissions = db.prepare(`
    SELECT fs.*, u.name AS patient_name, u.email AS patient_email
    FROM form_submissions fs
    JOIN users u ON u.id = fs.patient_id
    WHERE fs.form_id = ?
    ORDER BY fs.submitted_at DESC
  `).all(form.id).map((submission) => ({
    ...submission,
    data: parseJSON(submission.data, {}),
  }));

  res.json({ submissions });
});

module.exports = router;
