const express = require("express");
const { body } = require("express-validator");
const { authenticate } = require("../middleware/auth");
const ctrl = require("../controllers/cxController");

const router = express.Router();

// Photos (staff)
router.get("/jobs/:jobId/photos",     authenticate, ctrl.getPhotos);
router.post("/jobs/:jobId/photos",    authenticate, body("type").notEmpty(), body("url").notEmpty(), ctrl.addPhoto);
router.delete("/photos/:id",          authenticate, ctrl.deletePhoto);

// Surveys (public submission, staff list)
router.get("/jobs/:jobId/survey",     ctrl.getSurvey);
router.post("/jobs/:jobId/survey",    body("npsScore").optional().isInt({ min: 0, max: 10 }), ctrl.submitSurvey);
router.get("/surveys",                authenticate, ctrl.listSurveys);

// Referrals (public lookup, staff generate)
router.get("/referral/rewards",       ctrl.getRewards);
router.get("/referral/:code",         ctrl.getReferralCode);
router.post("/referral/generate",     authenticate, ctrl.generateReferralCode);
router.post("/referral/:code/use",    ctrl.useReferralCode);

// Digital booklet (public)
router.get("/booklet/:plate",         ctrl.getBooklet);

// Analytics (staff)
router.get("/analytics",              authenticate, ctrl.getAnalytics);

module.exports = router;
