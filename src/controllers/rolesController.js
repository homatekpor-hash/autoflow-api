const { ROLE_LEVEL, PERMISSIONS } = require("../middleware/rbac");
const prisma = require("../config/database");

const ROLE_DEFINITIONS = [
  {
    id:    "SUPER_ADMIN",
    label: "Platform Super Admin",
    icon:  "🛡️",
    color: "#7c3aed",
    desc:  "Full platform control. Manages all owners, billing, system config.",
    level: 100,
    canManage: [],
  },
  {
    id:    "OWNER",
    label: "Workshop Owner",
    icon:  "👑",
    color: "#dc2626",
    desc:  "Full control over their workshop network. Sees all branches, staff, revenue.",
    level: 80,
    canManage: ["BRANCH_MANAGER","SERVICE_ADVISOR","TECHNICIAN","CASHIER","PARTS_MANAGER"],
  },
  {
    id:    "BRANCH_MANAGER",
    label: "Branch Manager",
    icon:  "🏭",
    color: "#2563eb",
    desc:  "Manages one branch. Full access to jobs, staff, estimates, and reports for that branch.",
    level: 60,
    canManage: ["SERVICE_ADVISOR","TECHNICIAN","CASHIER","PARTS_MANAGER"],
  },
  {
    id:    "SERVICE_ADVISOR",
    label: "Service Advisor",
    icon:  "📋",
    color: "#0891b2",
    desc:  "Handles customer intake, job creation, estimates, and customer communication.",
    level: 40,
    canManage: [],
  },
  {
    id:    "TECHNICIAN",
    label: "Technician",
    icon:  "🔧",
    color: "#d97706",
    desc:  "Sees only assigned jobs. Can update status, add notes, and log time.",
    level: 20,
    canManage: [],
  },
  {
    id:    "CASHIER",
    label: "Cashier",
    icon:  "💳",
    color: "#059669",
    desc:  "Handles payments, invoices, and receipts. Cannot modify job or estimate data.",
    level: 20,
    canManage: [],
  },
  {
    id:    "PARTS_MANAGER",
    label: "Parts Manager",
    icon:  "📦",
    color: "#7c3aed",
    desc:  "Full inventory access. Purchase orders, stock movements, supplier management.",
    level: 20,
    canManage: [],
  },
  {
    id:    "CUSTOMER",
    label: "Customer",
    icon:  "🚗",
    color: "#6b7280",
    desc:  "Public portal only. Tracks own job, views/approves estimates, pays invoices.",
    level: 5,
    canManage: [],
  },
];

// ─── GET /api/roles ───────────────────────────────────────────────────────────
async function listRoles(req, res) {
  // Attach permission counts
  const roles = ROLE_DEFINITIONS.map(role => ({
    ...role,
    permissions: Object.entries(PERMISSIONS)
      .filter(([, allowed]) => allowed.includes(role.id))
      .map(([key]) => key),
  }));
  res.json(roles);
}

// ─── GET /api/roles/my-permissions ───────────────────────────────────────────
async function myPermissions(req, res) {
  const role = req.user.role;
  const granted = Object.entries(PERMISSIONS)
    .filter(([, allowed]) => allowed.includes(role))
    .map(([key]) => key);
  const def = ROLE_DEFINITIONS.find(r => r.id === role);
  res.json({ role, level: ROLE_LEVEL[role] || 0, permissions: granted, definition: def });
}

// ─── PUT /api/users/:id/role ──────────────────────────────────────────────────
async function changeRole(req, res, next) {
  try {
    const { role } = req.body;
    const validRoles = ROLE_DEFINITIONS.map(r => r.id);
    if (!validRoles.includes(role)) return res.status(400).json({ error: "Invalid role" });

    // Only SUPER_ADMIN can assign SUPER_ADMIN or OWNER roles
    if (["SUPER_ADMIN","OWNER"].includes(role) && req.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({ error: "Only Super Admins can assign Owner or Super Admin roles" });
    }

    // Check the requester can manage this role
    const requesterDef = ROLE_DEFINITIONS.find(r => r.id === req.user.role);
    if (requesterDef && !requesterDef.canManage.includes(role) && req.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({ error: `You cannot assign the ${role} role` });
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data:  { role },
      select: { id: true, name: true, email: true, role: true, workshopId: true },
    });
    res.json(user);
  } catch (err) { next(err); }
}

// ─── GET /api/roles/assignable ────────────────────────────────────────────────
// Returns which roles the current user can assign
async function assignableRoles(req, res) {
  const def = ROLE_DEFINITIONS.find(r => r.id === req.user.role);
  const canAssign = req.user.role === "SUPER_ADMIN"
    ? ROLE_DEFINITIONS.map(r => r.id)
    : (def?.canManage || []);

  res.json(ROLE_DEFINITIONS.filter(r => canAssign.includes(r.id)));
}

module.exports = { listRoles, myPermissions, changeRole, assignableRoles };
