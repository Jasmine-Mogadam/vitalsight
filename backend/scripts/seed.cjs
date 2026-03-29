const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const moduleRoot = path.join(projectRoot, 'node_modules', 'better-sqlite3');
const defaultNodeExecPath = process.env.npm_node_execpath || process.execPath;
const localBin = path.join(projectRoot, 'node_modules', '.bin');

function rebuildBetterSqlite3(nodePath) {
  const result = spawnSync('sh', ['-c', 'prebuild-install || node-gyp rebuild --release'], {
    cwd: moduleRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: `${path.dirname(nodePath)}${path.delimiter}${localBin}${path.delimiter}${process.env.PATH || ''}`,
    },
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function canLoadBetterSqlite3(nodePath) {
  const result = spawnSync(
    nodePath,
    ['-e', "const Database=require('better-sqlite3');const db=new Database(':memory:');db.close();"],
    {
      cwd: projectRoot,
      stdio: 'pipe',
      env: process.env,
    }
  );

  return result.status === 0;
}

if (!process.env.VITALSIGHT_SEED_RUNTIME_READY && !canLoadBetterSqlite3(defaultNodeExecPath)) {
  const fallbackNodes = ['/opt/homebrew/bin/node', '/usr/local/bin/node'].filter(
    (candidate) => candidate !== defaultNodeExecPath && fs.existsSync(candidate)
  );
  const matchingNode = fallbackNodes.find(canLoadBetterSqlite3);

  if (matchingNode) {
    const rerun = spawnSync(matchingNode, [__filename], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITALSIGHT_SEED_RUNTIME_READY: '1',
      },
    });

    if (rerun.error) {
      throw rerun.error;
    }

    process.exit(rerun.status ?? 0);
  }

  console.warn('Rebuilding better-sqlite3 for the active Node.js runtime before seeding...');
  rebuildBetterSqlite3(defaultNodeExecPath);
}

function shouldLoadDotenv() {
  return process.env.NODE_ENV !== 'production' && !process.env.FLY_APP_NAME;
}

if (shouldLoadDotenv()) {
  require('dotenv').config({ path: path.join(projectRoot, '.env') });
}

const bcrypt = require('bcryptjs');
const { db, createMessage, createUserWithProfile } = require('../db');

const DEFAULT_PASSWORD = 'SeededPass123!';
const ETHNICITY_OPTIONS = [
  'White',
  'Black or African American',
  'American Indian or Alaska Native',
  'Asian',
  'Native Hawaiian or Other Pacific Islander',
];
const CONDITION_OPTIONS = [
  'Asthma',
  'Diabetes',
  'High blood pressure',
  'Migraines',
  'Sleep apnea',
  'Anxiety',
  'High cholesterol',
  'Arthritis',
  'Hypothyroidism',
  'Anemia',
  'Cannabis use',
  'Tobacco use',
];

function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function timestampOffset(days, hour = 14) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function cycle(array, index, count = 1) {
  return Array.from({ length: count }, (_, offset) => array[(index + offset) % array.length]);
}

function buildPatientProfile(seed, overrides = {}) {
  return {
    date_of_birth: `${1974 + (seed % 24)}-${String((seed % 12) + 1).padStart(2, '0')}-${String(((seed * 3) % 28) + 1).padStart(2, '0')}`,
    ethnicity: cycle(ETHNICITY_OPTIONS, seed, seed % 3 === 0 ? 2 : 1),
    location: overrides.location,
    conditions: overrides.conditions || cycle(CONDITION_OPTIONS, seed, (seed % 3) + 2),
    notification_prefs: {
      form_reminders: seed % 5 !== 0,
      new_trials: seed % 4 !== 0,
    },
  };
}

function clearExistingData() {
  db.transaction(() => {
    db.exec(`
      DELETE FROM messages;
      DELETE FROM form_submissions;
      DELETE FROM form_schedules;
      DELETE FROM forms;
      DELETE FROM trial_enrollments;
      DELETE FROM trial_invites;
      DELETE FROM trials;
      DELETE FROM patient_profiles;
      DELETE FROM coordinator_profiles;
      DELETE FROM users;
      DELETE FROM sqlite_sequence;
    `);
  })();
}

function insertTrial(trial) {
  const result = db.prepare(`
    INSERT INTO trials (
      coordinator_id,
      name,
      description,
      type,
      reward_type,
      reward_desc,
      compensation_type,
      payment_structure,
      compensation_details,
      start_date,
      applications_close_at,
      is_private,
      status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    trial.coordinator_id,
    trial.name,
    trial.description,
    trial.type,
    trial.reward_type || 'none',
    trial.reward_desc || null,
    trial.compensation_type,
    trial.payment_structure || null,
    trial.compensation_details || null,
    trial.start_date || null,
    trial.applications_close_at || null,
    trial.is_private ? 1 : 0,
    trial.status || 'active'
  );

  return Number(result.lastInsertRowid);
}

function insertInvite(invite) {
  const result = db.prepare(`
    INSERT INTO trial_invites (trial_id, token, uses_remaining, prefill_data, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    invite.trial_id,
    invite.token,
    invite.uses_remaining ?? null,
    invite.prefill_data ? JSON.stringify(invite.prefill_data) : null,
    invite.expires_at || null
  );

  return Number(result.lastInsertRowid);
}

function insertEnrollment(enrollment) {
  const result = db.prepare(`
    INSERT INTO trial_enrollments (trial_id, patient_id, status, joined_at)
    VALUES (?, ?, ?, ?)
  `).run(
    enrollment.trial_id,
    enrollment.patient_id,
    enrollment.status,
    enrollment.joined_at || timestampOffset(-Math.floor(Math.random() * 45), 10)
  );

  return Number(result.lastInsertRowid);
}

function insertForm(form) {
  const result = db.prepare(`
    INSERT INTO forms (trial_id, title, description, fields)
    VALUES (?, ?, ?, ?)
  `).run(form.trial_id, form.title, form.description || null, JSON.stringify(form.fields));

  const formId = Number(result.lastInsertRowid);

  for (const schedule of form.schedules || []) {
    db.prepare(`
      INSERT INTO form_schedules (form_id, schedule_type, schedule_config, notify_email)
      VALUES (?, ?, ?, ?)
    `).run(formId, schedule.schedule_type, JSON.stringify(schedule.schedule_config || {}), schedule.notify_email === false ? 0 : 1);
  }

  return formId;
}

function insertSubmission(submission) {
  db.prepare(`
    INSERT INTO form_submissions (form_id, patient_id, data, submitted_at)
    VALUES (?, ?, ?, ?)
  `).run(submission.form_id, submission.patient_id, JSON.stringify(submission.data), submission.submitted_at || timestampOffset(-3, 18));
}

function seed() {
  clearExistingData();

  const passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, 12);

  const coordinators = [
    {
      name: 'Dr. Maya Chen',
      email: 'maya.chen@vitalsight.seed',
      organization: 'North River Research',
      title: 'Lead Clinical Coordinator',
    },
    {
      name: 'Jordan Alvarez',
      email: 'jordan.alvarez@vitalsight.seed',
      organization: 'Beacon Trials Group',
      title: 'Recruitment Program Manager',
    },
    {
      name: 'Priya Desai',
      email: 'priya.desai@vitalsight.seed',
      organization: 'Harborview Neurology Institute',
      title: 'Senior Study Director',
    },
    {
      name: 'Marcus Reed',
      email: 'marcus.reed@vitalsight.seed',
      organization: 'Summit Cardio Lab',
      title: 'Participant Operations Lead',
    },
    {
      name: 'Elena Petrova',
      email: 'elena.petrova@vitalsight.seed',
      organization: 'ClearPath Respiratory Network',
      title: 'Clinical Trial Manager',
    },
  ].map((coordinator) => createUserWithProfile({
    email: coordinator.email,
    passwordHash,
    role: 'coordinator',
    name: coordinator.name,
    profile: {
      organization: coordinator.organization,
      title: coordinator.title,
    },
  }));

  const patients = [
    ['Avery Brooks', 'New York, NY', ['Asthma', 'Anxiety']],
    ['Samira Patel', 'Jersey City, NJ', ['Diabetes', 'High cholesterol']],
    ['Noah Kim', 'Boston, MA', ['Migraines', 'Sleep apnea']],
    ['Lila Santos', 'Philadelphia, PA', ['High blood pressure', 'Arthritis']],
    ['Ethan Walker', 'Atlanta, GA', ['Asthma', 'Tobacco use']],
    ['Grace Nguyen', 'Seattle, WA', ['Hypothyroidism', 'Anemia']],
    ['Omar Hassan', 'Chicago, IL', ['Diabetes', 'High blood pressure']],
    ['Mia Rivera', 'Austin, TX', ['Anxiety', 'Migraines']],
    ['Lucas Bennett', 'Denver, CO', ['High cholesterol', 'Sleep apnea']],
    ['Chloe Foster', 'San Diego, CA', ['Asthma', 'Cannabis use']],
    ['Henry Coleman', 'Raleigh, NC', ['Arthritis', 'High blood pressure']],
    ['Nina Park', 'San Jose, CA', ['Anemia', 'Migraines']],
    ['Isaac Murphy', 'Nashville, TN', ['Sleep apnea', 'High cholesterol']],
    ['Zoe Turner', 'Miami, FL', ['Asthma', 'Anxiety']],
    ['Caleb Price', 'Phoenix, AZ', ['Diabetes', 'High blood pressure']],
    ['Amara Okafor', 'Columbus, OH', ['Hypothyroidism', 'Migraines']],
    ['Julian Scott', 'Portland, OR', ['Arthritis', 'Cannabis use']],
    ['Hannah Lee', 'Minneapolis, MN', ['Asthma', 'Sleep apnea']],
    ['Mateo Flores', 'Dallas, TX', ['High cholesterol', 'Tobacco use']],
    ['Sofia Martinez', 'Baltimore, MD', ['Anxiety', 'High blood pressure']],
  ].map(([name, location, conditions], index) => createUserWithProfile({
    email: `${name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@vitalsight.seed`,
    passwordHash,
    role: 'patient',
    name,
    profile: buildPatientProfile(index + 1, { location, conditions }),
  }));

  const trials = [
    {
      coordinator_id: coordinators[0].id,
      name: 'PulseTrack Hypertension Home Monitoring',
      type: 'Cardiology',
      description: 'A 12-week home blood pressure and symptom tracking study for adults managing stage 1 or stage 2 hypertension. Participants complete guided weekly check-ins, medication adherence logs, and remote vitals sessions from home.',
      compensation_type: 'stipend',
      payment_structure: 'milestone',
      compensation_details: '$40 onboarding stipend, $30 for each completed milestone visit, and a $100 completion bonus for all scheduled check-ins.',
      reward_type: 'money',
      reward_desc: '$40 onboarding stipend, milestone payments, and a completion bonus.',
      start_date: dateOffset(10),
      applications_close_at: dateOffset(45),
      is_private: false,
    },
    {
      coordinator_id: coordinators[1].id,
      name: 'Metabolic Reset Nutrition Trial',
      type: 'Endocrinology',
      description: 'Evaluates a coach-supported nutrition and sleep intervention for adults with prediabetes or type 2 diabetes. The study collects meal consistency, fasting glucose patterns, and weekly lifestyle reflections.',
      compensation_type: 'expense_reimbursement',
      payment_structure: 'lump_sum',
      compensation_details: 'Reimburses transportation, parking, and connected device shipping with up to $250 total support.',
      reward_type: 'money',
      reward_desc: 'Travel and device reimbursement up to $250.',
      start_date: dateOffset(18),
      applications_close_at: dateOffset(32),
      is_private: false,
    },
    {
      coordinator_id: coordinators[2].id,
      name: 'QuietMind Migraine Prevention Registry',
      type: 'Neurology',
      description: 'A longitudinal migraine registry focused on triggers, recovery windows, sleep quality, and workplace disruption. Some participants are invited into an intensive diary cohort with more frequent surveys.',
      compensation_type: 'incentive',
      payment_structure: 'milestone',
      compensation_details: 'Participants earn gift cards after completed monthly diary bundles and specialist follow-up surveys.',
      reward_type: 'volunteer_hours',
      reward_desc: 'Gift cards and recognition after milestone diary submissions.',
      start_date: dateOffset(5),
      applications_close_at: dateOffset(60),
      is_private: true,
    },
    {
      coordinator_id: coordinators[3].id,
      name: 'CardioStep Recovery Aftercare Study',
      type: 'Rehabilitation',
      description: 'Tracks recovery confidence, exercise tolerance, and remote check-ins after recent cardiac procedures. The protocol blends home walking goals, symptom escalation prompts, and coordinator outreach.',
      compensation_type: 'stipend',
      payment_structure: 'lump_sum',
      compensation_details: '$300 total paid at final completion, plus mailed educational materials and transportation support for any onsite visit.',
      reward_type: 'money',
      reward_desc: '$300 at final completion with transportation support.',
      start_date: dateOffset(21),
      applications_close_at: dateOffset(55),
      is_private: false,
    },
    {
      coordinator_id: coordinators[4].id,
      name: 'AirAware Asthma Trigger Mapping',
      type: 'Pulmonology',
      description: 'Studies daily symptom changes, rescue inhaler use, sleep interruptions, and likely environmental triggers for adults with persistent asthma. Includes remote onboarding and targeted flare-up check-ins.',
      compensation_type: 'none',
      payment_structure: null,
      compensation_details: 'No direct payment. Participants receive individualized trigger summaries and education resources after the study.',
      reward_type: 'none',
      reward_desc: 'No monetary compensation.',
      start_date: dateOffset(8),
      applications_close_at: dateOffset(40),
      is_private: true,
    },
  ].map((trial) => ({ ...trial, id: insertTrial({ ...trial, status: 'active' }) }));

  const invites = [
    {
      trial_id: trials[2].id,
      token: 'quietmind-seed-priority',
      uses_remaining: 6,
      prefill_data: { name: patients[7].name, email: patients[7].email },
      expires_at: timestampOffset(45, 23),
    },
    {
      trial_id: trials[2].id,
      token: 'quietmind-seed-open',
      uses_remaining: 12,
      prefill_data: null,
      expires_at: timestampOffset(75, 23),
    },
    {
      trial_id: trials[4].id,
      token: 'airaware-seed-clinic',
      uses_remaining: 8,
      prefill_data: { email: patients[17].email },
      expires_at: timestampOffset(50, 23),
    },
  ];

  invites.forEach(insertInvite);

  const enrollmentMatrix = [
    { trial: 0, patient: 0, status: 'approved' },
    { trial: 0, patient: 1, status: 'approved' },
    { trial: 0, patient: 3, status: 'approved' },
    { trial: 0, patient: 6, status: 'approved' },
    { trial: 0, patient: 10, status: 'pending' },
    { trial: 0, patient: 14, status: 'pending' },
    { trial: 0, patient: 19, status: 'rejected' },

    { trial: 1, patient: 1, status: 'approved' },
    { trial: 1, patient: 5, status: 'approved' },
    { trial: 1, patient: 6, status: 'approved' },
    { trial: 1, patient: 14, status: 'approved' },
    { trial: 1, patient: 15, status: 'pending' },
    { trial: 1, patient: 18, status: 'pending' },
    { trial: 1, patient: 9, status: 'withdrawn' },

    { trial: 2, patient: 2, status: 'approved' },
    { trial: 2, patient: 7, status: 'approved' },
    { trial: 2, patient: 11, status: 'approved' },
    { trial: 2, patient: 15, status: 'approved' },
    { trial: 2, patient: 16, status: 'pending' },
    { trial: 2, patient: 19, status: 'pending' },

    { trial: 3, patient: 3, status: 'approved' },
    { trial: 3, patient: 8, status: 'approved' },
    { trial: 3, patient: 12, status: 'approved' },
    { trial: 3, patient: 18, status: 'approved' },
    { trial: 3, patient: 4, status: 'pending' },
    { trial: 3, patient: 13, status: 'rejected' },

    { trial: 4, patient: 0, status: 'approved' },
    { trial: 4, patient: 4, status: 'approved' },
    { trial: 4, patient: 9, status: 'approved' },
    { trial: 4, patient: 17, status: 'approved' },
    { trial: 4, patient: 13, status: 'pending' },
    { trial: 4, patient: 16, status: 'pending' },
  ];

  const enrollmentIds = [];
  for (const item of enrollmentMatrix) {
    const trial = trials[item.trial];
    const patient = patients[item.patient];
    const enrollmentId = insertEnrollment({
      trial_id: trial.id,
      patient_id: patient.id,
      status: item.status,
      joined_at: timestampOffset(-14 - ((item.trial + item.patient) % 20), 10),
    });

    enrollmentIds.push({ id: enrollmentId, trial, patient, status: item.status });

    createMessage({
      recipient_id: trial.coordinator_id,
      sender_id: patient.id,
      type: 'join_request',
      subject: item.status === 'approved'
        ? `Participant enrolled in ${trial.name}`
        : `Enrollment update for ${trial.name}`,
      body: item.status === 'approved'
        ? `${patient.name} is actively enrolled in this study.`
        : `${patient.name} currently has a ${item.status} enrollment state.`,
      related_id: trial.id,
    });

    if (item.status !== 'pending') {
      createMessage({
        recipient_id: patient.id,
        sender_id: trial.coordinator_id,
        type: 'trial_update',
        subject: `Enrollment ${item.status}: ${trial.name}`,
        body: item.status === 'approved'
          ? `You are approved for ${trial.name}. Your study forms are now available in the dashboard.`
          : `Your status for ${trial.name} is ${item.status}.`,
        related_id: trial.id,
      });
    }
  }

  const forms = [
    {
      trial_id: trials[0].id,
      title: 'Weekly blood pressure check-in',
      description: 'Capture adherence, symptoms, and home cuff readings.',
      fields: [
        { id: 'bp_reading', label: 'Latest blood pressure reading', type: 'text', required: true },
        { id: 'meds_taken', label: 'Did you take all prescribed medications this week?', type: 'dropdown', required: true, options: ['Yes', 'Missed 1 dose', 'Missed 2+ doses'] },
        { id: 'side_effects', label: 'Symptoms or side effects noticed', type: 'textarea', required: false },
        { id: 'activity_days', label: 'Days with 20+ minutes of walking', type: 'number', required: true },
      ],
      schedules: [
        { schedule_type: 'weekly_days', schedule_config: { days: [1, 4], time: '18:30' }, notify_email: true },
      ],
    },
    {
      trial_id: trials[0].id,
      title: 'Onboarding cardiovascular history',
      description: 'Baseline background for the care team before the first virtual visit.',
      fields: [
        { id: 'primary_goal', label: 'Main health goal for joining', type: 'textarea', required: true },
        { id: 'home_monitor_access', label: 'Do you have a home blood pressure cuff?', type: 'dropdown', required: true, options: ['Yes', 'Need one mailed to me'] },
        { id: 'concerns', label: 'Biggest concerns about your blood pressure right now', type: 'multiselect', required: false, options: ['Medication side effects', 'High morning readings', 'Diet consistency', 'Exercise tolerance'] },
      ],
      schedules: [
        { schedule_type: 'specific_dates', schedule_config: { dates: [dateOffset(7)], time: '09:00' }, notify_email: true },
      ],
    },
    {
      trial_id: trials[1].id,
      title: 'Nutrition and sleep reflection',
      description: 'Weekly lifestyle notes for the metabolic coaching team.',
      fields: [
        { id: 'meal_consistency', label: 'How consistent were your meals this week?', type: 'dropdown', required: true, options: ['Very consistent', 'Mostly consistent', 'Mixed', 'Very inconsistent'] },
        { id: 'fasting_glucose', label: 'Average fasting glucose', type: 'number', required: true },
        { id: 'sleep_quality', label: 'How would you rate your sleep?', type: 'dropdown', required: true, options: ['Excellent', 'Good', 'Fair', 'Poor'] },
        { id: 'coaching_notes', label: 'Anything you want your coach to know?', type: 'textarea', required: false },
      ],
      schedules: [
        { schedule_type: 'weekly_days', schedule_config: { days: [0], time: '19:00' }, notify_email: true },
      ],
    },
    {
      trial_id: trials[1].id,
      title: 'Monthly habits checkpoint',
      description: 'A broader monthly survey about confidence, barriers, and support.',
      fields: [
        { id: 'energy_level', label: 'Energy level this month', type: 'dropdown', required: true, options: ['High', 'Steady', 'Variable', 'Low'] },
        { id: 'biggest_barrier', label: 'Biggest barrier to healthy routines', type: 'multiselect', required: true, options: ['Time', 'Cost', 'Stress', 'Family schedule', 'Motivation'] },
        { id: 'support_request', label: 'What support would help next month?', type: 'textarea', required: false },
      ],
      schedules: [
        { schedule_type: 'monthly_day', schedule_config: { day: 5, time: '08:00' }, notify_email: true },
      ],
    },
    {
      trial_id: trials[2].id,
      title: 'Migraine diary bundle',
      description: 'Records frequency, triggers, and recovery time.',
      fields: [
        { id: 'headache_days', label: 'Headache days this week', type: 'number', required: true },
        { id: 'likely_triggers', label: 'Likely triggers', type: 'multiselect', required: false, options: ['Stress', 'Poor sleep', 'Weather', 'Dietary trigger', 'Screen time', 'Hormonal change'] },
        { id: 'rescue_medication', label: 'Rescue medication use', type: 'dropdown', required: true, options: ['None', '1 time', '2-3 times', '4+ times'] },
        { id: 'recovery_notes', label: 'Recovery notes', type: 'textarea', required: false },
      ],
      schedules: [
        { schedule_type: 'weekly_days', schedule_config: { days: [2, 6], time: '20:00' }, notify_email: true },
      ],
    },
    {
      trial_id: trials[3].id,
      title: 'Recovery walk tolerance log',
      description: 'Monitors exercise confidence and symptom escalation after procedures.',
      fields: [
        { id: 'walk_minutes', label: 'Longest walk duration this week (minutes)', type: 'number', required: true },
        { id: 'shortness_breath', label: 'Shortness of breath during activity', type: 'dropdown', required: true, options: ['None', 'Mild', 'Moderate', 'Severe'] },
        { id: 'confidence_level', label: 'How confident do you feel about your recovery plan?', type: 'dropdown', required: true, options: ['Very confident', 'Mostly confident', 'Unsure', 'Concerned'] },
        { id: 'follow_up_questions', label: 'Questions for the coordinator', type: 'textarea', required: false },
      ],
      schedules: [
        { schedule_type: 'weekly_days', schedule_config: { days: [3], time: '17:30' }, notify_email: true },
      ],
    },
    {
      trial_id: trials[4].id,
      title: 'Asthma symptom and trigger scan',
      description: 'Captures flare-ups, rescue inhaler use, and likely environmental triggers.',
      fields: [
        { id: 'symptom_days', label: 'Symptom days this week', type: 'number', required: true },
        { id: 'night_wakings', label: 'Nights interrupted by symptoms', type: 'number', required: true },
        { id: 'trigger_sources', label: 'Likely triggers', type: 'multiselect', required: false, options: ['Pollen', 'Dust', 'Smoke', 'Exercise', 'Cold air', 'Pets'] },
        { id: 'inhaler_use', label: 'Rescue inhaler use', type: 'dropdown', required: true, options: ['None', '1-2 times', '3-5 times', '6+ times'] },
      ],
      schedules: [
        { schedule_type: 'weekly_days', schedule_config: { days: [1], time: '18:00' }, notify_email: true },
        { schedule_type: 'specific_dates', schedule_config: { dates: [dateOffset(14), dateOffset(28)], time: '08:30' }, notify_email: true },
      ],
    },
  ].map((form) => ({ ...form, id: insertForm(form) }));

  const approvedByTrial = new Map();
  for (const entry of enrollmentIds.filter((item) => item.status === 'approved')) {
    const bucket = approvedByTrial.get(entry.trial.id) || [];
    bucket.push(entry.patient);
    approvedByTrial.set(entry.trial.id, bucket);
  }

  const formSubmissions = [
    [forms[0], approvedByTrial.get(trials[0].id)[0], { bp_reading: '128/82', meds_taken: 'Yes', side_effects: 'Mild dizziness on one morning, resolved after breakfast.', activity_days: 5 }],
    [forms[0], approvedByTrial.get(trials[0].id)[1], { bp_reading: '134/86', meds_taken: 'Missed 1 dose', side_effects: 'No notable side effects. Felt more energized this week.', activity_days: 3 }],
    [forms[1], approvedByTrial.get(trials[0].id)[2], { primary_goal: 'Bring morning readings down and stay consistent without missing doses.', home_monitor_access: 'Yes', concerns: ['High morning readings', 'Exercise tolerance'] }],
    [forms[2], approvedByTrial.get(trials[1].id)[0], { meal_consistency: 'Mostly consistent', fasting_glucose: 112, sleep_quality: 'Good', coaching_notes: 'Weekend meals were harder to plan, but breakfast timing improved.' }],
    [forms[2], approvedByTrial.get(trials[1].id)[2], { meal_consistency: 'Mixed', fasting_glucose: 126, sleep_quality: 'Fair', coaching_notes: 'Shift work made sleep uneven for two nights.' }],
    [forms[3], approvedByTrial.get(trials[1].id)[3], { energy_level: 'Variable', biggest_barrier: ['Stress', 'Time'], support_request: 'Would love a simpler backup meal plan for late workdays.' }],
    [forms[4], approvedByTrial.get(trials[2].id)[0], { headache_days: 3, likely_triggers: ['Poor sleep', 'Screen time'], rescue_medication: '2-3 times', recovery_notes: 'Symptoms were strongest after back-to-back work meetings.' }],
    [forms[4], approvedByTrial.get(trials[2].id)[1], { headache_days: 1, likely_triggers: ['Weather'], rescue_medication: '1 time', recovery_notes: 'Hydration helped and recovery was faster than usual.' }],
    [forms[5], approvedByTrial.get(trials[3].id)[1], { walk_minutes: 24, shortness_breath: 'Mild', confidence_level: 'Mostly confident', follow_up_questions: 'Can I increase incline walking next week?' }],
    [forms[5], approvedByTrial.get(trials[3].id)[2], { walk_minutes: 18, shortness_breath: 'Moderate', confidence_level: 'Unsure', follow_up_questions: 'Would like guidance on balancing fatigue with activity goals.' }],
    [forms[6], approvedByTrial.get(trials[4].id)[0], { symptom_days: 2, night_wakings: 1, trigger_sources: ['Pollen', 'Cold air'], inhaler_use: '1-2 times' }],
    [forms[6], approvedByTrial.get(trials[4].id)[2], { symptom_days: 4, night_wakings: 2, trigger_sources: ['Smoke', 'Dust'], inhaler_use: '3-5 times' }],
  ];

  formSubmissions.forEach(([form, patient, data], index) => {
    insertSubmission({
      form_id: form.id,
      patient_id: patient.id,
      data,
      submitted_at: timestampOffset(-(index + 1), 18),
    });
  });

  createMessage({
    recipient_id: coordinators[0].id,
    sender_id: null,
    type: 'trial_update',
    subject: 'Seed data ready for coordinator review',
    body: 'PulseTrack now includes approved participants, pending applications, invite links, and form activity.',
    related_id: trials[0].id,
  });
  createMessage({
    recipient_id: patients[0].id,
    sender_id: coordinators[4].id,
    type: 'trial_update',
    subject: `Welcome to ${trials[4].name}`,
    body: 'Your first symptom survey is scheduled and available in your dashboard.',
    related_id: trials[4].id,
  });
  createMessage({
    recipient_id: patients[7].id,
    sender_id: coordinators[2].id,
    type: 'trial_update',
    subject: `Invite confirmed for ${trials[2].name}`,
    body: 'You joined the diary cohort through a private invite. Expect twice-weekly prompts.',
    related_id: trials[2].id,
  });

  const totalUsers = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  const totalTrials = db.prepare('SELECT COUNT(*) AS count FROM trials').get().count;
  const totalForms = db.prepare('SELECT COUNT(*) AS count FROM forms').get().count;
  const totalEnrollments = db.prepare('SELECT COUNT(*) AS count FROM trial_enrollments').get().count;
  const totalSubmissions = db.prepare('SELECT COUNT(*) AS count FROM form_submissions').get().count;

  console.log(`Seeded ${totalUsers} users, ${totalTrials} trials, ${totalForms} forms, ${totalEnrollments} enrollments, and ${totalSubmissions} form submissions.`);
  console.log(`Shared password for all seeded users: ${DEFAULT_PASSWORD}`);
  console.log('Coordinator logins:');
  coordinators.forEach((coordinator) => {
    console.log(`- ${coordinator.email}`);
  });
  console.log('Sample patient logins:');
  patients.slice(0, 5).forEach((patient) => {
    console.log(`- ${patient.email}`);
  });
}

try {
  seed();
} finally {
  db.close();
}
