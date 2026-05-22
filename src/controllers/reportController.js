const prisma = require("../config/database");

async function buildWsFilter(user) {
  if (user.role === "SUPER_ADMIN") return {};
  if (user.role === "OWNER") {
    const ws = await prisma.workshop.findMany({ where: { ownerId: user.id }, select: { id: true } });
    return { workshopId: { in: ws.map(w => w.id) } };
  }
  if (user.workshopId) return { workshopId: user.workshopId };
  return { workshopId: "none" };
}

async function revenue(req, res, next) {
  try {
    const { period = "month" } = req.query;
    const wsFilter = await buildWsFilter(req.user);
    const now = new Date();
    let start = new Date();
    if (period === "week")  start.setDate(now.getDate() - 7);
    if (period === "month") start.setMonth(now.getMonth() - 1);
    if (period === "year")  start.setFullYear(now.getFullYear() - 1);

    const [invoices, jobStats, topParts] = await Promise.all([
      prisma.invoice.findMany({
        where: { createdAt: { gte: start }, job: wsFilter },
        include: { job: { select: { workshopId: true, workshop: { select: { name: true } } } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.job.groupBy({
        by: ["status"], where: { createdAt: { gte: start }, ...wsFilter }, _count: { id: true },
      }),
      prisma.estimateItem.findMany({
        where: { estimate: { job: { createdAt: { gte: start }, ...wsFilter } }, type: "PART" },
        orderBy: { quantity: "desc" }, take: 5,
        select: { name: true, quantity: true, unitPrice: true },
      }),
    ]);

    const totalRevenue    = invoices.filter(i=>i.status==="PAID").reduce((s,i)=>s+Number(i.total),0);
    const totalUnpaid     = invoices.filter(i=>i.status==="UNPAID").reduce((s,i)=>s+Number(i.total),0);
    const totalJobs       = jobStats.reduce((s,j)=>s+j._count.id,0);
    const completedJobs   = jobStats.find(j=>j.status==="DELIVERED")?._count.id || 0;

    // Group revenue by day
    const byDay = {};
    invoices.filter(i=>i.status==="PAID").forEach(i => {
      const day = i.createdAt.toISOString().slice(0,10);
      byDay[day] = (byDay[day]||0) + Number(i.total);
    });

    // Revenue by workshop
    const byWorkshop = {};
    invoices.filter(i=>i.status==="PAID").forEach(i => {
      const name = i.job.workshop?.name || "Unknown";
      byWorkshop[name] = (byWorkshop[name]||0) + Number(i.total);
    });

    res.json({ totalRevenue, totalUnpaid, totalJobs, completedJobs, completionRate: totalJobs ? Math.round(completedJobs/totalJobs*100) : 0, byDay, byWorkshop, topParts });
  } catch (err) { next(err); }
}

async function jobs(req, res, next) {
  try {
    const { period = "month" } = req.query;
    const wsFilter = await buildWsFilter(req.user);
    const now = new Date(); let start = new Date();
    if (period === "week")  start.setDate(now.getDate() - 7);
    if (period === "month") start.setMonth(now.getMonth() - 1);
    if (period === "year")  start.setFullYear(now.getFullYear() - 1);

    const [byStatus, byPriority, recent] = await Promise.all([
      prisma.job.groupBy({ by: ["status"],   where: { createdAt: { gte: start }, ...wsFilter }, _count: { id: true } }),
      prisma.job.groupBy({ by: ["priority"], where: { createdAt: { gte: start }, ...wsFilter }, _count: { id: true } }),
      prisma.job.findMany({ where: { createdAt: { gte: start }, ...wsFilter }, take: 10, orderBy: { createdAt: "desc" }, include: { vehicle: { select: { plate: true, make: true, model: true } }, workshop: { select: { name: true } } } }),
    ]);

    res.json({ byStatus, byPriority, recent });
  } catch (err) { next(err); }
}

async function performance(req, res, next) {
  try {
    const wsFilter = await buildWsFilter(req.user);
    const start = new Date(); start.setMonth(start.getMonth() - 1);

    const technicians = await prisma.user.findMany({
      where: { role: "TECHNICIAN", ...( req.user.role === "SUPER_ADMIN" ? {} : req.user.role === "OWNER" ? { workshop: { ownerId: req.user.id } } : { workshopId: req.user.workshopId }) },
      select: { id: true, name: true, workshopId: true, workshop: { select: { name: true } }, _count: { select: { assignedJobs: true } } },
    });

    res.json({ technicians });
  } catch (err) { next(err); }
}

module.exports = { revenue, jobs, performance };
