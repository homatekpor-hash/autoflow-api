const { PrismaClient } = require("@prisma/client");

// Single shared instance — avoids connection exhaustion in dev with hot-reload
const prisma = global.__prisma || new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

module.exports = prisma;
