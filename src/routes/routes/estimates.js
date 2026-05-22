const express = require("express");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const ctrl = require("../controllers/estimateController");

const router = express.Router();
router.put("/:id", authenticate, requireRole("OWNER","MANAGER","TECHNICIAN"), ctrl.update);
router.post("/:id/send", authenticate, requireRole("OWNER","MANAGER","TECHNICIAN"), ctrl.send);
router.post("/approve/:token", ctrl.approve);
router.post("/reject/:token", ctrl.reject);
module.exports = router;
