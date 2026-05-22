const prisma = require("../config/database");

// GET /api/workshops/qr/:token — public, no auth needed
async function getWorkshopByQR(req, res, next) {
  try {
    const ws = await prisma.workshop.findUnique({
      where: { qrToken: req.params.token },
      select: { id: true, name: true, location: true, phone: true, active: true },
    });
    if (!ws || !ws.active) return res.status(404).json({ error: "Workshop not found" });
    res.json(ws);
  } catch (err) { next(err); }
}

// POST /api/checkin/:token — public customer self check-in
async function selfCheckin(req, res, next) {
  try {
    const ws = await prisma.workshop.findUnique({ where: { qrToken: req.params.token } });
    if (!ws || !ws.active) return res.status(404).json({ error: "Workshop not found" });

    const {
      plate, make, model, year, color, mileage,
      customerName, customerPhone, customerEmail,
      complaint, urgency = "NORMAL",
    } = req.body;

    if (!plate || !make || !model || !customerName || !customerPhone || !complaint) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Upsert vehicle
    let vehicle = await prisma.vehicle.findFirst({ where: { plate: plate.toUpperCase() } });
    if (!vehicle) {
      vehicle = await prisma.vehicle.create({
        data: {
          plate: plate.toUpperCase(), make, model,
          year: year ? parseInt(year) : null,
          color: color || null,
          mileage: mileage ? parseInt(mileage) : null,
          ownerName: customerName, ownerPhone: customerPhone,
          ownerEmail: customerEmail || null,
        },
      });
    }

    // Generate job ref
    const count = await prisma.job.count({ where: { workshopId: ws.id } });
    const prefix = ws.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 3);
    const jobRef = `${prefix}-${String(count + 1).padStart(4, "0")}`;

    // Create job
    const job = await prisma.job.create({
      data: {
        jobRef,
        workshopId: ws.id,
        vehicleId: vehicle.id,
        customerName, customerPhone,
        customerEmail: customerEmail || null,
        complaint,
        urgency,
        status: "RECEIVED",
        
      },
    });

    // Record status history
    await prisma.jobStatusHistory.create({
      data: { jobId: job.id, status: "RECEIVED", note: "Customer self check-in via QR code" },
    });

    res.status(201).json({ jobRef: job.jobRef, job, message: "Check-in successful" });
  } catch (err) { next(err); }
}

module.exports = { getWorkshopByQR, selfCheckin };
