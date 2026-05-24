const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");
const prisma = require("../config/database");

// ─── GET /api/users ───────────────────────────────────────────────────────────
async function list(req, res, next) {
  try {
    const { role: roleFilter, workshopId: wsQuery } = req.query;
    const { role, id: userId, workshopId } = req.user;

    let where = {};

    if (role === "SUPER_ADMIN") {
      // Sees everyone
      where = {};
    } else if (role === "OWNER") {
      // Owner sees only users in their workshops
      const ownedWorkshops = await prisma.workshop.findMany({
        where: { ownerId: userId },
        select: { id: true },
      });
      const wsIds = ownedWorkshops.map(w => w.id);
      where = { workshopId: { in: wsIds } };
      if (wsQuery && wsIds.includes(wsQuery)) where.workshopId = wsQuery;
    } else if (workshopId) {
      // Branch manager, advisor, etc — sees only their workshop
      where = { workshopId };
    } else {
      return res.json([]);
    }

    if (roleFilter) where.role = roleFilter;

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true, name: true, email: true, role: true,
        status: true, workshopId: true, createdAt: true,
        workshop: { select: { id: true, name: true } },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });

    res.json(users);
  } catch (err) { next(err); }
}

// ─── POST /api/users/invite ───────────────────────────────────────────────────
async function invite(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, role, workshopId } = req.body;
    const requester = req.user;

    // Validate workshopId belongs to requester
    if (requester.role === "OWNER") {
      const ws = await prisma.workshop.findFirst({ where: { id: workshopId, ownerId: requester.id } });
      if (!ws) return res.status(403).json({ error: "You do not own this workshop" });
    } else if (requester.role === "BRANCH_MANAGER") {
      if (workshopId !== requester.workshopId) return res.status(403).json({ error: "You can only invite staff to your own workshop" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const tempPassword = Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const user = await prisma.user.create({
      data: { name, email, passwordHash, role, workshopId, status: "ACTIVE" },
      select: { id: true, name: true, email: true, role: true, workshopId: true, status: true },
    });

    res.status(201).json({ user, tempPassword, message: `Account created. Temp password: ${tempPassword}` });
  } catch (err) { next(err); }
}

// ─── PUT /api/users/:id ───────────────────────────────────────────────────────
async function update(req, res, next) {
  try {
    const { name, role, status, password } = req.body;
    let passwordHash;
    if (password) { const bcrypt = require("bcryptjs"); passwordHash = await bcrypt.hash(password, 12); }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { ...(name && { name }), ...(role && { role }), ...(status && { status }), ...(passwordHash && { passwordHash }) },
      select: { id: true, name: true, email: true, role: true, status: true, workshopId: true },
    });
    res.json(user);
  } catch (err) { next(err); }
}

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
async function me(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true, status: true, workshopId: true },
    });
    res.json(user);
  } catch (err) { next(err); }
}

module.exports = { list, invite, update, me };

