const express = require("express");
const { body } = require("express-validator");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const ctrl = require("../controllers/jobController");
const estCtrl = require("../controllers/estimateController");

const router = express.Router();
router.get("/", authenticate, ctrl.list);
router.get("/:id", authenticate, ctrl.get);
router.put("/:id/status", authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER","TECHNICIAN"), body("status").notEmpty(), ctrl.updateStatus);
router.put("/:id/assign", authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), ctrl.assignTechnician);
router.get("/:id/history", authenticate, ctrl.getHistory);
router.get("/:jobId/estimate", authenticate, estCtrl.get);
router.post("/:jobId/estimate", authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER","TECHNICIAN"), estCtrl.create);
module.exports = router;

// Job notes
router.get("/:id/notes", authenticate, async (req, res, next) => {
  try {
    const notes = await require("../config/database").jobNote.findMany({
      where: { jobId: req.params.id },
      include: { author: { select: { id:true, name:true, role:true } } },
      orderBy: { createdAt: "asc" },
    });
    res.json(notes);
  } catch(err) { next(err); }
});

router.post("/:id/notes", authenticate, async (req, res, next) => {
  try {
    const { content, isInternal } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: "Note content required" });
    const note = await require("../config/database").jobNote.create({
      data: { jobId: req.params.id, authorId: req.user.id, content, isInternal: isInternal||false },
      include: { author: { select: { id:true, name:true, role:true } } },
    });
    res.status(201).json(note);
  } catch(err) { next(err); }
});
