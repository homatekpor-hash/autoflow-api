const express = require("express");
const { body } = require("express-validator");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const ctrl = require("../controllers/jobController");
const estCtrl = require("../controllers/estimateController");

const router = express.Router();
router.get("/", authenticate, ctrl.list);
router.get("/:id", authenticate, ctrl.get);
router.put("/:id/status", authenticate, requireRole("OWNER","MANAGER","TECHNICIAN"), body("status").notEmpty(), ctrl.updateStatus);
router.put("/:id/assign", authenticate, requireRole("OWNER","MANAGER"), ctrl.assignTechnician);
router.get("/:id/history", authenticate, ctrl.getHistory);
router.get("/:jobId/estimate", authenticate, estCtrl.get);
router.post("/:jobId/estimate", authenticate, requireRole("OWNER","MANAGER","TECHNICIAN"), estCtrl.create);
module.exports = router;
