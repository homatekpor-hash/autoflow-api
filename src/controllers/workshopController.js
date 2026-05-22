const QRCode = require("qrcode");
const { validationResult } = require("express-validator");
const prisma = require("../config/database");
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

async function list(req, res, next) {
  try {
    const role = req.user.role;
    const userId = req.user.id;
    const workshopId = req.user.workshopId;

    let where = { id: "no-access" };
    if (role === "SUPER_ADMIN") where = {};
    else if (role === "OWNER") where = { ownerId: userId };
    else if (workshopId) where = { id: workshopId };
    else return res.json([]);

    const workshops = await prisma.workshop.findMany({
      where,
      include: { manager: { select: { id: true, name: true, email: true } }, _count: { select: { members: true, jobs: true } } },
      orderBy: { name: "asc" },
    });

    const today = new Date(); today.setHours(0,0,0,0);
    const wsIds = workshops.map(w => w.id);
    const [active, completed] = wsIds.length ? await Promise.all([
      prisma.job.groupBy({ by: ["workshopId"], where: { workshopId: { in: wsIds }, createdAt: { gte: today }, status: { notIn: ["DELIVERED","CANCELLED"] } }, _count: { id: true } }),
      prisma.job.groupBy({ by: ["workshopId"], where: { workshopId: { in: wsIds }, createdAt: { gte: today }, status: "DELIVERED" }, _count: { id: true } }),
    ]) : [[], []];
    const am = Object.fromEntries(active.map(r => [r.workshopId, r._count.id]));
    const cm = Object.fromEntries(completed.map(r => [r.workshopId, r._count.id]));
    res.json(workshops.map(ws => ({ ...ws, stats: { active: am[ws.id]||0, completed: cm[ws.id]||0, revenueToday: 0 } })));
  } catch (err) { next(err); }
}

async function get(req, res, next) {
  try {
    const ws = await prisma.workshop.findUnique({ where: { id: req.params.id }, include: { manager: { select: { id: true, name: true, email: true } }, members: { select: { id: true, name: true, role: true, status: true } }, _count: { select: { jobs: true } } } });
    if (!ws) return res.status(404).json({ error: "Workshop not found" });
    const { role, id: userId, workshopId } = req.user;
    if (role !== "SUPER_ADMIN" && !(role === "OWNER" && ws.ownerId === userId) && ws.id !== workshopId) return res.status(403).json({ error: "Access denied" });
    res.json(ws);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { name, location, phone } = req.body;
    const ownerId = req.user.role === "OWNER" ? req.user.id : req.body.ownerId || null;
    const ws = await prisma.workshop.create({ data: { name, location, phone, ownerId } });
    res.status(201).json(ws);
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { name, location, phone, managerId } = req.body;
    const ws = await prisma.workshop.update({ where: { id: req.params.id }, data: { name, location, phone, managerId } });
    res.json(ws);
  } catch (err) { next(err); }
}

async function getQRCode(req, res, next) {
  try {
    const ws = await prisma.workshop.findUnique({ where: { id: req.params.id } });
    if (!ws) return res.status(404).json({ error: "Workshop not found" });
    const url = `${FRONTEND_URL}/checkin/${ws.qrToken}`;
    const format = req.query.format || "png";
    if (format === "url") return res.json({ url, qrToken: ws.qrToken });
    if (format === "svg") { const svg = await QRCode.toString(url, { type: "svg" }); res.setHeader("Content-Type", "image/svg+xml"); return res.send(svg); }
    const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: "H", margin: 2 });
    res.json({ dataUrl, url, qrToken: ws.qrToken });
  } catch (err) { next(err); }
}

module.exports = { list, get, create, update, getQRCode };
