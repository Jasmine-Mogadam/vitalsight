const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

async function sendEmail(to, subject, html) {
  const transport = getTransporter();
  if (!transport) {
    console.warn('SMTP not configured, skipping email to', to);
    return { skipped: true };
  }

  return transport.sendMail({
    from: process.env.SMTP_FROM || 'noreply@vitalsight.tech',
    to,
    subject,
    html,
  });
}

module.exports = {
  sendEmail,
};
