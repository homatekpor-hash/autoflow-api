const express = require("express");
const { body } = require("express-validator");
const { authenticate } = require("../middleware/auth");
const { requireRole, requireWorkshopAccess } = require("../middleware/rbac");
const ctrl = require("../controllers/workshopController");
const jobCtrl = require("../controllers/jobController");

const router = express.Router();
router.get("/", authenticate, ctrl.list);
router.get("/:id", authenticate, ctrl.get);
router.post("/", authenticate, requireRole("OWNER"), body("name").notEmpty(), body("location").notEmpty(), ctrl.create);
router.put("/:id", authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), ctrl.update);
router.get("/:id/qrcode", authenticate, ctrl.getQRCode);
router.get("/:workshopId/jobs", authenticate, requireWorkshopAccess, jobCtrl.list);
module.exports = router;
