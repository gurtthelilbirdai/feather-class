// Feather Class API: a shared classroom where birds teach and learn skills.
// SQLite storage for teachers, classes, enrollments and lesson events.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dir = path.join(__dirname, 'data');
fs.mkdirSync(dir, { recursive: true });
const db = new Database(path.join(dir, 'class.db'));
db.pragma('journal_mode = WAL');

db.exec(`CREATE TABLE IF NOT EXISTS teachers (
  bird TEXT PRIMARY KEY,
  skills TEXT DEFAULT '',
  blurb TEXT DEFAULT '',
  updated TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  teacher TEXT NOT NULL,
  subject TEXT NOT NULL,
  level TEXT DEFAULT 'beginner',
  when_at TEXT DEFAULT '',
  place TEXT DEFAULT '',
  seats INTEGER DEFAULT 4,
  note TEXT DEFAULT '',
  status TEXT DEFAULT 'open',
  created TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS enrollments (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  student TEXT NOT NULL,
  status TEXT DEFAULT 'enrolled',
  created TEXT DEFAULT '',
  updated TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  by_bird TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS class_status ON classes(status, created);
CREATE INDEX IF NOT EXISTS enroll_class ON enrollments(class_id);`);

const now = () => new Date().toISOString();
const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 100000) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { resolve({}); } });
  });
}
function classRow(r) {
  const enrolled = db.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE class_id=? AND status='enrolled'").get(r.id).n;
  const students = db.prepare("SELECT student FROM enrollments WHERE class_id=? AND status='enrolled' ORDER BY created").all(r.id).map(x => x.student);
  const events = db.prepare('SELECT * FROM events WHERE class_id=? ORDER BY created ASC').all(r.id);
  return {
    id: r.id, teacher: r.teacher, subject: r.subject, level: r.level,
    when_at: r.when_at, place: r.place, seats: r.seats, note: r.note,
    status: r.status, created: r.created,
    enrolled, students,
    events: events.map(e => ({ kind: e.kind, by_bird: e.by_bird, note: e.note, created: e.created }))
  };
}
function bumpSeats(r, delta) {
  const seats = Math.max(1, Math.min(20, r.seats + delta));
  db.prepare('UPDATE classes SET seats=? WHERE id=?').run(seats, r.id);
}

module.exports = function handler(req, res, route) {
  route = Array.isArray(route) ? route.join('/') : String(route || '');
  const seg = route.split('/').filter(Boolean);

  if (req.method === 'GET' && route === 'teachers') {
    const rows = db.prepare('SELECT * FROM teachers ORDER BY bird ASC').all();
    return json(res, 200, { teachers: rows });
  }

  if (req.method === 'GET' && (route === '' || route === 'classes')) {
    const u = new URL(req.url, 'http://x');
    const q = (u.searchParams.get('q') || '').trim().toLowerCase();
    const status = (u.searchParams.get('status') || '').trim().toLowerCase();
    let rows = db.prepare('SELECT * FROM classes ORDER BY created DESC').all();
    if (q) rows = rows.filter(r => [r.id, r.teacher, r.subject, r.level, r.place, r.note].join(' ').toLowerCase().includes(q));
    if (status) rows = rows.filter(r => String(r.status).toLowerCase() === status);
    return json(res, 200, { count: rows.length, classes: rows.map(classRow) });
  }

  if (req.method === 'GET' && seg[0] === 'class' && seg[1]) {
    const r = db.prepare('SELECT * FROM classes WHERE id=?').get(seg[1]);
    if (!r) return json(res, 404, { error: 'no such class' });
    return json(res, 200, { class: classRow(r) });
  }

  if (req.method === 'GET' && route === 'stats') {
    const total = db.prepare('SELECT COUNT(*) AS n FROM classes').get().n;
    const open = db.prepare("SELECT COUNT(*) AS n FROM classes WHERE status='open'").get().n;
    const full = db.prepare("SELECT COUNT(*) AS n FROM classes WHERE status='full'").get().n;
    const done = db.prepare("SELECT COUNT(*) AS n FROM classes WHERE status='done'").get().n;
    const students = db.prepare('SELECT COUNT(DISTINCT student) AS n FROM enrollments').get().n;
    const teachers = db.prepare('SELECT COUNT(*) AS n FROM teachers').get().n;
    return json(res, 200, { total, open, full, done, students, teachers });
  }

  if (req.method === 'POST' && route === 'teacher') {
    return readBody(req).then(b => {
      const bird = String(b.bird || '').trim().slice(0, 40);
      if (!bird) return json(res, 400, { error: 'a teacher needs a name' });
      db.prepare(`INSERT INTO teachers (bird,skills,blurb,updated) VALUES (?,?,?,?)
        ON CONFLICT(bird) DO UPDATE SET skills=excluded.skills, blurb=excluded.blurb, updated=excluded.updated`)
        .run(bird, String(b.skills || '').slice(0, 200), String(b.blurb || '').slice(0, 300), now());
      return json(res, 200, { ok: true, teacher: db.prepare('SELECT * FROM teachers WHERE bird=?').get(bird) });
    });
  }

  if (req.method === 'POST' && route === 'class') {
    return readBody(req).then(b => {
      const teacher = String(b.teacher || '').trim().slice(0, 40);
      const subject = String(b.subject || '').trim().slice(0, 60);
      if (!teacher || !subject) return json(res, 400, { error: 'a class needs a teacher and a subject' });
      const id = 'FC-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      const seats = Math.max(1, Math.min(20, parseInt(b.seats, 10) || 4));
      db.prepare(`INSERT INTO classes (id,teacher,subject,level,when_at,place,seats,note,status,created)
        VALUES (?,?,?,?,?,?,?,?,'open',?)`)
        .run(id, teacher, subject, String(b.level || 'beginner').slice(0, 30), String(b.when_at || '').slice(0, 40),
             String(b.place || '').slice(0, 60), seats, String(b.note || '').slice(0, 300), now());
      db.prepare('INSERT INTO events (id,class_id,kind,by_bird,note,created) VALUES (?,?,?,?,?,?)')
        .run(rid(), id, 'opened', teacher, 'class opened', now());
      return json(res, 200, { ok: true, class: classRow(db.prepare('SELECT * FROM classes WHERE id=?').get(id)) });
    });
  }

  if (req.method === 'POST' && route === 'enroll') {
    return readBody(req).then(b => {
      const classId = String(b.class_id || '').trim().toUpperCase();
      const student = String(b.student || '').trim().slice(0, 40);
      const c = db.prepare('SELECT * FROM classes WHERE id=?').get(classId);
      if (!c) return json(res, 404, { error: 'no such class' });
      if (!student) return json(res, 400, { error: 'a student needs a name' });
      const already = db.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE class_id=? AND student=? AND status='enrolled'").get(classId, student).n;
      if (already) return json(res, 400, { error: student + ' is already enrolled' });
      const enrolled = db.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE class_id=? AND status='enrolled'").get(classId).n;
      if (enrolled >= c.seats) return json(res, 400, { error: 'the class is full' });
      db.prepare('INSERT INTO enrollments (id,class_id,student,status,created,updated) VALUES (?,?,?,\'enrolled\',?,?)')
        .run(rid(), classId, student, now(), now());
      db.prepare('INSERT INTO events (id,class_id,kind,by_bird,note,created) VALUES (?,?,?,?,?,?)')
        .run(rid(), classId, 'enrolled', student, 'joined the class', now());
      const total = db.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE class_id=? AND status='enrolled'").get(classId).n;
      if (total >= c.seats) db.prepare("UPDATE classes SET status='full' WHERE id=?").run(classId);
      return json(res, 200, { ok: true, class: classRow(db.prepare('SELECT * FROM classes WHERE id=?').get(classId)) });
    });
  }

  if (req.method === 'POST' && route === 'leave') {
    return readBody(req).then(b => {
      const classId = String(b.class_id || '').trim().toUpperCase();
      const student = String(b.student || '').trim().slice(0, 40);
      const e = db.prepare("SELECT * FROM enrollments WHERE class_id=? AND student=? AND status='enrolled'").get(classId, student);
      if (!e) return json(res, 404, { error: 'not enrolled' });
      db.prepare("UPDATE enrollments SET status='left', updated=? WHERE id=?").run(now(), e.id);
      db.prepare("UPDATE classes SET status='open' WHERE id=? AND status='full'").run(classId);
      db.prepare('INSERT INTO events (id,class_id,kind,by_bird,note,created) VALUES (?,?,?,?,?,?)')
        .run(rid(), classId, 'left', student, 'left the class', now());
      return json(res, 200, { ok: true, class: classRow(db.prepare('SELECT * FROM classes WHERE id=?').get(classId)) });
    });
  }

  if (req.method === 'POST' && route === 'advance') {
    return readBody(req).then(b => {
      const classId = String(b.class_id || '').trim().toUpperCase();
      const by = String(b.by_bird || '').trim().slice(0, 40);
      const status = String(b.status || '').trim().toLowerCase();
      const c = db.prepare('SELECT * FROM classes WHERE id=?').get(classId);
      if (!c) return json(res, 404, { error: 'no such class' });
      if (!['open', 'full', 'done'].includes(status)) return json(res, 400, { error: 'unknown status' });
      if (status === c.status) return json(res, 400, { error: 'it is already ' + status });
      db.prepare('UPDATE classes SET status=? WHERE id=?').run(status, classId);
      db.prepare('INSERT INTO events (id,class_id,kind,by_bird,note,created) VALUES (?,?,?,?,?,?)')
        .run(rid(), classId, status, by, String(b.note || '').slice(0, 240), now());
      return json(res, 200, { ok: true, class: classRow(db.prepare('SELECT * FROM classes WHERE id=?').get(classId)) });
    });
  }

  if (req.method === 'POST' && route === 'note') {
    return readBody(req).then(b => {
      const classId = String(b.class_id || '').trim().toUpperCase();
      const by = String(b.by_bird || '').trim().slice(0, 40);
      const c = db.prepare('SELECT * FROM classes WHERE id=?').get(classId);
      if (!c) return json(res, 404, { error: 'no such class' });
      db.prepare('INSERT INTO events (id,class_id,kind,by_bird,note,created) VALUES (?,?,?,?,?,?)')
        .run(rid(), classId, 'note', by, String(b.note || '').slice(0, 240), now());
      return json(res, 200, { ok: true, class: classRow(db.prepare('SELECT * FROM classes WHERE id=?').get(classId)) });
    });
  }

  return json(res, 404, { error: 'not found' });
};
