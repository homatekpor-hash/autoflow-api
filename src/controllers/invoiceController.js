const prisma = require("../config/database");

async function create(req, res, next) {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: { estimate: true, workshop: true, invoice: true },
    });
    if (!job) return res.status(404).json({ error: "Job not found" });
    if (job.invoice) return res.status(409).json({ error: "Invoice already exists" });
    if (!job.estimate) return res.status(400).json({ error: "Create an estimate first" });

    const subtotal = Number(job.estimate.total) || 0;
    const tax = Math.round(subtotal * 0.125 * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    const invoice = await prisma.invoice.create({
      data: { jobId: job.id, estimateId: job.estimate.id, subtotal, tax, total, status: "PENDING" },
    });
    await prisma.job.update({ where: { id: job.id }, data: { status: "READY" } });
    res.status(201).json(invoice);
  } catch (err) { next(err); }
}

async function markPaid(req, res, next) {
  try {
    const { paymentMethod = "CASH" } = req.body;
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status: "PAID", paidAt: new Date() },
    });
    await prisma.job.update({ where: { id: invoice.jobId }, data: { status: "DELIVERED", completedAt: new Date() } });
    res.json(invoice);
  } catch (err) { next(err); }
}

async function getByJob(req, res, next) {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { jobId: req.params.id },
      include: { job: { include: { vehicle: true, workshop: true, estimate: { include: { items: true } } } } },
    });
    if (!invoice) return res.status(404).json({ error: "No invoice" });
    res.json(invoice);
  } catch (err) { next(err); }
}

async function list(req, res, next) {
  try {
    const { role, workshopId, id: userId } = req.user;
    let where = {};
    if (role === "OWNER") {
      const ws = await prisma.workshop.findMany({ where: { ownerId: userId }, select: { id: true } });
      where = { job: { workshopId: { in: ws.map(w => w.id) } } };
    } else if (role !== "SUPER_ADMIN" && workshopId) {
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
