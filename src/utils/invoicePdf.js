const PDFDocument = require("pdfkit");

const ORANGE = "#f97316";
const INK    = "#0f1117";
const MUTED  = "#6b7280";
const LIGHT  = "#f9fafb";
const WHITE  = "#ffffff";
const GREEN  = "#15803d";
const DARK   = "#111827";

function generateInvoicePdf(job, res) {
  const { estimate, vehicle, workshop, invoice } = job;
  const invoiceNum = `INV-${job.jobRef}`;
  const date    = new Date().toLocaleDateString("en-GH", { day: "numeric", month: "long", year: "numeric" });
  const dueDate = new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-GH", { day: "numeric", month: "long", year: "numeric" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${invoiceNum}.pdf"`);

  const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
  doc.pipe(res);

  const W = doc.page.width;
  const M = 50;

  // ── Dark header band ─────────────────────────────────────────────────────────
  doc.rect(0, 0, W, 100).fill(DARK);

  // Workshop name (large, prominent)
  doc.fontSize(20).fillColor(WHITE).font("Helvetica-Bold")
     .text(workshop.name, M, 22);

  // Workshop location + phone
  doc.fontSize(9).fillColor("rgba(255,255,255,0.55)").font("Helvetica")
     .text(`${workshop.location || ""}${workshop.phone ? "  ·  " + workshop.phone : ""}`, M, 48);

  // Orange accent line under workshop name
  doc.rect(M, 62, 120, 2).fill(ORANGE);

  // INVOICE label right
  doc.fontSize(26).fillColor(ORANGE).font("Helvetica-Bold")
     .text("INVOICE", 0, 25, { align: "right", width: W - M });
  doc.fontSize(10).fillColor("rgba(255,255,255,0.7)").font("Helvetica")
     .text(invoiceNum, 0, 58, { align: "right", width: W - M });

  // ── Bill from / bill to ──────────────────────────────────────────────────────
  const infoY = 118;

  doc.fontSize(7).fillColor(ORANGE).font("Helvetica-Bold")
     .text("BILLED FROM", M, infoY);
  doc.fontSize(11).fillColor(INK).font("Helvetica-Bold")
     .text(workshop.name, M, infoY + 13);
  doc.fontSize(9).fillColor(MUTED).font("Helvetica")
     .text(workshop.location || "", M, infoY + 28)
     .text(workshop.phone || "", M, infoY + 41);

  doc.fontSize(7).fillColor(ORANGE).font("Helvetica-Bold")
     .text("BILLED TO", 320, infoY);
  doc.fontSize(11).fillColor(INK).font("Helvetica-Bold")
     .text(job.customerName || "Customer", 320, infoY + 13);
  doc.fontSize(9).fillColor(MUTED).font("Helvetica")
     .text(job.customerPhone || "", 320, infoY + 28)
     .text(`${vehicle.make || ""} ${vehicle.model || ""} ${vehicle.year || ""}`.trim(), 320, infoY + 41)
     .text(`Plate: ${vehicle.plate}`, 320, infoY + 54);

  // ── Meta strip ───────────────────────────────────────────────────────────────
  const metaY = infoY + 80;
  doc.rect(M, metaY, W - M * 2, 36).fill(LIGHT);

  const cols = [
    { label: "Invoice date", value: date },
    { label: "Due date",     value: dueDate },
    { label: "Job ref",      value: job.jobRef },
    { label: "Status",       value: invoice?.status === "PAID" ? "✓ PAID" : "PENDING" },
  ];
  const colW = (W - M * 2) / 4;
  cols.forEach((col, i) => {
    const cx = M + 10 + i * colW;
    doc.fontSize(7).fillColor(MUTED).font("Helvetica-Bold")
       .text(col.label.toUpperCase(), cx, metaY + 7);
    const isPaid = col.value === "✓ PAID";
    doc.fontSize(10).fillColor(isPaid ? GREEN : INK)
       .font(isPaid ? "Helvetica-Bold" : "Helvetica")
       .text(col.value, cx, metaY + 20);
  });

  // ── Line items ────────────────────────────────────────────────────────────────
  const tableY = metaY + 52;
  const colX = { desc: M, type: 300, qty: 360, rate: 415, total: 480 };

  // Header
  doc.rect(M, tableY, W - M * 2, 22).fill(DARK);
  doc.fontSize(8).fillColor(WHITE).font("Helvetica-Bold")
     .text("DESCRIPTION",  colX.desc + 8, tableY + 7)
     .text("TYPE",         colX.type,     tableY + 7)
     .text("QTY",          colX.qty,      tableY + 7)
     .text("RATE (GHS)",   colX.rate,     tableY + 7)
     .text("TOTAL (GHS)",  colX.total,    tableY + 7);

  const items = estimate?.items || [];
  let rowY = tableY + 22;

  items.forEach((item, i) => {
    doc.rect(M, rowY, W - M * 2, 22).fill(i % 2 === 0 ? WHITE : LIGHT);
    doc.fontSize(9).fillColor(INK).font("Helvetica")
       .text(item.description,                 colX.desc + 8, rowY + 6, { width: 230 });
    doc.fontSize(8).fillColor(MUTED)
       .text(item.type || "",                  colX.type,     rowY + 7);
    doc.fontSize(9).fillColor(INK)
       .text(String(item.quantity),            colX.qty,      rowY + 6)
       .text(fmt(item.rate),                   colX.rate,     rowY + 6)
       .text(fmt(item.quantity * item.rate),   colX.total,    rowY + 6);
    rowY += 22;
  });

  if (items.length === 0) {
    doc.rect(M, rowY, W - M * 2, 28).fill(LIGHT);
    doc.fontSize(9).fillColor(MUTED).text("No items on this estimate", M + 8, rowY + 9);
    rowY += 28;
  }

  doc.moveTo(M, rowY).lineTo(W - M, rowY).strokeColor("#e5e7eb").lineWidth(0.5).stroke();

  // ── Totals ────────────────────────────────────────────────────────────────────
  const totY = rowY + 16;
  [
    ["Subtotal",    estimate?.subtotal ?? 0],
    ["VAT (12.5%)", estimate?.tax      ?? 0],
  ].forEach(([label, val], i) => {
    const ty = totY + i * 22;
    doc.fontSize(9).fillColor(MUTED).font("Helvetica")
       .text(label,            380, ty)
       .text(`GHS ${fmt(val)}`,490, ty, { width: 55, align: "right" });
  });

  const totalBoxY = totY + 52;
  doc.rect(370, totalBoxY, W - M - 370, 32).fill(ORANGE);
  doc.fontSize(11).fillColor(WHITE).font("Helvetica-Bold")
     .text("TOTAL DUE",              380, totalBoxY + 10)
     .text(`GHS ${fmt(estimate?.total ?? 0)}`, 380, totalBoxY + 10, { width: W - M - 380, align: "right" });

  // ── Complaint / job notes ─────────────────────────────────────────────────────
  const detY = totalBoxY + 50;
  doc.rect(M, detY, 240, 65).fill(LIGHT);
  doc.fontSize(7).fillColor(ORANGE).font("Helvetica-Bold")
     .text("JOB COMPLAINT", M + 10, detY + 10);
  doc.fontSize(8.5).fillColor(INK).font("Helvetica")
     .text(job.complaint || "—", M + 10, detY + 24, { width: 220 });

  // Payment note
  doc.fontSize(8).fillColor(MUTED).font("Helvetica")
     .text("Payment due within 7 days. Mobile Money accepted.", M, detY + 80)
     .text(`Thank you for choosing ${workshop.name}!`, M, detY + 93);

  // ── Footer ────────────────────────────────────────────────────────────────────
  const footY = doc.page.height - 44;
  doc.rect(0, footY - 8, W, 52).fill(DARK);
  doc.fontSize(8).fillColor(ORANGE).font("Helvetica-Bold")
     .text(workshop.name, 0, footY, { align: "center", width: W });
  doc.fontSize(7).fillColor("rgba(255,255,255,0.4)").font("Helvetica")
     .text(`${workshop.location || ""}  ·  ${workshop.phone || ""}  ·  ${invoiceNum}  ·  ${date}`, 0, footY + 14, { align: "center", width: W });

  doc.end();
}

function fmt(n) {
  return Number(n || 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = { generateInvoicePdf };
