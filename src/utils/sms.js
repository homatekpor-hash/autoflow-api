/**
 * Arkesel SMS — Ghana SMS provider
 * Docs: https://developers.arkesel.com
 */

const ARKESEL_KEY = process.env.ARKESEL_API_KEY;
const SENDER_ID   = process.env.ARKESEL_SENDER_ID || "AutoFlow";

const STATUS_MESSAGES = {
  RECEIVED:         "Your vehicle has been received at {workshop}. Job ref: {jobRef}. We'll keep you updated.",
  DIAGNOSING:       "Our technician is diagnosing your {vehicle}. Job ref: {jobRef}. We'll update you soon.",
  WAITING_APPROVAL: "Estimate ready for your {vehicle}. Total: GHS {amount}. Job ref: {jobRef}. Call us to approve.",
  WAITING_PARTS:    "We're sourcing parts for your {vehicle}. Job ref: {jobRef}. We'll notify you when work begins.",
  IN_PROGRESS:      "Work has started on your {vehicle}. Job ref: {jobRef}.",
  QC:               "Quality check in progress for your {vehicle}. Almost done! Job ref: {jobRef}.",
  READY:            "Great news! Your {vehicle} is READY for pickup at {workshop}. Job ref: {jobRef}.",
  DELIVERED:        "Thank you for choosing {workshop}! Your {vehicle} has been delivered. We hope to see you again!",
  CANCELLED:        "Your job {jobRef} has been cancelled. Please contact {workshop} for more information.",
};

function buildMessage(status, data) {
  const template = STATUS_MESSAGES[status] || "Your job {jobRef} status has been updated to {status}.";
  return template
    .replace(/{workshop}/g, data.workshopName || "our workshop")
    .replace(/{vehicle}/g,  data.vehicleName  || "your vehicle")
    .replace(/{jobRef}/g,   data.jobRef       || "")
    .replace(/{amount}/g,   data.amount       || "")
    .replace(/{status}/g,   status);
}

function formatPhone(phone) {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("233")) return cleaned;
  if (cleaned.startsWith("0"))   return "233" + cleaned.slice(1);
  return "233" + cleaned;
}

async function sendSMS(phone, message) {
  const intlPhone = formatPhone(phone);
  if (!intlPhone) return { success: false, error: "Invalid phone" };

  if (!ARKESEL_KEY) {
    console.log(`[SMS] Would send to ${intlPhone}: ${message}`);
    return { success: true, simulated: true };
  }

  try {
    const res = await fetch("https://sms.arkesel.com/api/v2/sms/send", {
      method: "POST",
      headers: { "api-key": ARKESEL_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ sender: SENDER_ID, message, recipients: [intlPhone] }),
    });
    const data = await res.json();
    console.log(`[SMS] Sent to ${intlPhone}:`, data);
    return { success: res.ok, data };
  } catch (err) {
    console.error("[SMS] Error:", err);
    return { success: false, error: err.message };
  }
}

async function notifyJobStatus(job, status) {
  if (!job.customerPhone) return;
  const message = buildMessage(status, {
    workshopName: job.workshop?.name,
    vehicleName:  job.vehicle ? `${job.vehicle.make} ${job.vehicle.model} (${job.vehicle.plate})` : "your vehicle",
    jobRef:       job.jobRef,
    amount:       job.estimate?.total ? Number(job.estimate.total).toLocaleString() : "",
  });
  return sendSMS(job.customerPhone, message);
}

module.exports = { sendSMS, notifyJobStatus, buildMessage, formatPhone };
