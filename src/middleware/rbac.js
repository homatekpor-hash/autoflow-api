/**
 * Role hierarchy — higher number = more permissions
 * SUPER_ADMIN > OWNER > BRANCH_MANAGER > SERVICE_ADVISOR > TECHNICIAN = CASHIER = PARTS_MANAGER > CUSTOMER
 */
const ROLE_LEVEL = {
  SUPER_ADMIN:     100,
  OWNER:           80,
  BRANCH_MANAGER:  60,
  SERVICE_ADVISOR: 40,
  TECHNICIAN:      20,
  CASHIER:         20,
  PARTS_MANAGER:   20,
  CUSTOMER:        5,
};

/**
 * Permission map — each permission lists which roles can access it
 * "own" means the role can only access their own data
 */
const PERMISSIONS = {
  // Platform
  platform_admin:    ["SUPER_ADMIN"],
  manage_owners:     ["SUPER_ADMIN"],

  // Workshops
  view_all_workshops:["SUPER_ADMIN","OWNER"],
  manage_workshops:  ["SUPER_ADMIN","OWNER"],
  view_own_workshop: ["SUPER_ADMIN","OWNER","BRANCH_MANAGER","SERVICE_ADVISOR","TECHNICIAN","CASHIER","PARTS_MANAGER"],

  // Staff
  manage_staff:      ["SUPER_ADMIN","OWNER","BRANCH_MANAGER"],
  view_staff:        ["SUPER_ADMIN","OWNER","BRANCH_MANAGER"],

  // Jobs
  create_jobs:       ["SUPER_ADMIN","OWNER","BRANCH_MANAGER","SERVICE_ADVISOR"],
  view_all_jobs:     ["SUPER_ADMIN","OWNER","BRANCH_MANAGER","SERVICE_ADVISOR","CASHIER"],
  view_own_jobs:     ["TECHNICIAN"],
  update_job_status: ["SUPER_ADMIN","OWNER","BRANCH_MANAGER","SERVICE_ADVISOR","TECHNICIAN"],

  // Estimates
  create_estimates:  ["SUPER_ADMIN","OWNER","BRANCH_MANAGER","SERVICE_ADVISOR","TECHNICIAN"],
  approve_estimates: ["CUSTOMER"],
  send_estimates:    ["SUPER_ADMIN","OWNER","BRANCH_MANAGER","SERVICE_ADVISOR"],

  // Invoices & payments
  manage_invoices:   ["SUPER_ADMIN","OWNER","BRANCH_MANAGER","CASHIER"],
  process_payments:  ["SUPER_ADMIN","OWNER","BRANCH_MANAGER","CASHIER","CUSTOMER"],
  view_invoices:     ["SUPER_ADMIN","OWNER","BRANCH_MANAGER","CASHIER","SERVICE_ADVISOR"],

  // Inventory
  manage_inventory:  ["SUPER_ADMIN","OWNER","BRANCH_MANAGER","PARTS_MANAGER"],
  view_inventory:    ["SUPER_ADMIN","OWNER","BRANCH_MANAGER","PARTS_MANAGER","SERVICE_ADVISOR","TECHNICIAN"],
  manage_purchase_orders: ["SUPER_ADMIN","OWNER","BRANCH_MANAGER","PARTS_MANAGER"],

  // Reports
  view_reports:      ["SUPER_ADMIN","OWNER","BRANCH_MANAGER"],
  view_commissions:  ["SUPER_ADMIN","OWNER","BRANCH_MANAGER","CASHIER"],

  // Workforce
  manage_workforce:  ["SUPER_ADMIN","OWNER","BRANCH_MANAGER"],
  time_tracking:     ["TECHNICIAN","SERVICE_ADVISOR"],

  // Customer portal
  customer_portal:   ["CUSTOMER"],
  track_own_job:     ["CUSTOMER"],
};

/**
 * requireRole(...roles) — gate by exact role name(s)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access denied. Required: ${roles.join(", ")}` });
    }
    next();
  };
}

/**
 * requirePermission(permission) — gate by permission key
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const allowed = PERMISSIONS[permission] || [];
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: `Permission denied: ${permission}` });
    }
    next();
  };
}

/**
 * requireLevel(minLevel) — gate by minimum role level
 */
function requireLevel(minLevel) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    const level = ROLE_LEVEL[req.user.role] || 0;
    if (level < minLevel) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

/**
 * requireWorkshopAccess — SUPER_ADMIN and OWNER bypass, others must match workshopId
 */
function requireWorkshopAccess(req, res, next) {
  const { user } = req;
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  if (["SUPER_ADMIN", "OWNER"].includes(user.role)) return next();

  const requestedId = req.params.workshopId || req.body.workshopId || req.query.workshopId;
  if (requestedId && user.workshopId !== requestedId) {
    return res.status(403).json({ error: "You do not have access to this workshop" });
  }
  next();
}

/**
 * Helper — check if user can access a resource (for use in controllers)
 */
function can(user, permission) {
  const allowed = PERMISSIONS[permission] || [];
  return allowed.includes(user.role);
}

/**
 * Filter jobs by role — technicians only see their own
 */
function jobsFilter(user, extraWhere = {}) {
  const base = { ...extraWhere };
  if (user.role === "TECHNICIAN") base.technicianId = user.id;
  if (!["SUPER_ADMIN","OWNER"].includes(user.role) && user.workshopId) base.workshopId = user.workshopId;
  return base;
}

module.exports = { requireRole, requirePermission, requireLevel, requireWorkshopAccess, can, jobsFilter, ROLE_LEVEL, PERMISSIONS };
