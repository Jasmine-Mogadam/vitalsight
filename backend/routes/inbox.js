const express = require('express');
const { db } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize || 20)));
  const offset = (page - 1) * pageSize;

  const items = db.prepare(`
    SELECT m.*, u.name AS sender_name
    FROM messages m
    LEFT JOIN users u ON u.id = m.sender_id
    WHERE m.recipient_id = ?
    ORDER BY m.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, pageSize, offset);

  const total = db.prepare('SELECT COUNT(*) AS count FROM messages WHERE recipient_id = ?').get(req.user.id).count;
  res.json({ items, total, page, pageSize });
});

router.get('/unread-count', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) AS count FROM messages WHERE recipient_id = ? AND read = 0').get(req.user.id).count;
  res.json({ count });
});

router.patch('/:id/read', (req, res) => {
  const result = db.prepare('UPDATE messages SET read = 1 WHERE id = ? AND recipient_id = ?').run(req.params.id, req.user.id);
  if (!result.changes) {
    return res.status(404).json({ error: 'Message not found' });
  }
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM messages WHERE id = ? AND recipient_id = ?').run(req.params.id, req.user.id);
  if (!result.changes) {
    return res.status(404).json({ error: 'Message not found' });
  }
  res.json({ success: true });
});

module.exports = router;
