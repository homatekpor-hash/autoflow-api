/**
 * WhatsApp notifications via wa.me links
 * In production, replace with Twilio/WhatsApp Business API
 */

const STATUS_MESSAGES = {
  RECEIVED:         "✅ Your vehicle has been received at {workshop}. Job ref: {jobRef}",
  DIAGNOSING:       "🔍 Our technician is diagnosing your {vehicle}. We'll update you soon. Ref: {jobRef}",
  WAITING_APPROVAL: "📋 Your estimate is ready for {vehicle}. Total: GHS {amount}. Please reply to approve. Ref: {jobRef}",
  WAITING_PARTS:    "⏳ We're waiting for parts for your {vehicle}. We'll notify you when work begins. Ref: {jobRef}",
  IN_PROGRESS:      "🔧 Work has started on your {vehicle}. Ref: {jobRef}",
  QC:               "✨ Quality check in progress for your {vehicle}. Almost done! Ref: {jobRef}",
  READY:            "🎉 Your {vehicle} is ready for pickup at {workshop}! Ref: {jobRef}",
  DELIVERED:        "👍 Thank you for choosing {workshop}! Your {vehicle} has been delivered. We hope to see you again!",
};

function buildMessage(status, data) {
  const template = STATUS_MESSAGES[status] || "Your job status has been updated to {status}. Ref: {jobRef}";
  return template
    .replace("{workshop}", data.workshopName || "our workshop")
    .replace("{vehicle}",  data.vehicleName  || "your vehicle")
    .replace("{jobRef}",   data.jobRef        || "")
    .replace("{amount}",   data.amount        || "")
    .replace("{status}",   status);
}

function buildWhatsAppLink(phone, message) {
  const cleaned = phone.replace(/\D/g, "");
  const intl    = cleaned.startsWith("0") ? "233" + cleaned.slice(1) : cleaned;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}

async function notifyJobStatusChanged(job, status) {
  if (!job.customerPhone) return;
  const message = buildMessage(status, {
    workshopName: job.workshop?.name,
    vehicleName:  job.vehicle ? `${job.vehicle.make} ${job.vehicle.model} (${job.vehicle.plate})` : "your vehicle",
    jobRef:       job.jobRef,
    amount:       job.estimate?.total ? `${job.estimate.total.toLocaleString()}` : "",
  });
  // Log for now — in production call WhatsApp Business API here
  console.log(`[WhatsApp] To: ${job.customerPhone}`);
  console.log(`[WhatsApp] Message: ${message}`);
  console.log(`[WhatsApp] Link: ${buildWhatsAppLink(job.customerPhone, message)}`);
  return { message, link: buildWhatsAppLink(job.customerPhone, message) };
}

module.exports = { notifyJobStatusChanged, buildMessage, buildWhatsAppLink };
