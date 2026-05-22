const express = require("express");
const { body } = require("express-validator");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const ctrl = require("../controllers/wipController");

const router = express.Router();

// Board
router.get("/",               authenticate, ctrl.getBoard);
router.get("/analytics",      authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), ctrl.getAnalytics);

// Bays
router.get("/bays",           authenticate, ctrl.getBays);
router.put("/bays/:id/assign",authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), ctrl.assignBay);

// Tasks
router.put("/tasks/:id",      authenticate, ctrl.updateTask);
router.delete("/tasks/:id",   authenticate, ctrl.deleteTask);

// Per-job
router.put("/:id/status",     authenticate, body("status").notEmpty(), ctrl.updateStatus);
router.post("/:id/tasks",     authenticate, body("title").notEmpty(), ctrl.createTask);
router.post("/:id/notes",     authenticate, body("content").notEmpty(), ctrl.addNote);
router.post("/:id/clock-in",  authenticate, ctrl.clockIn);
router.post("/:id/clock-out", authenticate, ctrl.clockOut);
router.post("/:id/pause",     authenticate, ctrl.pauseTimer);
router.post("/:id/resume",    authenticate, ctrl.resumeTimer);

module.exports = router;
