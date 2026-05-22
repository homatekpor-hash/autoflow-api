const express = require("express");
const { body } = require("express-validator");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const ctrl = require("../controllers/userController");

const router = express.Router();
router.get("/", authenticate, ctrl.list);
router.post("/invite", authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), body("name").notEmpty(), body("email").isEmail(), body("role").notEmpty(), ctrl.invite);
router.put("/:id", authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), ctrl.update);
module.exports = router;

