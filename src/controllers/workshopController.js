const QRCode = require("qrcode");
const { validationResult } = require("express-validator");
const prisma = require("../config/database");

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

async function list(req, res, next) {
  try {
    const role = req.user.role;
    const wsId = req.user.workshopId;

    const where = (role === "SUPER_ADMIN" || role === "OWNER" || !wsId)
      ? {}
      : { id: wsId };

    const workshops = await prisma.workshop.findMany({
      where,
      include: {
        manager: { select: { id: true, name: true, email: true } },
        _count: { select: { members: true, jobs: true } },
      },
      orderBy: { name: "asc" },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const enriched = await Promise.all(
      workshops.map(async (ws) => {
        const [active, completed, revenue] = await Promise.all([
          prisma.job.count({ where: { workshopId: ws.id, createdAt: { gte: today }, status: { notIn: ["DELIVERED","CANCELLED"] } } }),
          prisma.job.count({ where: { workshopId: ws.id, createdAt: { gte: today }, status: "DELIVERED" } }),
          prisma.invoice.aggregate({ where: { job: { workshopId: ws.id }, createdAt: { gte: today } }, _sum: { total: true } }),
        ]);
        return { ...ws, stats: { active, completed, revenueToday: revenue._sum.total || 0 } };
      })
    );

    res.json(enriched);
  } catch (err) { next(err); }
}

async function get(req, res, next) {
  try {
    const ws = await prisma.workshop.findUnique({
      where: { id: req.params.id },
      include: {
        manager: { select: { id: true, name: true, email: true } },
        members: { select: { id: true, name: true, role: true, status: true } },
        _count: { select: { jobs: true } },
      },
    });
    if (!ws) return res.status(404).json({ error: "Workshop not found" });
    const canAccess = ["SUPER_ADMIN","OWNER"].includes(req.user.role) || ws.id === req.user.workshopId;
    if (!canAccess) return res.status(403).json({ error: "Access denied" });
    res.json(ws);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { name, location, phone } = req.body;
    const ws = await prisma.workshop.create({ data: { name, location, phone } });
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
    if (format === "svg") {
      const svg = await QRCode.toString(url, { type: "svg" });
      res.setHeader("Content-Type", "image/svg+xml");
      return res.send(svg);
    }
    const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: "H", margin: 2 });
    res.json({ dataUrl, url, qrToken: ws.qrToken });
  } catch (err) { next(err); }
}

module.exports = { list, get, create, update, getQRCode };
