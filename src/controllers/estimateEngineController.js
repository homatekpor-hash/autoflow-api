const prisma = require("../config/database");
const { notifyEstimateSent } = require("../utils/notifications");

// ─── Currency rates (in production, fetch from a live FX API) ─────────────────
const FX_RATES = { GHS: 1, USD: 0.065, EUR: 0.060, GBP: 0.051 };

// ─── Calculation helpers ───────────────────────────────────────────────────────
function calcTotals(items, taxRate = 0.125, discountType = "pct", discountValue = 0) {
  const subtotal = items.reduce((s, i) => s + Number(i.quantity) * Number(i.rate), 0);
  const discountAmt = discountType === "pct"
    ? subtotal * (Number(discountValue) / 100)
    : Number(discountValue);
  const afterDiscount = Math.max(0, subtotal - discountAmt);
  const tax   = Math.round(afterDiscount * taxRate * 100) / 100;
  const total = Math.round((afterDiscount + tax) * 100) / 100;
  return { subtotal: Math.round(subtotal * 100) / 100, discountAmt: Math.round(discountAmt * 100) / 100, afterDiscount: Math.round(afterDiscount * 100) / 100, tax, total };
}

// ─── GET /api/estimates/job/:jobId ────────────────────────────────────────────
async function getByJob(req, res, next) {
  try {
    const estimate = await prisma.estimate.findUnique({
      where: { jobId: req.params.jobId },
      include: {
        items:    true,
        versions: { orderBy: { version: "desc" } },
        createdBy: { select: { name: true } },
        job: { include: { vehicle: true, workshop: true } },
      },
    });
    if (!estimate) return res.status(404).json({ error: "No estimate for this job" });
    res.json(estimate);
  } catch (err) { next(err); }
}

// ─── POST /api/estimates/job/:jobId ──────────────────────────────────────────
async function create(req, res, next) {
  try {
    const { items, taxRate = 0.125, discountType = "pct", discountValue = 0, currency = "GHS", partialApproval = false } = req.body;
    const existing = await prisma.estimate.findUnique({ where: { jobId: req.params.jobId } });
    if (existing) return res.status(409).json({ error: "Estimate already exists — use PUT to update" });

    const { subtotal, discountAmt, tax, total } = calcTotals(items, taxRate, discountType, discountValue);

    const estimate = await prisma.estimate.create({
      data: {
        jobId:          req.params.jobId,
        subtotal, tax, total,
        taxRate,
        discountType,
        discountValue,
        currency,
        partialApproval,
        createdById: req.user.id,
        items: {
          create: items.map(i => ({
            type:        i.type,
            description: i.description,
            quantity:    Number(i.quantity),
            rate:        Number(i.rate),
            total:       Math.round(Number(i.quantity) * Number(i.rate) * 100) / 100,
          })),
        },
      },
      include: { items: true },
    });

    // Save initial version snapshot
    await prisma.estimateVersion.create({
      data: {
        estimateId: estimate.id,
        version:    1,
        items:      items,
        subtotal, tax, total, currency,
        discountValue: discountAmt,
        status:     "DRAFT",
      },
    });

    res.status(201).json(estimate);
  } catch (err) { next(err); }
}

// ─── PUT /api/estimates/:id ───────────────────────────────────────────────────
async function update(req, res, next) {
  try {
    const { items, taxRate, discountType, discountValue, currency, partialApproval } = req.body;
    const { subtotal, discountAmt, tax, total } = calcTotals(items, taxRate, discountType, discountValue);

    const estimate = await prisma.$transaction(async (tx) => {
      // Delete old items, re-create
      await tx.estimateItem.deleteMany({ where: { estimateId: req.params.id } });
      const current = await tx.estimate.findUnique({ where: { id: req.params.id }, select: { currentVersion: true } });
      const newVersion = (current?.currentVersion || 1) + 1;

      // Save version snapshot
      await tx.estimateVersion.create({
        data: {
          estimateId: req.params.id,
          version:    newVersion,
          items, subtotal, tax, total, currency,
          discountValue: discountAmt,
          status: "DRAFT",
        },
      });

      return tx.estimate.update({
        where: { id: req.params.id },
        data: {
          subtotal, tax, total,
          taxRate:      taxRate      !== undefined ? taxRate      : undefined,
          discountType: discountType !== undefined ? discountType : undefined,
          discountValue: discountValue !== undefined ? discountValue : undefined,
          currency:     currency     !== undefined ? currency     : undefined,
          partialApproval: partialApproval !== undefined ? partialApproval : undefined,
          currentVersion: newVersion,
          status: "DRAFT",
          items: { create: items.map(i => ({
            type: i.type, description: i.description,
            quantity: Number(i.quantity), rate: Number(i.rate),
            total: Math.round(Number(i.quantity) * Number(i.rate) * 100) / 100,
          })) },
        },
        include: { items: true, versions: { orderBy: { version: "desc" } } },
      });
    });

    res.json(estimate);
  } catch (err) { next(err); }
}

// ─── POST /api/estimates/:id/send ─────────────────────────────────────────────
async function send(req, res, next) {
  try {
    const { channels = ["whatsapp"], message } = req.body;

    const estimate = await prisma.estimate.update({
      where: { id: req.params.id },
      data:  { status: "SENT" },
      include: {
        job: {
          include: { vehicle: true, workshop: true },
        },
      },
    });

    // Update version status
    await prisma.estimateVersion.updateMany({
      where: { estimateId: req.params.id, version: estimate.currentVersion },
      data:  { status: "SENT", sentAt: new Date() },
    });

    // Fire notifications per channel (SMS always goes through Twilio; WhatsApp needs WhatsApp Business API)
    if (channels.includes("sms") || channels.includes("whatsapp")) {
      notifyEstimateSent(estimate.job, estimate).catch(console.error);
    }

    res.json({ message: "Estimate sent", channels, estimate });
  } catch (err) { next(err); }
}

// ─── POST /api/estimates/approve/:token  (public) ────────────────────────────
async function approve(req, res, next) {
  try {
    const { approvedItemIds } = req.body; // optional — for partial approval

    const estimate = await prisma.estimate.findUnique({ where: { token: req.params.token } });
    if (!estimate) return res.status(404).json({ error: "Estimate not found" });

    if (approvedItemIds && approvedItemIds.length > 0) {
      // Partial approval — mark specific items
      await prisma.estimate.update({ where: { id: estimate.id }, data: { status: "APPROVED", partialApproval: true } });
      await prisma.estimateVersion.updateMany({
        where: { estimateId: estimate.id, version: estimate.currentVersion },
        data:  { status: "APPROVED" },
      });
      res.json({ message: "Partial approval confirmed", approvedItemIds });
    } else {
      // Full approval
      await prisma.estimate.update({ where: { id: estimate.id }, data: { status: "APPROVED" } });
      await prisma.estimateVersion.updateMany({
        where: { estimateId: estimate.id, version: estimate.currentVersion },
        data:  { status: "APPROVED" },
      });
      res.json({ message: "Estimate fully approved. Work will begin shortly." });
    }
  } catch (err) { next(err); }
}

// ─── POST /api/estimates/reject/:token  (public) ─────────────────────────────
async function reject(req, res, next) {
  try {
    const { reason } = req.body;
    const estimate = await prisma.estimate.findUnique({ where: { token: req.params.token } });
    if (!estimate) return res.status(404).json({ error: "Estimate not found" });

    await prisma.estimate.update({ where: { id: estimate.id }, data: { status: "REJECTED" } });
    await prisma.estimateVersion.updateMany({
      where: { estimateId: estimate.id, version: estimate.currentVersion },
      data:  { status: "REJECTED", note: reason || null },
    });

    if (reason) {
      await prisma.jobStatusHistory.create({
        data: { jobId: estimate.jobId, status: "WAITING_APPROVAL", note: `Customer rejected estimate v${estimate.currentVersion}: ${reason}` },
      });
    }

    res.json({ message: "Estimate rejected. The workshop has been notified." });
  } catch (err) { next(err); }
}

// ─── GET /api/estimates/templates ────────────────────────────────────────────
async function listTemplates(req, res, next) {
  try {
    const workshopId = req.query.workshopId || req.user.workshopId;
    const templates = await prisma.estimateTemplate.findMany({
      where: { OR: [{ isGlobal: true }, { workshopId }] },
      orderBy: { name: "asc" },
    });
    res.json(templates);
  } catch (err) { next(err); }
}

// ─── POST /api/estimates/templates ───────────────────────────────────────────
async function createTemplate(req, res, next) {
  try {
    const { name, description, items, isGlobal } = req.body;
    const template = await prisma.estimateTemplate.create({
      data: {
        name, description,
        items,
        isGlobal: isGlobal && req.user.role === "OWNER" ? true : false,
        workshopId: req.user.workshopId,
      },
    });
    res.status(201).json(template);
  } catch (err) { next(err); }
}

// ─── GET /api/estimates/history?complaint=... ─────────────────────────────────
// Historical cost comparison for AI suggestions
async function getHistory(req, res, next) {
  try {
    const { complaint, workshopId } = req.query;
    const wsId = workshopId || req.user.workshopId;

    // Estimates in this workshop
    const wsEstimates = await prisma.estimate.findMany({
      where: {
        status: { in: ["APPROVED"] },
        job: {
          workshopId: wsId,
          ...(complaint ? { complaint: { contains: complaint, mode: "insensitive" } } : {}),
        },
      },
      select: { total: true },
      take: 50,
      orderBy: { createdAt: "desc" },
    });

    // Network-wide
    const netEstimates = await prisma.estimate.findMany({
      where: {
        status: { in: ["APPROVED"] },
        ...(complaint ? { job: { complaint: { contains: complaint, mode: "insensitive" } } } : {}),
      },
      select: { total: true },
      take: 100,
      orderBy: { createdAt: "desc" },
    });

    function avg(arr) {
      if (!arr.length) return null;
      return Math.round(arr.reduce((s, e) => s + e.total, 0) / arr.length * 100) / 100;
    }

    // Most common repairs (top 10 by complaint frequency)
    const topRepairs = await prisma.job.groupBy({
      by: ["complaint"],
      _count: { id: true },
      where: { estimate: { status: "APPROVED" } },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    });

    res.json({
      workshopAvg: avg(wsEstimates),
      workshopCount: wsEstimates.length,
      networkAvg: avg(netEstimates),
      networkCount: netEstimates.length,
      topRepairs: topRepairs.map(r => ({ complaint: r.complaint, count: r._count.id })),
    });
  } catch (err) { next(err); }
}

// ─── GET /api/estimates/:id/pdf (insurance format) ────────────────────────────
async function getInsurancePdf(req, res, next) {
  try {
    const estimate = await prisma.estimate.findUnique({
      where: { id: req.params.id },
      include: {
        items: true,
        job:   { include: { vehicle: true, workshop: true } },
      },
    });
    if (!estimate) return res.status(404).json({ error: "Not found" });

    const { generateInvoicePdf } = require("../utils/invoicePdf");
    generateInvoicePdf({ ...estimate.job, estimate, invoice: null }, res);
  } catch (err) { next(err); }
}

// ─── GET /api/estimates/fx-rates ─────────────────────────────────────────────
async function getFxRates(req, res) {
  res.json({ base: "GHS", rates: FX_RATES, updatedAt: new Date().toISOString() });
}

module.exports = { getByJob, create, update, send, approve, reject, listTemplates, createTemplate, getHistory, getInsurancePdf, getFxRates };
