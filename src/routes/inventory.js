const express = require("express");
const { body } = require("express-validator");
const { authenticate } = require("../middleware/auth");
const { requireRole }  = require("../middleware/rbac");
const ctrl = require("../controllers/inventoryController");
const router = express.Router();

const canEdit = requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER","PARTS_MANAGER");

router.get("/parts",            authenticate, ctrl.listParts);
router.post("/parts",           authenticate, canEdit, body("name").notEmpty(), body("sku").notEmpty(), ctrl.createPart);
router.put("/parts/:id",        authenticate, canEdit, ctrl.updatePart);
router.get("/movements",        authenticate, ctrl.listMovements);
router.post("/movements",       authenticate, canEdit, ctrl.createMovement);
router.get("/suppliers",        authenticate, ctrl.listSuppliers);
router.get("/analytics",        authenticate, ctrl.analytics);

module.exports = router;
