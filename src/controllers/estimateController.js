const { validationResult } = require("express-validator");
const prisma = require("../config/database");
const { notifyEstimateSent } = require("../utils/notifications");

function calcTotals(items, taxRate = 0.125) {
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.rate, 0);
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  return { subtotal: Math.round(subtotal * 100) / 100, tax, total };
}

// ─── GET /api/jobs/:jobId/estimate ────────────────────────────────────────────
async function get(req, res, next) {
  try {
    const estimate = await prisma.estimate.findUnique({
      where: { jobId: req.params.jobId },
      include: { items: true, createdBy: { select: { name: true } } },
    });
    if (!estimate) return res.status(404).json({ error: "No estimate for this job" });
    res.json(estimate);
  } catch (err) { next(err); }
}

// ─── POST /api/jobs/:jobId/estimate ──────────────────────────────────────────
async function create(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { items } = req.body;
    const jobId = req.params.jobId;

    // Only one estimate per job
    const existing = await prisma.estimate.findUnique({ where: { jobId } });
    if (existing) return res.status(409).json({ error: "Estimate already exists. Use PUT to update." });

    const { subtotal, tax, total } = calcTotals(items);

    const estimate = await prisma.estimate.create({
      data: {
        jobId,
        subtotal, tax, total,
        createdById: req.user.id,
        items: {
          create: items.map((i) => ({
            type: i.type,
            description: i.description,
            quantity: Number(i.quantity),
            rate: Number(i.rate),
            total: Math.round(Number(i.quantity) * Number(i.rate) * 100) / 100,
          })),
        },
      },
      include: { items: true },
    });
    res.status(201).json(estimate);
  } catch (err) { next(err); }
}

// ─── PUT /api/estimates/:id ───────────────────────────────────────────────────
async function update(req, res, next) {
  try {
    const { items } = req.body;
    const { subtotal, tax, total } = calcTotals(items);

    // Replace all items (delete + re-create is cleanest for line-item editing)
    const estimate = await prisma.$transaction(async (tx) => {
      await tx.estimateItem.deleteMany({ where: { estimateId: req.params.id } });
      return tx.estimate.update({
        where: { id: req.params.id },
        data: {
          subtotal, tax, total,
          items: {
            create: items.map((i) => ({
              type: i.type,
              description: i.description,
              quantity: Number(i.quantity),
              rate: Number(i.rate),
              total: Math.round(Number(i.quantity) * Number(i.rate) * 100) / 100,
            })),
          },
        },
        include: { items: true },
      });
    });
    res.json(estimate);
  } catch (err) { next(err); }
}

// ─── POST /api/estimates/:id/send ─────────────────────────────────────────────
async function send(req, res, next) {
  try {
    const estimate = await prisma.estimate.update({
      where: { id: req.params.id },
      data: { status: "SENT" },
      include: { job: { include: { vehicle: true, workshop: true } } },
    });
    notifyEstimateSent(estimate.job, estimate).catch(console.error);
    res.json(estimate);
  } catch (err) { next(err); }
}

// ─── POST /api/estimates/approve/:token  (public — no auth) ───────────────────
async function approve(req, res, next) {
  try {
    const estimate = await prisma.estimate.findUnique({ where: { token: req.params.token } });
    if (!estimate) return res.status(404).json({ error: "Estimate not found" });
    if (estimate.status === "APPROVED") return res.json({ message: "Already approved" });

    await prisma.estimate.update({ where: { id: estimate.id }, data: { status: "APPROVED" } });
    res.json({ message: "Estimate approved. Work will begin shortly." });
  } catch (err) { next(err); }
}

// ─── POST /api/estimates/reject/:token  (public — no auth) ───────────────────
async function reject(req, res, next) {
  try {
    const { reason } = req.body;
    const estimate = await prisma.estimate.findUnique({ where: { token: req.params.token } });
    if (!estimate) return res.status(404).json({ error: "Estimate not found" });

    await prisma.estimate.update({ where: { id: estimate.id }, data: { status: "REJECTED" } });
    // Optionally log the rejection reason in job history
    if (reason) {
      await prisma.jobStatusHistory.create({
        data: { jobId: estimate.jobId, status: "DIAGNOSING", note: `Customer rejected estimate: ${reason}` },
      });
    }
    res.json({ message: "Estimate rejected. The workshop has been notified." });
  } catch (err) { next(err); }
}

module.exports = { get, create, update, send, approve, reject };
