const prisma = require("../config/database");

// ─── GET /api/workforce/technicians ──────────────────────────────────────────
async function listTechnicians(req, res, next) {
  try {
    const workshopId = req.query.workshopId || req.user.workshopId;
    const where = req.user.role === "OWNER" && !workshopId ? {} : { workshopId };

    const techs = await prisma.user.findMany({
      where: { ...where, role: "TECHNICIAN", status: "ACTIVE" },
      include: {
        profile: {
          include: {
            attendances: { where: { date: { gte: startOfMonth() } }, orderBy: { date: "desc" } },
            training:    { orderBy: { dueDate: "asc" } },
          },
        },
        assignedJobs: {
          where: { status: { notIn: ["DELIVERED", "CANCELLED"] } },
          select: { id: true, jobRef: true, status: true },
        },
        timeEntries: {
          where: { startedAt: { gte: startOfDay() } },
          select: { totalMins: true, status: true, startedAt: true },
        },
      },
      orderBy: { name: "asc" },
    });

    // Enrich with computed stats
    const enriched = await Promise.all(techs.map(async t => {
      const completedThisMonth = await prisma.job.count({
        where: { technicianId: t.id, status: "DELIVERED", completedAt: { gte: startOfMonth() } },
      });

      const totalMinsToday = t.timeEntries.reduce((s, e) => {
        if (e.status === "RUNNING") {
          return s + Math.floor((Date.now() - new Date(e.startedAt).getTime()) / 60000) + e.totalMins;
        }
        return s + e.totalMins;
      }, 0);

      const attendance = t.profile?.attendances || [];
      const attended   = attendance.filter(a => a.status === "PRESENT").length;
      const attPct     = attendance.length ? Math.round((attended / attendance.length) * 100) : 100;

      return {
        id: t.id, name: t.name, email: t.email,
        workshopId: t.workshopId,
        profile: t.profile,
        activeJobs: t.assignedJobs.length,
        hoursToday: Math.round(totalMinsToday / 60 * 10) / 10,
        jobsThisMonth: completedThisMonth,
        attendancePct: attPct,
        isRunning: t.timeEntries.some(e => e.status === "RUNNING"),
      };
    }));

    res.json(enriched);
  } catch (err) { next(err); }
}

// ─── GET /api/workforce/technicians/:id ──────────────────────────────────────
async function getTechnician(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        profile: { include: { attendances: { orderBy: { date: "desc" }, take: 30 }, training: true } },
        assignedJobs: {
          include: { vehicle: { select: { plate: true, make: true, model: true } }, workshop: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        timeEntries: { orderBy: { startedAt: "desc" }, take: 30 },
      },
    });
    if (!user) return res.status(404).json({ error: "Technician not found" });

    // Commission this month
    const commissions = await prisma.commission.findMany({
      where: { userId: req.params.id, month: new Date().getMonth() + 1, year: new Date().getFullYear() },
    });
    const totalCommission = commissions.reduce((s, c) => s + c.amount, 0);

    res.json({ ...user, totalCommission });
  } catch (err) { next(err); }
}

// ─── PUT /api/workforce/technicians/:id/profile ───────────────────────────────
async function updateProfile(req, res, next) {
  try {
    const { skills, certifications, commissionRate, shift, bio, phone } = req.body;
    const existing = await prisma.technicianProfile.findUnique({ where: { userId: req.params.id } });

    const profile = existing
      ? await prisma.technicianProfile.update({
          where: { userId: req.params.id },
          data: { skills, certifications, commissionRate, shift, bio, phone },
        })
      : await prisma.technicianProfile.create({
          data: { userId: req.params.id, workshopId: req.body.workshopId, skills, certifications, commissionRate, shift, bio, phone },
        });

    res.json(profile);
  } catch (err) { next(err); }
}

// ─── POST /api/workforce/attendance/clock-in ──────────────────────────────────
async function clockIn(req, res, next) {
  try {
    const profile = await prisma.technicianProfile.findUnique({ where: { userId: req.user.id } });
    if (!profile) return res.status(404).json({ error: "Profile not found" });

    const today = new Date(); today.setHours(0, 0, 0, 0);

    const attendance = await prisma.attendance.upsert({
      where:  { profileId_date: { profileId: profile.id, date: today } },
      update: { clockIn: new Date(), status: "PRESENT" },
      create: { profileId: profile.id, date: today, clockIn: new Date(), status: "PRESENT" },
    });
    res.json(attendance);
  } catch (err) { next(err); }
}

// ─── POST /api/workforce/attendance/clock-out ─────────────────────────────────
async function clockOut(req, res, next) {
  try {
    const profile = await prisma.technicianProfile.findUnique({ where: { userId: req.user.id } });
    if (!profile) return res.status(404).json({ error: "Profile not found" });

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const record = await prisma.attendance.findUnique({ where: { profileId_date: { profileId: profile.id, date: today } } });
    if (!record || !record.clockIn) return res.status(400).json({ error: "Not clocked in" });

    const totalHours = (new Date() - new Date(record.clockIn)) / 3600000 - record.breakMins / 60;
    const attendance = await prisma.attendance.update({
      where: { id: record.id },
      data:  { clockOut: new Date(), totalHours: Math.round(totalHours * 100) / 100 },
    });
    res.json(attendance);
  } catch (err) { next(err); }
}

// ─── GET /api/workforce/schedule ─────────────────────────────────────────────
async function getSchedule(req, res, next) {
  try {
    const workshopId = req.query.workshopId || req.user.workshopId;
    const techs = await prisma.user.findMany({
      where: { role: "TECHNICIAN", ...(workshopId && { workshopId }) },
      include: { profile: { select: { shift: true, skills: true } } },
      select: { id: true, name: true, profile: true },
    });
    res.json(techs);
  } catch (err) { next(err); }
}

// ─── GET /api/workforce/performance ──────────────────────────────────────────
async function getPerformance(req, res, next) {
  try {
    const workshopId = req.query.workshopId || req.user.workshopId;
    const where = req.user.role === "OWNER" && !workshopId ? {} : { workshopId };
    const month = new Date().getMonth() + 1;
    const year  = new Date().getFullYear();

    const techs = await prisma.user.findMany({
      where: { ...where, role: "TECHNICIAN" },
      select: { id: true, name: true },
    });

    const stats = await Promise.all(techs.map(async t => {
      const [completed, timeEntries] = await Promise.all([
        prisma.job.count({ where: { technicianId: t.id, status: "DELIVERED", completedAt: { gte: startOfMonth() } } }),
        prisma.timeEntry.findMany({ where: { techId: t.id, startedAt: { gte: startOfMonth() } } }),
      ]);
      const totalMins    = timeEntries.reduce((s, e) => s + e.totalMins, 0);
      const commissions  = await prisma.commission.aggregate({ where: { userId: t.id, month, year }, _sum: { amount: true } });

      return {
        techId: t.id, name: t.name,
        jobsCompleted: completed,
        totalHours:    Math.round(totalMins / 60 * 10) / 10,
        commission:    commissions._sum.amount || 0,
        efficiency:    completed > 0 ? Math.min(100, Math.round((completed / (totalMins / 60)) * 10)) : 0,
      };
    }));

    res.json(stats.sort((a, b) => b.efficiency - a.efficiency));
  } catch (err) { next(err); }
}

// ─── GET /api/workforce/commissions ──────────────────────────────────────────
async function getCommissions(req, res, next) {
  try {
    const { month = new Date().getMonth() + 1, year = new Date().getFullYear() } = req.query;
    const workshopId = req.query.workshopId || req.user.workshopId;

    const commissions = await prisma.commission.findMany({
      where: {
        month: Number(month), year: Number(year),
        ...(workshopId && { workshopId }),
      },
      orderBy: { amount: "desc" },
    });

    // Group by userId
    const grouped = {};
    commissions.forEach(c => {
      if (!grouped[c.userId]) grouped[c.userId] = { userId: c.userId, total: 0, isPaid: c.isPaid, entries: [] };
      grouped[c.userId].total += c.amount;
      grouped[c.userId].entries.push(c);
    });

    const userIds = Object.keys(grouped);
    const users   = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
    const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));

    res.json(Object.values(grouped).map(g => ({ ...g, name: userMap[g.userId] || "Unknown" })));
  } catch (err) { next(err); }
}

// ─── POST /api/workforce/commissions/calculate ───────────────────────────────
// Auto-calculate commissions for all completed jobs this month
async function calculateCommissions(req, res, next) {
  try {
    const month = new Date().getMonth() + 1;
    const year  = new Date().getFullYear();
    const workshopId = req.body.workshopId || req.user.workshopId;

    const completedJobs = await prisma.job.findMany({
      where: {
        status: "DELIVERED",
        completedAt: { gte: startOfMonth() },
        technicianId: { not: null },
        ...(workshopId && { workshopId }),
      },
      include: {
        estimate: { select: { total: true } },
        technician: { include: { profile: { select: { commissionRate: true } } } },
      },
    });

    const created = [];
    for (const job of completedJobs) {
      if (!job.technicianId || !job.estimate) continue;
      const rate       = job.technician?.profile?.commissionRate || 5;
      const baseAmount = job.estimate.total;
      const amount     = Math.round(baseAmount * (rate / 100) * 100) / 100;

      // Don't double-create
      const existing = await prisma.commission.findFirst({ where: { jobId: job.id, userId: job.technicianId } });
      if (existing) continue;

      const commission = await prisma.commission.create({
        data: { userId: job.technicianId, workshopId: job.workshopId, jobId: job.id, amount, rate, baseAmount, month, year },
      });
      created.push(commission);
    }

    res.json({ calculated: created.length, commissions: created });
  } catch (err) { next(err); }
}

// ─── GET /api/workforce/leaderboard ──────────────────────────────────────────
async function getLeaderboard(req, res, next) {
  try {
    const workshopId = req.query.workshopId || req.user.workshopId;
    const where = req.user.role === "OWNER" && !workshopId ? {} : { workshopId };

    const techs = await prisma.user.findMany({
      where: { ...where, role: "TECHNICIAN" },
      select: { id: true, name: true, workshopId: true },
    });

    const board = await Promise.all(techs.map(async (t, i) => {
      const [jobs, attendance, profile] = await Promise.all([
        prisma.job.count({ where: { technicianId: t.id, status: "DELIVERED", completedAt: { gte: startOfMonth() } } }),
        prisma.attendance.count({ where: { profile: { userId: t.id }, status: "PRESENT", date: { gte: startOfMonth() } } }),
        prisma.technicianProfile.findUnique({ where: { userId: t.id }, select: { streak: true, commissionRate: true } }),
      ]);
      const score = Math.round(jobs * 40 + attendance * 0.6);
      return { userId: t.id, name: t.name, jobs, attendance, score, streak: profile?.streak || 0 };
    }));

    res.json(board.sort((a, b) => b.score - a.score).map((t, i) => ({ ...t, rank: i + 1 })));
  } catch (err) { next(err); }
}

// ─── Training ─────────────────────────────────────────────────────────────────
async function getTraining(req, res, next) {
  try {
    const profileId = req.query.profileId;
    const where = profileId ? { profileId } : {};
    const items = await prisma.trainingItem.findMany({
      where,
      include: { profile: { include: { user: { select: { name: true } } } } },
      orderBy: { dueDate: "asc" },
    });
    res.json(items);
  } catch (err) { next(err); }
}

async function createTraining(req, res, next) {
  try {
    const { profileId, name, provider, dueDate } = req.body;
    const item = await prisma.trainingItem.create({
      data: { profileId, name, provider, dueDate: dueDate ? new Date(dueDate) : null },
    });
    res.status(201).json(item);
  } catch (err) { next(err); }
}

async function completeTraining(req, res, next) {
  try {
    const item = await prisma.trainingItem.update({
      where: { id: req.params.id },
      data:  { isDone: true, completedAt: new Date() },
    });
    res.json(item);
  } catch (err) { next(err); }
}

// ─── Skill matching ───────────────────────────────────────────────────────────
async function matchSkills(req, res, next) {
  try {
    const { requiredSkills, workshopId } = req.query;
    const skills = requiredSkills ? requiredSkills.split(",") : [];

    const profiles = await prisma.technicianProfile.findMany({
      where: { ...(workshopId && { workshopId }) },
      include: { user: { select: { id: true, name: true } } },
    });

    const matched = profiles
      .map(p => {
        const techSkills = Array.isArray(p.skills) ? p.skills : [];
        const matchCount = skills.filter(s => techSkills.some(ts => ts.toLowerCase().includes(s.toLowerCase()))).length;
        return { userId: p.userId, name: p.user?.name, skills: techSkills, matchCount, matchPct: skills.length ? Math.round(matchCount / skills.length * 100) : 0 };
      })
      .filter(t => t.matchCount > 0)
      .sort((a, b) => b.matchCount - a.matchCount);

    res.json(matched);
  } catch (err) { next(err); }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function startOfDay() { const d = new Date(); d.setHours(0,0,0,0); return d; }
function startOfMonth() { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; }

module.exports = {
  listTechnicians, getTechnician, updateProfile,
  clockIn, clockOut, getSchedule,
  getPerformance, getCommissions, calculateCommissions,
  getLeaderboard, getTraining, createTraining, completeTraining,
  matchSkills,
};
