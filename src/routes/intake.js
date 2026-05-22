const express = require("express");
const { body } = require("express-validator");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const ctrl = require("../controllers/intakeController");

const router = express.Router();

router.get("/lookup", authenticate, ctrl.lookup);

router.post("/",
  authenticate,
  requireRole("OWNER", "BRANCH_MANAGER", "TECHNICIAN", "SERVICE_ADVISOR"),
  body("workshopId").notEmpty(),
  body("plate").notEmpty(),
  body("mileage").isInt({ min: 0 }),
  body("customerName").notEmpty(),
  body("complaint").notEmpty(),
  ctrl.create
);

module.exports = router;
