const express = require("express");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const ctrl = require("../controllers/reportController");

const router = express.Router();
router.get("/revenue", authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), ctrl.revenue);
router.get("/jobs", authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), ctrl.jobs);
router.get("/performance", authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), ctrl.performance);
module.exports = router;

// CSV export
router.get("/export", authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), async (req, res, next) => {
  try {
    const { type = "revenue" } = req.query;
    const invoices = await prisma.invoice.findMany({
      include: { job: { include: { vehicle: true, workshop: true } } },
      orderBy: { createdAt: "desc" },
    });
    const rows = [["Invoice #","Date","Workshop","Customer","Vehicle","Plate","Subtotal","VAT","Total","Status","Payment"]];
    invoices.forEach(inv => {
      rows.push([inv.invoiceNumber, new Date(inv.createdAt).toLocaleDateString("en-GH"), inv.job?.workshop?.name||"", inv.job?.customerName||"", `${inv.job?.vehicle?.make||""} ${inv.job?.vehicle?.model||""}`, inv.job?.vehicle?.plate||"", inv.subtotal, inv.vat, inv.total, inv.status, inv.paymentMethod||""]);
    });
    const csv = rows.map(r => r.join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=autoflow-report-${Date.now()}.csv`);
    res.send(csv);
  } catch(err) { next(err); }
});
