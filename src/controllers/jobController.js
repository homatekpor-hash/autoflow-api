const { validationResult } = require("express-validator");
const prisma = require("../config/database");

const JOB_INCLUDE = {
  vehicle:    { select: { id:true, plate:true, make:true, model:true, year:true, color:true } },
  workshop:   { select: { id:true, name:true, location:true } },
  technician: { select: { id:true, name:true } },
  estimate:   { select: { id:true, status:true, total:true } },
  invoice:    { select: { id:true, status:true, total:true } },
};

async function buildFilter(user) {
  const { role, id: userId, workshopId } = user;
  if (role === "SUPER_ADMIN") return {};
  if (role === "OWNER") {
    const ws = await prisma.workshop.findMany({ where: { ownerId: userId }, select: { id: true } });
    return { workshopId: { in: ws.map(w => w.id) } };
  }
  if (role === "TECHNICIAN") return { workshopId, technicianId: userId };
  if (workshopId) return { workshopId };
  return { workshopId: "none" };
}

async function list(req, res, next) {
  try {
    const { status, date, search } = req.query;
    const baseFilter = await buildFilter(req.user);
    const dateFilter = date ? { createdAt: { gte: new Date(date), lt: new Date(new Date(date).getTime() + 86400000) } } : {};
    const searchFilter = search ? { OR: [
      { jobRef: { contains: search, mode: "insensitive" } },
      { customerName: { contains: search, mode: "insensitive" } },
      { vehicle: { plate: { contains: search, mode: "insensitive" } } },
    ]} : {};

    const jobs = await prisma.job.findMany({
      where: { ...baseFilter, ...(status && { status }), ...dateFilter, ...searchFilter },
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
        statusHistory: { include: { changedBy: { select: { id:true, name:true } } }, orderBy: { createdAt: "asc" } },
        estimate: { include: { items: true } },
        notes: { include: { author: { select: { id:true, name:true, role:true } } }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  } catch (err) { next(err); }
}

async function updateStatus(req, res, next) {
  try {
    const { status, note } = req.body;
    const VALID = ["RECEIVED","DIAGNOSING","WAITING_APPROVAL","WAITING_PARTS","IN_PROGRESS","QC","READY","DELIVERED","CANCELLED"];
    if (!VALID.includes(status)) return res.status(400).json({ error: "Invalid status" });

    const [job] = await prisma.$transaction([
      prisma.job.update({
        where: { id: req.params.id },
        data: { status, ...(status === "DELIVERED" && { completedAt: new Date() }) },
        include: { ...JOB_INCLUDE, vehicle: true, workshop: true },
      }),
      prisma.jobStatusHistory.create({
        data: { jobId: req.params.id, status, note: note || null, changedById: req.user.id },
      }),
    ]);

    // WhatsApp notification
    try {
      const { notifyJobStatusChanged } = require("../utils/whatsapp");
      notifyJobStatusChanged(job, status).catch(() => {});
    } catch {}

    res.json(job);
  } catch (err) { next(err); }
}

async function assignTechnician(req, res, next) {
  try {
    const { technicianId } = req.body;
    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: { technicianId },
      include: JOB_INCLUDE,
    });
    res.json(job);
  } catch (err) { next(err); }
}

async function getHistory(req, res, next) {
  try {
    const history = await prisma.jobStatusHistory.findMany({
      where: { jobId: req.params.id },
      include: { changedBy: { select: { id:true, name:true } } },
      orderBy: { createdAt: "asc" },
    });
    res.json(history);
  } catch (err) { next(err); }
}

module.exports = { list, get, updateStatus, assignTechnician, getHistory };
