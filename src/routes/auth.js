const express = require("express");
const { body } = require("express-validator");
const { authenticate } = require("../middleware/auth");
const ctrl = require("../controllers/authController");

const router = express.Router();
router.post("/login", body("email").isEmail(), body("password").notEmpty(), ctrl.login);
router.get("/me", authenticate, ctrl.me);
router.post("/change-password", authenticate, body("newPassword").isLength({ min: 8 }), ctrl.changePassword);
module.exports = router;

// Change password
router.post("/change-password", authenticate, async (req, res, next) => {
  try {
    const bcrypt = require("bcryptjs");
    const { oldPassword, newPassword } = req.body;
    const user = await require("../config/database").user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) return res.status(400).json({ error: "Current password is incorrect" });
    const hash = await bcrypt.hash(newPassword, 12);
    await require("../config/database").user.update({ where: { id: req.user.id }, data: { passwordHash: hash } });
    res.json({ success: true });
  } catch (err) { next(err); }
});
