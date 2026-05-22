const prisma = require("../config/database");

/**
 * Generates a unique, human-readable job reference.
 * Format: SL-{WORKSHOP_PREFIX}-{ZERO_PADDED_NUMBER}
 * Example: SL-ACC-0042
 */
async function generateJobRef(workshopName) {
  // Take first 3 letters of first word of workshop name
  const prefix = workshopName.split(" ")[0].substring(0, 3).toUpperCase();

  // Count existing jobs for this workshop to determine next number
  const count = await prisma.job.count({
    where: { workshop: { name: { startsWith: workshopName.split(" ")[0] } } },
  });

  const number = String(count + 1).padStart(4, "0");
  return `SL-${prefix}-${number}`;
}

module.exports = { generateJobRef };
