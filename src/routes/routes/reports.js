const express = require("express");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const ctrl = require("../controllers/reportController");

const router = express.Router();
router.get("/revenue", authenticate, requireRole("OWNER","MANAGER"), ctrl.revenue);
router.get("/jobs", authenticate, requireRole("OWNER","MANAGER"), ctrl.jobs);
router.get("/performance", authenticate, requireRole("OWNER","MANAGER"), ctrl.performance);
module.exports = router;
