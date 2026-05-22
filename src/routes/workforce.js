const express = require("express");
const { body } = require("express-validator");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const ctrl = require("../controllers/workforceController");

const router = express.Router();

router.get("/technicians",                   authenticate, ctrl.listTechnicians);
router.get("/technicians/:id",               authenticate, ctrl.getTechnician);
router.put("/technicians/:id/profile",       authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), ctrl.updateProfile);

router.post("/attendance/clock-in",          authenticate, ctrl.clockIn);
router.post("/attendance/clock-out",         authenticate, ctrl.clockOut);
router.get("/schedule",                      authenticate, ctrl.getSchedule);

router.get("/performance",                   authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), ctrl.getPerformance);
router.get("/commissions",                   authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), ctrl.getCommissions);
router.post("/commissions/calculate",        authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), ctrl.calculateCommissions);

router.get("/leaderboard",                   authenticate, ctrl.getLeaderboard);

router.get("/training",                      authenticate, ctrl.getTraining);
router.post("/training",                     authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), body("profileId").notEmpty(), body("name").notEmpty(), ctrl.createTraining);
router.post("/training/:id/complete",        authenticate, ctrl.completeTraining);

router.get("/match-skills",                  authenticate, ctrl.matchSkills);

module.exports = router;
