const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding AutoFlow Ghana...\n");
  const hash = (pw) => bcrypt.hash(pw, 12);

  // ─── SUPER ADMIN (AutoFlow platform — sees all workshops) ────────────────────
  await prisma.user.upsert({
    where: { email: "admin@autoflow.gh" }, update: {},
    create: { name: "AutoFlow Admin", email: "admin@autoflow.gh", passwordHash: await hash("admin1234"), role: "SUPER_ADMIN", status: "ACTIVE" },
  });

  // ─── WORKSHOP 1: Auto Ghana Limited ──────────────────────────────────────────
  const owner1 = await prisma.user.upsert({
    where: { email: "owner@autoghanaltd.gh" }, update: {},
    create: { name: "Owner - Auto Ghana Ltd", email: "owner@autoghanaltd.gh", passwordHash: await hash("owner1234"), role: "OWNER", status: "ACTIVE" },
  });
  const ws1 = await prisma.workshop.upsert({
    where: { qrToken: "auto-ghana-limited" }, update: { name: "Auto Ghana Limited" },
    create: { name: "Auto Ghana Limited", location: "Accra, Ghana", phone: "+233 30 000 0001", qrToken: "auto-ghana-limited" },
  });
  const mgr1 = await prisma.user.upsert({
    where: { email: "manager@autoghanaltd.gh" }, update: {},
    create: { name: "Manager - Auto Ghana Ltd", email: "manager@autoghanaltd.gh", passwordHash: await hash("manager1234"), role: "BRANCH_MANAGER", status: "ACTIVE", workshopId: ws1.id },
  });
  await prisma.user.upsert({ where: { email: "advisor@autoghanaltd.gh" }, update: {}, create: { name: "Service Advisor - AGL", email: "advisor@autoghanaltd.gh", passwordHash: await hash("advisor1234"), role: "SERVICE_ADVISOR", status: "ACTIVE", workshopId: ws1.id } });
  await prisma.user.upsert({ where: { email: "tech@autoghanaltd.gh"    }, update: {}, create: { name: "Technician - AGL",      email: "tech@autoghanaltd.gh",    passwordHash: await hash("tech1234"),    role: "TECHNICIAN",     status: "ACTIVE", workshopId: ws1.id } });
  await prisma.user.upsert({ where: { email: "cashier@autoghanaltd.gh" }, update: {}, create: { name: "Cashier - AGL",         email: "cashier@autoghanaltd.gh", passwordHash: await hash("cash1234"),    role: "CASHIER",        status: "ACTIVE", workshopId: ws1.id } });
  await prisma.user.upsert({ where: { email: "parts@autoghanaltd.gh"   }, update: {}, create: { name: "Parts Manager - AGL",   email: "parts@autoghanaltd.gh",   passwordHash: await hash("parts1234"),  role: "PARTS_MANAGER",  status: "ACTIVE", workshopId: ws1.id } });
  await prisma.workshop.update({ where: { id: ws1.id }, data: { managerId: mgr1.id } });

  // ─── WORKSHOP 2: Home Base ────────────────────────────────────────────────────
  const owner2 = await prisma.user.upsert({
    where: { email: "owner@homebase.gh" }, update: {},
    create: { name: "Owner - Home Base", email: "owner@homebase.gh", passwordHash: await hash("owner1234"), role: "OWNER", status: "ACTIVE" },
  });
  const ws2 = await prisma.workshop.upsert({
    where: { qrToken: "home-base-workshop" }, update: { name: "Home Base" },
    create: { name: "Home Base", location: "Accra, Ghana", phone: "+233 30 000 0002", qrToken: "home-base-workshop" },
  });
  const mgr2 = await prisma.user.upsert({
    where: { email: "manager@homebase.gh" }, update: {},
    create: { name: "Manager - Home Base", email: "manager@homebase.gh", passwordHash: await hash("manager1234"), role: "BRANCH_MANAGER", status: "ACTIVE", workshopId: ws2.id },
  });
  await prisma.user.upsert({ where: { email: "advisor@homebase.gh" }, update: {}, create: { name: "Service Advisor - HB", email: "advisor@homebase.gh", passwordHash: await hash("advisor1234"), role: "SERVICE_ADVISOR", status: "ACTIVE", workshopId: ws2.id } });
  await prisma.user.upsert({ where: { email: "tech@homebase.gh"    }, update: {}, create: { name: "Technician - HB",      email: "tech@homebase.gh",    passwordHash: await hash("tech1234"),    role: "TECHNICIAN",     status: "ACTIVE", workshopId: ws2.id } });
  await prisma.user.upsert({ where: { email: "cashier@homebase.gh" }, update: {}, create: { name: "Cashier - HB",         email: "cashier@homebase.gh", passwordHash: await hash("cash1234"),    role: "CASHIER",        status: "ACTIVE", workshopId: ws2.id } });
  await prisma.user.upsert({ where: { email: "parts@homebase.gh"   }, update: {}, create: { name: "Parts Manager - HB",   email: "parts@homebase.gh",   passwordHash: await hash("parts1234"),  role: "PARTS_MANAGER",  status: "ACTIVE", workshopId: ws2.id } });
  await prisma.workshop.update({ where: { id: ws2.id }, data: { managerId: mgr2.id } });

  // ─── WORKSHOP 3: ERICO AUTO MECHANICALS ──────────────────────────────────────
  const owner3 = await prisma.user.upsert({
    where: { email: "owner@erico.gh" }, update: {},
    create: { name: "Owner - ERICO AUTO", email: "owner@erico.gh", passwordHash: await hash("owner1234"), role: "OWNER", status: "ACTIVE" },
  });
  const ws3 = await prisma.workshop.upsert({
    where: { qrToken: "erico-auto-mechanicals" }, update: { name: "ERICO AUTO MECHANICALS" },
    create: { name: "ERICO AUTO MECHANICALS", location: "Accra, Ghana", phone: "+233 30 000 0003", qrToken: "erico-auto-mechanicals" },
  });
  const mgr3 = await prisma.user.upsert({
    where: { email: "manager@erico.gh" }, update: {},
    create: { name: "Manager - ERICO", email: "manager@erico.gh", passwordHash: await hash("manager1234"), role: "BRANCH_MANAGER", status: "ACTIVE", workshopId: ws3.id },
  });
  await prisma.user.upsert({ where: { email: "advisor@erico.gh" }, update: {}, create: { name: "Service Advisor - ERICO", email: "advisor@erico.gh", passwordHash: await hash("advisor1234"), role: "SERVICE_ADVISOR", status: "ACTIVE", workshopId: ws3.id } });
  await prisma.user.upsert({ where: { email: "tech@erico.gh"    }, update: {}, create: { name: "Technician - ERICO",      email: "tech@erico.gh",    passwordHash: await hash("tech1234"),    role: "TECHNICIAN",     status: "ACTIVE", workshopId: ws3.id } });
  await prisma.user.upsert({ where: { email: "cashier@erico.gh" }, update: {}, create: { name: "Cashier - ERICO",         email: "cashier@erico.gh", passwordHash: await hash("cash1234"),    role: "CASHIER",        status: "ACTIVE", workshopId: ws3.id } });
  await prisma.user.upsert({ where: { email: "parts@erico.gh"   }, update: {}, create: { name: "Parts Manager - ERICO",   email: "parts@erico.gh",   passwordHash: await hash("parts1234"),  role: "PARTS_MANAGER",  status: "ACTIVE", workshopId: ws3.id } });
  await prisma.workshop.update({ where: { id: ws3.id }, data: { managerId: mgr3.id } });

  console.log("✅ Seeded successfully!\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🛡️  PLATFORM ADMIN (sees all workshops)");
  console.log("    admin@autoflow.gh / admin1234");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🏭  AUTO GHANA LIMITED");
  console.log("    👑 owner@autoghanaltd.gh   / owner1234");
  console.log("    🏭 manager@autoghanaltd.gh / manager1234");
  console.log("    📋 advisor@autoghanaltd.gh / advisor1234");
  console.log("    🔧 tech@autoghanaltd.gh    / tech1234");
  console.log("    💳 cashier@autoghanaltd.gh / cash1234");
  console.log("    📦 parts@autoghanaltd.gh   / parts1234");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🏭  HOME BASE");
  console.log("    👑 owner@homebase.gh       / owner1234");
  console.log("    🏭 manager@homebase.gh     / manager1234");
  console.log("    📋 advisor@homebase.gh     / advisor1234");
  console.log("    🔧 tech@homebase.gh        / tech1234");
  console.log("    💳 cashier@homebase.gh     / cash1234");
  console.log("    📦 parts@homebase.gh       / parts1234");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🏭  ERICO AUTO MECHANICALS");
  console.log("    👑 owner@erico.gh          / owner1234");
  console.log("    🏭 manager@erico.gh        / manager1234");
  console.log("    📋 advisor@erico.gh        / advisor1234");
  console.log("    🔧 tech@erico.gh           / tech1234");
  console.log("    💳 cashier@erico.gh        / cash1234");
  console.log("    📦 parts@erico.gh          / parts1234");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main().catch(console.error).finally(() => prisma.$disconnect());
