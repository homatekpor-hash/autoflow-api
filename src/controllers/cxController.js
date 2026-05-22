const prisma = require("../config/database");

// ─── Photos ───────────────────────────────────────────────────────────────────

// GET /api/cx/jobs/:jobId/photos
async function getPhotos(req, res, next) {
  try {
    const photos = await prisma.jobPhoto.findMany({
      where:   { jobId: req.params.jobId },
      orderBy: { takenAt: "asc" },
    });
    const before = photos.filter(p => p.type === "BEFORE");
    const after  = photos.filter(p => p.type === "AFTER");
    const video  = photos.filter(p => p.type === "VIDEO");
    res.json({ before, after, video, total: photos.length });
  } catch (err) { next(err); }
}

// POST /api/cx/jobs/:jobId/photos
async function addPhoto(req, res, next) {
  try {
    const { type, url, caption } = req.body;
    if (!["BEFORE","AFTER","VIDEO"].includes(type)) {
      return res.status(400).json({ error: "type must be BEFORE, AFTER, or VIDEO" });
    }
    const photo = await prisma.jobPhoto.create({
      data: { jobId: req.params.jobId, type, url, caption, uploadedById: req.user.id },
    });
    res.status(201).json(photo);
  } catch (err) { next(err); }
}

// DELETE /api/cx/photos/:id
async function deletePhoto(req, res, next) {
  try {
    await prisma.jobPhoto.delete({ where: { id: req.params.id } });
    res.json({ message: "Photo deleted" });
  } catch (err) { next(err); }
}

// ─── Feedback surveys ─────────────────────────────────────────────────────────

// GET /api/cx/jobs/:jobId/survey (public — token-based via tracking link)
async function getSurvey(req, res, next) {
  try {
    const survey = await prisma.feedbackSurvey.findUnique({ where: { jobId: req.params.jobId } });
    res.json(survey || { exists: false });
  } catch (err) { next(err); }
}

// POST /api/cx/jobs/:jobId/survey (public — no auth)
async function submitSurvey(req, res, next) {
  try {
    const { npsScore, satisfaction, timeliness, comment, customerId } = req.body;

    // Check not already submitted
    const existing = await prisma.feedbackSurvey.findUnique({ where: { jobId: req.params.jobId } });
    if (existing) return res.status(409).json({ error: "Survey already submitted" });

    // Award points if customer has a referral code
    let pointsAwarded = 50; // base points for completing survey

    const survey = await prisma.feedbackSurvey.create({
      data: {
        jobId:         req.params.jobId,
        customerId:    customerId || null,
        npsScore:      npsScore    !== undefined ? Number(npsScore)    : null,
        satisfaction:  satisfaction !== undefined ? Number(satisfaction) : null,
        timeliness:    timeliness  !== undefined ? Number(timeliness)  : null,
        comment:       comment || null,
        pointsAwarded,
      },
    });

    res.status(201).json({ survey, pointsAwarded, message: "Thank you! You've earned " + pointsAwarded + " bonus points." });
  } catch (err) { next(err); }
}

// GET /api/cx/surveys — list all surveys (staff)
async function listSurveys(req, res, next) {
  try {
    const workshopId = req.query.workshopId || req.user.workshopId;
    const surveys = await prisma.feedbackSurvey.findMany({
      where: workshopId ? { job: { workshopId } } : {},
      orderBy: { submittedAt: "desc" },
      take: 100,
    });

    // Compute averages
    const withScores = surveys.filter(s => s.npsScore !== null);
    const avgNps = withScores.length
      ? Math.round(withScores.reduce((s, x) => s + (x.npsScore || 0), 0) / withScores.length * 10) / 10
      : null;
    const avgSat = surveys.filter(s => s.satisfaction !== null).length
      ? Math.round(surveys.filter(s => s.satisfaction !== null).reduce((s, x) => s + (x.satisfaction || 0), 0) / surveys.filter(s => s.satisfaction !== null).length * 10) / 10
      : null;

    // NPS category
    const promoters  = withScores.filter(s => (s.npsScore || 0) >= 9).length;
    const detractors = withScores.filter(s => (s.npsScore || 0) <= 6).length;
    const npsIndex   = withScores.length
      ? Math.round(((promoters - detractors) / withScores.length) * 100)
      : null;

    res.json({ surveys, avgNps, avgSat, npsIndex, total: surveys.length });
  } catch (err) { next(err); }
}

// ─── Referrals ────────────────────────────────────────────────────────────────

// GET /api/cx/referral/:code — look up referral code (public)
async function getReferralCode(req, res, next) {
  try {
    const code = await prisma.referralCode.findUnique({
      where:   { code: req.params.code },
      include: { referrals: { orderBy: { createdAt: "desc" }, take: 20 } },
    });
    if (!code) return res.status(404).json({ error: "Referral code not found" });
    res.json(code);
  } catch (err) { next(err); }
}

// POST /api/cx/referral/generate — generate a referral code for a customer
async function generateReferralCode(req, res, next) {
  try {
    const { customerPhone, userId } = req.body;
    const base = customerPhone
      ? customerPhone.replace(/\D/g, "").slice(-6)
      : Math.random().toString(36).slice(-6).toUpperCase();
    const code = "SL-" + base.toUpperCase();

    const existing = await prisma.referralCode.findFirst({
      where: { OR: [{ code }, { customerPhone }] },
    });
    if (existing) return res.json(existing);

    const referralCode = await prisma.referralCode.create({
      data: { code, customerPhone, userId },
    });
    res.status(201).json(referralCode);
  } catch (err) { next(err); }
}

// POST /api/cx/referral/:code/use — record a referral usage
async function useReferralCode(req, res, next) {
  try {
    const { referredPhone, jobId } = req.body;
    const codeRecord = await prisma.referralCode.findUnique({ where: { code: req.params.code } });
    if (!codeRecord) return res.status(404).json({ error: "Code not found" });

    const referral = await prisma.referral.create({
      data: { codeId: codeRecord.id, referredPhone, jobId, rewardAmount: 25, pointsAwarded: 50 },
    });

    await prisma.referralCode.update({
      where: { id: codeRecord.id },
      data:  { totalReferrals: { increment: 1 }, totalEarned: { increment: 25 }, points: { increment: 50 } },
    });

    res.status(201).json({ referral, message: "Referral recorded. Customer will earn ₵25 reward." });
  } catch (err) { next(err); }
}

// GET /api/cx/referral/:code/rewards — get reward options
async function getRewards(req, res) {
  const REWARDS = [
    { id: "oil_change",    label: "Free oil change",        points: 200, value: "₵120" },
    { id: "discount_10",   label: "10% off next service",   points: 350, value: "Up to ₵200 off" },
    { id: "full_service",  label: "Free full service",      points: 500, value: "₵350 value" },
    { id: "referral_cash", label: "Cash reward ₵50",        points: 400, value: "₵50 cash" },
  ];
  res.json(REWARDS);
}

// ─── Digital service booklet ──────────────────────────────────────────────────

// GET /api/cx/booklet/:plate — full service history as structured data
async function getBooklet(req, res, next) {
  try {
    const plate   = req.params.plate.toUpperCase();
    const vehicle = await prisma.vehicle.findUnique({ where: { plate } });
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });

    const jobs = await prisma.job.findMany({
      where:   { vehicleId: vehicle.id, status: "DELIVERED" },
      include: {
        workshop:  { select: { name: true, location: true, phone: true } },
        technician: { select: { name: true } },
        estimate:  { select: { total: true } },
      },
      orderBy: { completedAt: "desc" },
    });

    const totalSpend = jobs.reduce((s, j) => s + (j.estimate?.total || 0), 0);
    const lastJob    = jobs[0];
    const nextServiceKm = lastJob ? lastJob.mileage + 10000 : null;

    res.json({
      vehicle,
      totalVisits: jobs.length,
      totalSpend:  Math.round(totalSpend * 100) / 100,
      lastMileage: lastJob?.mileage || null,
      nextServiceKm,
      jobs: jobs.map(j => ({
        jobRef:    j.jobRef,
        date:      j.completedAt,
        service:   j.complaint,
        mileage:   j.mileage,
        workshop:  j.workshop.name,
        tech:      j.technician?.name,
        cost:      j.estimate?.total || 0,
      })),
    });
  } catch (err) { next(err); }
}

// ─── Analytics ────────────────────────────────────────────────────────────────

// GET /api/cx/analytics
async function getAnalytics(req, res, next) {
  try {
    const workshopId = req.query.workshopId || req.user.workshopId;
    const where = workshopId ? { job: { workshopId } } : {};

    const [surveys, referrals] = await Promise.all([
      prisma.feedbackSurvey.findMany({ where, select: { npsScore: true, satisfaction: true } }),
      prisma.referralCode.findMany({ select: { totalReferrals: true, totalEarned: true } }),
    ]);

    const withNps = surveys.filter(s => s.npsScore !== null);
    const promoters  = withNps.filter(s => (s.npsScore || 0) >= 9).length;
    const detractors = withNps.filter(s => (s.npsScore || 0) <= 6).length;
    const npsIndex   = withNps.length ? Math.round(((promoters - detractors) / withNps.length) * 100) : 0;

    res.json({
      totalSurveys:    surveys.length,
      npsIndex,
      avgSatisfaction: surveys.length ? Math.round(surveys.reduce((s, x) => s + (x.satisfaction || 0), 0) / surveys.length * 10) / 10 : 0,
      totalReferrals:  referrals.reduce((s, r) => s + r.totalReferrals, 0),
      totalRewardsGiven: referrals.reduce((s, r) => s + r.totalEarned, 0),
    });
  } catch (err) { next(err); }
}

module.exports = {
  getPhotos, addPhoto, deletePhoto,
  getSurvey, submitSurvey, listSurveys,
  getReferralCode, generateReferralCode, useReferralCode, getRewards,
  getBooklet, getAnalytics,
};
