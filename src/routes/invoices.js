const express = require("express");
const { authenticate } = require("../middleware/auth");
const { requireRole }  = require("../middleware/rbac");
const ctrl = require("../controllers/invoiceController");
const router = express.Router();

router.get("/",              authenticate, ctrl.list);
router.post("/jobs/:id/invoice",  authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER","SERVICE_ADVISOR"), ctrl.create);
router.get("/jobs/:id/invoice",   authenticate, ctrl.getByJob);
router.put("/invoices/:id/paid",  authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER","CASHIER"), ctrl.markPaid);

module.exports = router;

// Get single invoice by ID
router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const invoice = await require("../config/database").invoice.findUnique({
      where: { id: req.params.id },
      include: { job: { include: { vehicle: true, workshop: true, estimate: { include: { items: true } } } } },
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    res.json(invoice);
  } catch (err) { next(err); }
});
