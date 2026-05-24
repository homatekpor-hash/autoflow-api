/**
 * Email notifications via SMTP (Gmail/Mailgun/SendGrid)
 * Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env
 */

async function sendEmail({ to, subject, html }) {
  const SMTP_HOST = process.env.SMTP_HOST;
  const SMTP_USER = process.env.SMTP_USER;
  const SMTP_PASS = process.env.SMTP_PASS;
  const FROM      = process.env.SMTP_FROM || "AutoFlow Ghana <noreply@autoflowghana.com>";

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log(`[Email] Would send to ${to}: ${subject}`);
    return { success: true, simulated: true };
  }

  try {
    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transporter.sendMail({ from: FROM, to, subject, html });
    console.log(`[Email] Sent to ${to}: ${subject}`);
    return { success: true };
  } catch (err) {
    console.error("[Email] Error:", err);
    return { success: false, error: err.message };
  }
}

function invoiceEmailHtml(invoice, job) {
  return `
<!DOCTYPE html>
<html>
<head><style>
  body { font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; }
  .header { background: #f97316; padding: 24px; text-align: center; border-radius: 12px 12px 0 0; }
  .header h1 { color: white; margin: 0; font-size: 24px; }
  .body { background: #f9f9f9; padding: 24px; }
  .card { background: white; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
  .total { font-size: 28px; font-weight: bold; color: #f97316; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; }
  .paid { background: #d1fae5; color: #065f46; }
  .unpaid { background: #fef3c7; color: #92400e; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 8px; text-align: left; border-bottom: 1px solid #eee; }
  th { font-size: 11px; color: #888; text-transform: uppercase; }
  .footer { text-align: center; padding: 16px; color: #888; font-size: 12px; }
</style></head>
<body>
  <div class="header">
    <h1>AutoFlow Ghana</h1>
    <p style="color:rgba(255,255,255,0.8);margin:4px 0 0">${job?.workshop?.name || ""}</p>
  </div>
  <div class="body">
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div>
          <h2 style="margin:0">${invoice.invoiceNumber}</h2>
          <p style="color:#888;margin:4px 0 0;font-size:14px">${new Date(invoice.createdAt).toLocaleDateString("en-GH",{year:"numeric",month:"long",day:"numeric"})}</p>
        </div>
        <span class="badge ${invoice.status==="PAID"?"paid":"unpaid"}">${invoice.status}</span>
      </div>
    </div>
    <div class="card">
      <table>
        <tr><th>Vehicle</th><td>${job?.vehicle?.make} ${job?.vehicle?.model} (${job?.vehicle?.plate})</td></tr>
        <tr><th>Job ref</th><td>${job?.jobRef}</td></tr>
        <tr><th>Customer</th><td>${job?.customerName}</td></tr>
      </table>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>Description</th><th>Qty</th><th>Amount</th></tr></thead>
        <tbody>
          ${(job?.estimate?.items||[]).map(i=>`<tr><td>${i.description}</td><td>${i.quantity}</td><td>GHS ${(i.quantity*(i.rate||i.unitPrice||0)).toLocaleString()}</td></tr>`).join("")}
        </tbody>
      </table>
      <div style="text-align:right;margin-top:12px">
        <p style="margin:4px 0;font-size:14px">Subtotal: GHS ${Number(invoice.subtotal).toLocaleString()}</p>
        <p style="margin:4px 0;font-size:14px">VAT (12.5%): GHS ${Number(invoice.tax).toFixed(2)}</p>
        <p class="total">Total: GHS ${Number(invoice.total).toLocaleString()}</p>
      </div>
    </div>
  </div>
  <div class="footer">
    <p>Thank you for choosing ${job?.workshop?.name}</p>
    <p>Powered by <a href="https://autoflow-web-five.vercel.app" style="color:#f97316">AutoFlow Ghana</a></p>
  </div>
</body>
</html>`;
}

async function sendInvoiceEmail(invoice, job) {
  if (!job?.customerEmail) return { success: false, error: "No customer email" };
  return sendEmail({
    to:      job.customerEmail,
    subject: `Invoice ${invoice.invoiceNumber} from ${job.workshop?.name}`,
    html:    invoiceEmailHtml(invoice, job),
  });
}

module.exports = { sendEmail, sendInvoiceEmail, invoiceEmailHtml };
