const express = require("express");
const { body } = require("express-validator");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const ctrl = require("../controllers/estimateEngineController");

const router = express.Router();

// FX rates (public)
router.get("/fx-rates",                 ctrl.getFxRates);

// Templates
router.get("/templates",                authenticate, ctrl.listTemplates);
router.post("/templates",               authenticate, body("name").notEmpty(), body("items").isArray(), ctrl.createTemplate);

// History / analytics
router.get("/history",                  authenticate, ctrl.getHistory);

// Public approval links (no auth — token-based)
router.post("/approve/:token",          ctrl.approve);
router.post("/reject/:token",           ctrl.reject);

// Per-job estimate
router.get("/job/:jobId",               authenticate, ctrl.getByJob);
router.post("/job/:jobId",              authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER","TECHNICIAN"), body("items").isArray({ min: 1 }), ctrl.create);

// Per-estimate
router.put("/:id",                      authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER","TECHNICIAN"), body("items").isArray({ min: 1 }), ctrl.update);
router.post("/:id/send",                authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), ctrl.send);
router.get("/:id/pdf",                  authenticate, ctrl.getInsurancePdf);

module.exports = router;
