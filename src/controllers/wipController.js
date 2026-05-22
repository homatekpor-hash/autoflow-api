const prisma = require("../config/database");

const JOB_WIP_INCLUDE = {
  vehicle:        { select: { plate: true, make: true, model: true, year: true, color: true } },
  workshop:       { select: { id: true, name: true } },
  technician:     { select: { id: true, name: true } },
  serviceAdvisor: { select: { id: true, name: true } },
  tasks:          { orderBy: { sortOrder: "asc" } },
  notes:          { include: { author: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: "desc" } },
  timeEntries:    { include: { tech: { select: { id: true, name: true } } }, orderBy: { startedAt: "desc" } },
  estimate:       { select: { id: true, status: true, total: true } },
  bay:            { select: { id: true, name: true } },
  statusHistory:  { include: { changedBy: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
};

// ─── GET /api/wip  — full board for a workshop ────────────────────────────────
async function getBoard(req, res, next) {
  try {
    const workshopId = req.query.workshopId || req.user.workshopId;
    const where = req.user.role === "OWNER"
      ? (workshopId ? { workshopId, status: { notIn: ["DELIVERED","CANCELLED"] } } : { status: { notIn: ["DELIVERED","CANCELLED"] } })
      : { workshopId: req.user.workshopId, status: { notIn: ["DELIVERED","CANCELLED"] } };

    const jobs = await prisma.job.findMany({
      where,
      include: JOB_WIP_INCLUDE,
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    });

    // Compute elapsed minutes for each job from time entries
    const enriched = jobs.map(job => {
      const totalMins = job.timeEntries
        .filter(e => e.status === "STOPPED" || e.status === "PAUSED")
        .reduce((s, e) => s + e.totalMins, 0);

      const runningEntry = job.timeEntries.find(e => e.status === "RUNNING");
      const runningMins  = runningEntry
        ? Math.floor((Date.now() - new Date(runningEntry.startedAt).getTime()) / 60000)
        : 0;

      const isOverdue = job.expectedCompletion
        ? new Date() > new Date(job.expectedCompletion)
        : false;

      return { ...job, elapsedMins: totalMins + runningMins, isRunning: !!runningEntry, isOverdue };
    });

    // Escalation alerts
    const alerts = enriched
      .filter(j => j.isOverdue || j.priority === "URGENT")
      .map(j => ({
        jobId:    j.id,
        jobRef:   j.jobRef,
        type:     j.isOverdue ? "overdue" : "urgent",
        message:  j.isOverdue
          ? `${j.jobRef} is overdue — ${j.vehicle.make} ${j.vehicle.model}`
          : `${j.jobRef} is URGENT — ${j.vehicle.make} ${j.vehicle.model}`,
      }));

    res.json({ jobs: enriched, alerts });
  } catch (err) { next(err); }
}

// ─── PUT /api/wip/:id/status ──────────────────────────────────────────────────
async function updateStatus(req, res, next) {
  try {
    const { status, note } = req.body;
    const [job] = await prisma.$transaction([
      prisma.job.update({
        where: { id: req.params.id },
        data: {
          status,
          ...(status === "DELIVERED" && { completedAt: new Date() }),
        },
        include: JOB_WIP_INCLUDE,
      }),
      prisma.jobStatusHistory.create({
        data: { jobId: req.params.id, status, note: note || null, changedById: req.user.id },
      }),
    ]);
    res.json(job);
  } catch (err) { next(err); }
}

// ─── POST /api/wip/:id/tasks ──────────────────────────────────────────────────
async function createTask(req, res, next) {
  try {
    const { title, description, assignedToId, estimatedHours, dependsOnId } = req.body;
    const count = await prisma.jobTask.count({ where: { jobId: req.params.id } });
    const task  = await prisma.jobTask.create({
      data: {
        jobId:          req.params.id,
        title,
        description:    description    || null,
        assignedToId:   assignedToId   || null,
        estimatedHours: estimatedHours || 0,
        dependsOnId:    dependsOnId    || null,
        sortOrder:      count,
      },
    });
    res.status(201).json(task);
  } catch (err) { next(err); }
}

// ─── PUT /api/wip/tasks/:id ───────────────────────────────────────────────────
async function updateTask(req, res, next) {
  try {
    const { isDone, title, actualHours } = req.body;
    const task = await prisma.jobTask.update({
      where: { id: req.params.id },
      data: {
        ...(isDone    !== undefined && { isDone }),
        ...(title                  && { title }),
        ...(actualHours !== undefined && { actualHours }),
      },
    });
    res.json(task);
  } catch (err) { next(err); }
}

// ─── DELETE /api/wip/tasks/:id ────────────────────────────────────────────────
async function deleteTask(req, res, next) {
  try {
    await prisma.jobTask.delete({ where: { id: req.params.id } });
    res.json({ message: "Task deleted" });
  } catch (err) { next(err); }
}

// ─── POST /api/wip/:id/notes ─────────────────────────────────────────────────
async function addNote(req, res, next) {
  try {
    const { content, type } = req.body;
    const note = await prisma.jobNote.create({
      data: { jobId: req.params.id, content, type: type || "INTERNAL", authorId: req.user.id },
      include: { author: { select: { id: true, name: true, role: true } } },
    });
    res.status(201).json(note);
  } catch (err) { next(err); }
}

// ─── POST /api/wip/:id/clock-in ──────────────────────────────────────────────
async function clockIn(req, res, next) {
  try {
    // Stop any running entry for this tech on any job
    await prisma.timeEntry.updateMany({
      where: { techId: req.user.id, status: "RUNNING" },
      data:  { status: "STOPPED", stoppedAt: new Date() },
    });

    const entry = await prisma.timeEntry.create({
      data: { jobId: req.params.id, techId: req.user.id, status: "RUNNING", startedAt: new Date() },
    });
    res.status(201).json(entry);
  } catch (err) { next(err); }
}

// ─── POST /api/wip/:id/clock-out ─────────────────────────────────────────────
async function clockOut(req, res, next) {
  try {
    const entry = await prisma.timeEntry.findFirst({
      where: { jobId: req.params.id, techId: req.user.id, status: { in: ["RUNNING", "PAUSED"] } },
    });
    if (!entry) return res.status(404).json({ error: "No active time entry" });

    const totalMins = entry.status === "RUNNING"
      ? entry.totalMins + Math.floor((Date.now() - new Date(entry.startedAt).getTime()) / 60000)
      : entry.totalMins;

    const updated = await prisma.timeEntry.update({
      where: { id: entry.id },
      data:  { status: "STOPPED", stoppedAt: new Date(), totalMins },
    });
    res.json(updated);
  } catch (err) { next(err); }
}

// ─── POST /api/wip/:id/pause ─────────────────────────────────────────────────
async function pauseTimer(req, res, next) {
  try {
    const entry = await prisma.timeEntry.findFirst({
      where: { jobId: req.params.id, techId: req.user.id, status: "RUNNING" },
    });
    if (!entry) return res.status(404).json({ error: "No running timer" });

    const elapsedMins = Math.floor((Date.now() - new Date(entry.startedAt).getTime()) / 60000);
    const updated = await prisma.timeEntry.update({
      where: { id: entry.id },
      data:  { status: "PAUSED", pausedAt: new Date(), totalMins: entry.totalMins + elapsedMins },
    });
    res.json(updated);
  } catch (err) { next(err); }
}

// ─── POST /api/wip/:id/resume ────────────────────────────────────────────────
async function resumeTimer(req, res, next) {
  try {
    const entry = await prisma.timeEntry.findFirst({
      where: { jobId: req.params.id, techId: req.user.id, status: "PAUSED" },
    });
    if (!entry) return res.status(404).json({ error: "No paused timer" });
    const updated = await prisma.timeEntry.update({
      where: { id: entry.id },
      data:  { status: "RUNNING", startedAt: new Date(), pausedAt: null },
    });
    res.json(updated);
  } catch (err) { next(err); }
}

// ─── GET /api/wip/bays ───────────────────────────────────────────────────────
async function getBays(req, res, next) {
  try {
    const workshopId = req.query.workshopId || req.user.workshopId;
    const bays = await prisma.bay.findMany({
      where:   { workshopId },
      include: { currentJob: { select: { id: true, jobRef: true, vehicle: { select: { make: true, model: true, plate: true } }, technician: { select: { name: true } } } } },
      orderBy: { name: "asc" },
    });
    res.json(bays);
  } catch (err) { next(err); }
}

// ─── PUT /api/wip/bays/:id/assign ────────────────────────────────────────────
async function assignBay(req, res, next) {
  try {
    const { jobId } = req.body;
    const bay = await prisma.bay.update({
      where: { id: req.params.id },
      data:  { currentJobId: jobId || null },
      include: { currentJob: { select: { jobRef: true } } },
    });
    res.json(bay);
  } catch (err) { next(err); }
}

// ─── GET /api/wip/analytics ──────────────────────────────────────────────────
async function getAnalytics(req, res, next) {
  try {
    const workshopId = req.query.workshopId || req.user.workshopId;
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const [jobs, timeEntries, bays] = await Promise.all([
      prisma.job.findMany({ where: { workshopId, createdAt: { gte: today } } }),
      prisma.timeEntry.findMany({
        where: { job: { workshopId }, startedAt: { gte: today } },
        include: { tech: { select: { id: true, name: true } } },
      }),
      prisma.bay.findMany({ where: { workshopId } }),
    ]);

    // Technician productivity
    const techMap = {};
    timeEntries.forEach(e => {
      if (!techMap[e.techId]) techMap[e.techId] = { name: e.tech.name, totalMins: 0, jobCount: 0 };
      techMap[e.techId].totalMins += e.totalMins;
      techMap[e.techId].jobCount  += 1;
    });

    const byStatus = {};
    jobs.forEach(j => { byStatus[j.status] = (byStatus[j.status] || 0) + 1; });

    res.json({
      totalJobs:      jobs.length,
      overdueJobs:    jobs.filter(j => j.expectedCompletion && new Date() > new Date(j.expectedCompletion)).length,
      bayUtilisation: bays.length ? Math.round(bays.filter(b => b.currentJobId).length / bays.length * 100) : 0,
      byStatus,
      techProductivity: Object.entries(techMap).map(([id, d]) => ({
        techId: id, name: d.name,
        totalHours: Math.round(d.totalMins / 60 * 10) / 10,
        jobCount: d.jobCount,
      })).sort((a, b) => b.totalHours - a.totalHours),
    });
  } catch (err) { next(err); }
}

module.exports = {
  getBoard, updateStatus,
  createTask, updateTask, deleteTask,
  addNote,
  clockIn, clockOut, pauseTimer, resumeTimer,
  getBays, assignBay,
  getAnalytics,
};
