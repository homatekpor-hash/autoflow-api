const { validationResult } = require("express-validator");
const prisma = require("../config/database");
const { generateJobRef } = require("../utils/jobRef");
const { notifyCheckinConfirmed } = require("../utils/notifications");

// Full job include for responses
const JOB_INCLUDE = {
  vehicle:        true,
  workshop:       { select: { id: true, name: true, location: true, phone: true } },
  technician:     { select: { id: true, name: true } },
  serviceAdvisor: { select: { id: true, name: true } },
  estimate:       { select: { id: true, status: true, total: true } },
};

// ─── POST /api/intake  (staff — authenticated) ────────────────────────────────
async function create(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      workshopId,
      // Vehicle
      plate, make, model, year, color, vin,
      // Job
      mileage, fuelLevel,
      customerName, customerPhone,
      complaint, advisorNotes,
      priority,
      // Intake details
      damageSpots, accessories, photos,
      customerSignature,
      // Assignment
      technicianId, serviceAdvisorId,
      expectedCompletion,
      // Extra
      towingRequired, towingFrom,
      insurancePolicyNo, isAccidentCase,
    } = req.body;

    // 1. Resolve workshop
    const workshop = await prisma.workshop.findUnique({ where: { id: workshopId } });
    if (!workshop) return res.status(404).json({ error: "Workshop not found" });

    // 2. Upsert vehicle
    const vehicle = await prisma.vehicle.upsert({
      where: { plate: plate.toUpperCase() },
      update: {
        ...(make  && { make }),
        ...(model && { model }),
        ...(year  && { year: Number(year) }),
        ...(color && { color }),
        ...(vin   && { vin }),
      },
      create: {
        plate: plate.toUpperCase(),
        make, model,
        year:  year  ? Number(year)  : undefined,
        color, vin,
      },
    });

    // 3. Generate job reference
    const jobRef = await generateJobRef(workshop.name);

    // 4. Create job
    const job = await prisma.job.create({
      data: {
        jobRef,
        workshopId: workshop.id,
        vehicleId:  vehicle.id,
        mileage:    Number(mileage),
        fuelLevel:  fuelLevel !== undefined ? Number(fuelLevel) : 5,
        customerName,
        customerPhone:     customerPhone  || null,
        complaint,
        advisorNotes:      advisorNotes   || null,
        priority:          priority       || "NORMAL",
        damageSpots:       damageSpots    || [],
        accessories:       accessories    || {},
        photos:            photos         || [],
        customerSignature: customerSignature || null,
        technicianId:      technicianId   || null,
        serviceAdvisorId:  serviceAdvisorId || null,
        expectedCompletion: expectedCompletion ? new Date(expectedCompletion) : null,
        towingRequired:    towingRequired  || false,
        towingFrom:        towingFrom      || null,
        insurancePolicyNo: insurancePolicyNo || null,
        isAccidentCase:    isAccidentCase  || false,
      },
      include: JOB_INCLUDE,
    });

    // 5. Record intake in status history
    await prisma.jobStatusHistory.create({
      data: {
        jobId:      job.id,
        status:     "RECEIVED",
        note:       "Job created via staff intake form",
        changedById: req.user.id,
      },
    });

    // 6. Fire SMS notification
    notifyCheckinConfirmed(job).catch(console.error);

    res.status(201).json(job);
  } catch (err) { next(err); }
}

// ─── GET /api/intake/lookup?plate=GR-1234-21  ─────────────────────────────────
// Lookup vehicle + customer history for returning customer recognition
async function lookup(req, res, next) {
  try {
    const { plate } = req.query;
    if (!plate) return res.status(400).json({ error: "plate is required" });

    const vehicle = await prisma.vehicle.findUnique({
      where: { plate: plate.toUpperCase() },
      include: {
        jobs: {
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            workshop:  { select: { name: true } },
            estimate:  { select: { total: true } },
          },
        },
      },
    });

    if (!vehicle) return res.json({ found: false });

    const jobs = vehicle.jobs;
    const lastJob = jobs[0];

    res.json({
      found:         true,
      vehicle:       { plate: vehicle.plate, make: vehicle.make, model: vehicle.model, year: vehicle.year, color: vehicle.color, vin: vehicle.vin },
      customer:      { name: lastJob?.customerName, phone: lastJob?.customerPhone },
      history: {
        totalVisits:  jobs.length,
        lastVisit:    lastJob?.createdAt,
        lastWorkshop: lastJob?.workshop?.name,
        lastMileage:  lastJob?.mileage,
        totalSpend:   jobs.reduce((s, j) => s + (j.estimate?.total || 0), 0),
        recentJobs:   jobs.map(j => ({
          jobRef:    j.jobRef,
          complaint: j.complaint,
          date:      j.createdAt,
          workshop:  j.workshop.name,
          amount:    j.estimate?.total || null,
        })),
      },
    });
  } catch (err) { next(err); }
}

module.exports = { create, lookup };
