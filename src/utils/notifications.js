/**
 * Notification utility — wraps Twilio SMS.
 * In development (TWILIO_ACCOUNT_SID not set), logs to console instead of sending.
 */

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

function isTwilioConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

async function sendSMS(to, body) {
  if (!to) return;

  if (!isTwilioConfigured()) {
    console.log(`[SMS MOCK] To: ${to}\n${body}\n`);
    return;
  }

  const twilio = require("twilio");
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  await client.messages.create({ body, from: process.env.TWILIO_PHONE_NUMBER, to });
}

// ─── Notification templates ────────────────────────────────────────────────

async function notifyCheckinConfirmed(job) {
  const trackingUrl = `${FRONTEND_URL}/track/${job.trackingToken}`;
  const msg =
    `Hi ${job.customerName}, your ${job.vehicle.plate} has been checked in at ${job.workshop.name}.\n` +
    `Job ref: ${job.jobRef}\n` +
    `Track your job live: ${trackingUrl}`;
  await sendSMS(job.customerPhone, msg);
}

async function notifyEstimateSent(job, estimate) {
  const approveUrl = `${FRONTEND_URL}/estimate/${estimate.token}`;
  const msg =
    `Hi ${job.customerName}, your estimate for ${job.vehicle.plate} is ready.\n` +
    `Total: GHS ${estimate.total.toFixed(2)}\n` +
    `Review & approve: ${approveUrl}`;
  await sendSMS(job.customerPhone, msg);
}

async function notifyJobStatusChanged(job, newStatus) {
  const messages = {
    DIAGNOSING:    `Hi ${job.customerName}, we're now diagnosing your ${job.vehicle.plate}. We'll update you soon.`,
    IN_PROGRESS:   `Hi ${job.customerName}, work has started on your ${job.vehicle.plate}. We'll notify you when done.`,
    QUALITY_CHECK: `Hi ${job.customerName}, repairs on your ${job.vehicle.plate} are done — final quality check underway.`,
    COMPLETED:     `Hi ${job.customerName}, your ${job.vehicle.plate} is ready for collection at ${job.workshop.name}! Job ref: ${job.jobRef}`,
  };
  const msg = messages[newStatus];
  if (msg) await sendSMS(job.customerPhone, msg);
}

module.exports = {
  notifyCheckinConfirmed,
  notifyEstimateSent,
  notifyJobStatusChanged,
};
