const express = require("express");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const ctrl = require("../controllers/reportController");
const prisma = require("../config/database");
const router = express.Router();

router.get("/revenue",     authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), ctrl.revenue);
router.get("/jobs",        authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), ctrl.jobs);
router.get("/performance", authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), ctrl.performance);

router.get("/export", authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), async (req, res, next) => {
  try {
    const invoices = await prisma.invoice.findMany({
      include: { job: { include: { vehicle: true, workshop: true } } },
      orderBy: { createdAt: "desc" },
    });
    const rows = [["Date","Workshop","Customer","Vehicle","Plate","Subtotal","Tax","Total","Status"]];
    invoices.forEach(inv => {
      rows.push([
        new Date(inv.createdAt).toLocaleDateString("en-GH"),
        inv.job?.workshop?.name||"",
        inv.job?.customerName||"",
        `${inv.job?.vehicle?.make||""} ${inv.job?.vehicle?.model||""}`,
        inv.job?.vehicle?.plate||"",
        inv.subtotal, inv.tax, inv.total, inv.status
      ]);
    });
    const csv = rows.map(r => r.join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=autoflow-${Date.now()}.csv`);
    res.send(csv);
  } catch(err) { next(err); }
});

router.get("/backup", authenticate, requireRole("SUPER_ADMIN","OWNER"), async (req, res, next) => {
  try {
    const { role, id: userId } = req.user;
    let wsFilter = {};
    if (role === "OWNER") {
      const ws = await prisma.workshop.findMany({ where: { ownerId: userId }, select: { id: true } });
      wsFilter = { workshopId: { in: ws.map(w => w.id) } };
    }
    const [jobs, invoices, parts] = await Promise.all([
      prisma.job.findMany({ where: wsFilter, include: { vehicle: true, workshop: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
      prisma.invoice.findMany({ where: { job: wsFilter }, include: { job: { select: { jobRef: true, customerName: true } } }, orderBy: { createdAt: "desc" } }),
      prisma.part.findMany({ where: wsFilter }),
    ]);
    res.json({ exportedAt: new Date().toISOString(), jobs: jobs.length, invoices: invoices.length, parts: parts.length, data: { jobs, invoices, parts } });
  } catch(err) { next(err); }
});

module.exports = router;
