const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'vitalsight.sqlite');
const db = new Database(dbPath);

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('patient','coordinator')),
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS patient_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    date_of_birth TEXT,
    ethnicity TEXT,
    location TEXT,
    conditions TEXT,
    notification_prefs TEXT DEFAULT '{"form_reminders":true,"new_trials":true}'
  );

  CREATE TABLE IF NOT EXISTS coordinator_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    organization TEXT,
    title TEXT
  );

  CREATE TABLE IF NOT EXISTS trials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coordinator_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT,
    type TEXT,
    reward_type TEXT CHECK(reward_type IN ('money','volunteer_hours','none')),
    reward_desc TEXT,
    is_private INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS trial_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trial_id INTEGER NOT NULL REFERENCES trials(id),
    token TEXT UNIQUE NOT NULL,
    uses_remaining INTEGER,
    prefill_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS trial_enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trial_id INTEGER NOT NULL REFERENCES trials(id),
    patient_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','withdrawn')),
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(trial_id, patient_id)
  );

  CREATE TABLE IF NOT EXISTS forms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trial_id INTEGER NOT NULL REFERENCES trials(id),
    title TEXT NOT NULL,
    description TEXT,
    fields TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS form_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    form_id INTEGER NOT NULL REFERENCES forms(id),
    schedule_type TEXT NOT NULL CHECK(schedule_type IN ('weekly_days','monthly_day','specific_dates')),
    schedule_config TEXT NOT NULL,
    notify_email INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS form_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    form_id INTEGER NOT NULL REFERENCES forms(id),
    patient_id INTEGER NOT NULL REFERENCES users(id),
    data TEXT NOT NULL,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_id INTEGER NOT NULL REFERENCES users(id),
    sender_id INTEGER,
    type TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    related_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id, read);
  CREATE INDEX IF NOT EXISTS idx_enrollments_trial ON trial_enrollments(trial_id, status);
  CREATE INDEX IF NOT EXISTS idx_enrollments_patient ON trial_enrollments(patient_id);
  CREATE INDEX IF NOT EXISTS idx_form_submissions_patient ON form_submissions(patient_id, form_id);
`);

const patientProfileColumns = db.prepare("PRAGMA table_info(patient_profiles)").all();
if (patientProfileColumns.some((column) => column.name === 'age')) {
  db.exec('ALTER TABLE patient_profiles DROP COLUMN age');
}

const parseJSON = (value, fallback) => {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeUser = (user) => {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    created_at: user.created_at,
  };
};

const getUserByIdStmt = db.prepare('SELECT * FROM users WHERE id = ?');
const getUserByEmailStmt = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)');
const getPatientProfileStmt = db.prepare('SELECT * FROM patient_profiles WHERE user_id = ?');
const getCoordinatorProfileStmt = db.prepare('SELECT * FROM coordinator_profiles WHERE user_id = ?');
const createUserStmt = db.prepare(`
  INSERT INTO users (email, password_hash, role, name)
  VALUES (@email, @password_hash, @role, @name)
`);
const insertPatientProfileStmt = db.prepare(`
  INSERT INTO patient_profiles (user_id, date_of_birth, ethnicity, location, conditions, notification_prefs)
  VALUES (@user_id, @date_of_birth, @ethnicity, @location, @conditions, @notification_prefs)
`);
const insertCoordinatorProfileStmt = db.prepare(`
  INSERT INTO coordinator_profiles (user_id, organization, title)
  VALUES (@user_id, @organization, @title)
`);
const updatePatientProfileStmt = db.prepare(`
  UPDATE patient_profiles
  SET date_of_birth = @date_of_birth,
      ethnicity = @ethnicity,
      location = @location,
      conditions = @conditions,
      notification_prefs = @notification_prefs
  WHERE user_id = @user_id
`);
const updateCoordinatorProfileStmt = db.prepare(`
  UPDATE coordinator_profiles
  SET organization = @organization,
      title = @title
  WHERE user_id = @user_id
`);
const insertMessageStmt = db.prepare(`
  INSERT INTO messages (recipient_id, sender_id, type, subject, body, related_id)
  VALUES (@recipient_id, @sender_id, @type, @subject, @body, @related_id)
`);

function getUserWithProfile(userId) {
  const user = normalizeUser(getUserByIdStmt.get(userId));
  if (!user) return null;

  if (user.role === 'patient') {
    const profile = getPatientProfileStmt.get(userId);
    return {
      ...user,
      profile: profile
        ? {
            ...profile,
            conditions: parseJSON(profile.conditions, []),
            notification_prefs: parseJSON(profile.notification_prefs, {
              form_reminders: true,
              new_trials: true,
            }),
          }
        : null,
    };
  }

  return {
    ...user,
    profile: getCoordinatorProfileStmt.get(userId) || null,
  };
}

function createUserWithProfile({ email, passwordHash, role, name, profile = {} }) {
  const create = db.transaction(() => {
    const result = createUserStmt.run({
      email: email.trim().toLowerCase(),
      password_hash: passwordHash,
      role,
      name: name.trim(),
    });
    const userId = result.lastInsertRowid;

    if (role === 'patient') {
      insertPatientProfileStmt.run({
        user_id: userId,
        date_of_birth: profile.date_of_birth || null,
        ethnicity: profile.ethnicity || null,
        location: profile.location || null,
        conditions: JSON.stringify(Array.isArray(profile.conditions) ? profile.conditions : []),
        notification_prefs: JSON.stringify({
          form_reminders: true,
          new_trials: true,
          ...(profile.notification_prefs || {}),
        }),
      });
    } else {
      insertCoordinatorProfileStmt.run({
        user_id: userId,
        organization: profile.organization || null,
        title: profile.title || null,
      });
    }

    return userId;
  });

  return getUserWithProfile(create());
}

function updatePatientProfile(userId, updates = {}) {
  const current = getPatientProfileStmt.get(userId);
  const next = {
    date_of_birth: updates.date_of_birth ?? current?.date_of_birth ?? null,
    ethnicity: updates.ethnicity ?? current?.ethnicity ?? null,
    location: updates.location ?? current?.location ?? null,
    conditions: JSON.stringify(
      Array.isArray(updates.conditions) ? updates.conditions : parseJSON(current?.conditions, [])
    ),
    notification_prefs: JSON.stringify({
      form_reminders: true,
      new_trials: true,
      ...parseJSON(current?.notification_prefs, {}),
      ...(updates.notification_prefs || {}),
    }),
    user_id: userId,
  };

  if (current) {
    updatePatientProfileStmt.run(next);
  } else {
    insertPatientProfileStmt.run(next);
  }

  return getUserWithProfile(userId);
}

function updateCoordinatorProfile(userId, updates = {}) {
  const current = getCoordinatorProfileStmt.get(userId);
  const next = {
    organization: updates.organization ?? current?.organization ?? null,
    title: updates.title ?? current?.title ?? null,
    user_id: userId,
  };

  if (current) {
    updateCoordinatorProfileStmt.run(next);
  } else {
    insertCoordinatorProfileStmt.run(next);
  }

  return getUserWithProfile(userId);
}

function createMessage(message) {
  return insertMessageStmt.run({
    recipient_id: message.recipient_id,
    sender_id: message.sender_id ?? null,
    type: message.type,
    subject: message.subject,
    body: message.body,
    related_id: message.related_id ?? null,
  });
}

module.exports = {
  db,
  parseJSON,
  normalizeUser,
  getUserById: (id) => getUserByIdStmt.get(id),
  getUserByEmail: (email) => getUserByEmailStmt.get(email),
  getUserWithProfile,
  createUserWithProfile,
  updatePatientProfile,
  updateCoordinatorProfile,
  createMessage,
};
