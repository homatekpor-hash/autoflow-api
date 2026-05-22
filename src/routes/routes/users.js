const express = require("express");
const { body } = require("express-validator");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const ctrl = require("../controllers/userController");

const router = express.Router();
router.get("/", authenticate, ctrl.list);
router.post("/invite", authenticate, requireRole("OWNER","MANAGER"), body("name").notEmpty(), body("email").isEmail(), body("role").notEmpty(), ctrl.invite);
router.put("/:id", authenticate, requireRole("OWNER","MANAGER"), ctrl.update);
router.delete("/:id", authenticate, requireRole("OWNER"), ctrl.deactivate);
module.exports = router;
