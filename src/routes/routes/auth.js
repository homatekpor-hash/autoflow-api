const express = require("express");
const { body } = require("express-validator");
const { authenticate } = require("../middleware/auth");
const ctrl = require("../controllers/authController");

const router = express.Router();
router.post("/login", body("email").isEmail(), body("password").notEmpty(), ctrl.login);
router.get("/me", authenticate, ctrl.me);
router.post("/change-password", authenticate, body("newPassword").isLength({ min: 8 }), ctrl.changePassword);
module.exports = router;
