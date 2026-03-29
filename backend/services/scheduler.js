const cron = require('node-cron');
const { db, createMessage, parseJSON } = require('../db');
const { sendEmail } = require('./email');

function hourMatches(time, date) {
  if (!time || typeof time !== 'string') return false;
  const [hours] = time.split(':').map(Number);
  return Number.isInteger(hours) && hours === date.getHours();
}

function scheduleMatches(schedule, date) {
  const config = parseJSON(schedule.schedule_config, {});
  const isoDate = date.toISOString().slice(0, 10);

  if (schedule.schedule_type === 'weekly_days') {
    return Array.isArray(config.days) && config.days.includes(date.getDay()) && hourMatches(config.time, date);
  }

  if (schedule.schedule_type === 'monthly_day') {
    return Number(config.day) === date.getDate() && hourMatches(config.time, date);
  }

  if (schedule.schedule_type === 'specific_dates') {
    return Array.isArray(config.dates) && config.dates.includes(isoDate);
  }

  return false;
}

async function runReminderSweep(now = new Date()) {
  const schedules = db.prepare(`
    SELECT fs.*, f.title AS form_title, f.trial_id, t.name AS trial_name
    FROM form_schedules fs
    JOIN forms f ON f.id = fs.form_id
    JOIN trials t ON t.id = f.trial_id
    WHERE t.status = 'active'
  `).all();

  for (const schedule of schedules) {
    if (!scheduleMatches(schedule, now)) continue;

    const patients = db.prepare(`
      SELECT u.id, u.email, u.name, pp.notification_prefs
      FROM trial_enrollments te
      JOIN users u ON u.id = te.patient_id
      LEFT JOIN patient_profiles pp ON pp.user_id = u.id
      WHERE te.trial_id = ? AND te.status = 'approved'
    `).all(schedule.trial_id);

    for (const patient of patients) {
      createMessage({
        recipient_id: patient.id,
        sender_id: null,
        type: 'form_reminder',
        subject: `Time to complete: ${schedule.form_title}`,
        body: `Your ${schedule.trial_name} trial has a scheduled form ready: ${schedule.form_title}.`,
        related_id: schedule.form_id,
      });

      const prefs = parseJSON(patient.notification_prefs, {
        form_reminders: true,
        new_trials: true,
      });

      if (schedule.notify_email && prefs.form_reminders) {
        await sendEmail(
          patient.email,
          `VitalSight reminder: ${schedule.form_title}`,
          `<p>Hello ${patient.name || 'there'},</p><p>Your scheduled form <strong>${schedule.form_title}</strong> is ready in VitalSight.</p>`
        );
      }
    }
  }
}

function startScheduler() {
  cron.schedule('0 * * * *', () => {
    runReminderSweep().catch((error) => {
      console.error('Scheduler error:', error);
    });
  });
}

module.exports = {
  startScheduler,
  runReminderSweep,
};
