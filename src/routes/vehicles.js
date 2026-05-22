const express = require("express");
const { authenticate } = require("../middleware/auth");
const prisma = require("../config/database");
const router = express.Router();

router.get("/vehicles", authenticate, async (req, res, next) => {
  try {
    const { role, workshopId } = req.user;
    const where = role === "SUPER_ADMIN" ? {} : { jobs: { some: { workshopId: workshopId||"none" } } };
    const vehicles = await prisma.vehicle.findMany({
      where,
      include: { _count: { select: { jobs: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json(vehicles);
  } catch (err) { next(err); }
});

module.exports = router;
