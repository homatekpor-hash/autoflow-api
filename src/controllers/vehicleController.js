const prisma = require("../config/database");

const JOB_INCLUDE = {
  workshop:   { select: { id: true, name: true, location: true } },
  technician: { select: { id: true, name: true } },
  estimate:   { select: { id: true, status: true, subtotal: true, tax: true, total: true } },
  invoice:    { select: { id: true, status: true, total: true } },
  statusHistory: {
    orderBy: { createdAt: "asc" },
    select:  { status: true, note: true, createdAt: true, changedBy: { select: { name: true } } },
  },
};

// ─── GET /api/vehicles/search?q=GR-1234 ──────────────────────────────────────
async function search(req, res, next) {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    const vehicles = await prisma.vehicle.findMany({
      where: {
        OR: [
          { plate: { contains: q.toUpperCase(), mode: "insensitive" } },
          { make:  { contains: q, mode: "insensitive" } },
          { model: { contains: q, mode: "insensitive" } },
        ],
      },
      include: {
        _count: { select: { jobs: true } },
        jobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true, status: true, workshop: { select: { name: true } } },
        },
      },
      take: 10,
      orderBy: { updatedAt: "desc" },
    });

    res.json(vehicles);
  } catch (err) { next(err); }
}

// ─── GET /api/vehicles/:plate ─────────────────────────────────────────────────
async function getByPlate(req, res, next) {
  try {
    const plate = req.params.plate.toUpperCase();

    const vehicle = await prisma.vehicle.findUnique({
      where: { plate },
    });
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });

    // Full job history across all workshops
    const jobs = await prisma.job.findMany({
      where: { vehicleId: vehicle.id },
      include: JOB_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    // Aggregate stats
    const totalSpend  = jobs.reduce((s, j) => s + (j.invoice?.total || j.estimate?.total || 0), 0);
    const lastMileage = jobs.length ? jobs[0].mileage : null;
    const firstSeen   = jobs.length ? jobs[jobs.length - 1].createdAt : null;

    res.json({
      vehicle,
      stats: {
        totalJobs:    jobs.length,
        totalSpend:   Math.round(totalSpend * 100) / 100,
        lastMileage,
        firstSeen,
        workshops:    [...new Set(jobs.map(j => j.workshop.name))],
      },
      jobs,
    });
  } catch (err) { next(err); }
}

// ─── GET /api/vehicles ────────────────────────────────────────────────────────
async function list(req, res, next) {
  try {
    const vehicles = await prisma.vehicle.findMany({
      include: {
        _count: { select: { jobs: true } },
        jobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true, status: true, mileage: true, workshop: { select: { name: true } } },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    res.json(vehicles);
  } catch (err) { next(err); }
}

module.exports = { search, getByPlate, list };
