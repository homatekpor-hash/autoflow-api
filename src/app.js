const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const authRoutes     = require("./routes/auth");
const workshopRoutes = require("./routes/workshops");
const jobRoutes      = require("./routes/jobs");
const checkinRoutes  = require("./routes/checkin");
const estimateRoutes = require("./routes/estimates");
const userRoutes     = require("./routes/users");
const reportRoutes   = require("./routes/reports");
const invoiceRoutes  = require("./routes/invoices");
const vehicleRoutes  = require("./routes/vehicles");

const app = express();

// ─── Global middleware ────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: true || "*", credentials: true }));
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: "1.0.0", timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth",      authRoutes);
app.use("/api/workshops", workshopRoutes);
app.use("/api/jobs",      jobRoutes);
app.use("/api/checkin",   checkinRoutes);   // public — no auth
app.use("/api/estimates", estimateRoutes);
app.use("/api/users",     userRoutes);
app.use("/api/reports",   reportRoutes);
app.use("/api",           invoiceRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/intake",   require("./routes/intake"));
app.use("/api/wip",       require("./routes/wip"));
app.use("/api/estimates",  require("./routes/estimateEngine"));
app.use("/api/inventory",  require("./routes/inventory"));
app.use("/api/workforce", require("./routes/workforce"));
app.use("/api/roles",     require("./routes/roles"));
app.use("/api/cx",        require("./routes/cx"));

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || "Internal server error",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});

module.exports = app;

