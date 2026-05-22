// ─── Auth ─────────────────────────────────────────────────────────────────────
const authRouter = require("express").Router();
const { body } = require("express-validator");
const { authenticate } = require("../middleware/auth");
const authCtrl = require("../controllers/authController");

authRouter.post("/login",
  body("email").isEmail(),
  body("password").notEmpty(),
  authCtrl.login
);
authRouter.get("/me", authenticate, authCtrl.me);
authRouter.post("/change-password",
  authenticate,
  body("newPassword").isLength({ min: 8 }),
  authCtrl.changePassword
);

module.exports.authRoutes = authRouter;


// ─── Workshops ────────────────────────────────────────────────────────────────
const wsRouter = require("express").Router();
const { requireRole, requireWorkshopAccess } = require("../middleware/rbac");
const wsCtrl = require("../controllers/workshopController");

wsRouter.get("/",    authenticate, wsCtrl.list);
wsRouter.get("/:id", authenticate, wsCtrl.get);
wsRouter.post("/",   authenticate, requireRole("OWNER"), body("name").notEmpty(), body("location").notEmpty(), wsCtrl.create);
wsRouter.put("/:id", authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), wsCtrl.update);
wsRouter.get("/:id/qrcode", authenticate, wsCtrl.getQRCode);
wsRouter.get("/:workshopId/jobs", authenticate, requireWorkshopAccess, require("../controllers/jobController").list);

module.exports.workshopRoutes = wsRouter;


// ─── Jobs ─────────────────────────────────────────────────────────────────────
const jobRouter = require("express").Router();
const jobCtrl = require("../controllers/jobController");

jobRouter.get("/",                  authenticate, jobCtrl.list);
jobRouter.get("/:id",               authenticate, jobCtrl.get);
jobRouter.put("/:id/status",        authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER","TECHNICIAN"), body("status").notEmpty(), jobCtrl.updateStatus);
jobRouter.put("/:id/assign",        authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), jobCtrl.assignTechnician);
jobRouter.get("/:id/history",       authenticate, jobCtrl.getHistory);
jobRouter.get("/:jobId/estimate",   authenticate, require("../controllers/estimateController").get);
jobRouter.post("/:jobId/estimate",  authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER","TECHNICIAN"), require("../controllers/estimateController").create);

module.exports.jobRoutes = jobRouter;


// ─── Public check-in ──────────────────────────────────────────────────────────
const ciRouter = require("express").Router();
const ciCtrl = require("../controllers/checkinController");

ciRouter.get("/workshop/:qrToken",        ciCtrl.getWorkshop);
ciRouter.post("/",
  body("qrToken").notEmpty(),
  body("plate").notEmpty(),
  body("mileage").isInt({ min: 0 }),
  body("customerName").notEmpty(),
  body("complaint").notEmpty(),
  ciCtrl.create
);
ciRouter.get("/track/:trackingToken",     ciCtrl.trackJob);

module.exports.checkinRoutes = ciRouter;


// ─── Estimates ────────────────────────────────────────────────────────────────
const estRouter = require("express").Router();
const estCtrl = require("../controllers/estimateController");

estRouter.put("/:id",              authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER","TECHNICIAN"), estCtrl.update);
estRouter.post("/:id/send",        authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER","TECHNICIAN"), estCtrl.send);
estRouter.post("/approve/:token",  estCtrl.approve);   // public
estRouter.post("/reject/:token",   estCtrl.reject);    // public

module.exports.estimateRoutes = estRouter;


// ─── Users ────────────────────────────────────────────────────────────────────
const userRouter = require("express").Router();
const userCtrl = require("../controllers/userController");

userRouter.get("/",         authenticate, userCtrl.list);
userRouter.post("/invite",  authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"),
  body("name").notEmpty(), body("email").isEmail(), body("role").notEmpty(),
  userCtrl.invite
);
userRouter.put("/:id",      authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), userCtrl.update);
userRouter.delete("/:id",   authenticate, requireRole("OWNER"), userCtrl.deactivate);

module.exports.userRoutes = userRouter;


// ─── Reports ──────────────────────────────────────────────────────────────────
const repRouter = require("express").Router();
const repCtrl = require("../controllers/reportController");

repRouter.get("/revenue",     authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), repCtrl.revenue);
repRouter.get("/jobs",        authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), repCtrl.jobs);
repRouter.get("/performance", authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), repCtrl.performance);

module.exports.reportRoutes = repRouter;
