const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== Baby =====

app.post('/api/babies', (req, res) => {
  const { name, birthday, gender, emoji, userName } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '请输入宝宝的名字' });

  const inviteCode = generateCode();
  const id = uuidv4();

  try {
    db.prepare(`
      INSERT INTO babies (id, name, birthday, gender, emoji, invite_code, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, name.trim(), birthday || null, gender || null, emoji || '👶', inviteCode, new Date().toISOString());

    res.json({ id, name: name.trim(), birthday, gender, emoji: emoji || '👶', invite_code: inviteCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/babies/by-code/:code', (req, res) => {
  const baby = db.prepare('SELECT * FROM babies WHERE invite_code = ?').get(req.params.code.toUpperCase());
  if (!baby) return res.status(404).json({ error: '未找到宝宝档案，请检查邀请码是否正确' });
  res.json(baby);
});

app.get('/api/babies/:id', (req, res) => {
  const baby = db.prepare('SELECT * FROM babies WHERE id = ?').get(req.params.id);
  if (!baby) return res.status(404).json({ error: '未找到宝宝档案' });
  res.json(baby);
});

app.put('/api/babies/:id', (req, res) => {
  const { name, birthday, gender, emoji } = req.body;
  const baby = db.prepare('SELECT * FROM babies WHERE id = ?').get(req.params.id);
  if (!baby) return res.status(404).json({ error: '未找到宝宝档案' });

  db.prepare(`UPDATE babies SET name = ?, birthday = ?, gender = ?, emoji = ? WHERE id = ?`).run(
    name || baby.name,
    birthday !== undefined ? birthday : baby.birthday,
    gender !== undefined ? gender : baby.gender,
    emoji || baby.emoji,
    req.params.id
  );

  res.json(db.prepare('SELECT * FROM babies WHERE id = ?').get(req.params.id));
});

// ===== Records =====

app.get('/api/babies/:babyId/records', (req, res) => {
  const { limit = 200, offset = 0, date, date_from, date_to } = req.query;
  let query = 'SELECT * FROM records WHERE baby_id = ?';
  const params = [req.params.babyId];

  if (date_from && date_to) {
    query += " AND DATE(recorded_at, 'localtime') BETWEEN ? AND ?";
    params.push(date_from, date_to);
  } else if (date) {
    query += " AND DATE(recorded_at, 'localtime') = ?";
    params.push(date);
  }

  query += ' ORDER BY recorded_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const records = db.prepare(query).all(...params);
  records.forEach(r => {
    try { r.data = JSON.parse(r.data); } catch { r.data = {}; }
  });
  res.json(records);
});

app.post('/api/babies/:babyId/records', (req, res) => {
  const { type, data, note, recorded_at, created_by } = req.body;
  if (!type) return res.status(400).json({ error: '请选择记录类型' });

  const id = uuidv4();
  const now = recorded_at || new Date().toISOString();

  try {
    db.prepare(`
      INSERT INTO records (id, baby_id, type, data, note, recorded_at, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.params.babyId, type, JSON.stringify(data || {}), note || null, now, created_by || null, new Date().toISOString());

    const record = db.prepare('SELECT * FROM records WHERE id = ?').get(id);
    try { record.data = JSON.parse(record.data); } catch { record.data = {}; }
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/records/:id', (req, res) => {
  db.prepare('DELETE FROM records WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ===== Stats =====

app.get('/api/babies/:babyId/stats', (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];

  const records = db.prepare(`
    SELECT * FROM records WHERE baby_id = ? AND DATE(recorded_at, 'localtime') = ?
  `).all(req.params.babyId, targetDate);

  const stats = {
    date: targetDate,
    feeding: { count: 0, total_ml: 0, total_minutes: 0 },
    sleep: { count: 0, total_minutes: 0 },
    diaper: { total: 0, wet: 0, dirty: 0 },
  };

  records.forEach(r => {
    let data;
    try { data = JSON.parse(r.data); } catch { data = {}; }

    switch (r.type) {
      case 'breast':
        stats.feeding.count++;
        stats.feeding.total_minutes += data.duration || 0;
        break;
      case 'bottle':
        stats.feeding.count++;
        stats.feeding.total_ml += data.amount || 0;
        stats.feeding.total_minutes += data.duration || 0;
        break;
      case 'solid':
        stats.feeding.count++;
        break;
      case 'sleep':
        stats.sleep.count++;
        stats.sleep.total_minutes += data.duration || 0;
        break;
      case 'diaper':
        stats.diaper.total++;
        if (data.type === 'wet' || data.type === 'both') stats.diaper.wet++;
        if (data.type === 'dirty' || data.type === 'both') stats.diaper.dirty++;
        break;
    }
  });

  res.json(stats);
});

// ===== Timers =====

app.get('/api/babies/:babyId/timers', (req, res) => {
  const timers = db.prepare('SELECT * FROM timers WHERE baby_id = ? AND ended_at IS NULL ORDER BY started_at DESC').all(req.params.babyId);
  res.json(timers);
});

app.post('/api/babies/:babyId/timers', (req, res) => {
  const { type, sub_type, created_by } = req.body;
  const id = uuidv4();
  const now = new Date().toISOString();

  try {
    db.prepare(`INSERT INTO timers (id, baby_id, type, sub_type, started_at, created_by) VALUES (?, ?, ?, ?, ?, ?)`).run(
      id, req.params.babyId, type, sub_type || null, now, created_by || null
    );
    res.json(db.prepare('SELECT * FROM timers WHERE id = ?').get(id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/timers/:id/stop', (req, res) => {
  const timer = db.prepare('SELECT * FROM timers WHERE id = ?').get(req.params.id);
  if (!timer) return res.status(404).json({ error: '计时器不存在' });

  const endedAt = new Date().toISOString();
  db.prepare('UPDATE timers SET ended_at = ? WHERE id = ?').run(endedAt, req.params.id);

  const durationMs = new Date(endedAt) - new Date(timer.started_at);
  const durationMinutes = Math.round(durationMs / 60000);

  res.json({ ...timer, ended_at: endedAt, duration_minutes: durationMinutes });
});

// ===== Helpers =====

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🍼 宝宝日记 运行中: http://localhost:${PORT}`);
});
