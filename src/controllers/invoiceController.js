const { sendInvoiceEmail } = require("../utils/email");
const prisma = require("../config/database");

async function create(req, res, next) {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: {
        estimate: { include: { items: true } },
        vehicle: true,
        workshop: true,
        invoice: true,
      },
    });
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.invoice) return res.status(409).json({ error: "Invoice already exists" });
    if (!job.estimate) return res.status(400).json({ error: "No estimate found. Create an estimate first." });

    const subtotal = Number(job.estimate.total) || 0;
    const vatRate  = 0.125;
    const vat      = Math.round(subtotal * vatRate * 100) / 100;
    const total    = Math.round((subtotal + vat) * 100) / 100;

    const count  = await prisma.invoice.count({ where: { job: { workshopId: job.workshopId } } });
    const prefix = job.workshop?.name?.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,3) || "AUT";
    const invNum = `INV-${prefix}-${String(count+1).padStart(4,"0")}`;

    const invoice = await prisma.invoice.create({
      data: { jobId: job.id, estimateId: job.estimate.id, invoiceNumber: invNum, subtotal, tax: vat, total, status: "PENDING" },
    });

    await prisma.job.update({ where: { id: job.id }, data: { status: "READY" } });
    res.status(201).json(invoice);
  } catch (err) { next(err); }
}

async function markPaid(req, res, next) {
  try {
    const { paymentMethod = "CASH", amountPaid } = req.body;
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status: "PAID", paidAt: new Date(), paymentMethod, amountPaid: amountPaid || undefined },
    });
    const fullJob = await prisma.job.findUnique({ where: { id: invoice.jobId }, include: { vehicle: true, workshop: true, estimate: { include: { items: true } } } });
    await prisma.job.update({ where: { id: invoice.jobId }, data: { status: "DELIVERED", completedAt: new Date() } });
    // Send invoice email
    try { sendInvoiceEmail(invoice, fullJob).catch(()=>{}); } catch {}
    res.json(invoice);
  } catch (err) { next(err); }
}

async function getByJob(req, res, next) {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { jobId: req.params.id },
      include: { job: { include: { vehicle: true, workshop: true, estimate: { include: { items: true } } } } },
    });
    if (!invoice) return res.status(404).json({ error: "No invoice for this job" });
    res.json(invoice);
  } catch (err) { next(err); }
}

async function list(req, res, next) {
  try {
    const { role, workshopId, id: userId } = req.user;
    let where = {};
    if (role === "SUPER_ADMIN") where = {};
    else if (role === "OWNER") {
      const ws = await prisma.workshop.findMany({ where: { ownerId: userId }, select: { id: true } });
      where = { job: { workshopId: { in: ws.map(w=>w.id) } } };
    } else if (workshopId) {
      where = { job: { workshopId } };
    }
    const invoices = await prisma.invoice.findMany({
      where, orderBy: { createdAt: "desc" },
      include: { job: { select: { jobRef: true, customerName: true, vehicle: { select: { plate: true, make: true, model: true } }, workshop: { select: { name: true } } } } },
    });
    res.json(invoices);
  } catch (err) { next(err); }
}

module.exports = { create, markPaid, getByJob, list };



