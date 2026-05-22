const { validationResult } = require("express-validator");
const prisma = require("../config/database");
const { notifyJobStatusChanged } = require("../utils/notifications");

const JOB_INCLUDE = {
  vehicle:   { select: { id: true, plate: true, make: true, model: true, year: true, color: true } },
  workshop:  { select: { id: true, name: true, location: true } },
  technician:{ select: { id: true, name: true } },
  estimate:  { select: { id: true, status: true, total: true } },
  invoice:   { select: { id: true, status: true, total: true } },
};

function buildWorkshopFilter(user, workshopId) {
  const role  = user.role;
  const wsId  = workshopId || user.workshopId;

  if (role === "SUPER_ADMIN") return {};
  if (role === "OWNER")       return wsId ? { workshopId: wsId } : {};
  if (role === "TECHNICIAN")  return { workshopId: user.workshopId, technicianId: user.id };
  if (user.workshopId)        return { workshopId: user.workshopId };
  return {};
}

async function list(req, res, next) {
  try {
    const { status, technicianId, date, search } = req.query;
    const workshopId    = req.params.workshopId || req.query.workshopId;
    const workshopFilter = buildWorkshopFilter(req.user, workshopId);

    const dateFilter = date
      ? { createdAt: { gte: new Date(date), lt: new Date(new Date(date).getTime() + 86400000) } }
      : {};

    const jobs = await prisma.job.findMany({
      where: {
        ...workshopFilter,
        ...(status && { status }),
        ...(technicianId && { technicianId }),
        ...dateFilter,
        ...(search && {
          OR: [
            { jobRef:        { contains: search, mode: "insensitive" } },
            { customerName:  { contains: search, mode: "insensitive" } },
            { vehicle: { plate: { contains: search, mode: "insensitive" } } },
          ],
        }),
      },
      include: JOB_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    res.json(jobs);
  } catch (err) { next(err); }
}

async function get(req, res, next) {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: {
        ...JOB_INCLUDE,
        statusHistory: {
          include: { changedBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
        estimate: { include: { items: true } },
      },
    });
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  } catch (err) { next(err); }
}

async function updateStatus(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { status, note } = req.body;
    const VALID = ["RECEIVED","DIAGNOSING","WAITING_APPROVAL","WAITING_PARTS","IN_PROGRESS","QC","READY","DELIVERED","CANCELLED"];
    if (!VALID.includes(status)) return res.status(400).json({ error: "Invalid status" });

    const [job] = await prisma.$transaction([
      prisma.job.update({
        where: { id: req.params.id },
        data: { status, ...(status === "DELIVERED" && { completedAt: new Date() }) },
        include: { ...JOB_INCLUDE, vehicle: true },
      }),
      prisma.jobStatusHistory.create({
        data: { jobId: req.params.id, status, note: note || null, changedById: req.user.id },
      }),
    ]);

    notifyJobStatusChanged(job, status).catch(console.error);
    res.json(job);
  } catch (err) { next(err); }
}

async function assignTechnician(req, res, next) {
  try {
    const { technicianId } = req.body;
    const tech = await prisma.user.findUnique({ where: { id: technicianId } });
    if (!tech || tech.role !== "TECHNICIAN") return res.status(400).json({ error: "Invalid technician" });

    const job = await prisma.job.update({
      where: { id: req.params.id },
      data:  { technicianId },
      include: JOB_INCLUDE,
    });

    if (job.status === "RECEIVED") {
      await prisma.job.update({ where: { id: job.id }, data: { status: "DIAGNOSING" } });
      await prisma.jobStatusHistory.create({
        data: { jobId: job.id, status: "DIAGNOSING", note: `Assigned to ${tech.name}`, changedById: req.user.id },
      });
    }

    res.json(job);
  } catch (err) { next(err); }
}

async function getHistory(req, res, next) {
  try {
    const history = await prisma.jobStatusHistory.findMany({
      where:   { jobId: req.params.id },
      include: { changedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
    res.json(history);
  } catch (err) { next(err); }
}

module.exports = { list, get, updateStatus, assignTechnician, getHistory };


