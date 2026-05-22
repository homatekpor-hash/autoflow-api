const jwt  = require("jsonwebtoken");
const prisma = require("../config/database");

const JWT_SECRET = process.env.JWT_SECRET || "autoflow-ghana-2026";

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Support both sub and userId in payload
    const userId = payload.sub || payload.userId;
    if (!userId) return res.status(401).json({ error: "Invalid token" });

    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { id: true, name: true, email: true, role: true, status: true, workshopId: true },
    });
    if (!user || user.status !== "ACTIVE") {
      return res.status(401).json({ error: "Account inactive or not found" });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { authenticate, JWT_SECRET };
