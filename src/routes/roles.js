const express = require("express");
const { body } = require("express-validator");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const ctrl = require("../controllers/rolesController");

const router = express.Router();

router.get("/",                 authenticate, ctrl.listRoles);
router.get("/my-permissions",   authenticate, ctrl.myPermissions);
router.get("/assignable",       authenticate, ctrl.assignableRoles);
router.put("/users/:id/role",   authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), body("role").notEmpty(), ctrl.changeRole);

module.exports = router;
