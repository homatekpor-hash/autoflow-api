const express = require("express");
const router  = express.Router();
const prisma  = require("../config/database");

// GET /api/workshops/checkin/:token — get workshop info by QR token (public)
router.get("/workshop/:token", async (req, res) => {
  try {
    const ws = await prisma.workshop.findUnique({
      where: { qrToken: req.params.token },
      select: { id: true, name: true, location: true, phone: true },
    });
    if (!ws) return res.status(404).json({ error: "Workshop not found" });
    res.json(ws);
  } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// POST /api/checkin/:token — submit customer intake (public)
router.post("/checkin/:token", async (req, res) => {
  try {
    const ws = await prisma.workshop.findUnique({ where: { qrToken: req.params.token } });
    if (!ws) return res.status(404).json({ error: "Workshop not found" });

    const {
      plate, make, model, year, color, mileage,
      customerName, customerPhone, customerEmail,
      complaint, notes, fuelLevel,
    } = req.body;

    if (!plate || !make || !model || !customerName || !customerPhone || !complaint) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Find or create vehicle
    let vehicle = await prisma.vehicle.findFirst({ where: { plate: plate.toUpperCase() } });
    if (!vehicle) {
      vehicle = await prisma.vehicle.create({
        data: { plate: plate.toUpperCase(), make, model, year: year ? parseInt(year) : null, color, ownerName: customerName, ownerPhone: customerPhone, ownerEmail: customerEmail || null },
      });
    }

    // Generate job ref
    const count = await prisma.job.count({ where: { workshopId: ws.id } });
    const prefix = ws.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 3);
    const jobRef = `SL-${prefix}-${String(count + 1).padStart(4, "0")}`;

    // Create job
    const job = await prisma.job.create({
      data: {
        jobRef, workshopId: ws.id, vehicleId: vehicle.id,
        customerName, customerPhone, customerEmail: customerEmail || null,
        complaint, notes: notes || null,
        fuelLevel: fuelLevel || "HALF",
        mileageIn: mileage ? parseInt(mileage) : null,
        status: "RECEIVED", priority: "NORMAL",
        source: "QR_CHECKIN",
      },
    });

    // Record status history
    await prisma.jobStatusHistory.create({
      data: { jobId: job.id, status: "RECEIVED", note: "Customer self check-in via QR code" },
    });

    res.status(201).json({ jobRef: job.jobRef, id: job.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create check-in" });
  }
});

module.exports = router;

