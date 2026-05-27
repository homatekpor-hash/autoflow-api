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

// Public job tracker - no auth required
router.get("/track/:jobRef", async (req, res, next) => {
  try {
    const job = await prisma.job.findFirst({
      where: { jobRef: req.params.jobRef.toUpperCase() },
      select: {
        id:true, jobRef:true, status:true, customerName:true,
        vehicle: { select: { make:true, model:true, plate:true, year:true } },
        workshop: { select: { name:true, location:true, phone:true } },
        createdAt:true, updatedAt:true,
      },
    });
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  } catch (err) { next(err); }
});

// Assign technician
router.put("/:id/assign", authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER","SERVICE_ADVISOR"), async (req, res, next) => {
  try {
    const { technicianId } = req.body;
    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: { technicianId: technicianId || null },
      include: { technician: { select: { id:true, name:true } } },
    });
    res.json(job);
  } catch(err) { next(err); }
});

// Customer rating submission (public)
router.post("/:id/rate", async (req, res, next) => {
  try {
    const { score, comment } = req.body;
    if (!score || score < 1 || score > 10) return res.status(400).json({ error: "Score must be between 1 and 10" });
    const job = await prisma.job.findUnique({ where: { id: req.params.id } });
    if (!job) return res.status(404).json({ error: "Job not found" });
    // Store rating as a job note
    const note = await prisma.jobNote.create({
      data: { jobId: job.id, content: `⭐ Customer rating: ${score}/10${comment ? " — " + comment : ""}`, isInternal: false },
    });
    res.status(201).json({ score, comment, jobId: job.id });
  } catch(err) { next(err); }
});

// Get job photos
router.get("/:id/photos", authenticate, async (req, res, next) => {
  try {
    const photos = await prisma.jobPhoto.findMany({
      where: { jobId: req.params.id },
      orderBy: { takenAt: "asc" },
    });
    res.json(photos);
  } catch(err) { next(err); }
});

// Add job photo (base64)
router.post("/:id/photos", authenticate, async (req, res, next) => {
  try {
    const { url, type, caption } = req.body;
    if (!url) return res.status(400).json({ error: "Photo URL required" });
    const photo = await prisma.jobPhoto.create({
      data: { jobId: req.params.id, url, type: type||"OTHER", caption: caption||null, uploadedById: req.user.id },
    });
    res.status(201).json(photo);
  } catch(err) { next(err); }
});

// Auto-escalate stale jobs (jobs waiting > 24hrs)
router.post("/escalate", authenticate, requireRole("SUPER_ADMIN","OWNER","BRANCH_MANAGER"), async (req, res, next) => {
  try {
    const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const staleJobs = await prisma.job.findMany({
      where: {
        status: { in: ["RECEIVED","DIAGNOSING","WAITING_PARTS"] },
        priority: { not: "URGENT" },
        updatedAt: { lt: threshold },
      },
    });
    const updated = await Promise.all(staleJobs.map(j =>
      prisma.job.update({ where: { id: j.id }, data: { priority: "HIGH" } })
    ));
    res.json({ escalated: updated.length, jobs: updated.map(j=>j.jobRef) });
  } catch(err) { next(err); }
});

// Customer portal - get jobs by phone (public)
router.get("/customer", async (req, res, next) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ error: "Phone required" });
    const cleaned = String(phone).replace(/\D/g,"");
    const variants = [cleaned, "0"+cleaned.slice(-9), "233"+cleaned.slice(-9)];
    const jobs = await prisma.job.findMany({
      where: { customerPhone: { in: variants } },
      include: { vehicle: true, workshop: { select: { name:true, location:true } }, invoice: { select: { status:true, total:true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(jobs);
  } catch(err) { next(err); }
});
