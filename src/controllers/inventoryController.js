const { validationResult } = require("express-validator");
const prisma = require("../config/database");

function wsFilter(user) {
  if (user.role === "SUPER_ADMIN") return {};
  if (user.workshopId) return { workshopId: user.workshopId };
  return {};
}

async function listParts(req, res, next) {
  try {
    const parts = await prisma.part.findMany({ where: wsFilter(req.user), orderBy: { name: "asc" } });
    res.json(parts);
  } catch (err) { next(err); }
}

async function createPart(req, res, next) {
  try {
    const { name, sku, description, quantity, minQuantity, unitPrice, unit, category, brand } = req.body;
    const workshopId = req.user.workshopId || null;
    const price = parseFloat(unitPrice) || 0;
    const qty = parseInt(quantity) || 0;
    const part = await prisma.part.create({
      data: {
        name, sku,
        description: description || null,
        category: category || "General",
        brand: brand || null,
        costPrice: price,
        sellPrice: price,
        qty,
        minQty: parseInt(minQuantity) || 5,
        maxQty: 100,
        workshopId,
      },
    });
    if (qty > 0) {
      await prisma.stockMovement.create({ data: { partId: part.id, qty: qty, qtyBefore: 0, qtyAfter: qty, type: "STOCK_IN", note: "Initial stock" } });
    }
    res.status(201).json(part);
  } catch (err) { next(err); }
}

async function updatePart(req, res, next) {
  try {
    const part = await prisma.part.update({ where: { id: req.params.id }, data: req.body });
    res.json(part);
  } catch (err) { next(err); }
}

async function listMovements(req, res, next) {
  try {
    const movements = await prisma.stockMovement.findMany({
      where: wsFilter(req.user),
      include: { part: { select: { name: true, sku: true } } },
      orderBy: { createdAt: "desc" }, take: 100,
    });
    res.json(movements);
  } catch (err) { next(err); }
}

async function createMovement(req, res, next) {
  try {
    const { partId, quantity, type, note } = req.body;
    const workshopId = req.user.workshopId || null;
    const qty = parseInt(quantity);
    const part = await prisma.part.findUnique({ where: { id: partId } });
    if (!part) return res.status(404).json({ error: "Part not found" });
    const newQty = type === "STOCK_IN" ? part.qty + qty : part.qty - qty;
    if (newQty < 0) return res.status(400).json({ error: "Insufficient stock" });
    await prisma.$transaction([
      prisma.stockMovement.create({ data: { partId, qty: qty, qtyBefore: part.qty, qtyAfter: newQty, type, note: note || null } }),
      prisma.part.update({ where: { id: partId }, data: { qty: newQty } }),
    ]);
    res.status(201).json({ success: true, newQty });
  } catch (err) { next(err); }
}

async function listSuppliers(req, res, next) {
  try {
    const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
    res.json(suppliers);
  } catch (err) { next(err); }
}

async function analytics(req, res, next) {
  try {
    const parts = await prisma.part.findMany({ where: wsFilter(req.user) });
    const totalValue = parts.reduce((s, p) => s + (p.qty * p.sellPrice), 0);
    const lowStock = parts.filter(p => p.qty <= p.minQty);
    const categories = [...new Set(parts.map(p => p.category).filter(Boolean))];
    res.json({ totalParts: parts.length, totalValue, lowStockCount: lowStock.length, categories: categories.length });
  } catch (err) { next(err); }
}

module.exports = { listParts, createPart, updatePart, listMovements, createMovement, listSuppliers, analytics };

