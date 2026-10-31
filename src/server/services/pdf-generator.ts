/**
 * TrimNova — PDF Generation Service
 * Generates customer invoices and vendor settlement invoices using PDFKit.
 *
 * Invoice Types:
 *   1. Customer Invoice  — Seller-to-Customer (B2C tax invoice with HSN, GST)
 *   2. Settlement Invoice — TrimNova-to-Seller (commission deduction statement)
 */

import PDFDocument from 'pdfkit';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InvoiceLineItem {
  description: string;
  hsnCode: string;
  quantity: number;
  unit: string;
  unitPrice: number;      // in ₹
  taxableAmount: number;  // in ₹
  gstRate: number;        // e.g. 12 for 12%
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
}

export interface CustomerInvoiceData {
  invoiceNumber: string;
  invoiceDate: string;           // ISO date string
  orderNumber: string;

  // Seller (Vendor)
  sellerName: string;
  sellerGstin: string;
  sellerAddress: string;
  sellerState: string;
  sellerStateCode: string;

  // Buyer (Customer)
  buyerName: string;
  buyerGstin?: string;
  buyerAddress: string;
  buyerState: string;
  buyerStateCode: string;

  // Supply
  placeOfSupply: string;
  isInterState: boolean;         // IGST if true, CGST+SGST if false

  lineItems: InvoiceLineItem[];

  // Totals
  subtotal: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  roundOff: number;
  grandTotal: number;

  // Optional
  couponDiscount?: number;
  shippingCharge?: number;
  paymentMode?: string;
  termsAndConditions?: string;
}

export interface SettlementLineItem {
  orderNumber: string;
  subOrderNumber: string;
  productDescription: string;
  deliveredDate: string;
  grossAmount: number;
  vendorDiscount: number;
  commissionBasis: number;
  marginRate: number;
  commissionAmt: number;
  gstOnCommission: number;
  tdsAmount: number;
  returnDeductions: number;
  netPayable: number;
}

export interface SettlementInvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  settlementBatchId: string;
  settlementPeriod: string;      // e.g. "1 Oct – 15 Oct 2026"

  // TrimNova (Buyer of services)
  platformName: string;
  platformGstin: string;
  platformAddress: string;

  // Vendor (Seller of services)
  vendorName: string;
  vendorCode: string;
  vendorGstin: string;
  vendorPan: string;
  vendorBankAccount: string;
  vendorIfsc: string;
  vendorAddress: string;

  lineItems: SettlementLineItem[];

  // Totals
  totalGross: number;
  totalCommission: number;
  totalGstOnCommission: number;
  totalTds: number;
  totalReturns: number;
  netSettlementAmount: number;

  // Payment info
  utrNumber?: string;
  paymentDate?: string;
}

// ─── Color Palette ────────────────────────────────────────────────────────────
const COLORS = {
  primary: '#4F46E5',
  dark: '#0F172A',
  slate: '#1E293B',
  muted: '#64748B',
  light: '#F4F6FB',
  border: '#E2E8F0',
  emerald: '#10B981',
  amber: '#F59E0B',
  coral: '#EF4444',
  white: '#FFFFFF',
};

// ─── Helper: rupee format ─────────────────────────────────────────────────────
function fmt(amount: number): string {
  return `\u20B9${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Helper: number to words (Indian system) ─────────────────────────────────
function numberToWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  if (num === 0) return 'Zero';

  function convertHundreds(n: number): string {
    if (n > 999) return '';
    let result = '';
    if (n >= 100) {
      result += ones[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      result += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    }
    if (n > 0) result += ones[n] + ' ';
    return result;
  }

  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const remainder = num % 1000;

  let result = '';
  if (crore > 0) result += convertHundreds(crore) + 'Crore ';
  if (lakh > 0) result += convertHundreds(lakh) + 'Lakh ';
  if (thousand > 0) result += convertHundreds(thousand) + 'Thousand ';
  if (remainder > 0) result += convertHundreds(remainder);

  return result.trim() + ' Rupees Only';
}

// ─── Helper: PDF buffer from doc ─────────────────────────────────────────────
function pdfToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

// ─── Helper: draw horizontal rule ────────────────────────────────────────────
function drawRule(doc: PDFKit.PDFDocument, y: number, color = COLORS.border): void {
  doc.moveTo(40, y).lineTo(555, y).strokeColor(color).lineWidth(0.5).stroke();
}

// ─── Helper: section header ───────────────────────────────────────────────────
function sectionHeader(doc: PDFKit.PDFDocument, text: string, y: number, color = COLORS.primary): void {
  doc.rect(40, y, 515, 20).fill(color);
  doc.fillColor(COLORS.white).fontSize(9).font('Helvetica-Bold')
    .text(text.toUpperCase(), 48, y + 6, { width: 499 });
  doc.fillColor(COLORS.dark);
}

// ─── generateCustomerInvoicePdf ───────────────────────────────────────────────

/**
 * Generate a GST-compliant seller-to-customer tax invoice PDF.
 */
export async function generateCustomerInvoicePdf(
  data: CustomerInvoiceData
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    info: {
      Title: `Tax Invoice ${data.invoiceNumber}`,
      Author: data.sellerName,
      Subject: `Order ${data.orderNumber}`,
      Creator: 'TrimNova Platform',
    },
  });

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.rect(40, 40, 515, 60).fill(COLORS.slate);
  doc.fillColor(COLORS.white).fontSize(20).font('Helvetica-Bold')
    .text('TAX INVOICE', 48, 52, { width: 300 });
  doc.fontSize(8).font('Helvetica')
    .text(`Facilitated by TrimNova Marketplace`, 48, 76, { width: 300 });

  doc.fillColor(COLORS.white).fontSize(9)
    .text(`Invoice No: ${data.invoiceNumber}`, 360, 52, { width: 195, align: 'right' })
    .text(`Date: ${new Date(data.invoiceDate).toLocaleDateString('en-IN')}`, 360, 65, { width: 195, align: 'right' })
    .text(`Order: ${data.orderNumber}`, 360, 78, { width: 195, align: 'right' });

  doc.fillColor(COLORS.dark);

  // ── Seller / Buyer Info ──────────────────────────────────────────────────────
  let y = 118;
  sectionHeader(doc, 'Seller Details', y);
  y += 26;

  doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.dark)
    .text(data.sellerName, 48, y);
  y += 14;
  doc.fontSize(8.5).font('Helvetica').fillColor(COLORS.muted)
    .text(data.sellerAddress, 48, y, { width: 230 });
  y += doc.heightOfString(data.sellerAddress, { width: 230 }) + 4;
  doc.text(`State: ${data.sellerState} (${data.sellerStateCode})`, 48, y);
  y += 14;
  doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLORS.slate)
    .text(`GSTIN: ${data.sellerGstin}`, 48, y);

  // Buyer on the right
  const buyerStartY = 118 + 26;
  doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.dark)
    .text(data.buyerName, 295, buyerStartY);
  doc.fontSize(8.5).font('Helvetica').fillColor(COLORS.muted)
    .text(data.buyerAddress, 295, buyerStartY + 14, { width: 260 });
  doc.text(`State: ${data.buyerState} (${data.buyerStateCode})`, 295, buyerStartY + 14 + doc.heightOfString(data.buyerAddress, { width: 260 }) + 4);
  if (data.buyerGstin) {
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLORS.slate)
      .text(`GSTIN: ${data.buyerGstin}`, 295, buyerStartY + 50);
  }

  // Place of supply
  y = Math.max(y + 20, 220);
  drawRule(doc, y);
  y += 8;
  doc.fontSize(8.5).font('Helvetica').fillColor(COLORS.muted)
    .text(`Place of Supply: ${data.placeOfSupply}`, 48, y)
    .text(`Tax Type: ${data.isInterState ? 'IGST (Interstate)' : 'CGST + SGST (Intrastate)'}`, 295, y);
  y += 20;

  // ── Line Items Table ─────────────────────────────────────────────────────────
  sectionHeader(doc, 'Item Details', y);
  y += 24;

  // Table headers
  const cols = { desc: 48, hsn: 220, qty: 268, rate: 310, taxable: 355, gst: 410, total: 470 };
  doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.muted);
  doc.text('Description', cols.desc, y, { width: 168 });
  doc.text('HSN', cols.hsn, y, { width: 44, align: 'center' });
  doc.text('Qty', cols.qty, y, { width: 38, align: 'right' });
  doc.text('Rate', cols.rate, y, { width: 40, align: 'right' });
  doc.text('Taxable', cols.taxable, y, { width: 52, align: 'right' });
  doc.text('GST', cols.gst, y, { width: 56, align: 'right' });
  doc.text('Total', cols.total, y, { width: 85, align: 'right' });
  y += 14;
  drawRule(doc, y, COLORS.slate);
  y += 6;

  // Table rows
  doc.font('Helvetica').fillColor(COLORS.dark);
  for (const [i, item] of data.lineItems.entries()) {
    if (i % 2 === 0) {
      doc.rect(40, y - 3, 515, 18).fill(COLORS.light);
      doc.fillColor(COLORS.dark);
    }
    doc.fontSize(8.5).text(item.description, cols.desc, y, { width: 168 });
    doc.text(item.hsnCode, cols.hsn, y, { width: 44, align: 'center' });
    doc.text(`${item.quantity} ${item.unit}`, cols.qty, y, { width: 38, align: 'right' });
    doc.text(fmt(item.unitPrice), cols.rate, y, { width: 40, align: 'right' });
    doc.text(fmt(item.taxableAmount), cols.taxable, y, { width: 52, align: 'right' });

    const gstLabel = data.isInterState
      ? `IGST ${item.gstRate}%`
      : `CGST ${item.gstRate / 2}%+SGST ${item.gstRate / 2}%`;
    const gstAmt = data.isInterState ? item.igst : (item.cgst + item.sgst);
    doc.text(`${gstLabel}\n${fmt(gstAmt)}`, cols.gst, y, { width: 56, align: 'right' });
    doc.text(fmt(item.totalAmount), cols.total, y, { width: 85, align: 'right' });
    y += 24;
  }

  y += 6;
  drawRule(doc, y);
  y += 12;

  // ── Totals ────────────────────────────────────────────────────────────────────
  const totalColL = 360;
  const totalColR = 470;
  const totalWidth = 85;

  const addTotalRow = (label: string, amount: number, bold = false, color = COLORS.dark) => {
    doc.fontSize(9)
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fillColor(COLORS.muted)
      .text(label, totalColL, y, { width: 104 });
    doc.fillColor(color)
      .text(fmt(amount), totalColR, y, { width: totalWidth, align: 'right' });
    y += 16;
  };

  addTotalRow('Subtotal', data.subtotal);
  if (data.couponDiscount) addTotalRow('Coupon Discount', -data.couponDiscount, false, COLORS.emerald);
  if (data.shippingCharge) addTotalRow('Shipping', data.shippingCharge ?? 0);
  if (!data.isInterState) {
    addTotalRow(`CGST`, data.totalCgst);
    addTotalRow(`SGST`, data.totalSgst);
  } else {
    addTotalRow(`IGST`, data.totalIgst);
  }
  if (data.roundOff !== 0) addTotalRow('Round Off', data.roundOff);
  drawRule(doc, y);
  y += 8;
  doc.rect(totalColL - 10, y - 4, 199, 22).fill(COLORS.slate);
  doc.fillColor(COLORS.white).fontSize(10).font('Helvetica-Bold')
    .text('Grand Total', totalColL, y, { width: 104 })
    .text(fmt(data.grandTotal), totalColR, y, { width: totalWidth, align: 'right' });
  doc.fillColor(COLORS.dark);
  y += 30;

  // ── Amount in Words ────────────────────────────────────────────────────────
  doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLORS.slate)
    .text('Amount in Words: ', 48, y, { continued: true });
  doc.font('Helvetica').fillColor(COLORS.muted)
    .text(numberToWords(Math.round(data.grandTotal)));
  y += 20;

  // ── Terms ──────────────────────────────────────────────────────────────────
  if (data.termsAndConditions) {
    drawRule(doc, y);
    y += 10;
    doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.muted).text('Terms & Conditions', 48, y);
    y += 12;
    doc.fontSize(8).font('Helvetica').fillColor(COLORS.muted)
      .text(data.termsAndConditions, 48, y, { width: 515 });
    y += 20;
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  doc.rect(40, y + 10, 515, 30).fill(COLORS.light);
  doc.fontSize(7.5).font('Helvetica').fillColor(COLORS.muted)
    .text(
      'This is a computer-generated invoice. No physical signature required. ' +
      'Facilitated by TrimNova Marketplace — GSTIN: ' + (process.env.PLATFORM_GSTIN ?? '27AABCT1234C1ZX'),
      48, y + 18, { width: 499, align: 'center' }
    );

  return pdfToBuffer(doc);
}

// ─── generateSettlementInvoicePdf ─────────────────────────────────────────────

/**
 * Generate a TrimNova-to-Vendor settlement invoice showing commission deductions,
 * GST on commission, TDS @ 194-O, and net payable.
 */
export async function generateSettlementInvoicePdf(
  data: SettlementInvoiceData
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    layout: 'landscape',
    info: {
      Title: `Settlement Invoice ${data.invoiceNumber}`,
      Author: 'TrimNova Marketplace',
      Subject: `Settlement Batch ${data.settlementBatchId}`,
      Creator: 'TrimNova Platform',
    },
  });

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.rect(40, 40, 762, 65).fill(COLORS.slate);
  doc.fillColor(COLORS.white).fontSize(18).font('Helvetica-Bold')
    .text('VENDOR SETTLEMENT STATEMENT', 56, 52, { width: 400 });
  doc.fontSize(8).font('Helvetica')
    .text(`TrimNova Marketplace · GSTIN: ${data.platformGstin}`, 56, 76, { width: 400 });

  doc.fillColor('#A5B4FC').fontSize(9)
    .text(`Invoice No: ${data.invoiceNumber}`, 500, 52, { width: 295, align: 'right' })
    .text(`Date: ${new Date(data.invoiceDate).toLocaleDateString('en-IN')}`, 500, 64, { width: 295, align: 'right' })
    .text(`Settlement Period: ${data.settlementPeriod}`, 500, 76, { width: 295, align: 'right' })
    .text(`Batch ID: ${data.settlementBatchId}`, 500, 88, { width: 295, align: 'right' });

  doc.fillColor(COLORS.dark);

  // ── Parties ───────────────────────────────────────────────────────────────
  let y = 125;
  doc.fontSize(9).font('Helvetica-Bold').fillColor(COLORS.slate)
    .text('FROM (Platform)', 48, y)
    .text('TO (Vendor)', 430, y);
  y += 14;

  doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLORS.dark)
    .text(data.platformName, 48, y)
    .text(`${data.vendorName} · ${data.vendorCode}`, 430, y);
  y += 12;
  doc.fontSize(8).font('Helvetica').fillColor(COLORS.muted)
    .text(data.platformAddress, 48, y, { width: 360 })
    .text(data.vendorAddress, 430, y, { width: 360 });
  y += 24;
  doc.fontSize(8).font('Helvetica-Bold').fillColor(COLORS.slate)
    .text(`GSTIN: ${data.platformGstin}`, 48, y)
    .text(`GSTIN: ${data.vendorGstin}  PAN: ${data.vendorPan}`, 430, y);
  y += 14;
  doc.fontSize(8).font('Helvetica').fillColor(COLORS.muted)
    .text(`Bank A/C: ${data.vendorBankAccount}  IFSC: ${data.vendorIfsc}`, 430, y);

  y += 28;

  // ── Transactions Table ────────────────────────────────────────────────────
  sectionHeader(doc, 'Transaction Details', y, COLORS.slate);
  y += 26;

  const tc = {
    order: 48, sub: 115, desc: 175, date: 295, gross: 355, disc: 405,
    basis: 452, comm: 500, gstComm: 548, tds: 596, ret: 640, net: 690,
  };

  doc.fontSize(7.5).font('Helvetica-Bold').fillColor(COLORS.muted);
  doc.text('Order', tc.order, y, { width: 63 });
  doc.text('Sub-Order', tc.sub, y, { width: 56 });
  doc.text('Product', tc.desc, y, { width: 116 });
  doc.text('Date', tc.date, y, { width: 56 });
  doc.text('Gross', tc.gross, y, { width: 46, align: 'right' });
  doc.text('V.Disc', tc.disc, y, { width: 44, align: 'right' });
  doc.text('Basis', tc.basis, y, { width: 44, align: 'right' });
  doc.text('Comm', tc.comm, y, { width: 44, align: 'right' });
  doc.text('GST/C', tc.gstComm, y, { width: 44, align: 'right' });
  doc.text('TDS', tc.tds, y, { width: 40, align: 'right' });
  doc.text('Returns', tc.ret, y, { width: 46, align: 'right' });
  doc.text('Net', tc.net, y, { width: 60, align: 'right' });
  y += 14;
  drawRule(doc, y, COLORS.slate);
  y += 6;

  doc.font('Helvetica').fillColor(COLORS.dark);

  for (const [i, item] of data.lineItems.entries()) {
    if (i % 2 === 0) {
      doc.rect(40, y - 3, 762, 16).fill(COLORS.light);
      doc.fillColor(COLORS.dark);
    }
    doc.fontSize(7.5);
    doc.text(item.orderNumber, tc.order, y, { width: 63 });
    doc.text(item.subOrderNumber, tc.sub, y, { width: 56 });
    doc.text(item.productDescription, tc.desc, y, { width: 116 });
    doc.text(new Date(item.deliveredDate).toLocaleDateString('en-IN'), tc.date, y, { width: 56 });
    doc.text(fmt(item.grossAmount), tc.gross, y, { width: 46, align: 'right' });
    doc.text(fmt(item.vendorDiscount), tc.disc, y, { width: 44, align: 'right' });
    doc.text(fmt(item.commissionBasis), tc.basis, y, { width: 44, align: 'right' });
    doc.fillColor(COLORS.coral).text(fmt(item.commissionAmt), tc.comm, y, { width: 44, align: 'right' });
    doc.fillColor(COLORS.coral).text(fmt(item.gstOnCommission), tc.gstComm, y, { width: 44, align: 'right' });
    doc.fillColor(COLORS.amber).text(fmt(item.tdsAmount), tc.tds, y, { width: 40, align: 'right' });
    doc.fillColor(COLORS.dark).text(fmt(item.returnDeductions), tc.ret, y, { width: 46, align: 'right' });
    doc.fillColor(COLORS.emerald).font('Helvetica-Bold')
      .text(fmt(item.netPayable), tc.net, y, { width: 60, align: 'right' });
    doc.fillColor(COLORS.dark).font('Helvetica');
    y += 16;
  }

  drawRule(doc, y);
  y += 12;

  // ── Summary ───────────────────────────────────────────────────────────────
  sectionHeader(doc, 'Settlement Summary', y, COLORS.primary);
  y += 26;

  const summaryCol1 = 430;
  const summaryCol2 = 700;

  const addSumRow = (label: string, amount: number, bold = false, color = COLORS.dark) => {
    doc.fontSize(9).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(COLORS.muted)
      .text(label, summaryCol1, y, { width: 250 });
    doc.fillColor(color).text(fmt(amount), summaryCol2, y, { width: 100, align: 'right' });
    y += 16;
  };

  addSumRow('Total Gross Value', data.totalGross);
  addSumRow('Less: Commission Amount', -data.totalCommission, false, COLORS.coral);
  addSumRow('Less: GST on Commission (18%)', -data.totalGstOnCommission, false, COLORS.coral);
  addSumRow('Less: TDS u/s 194-O (1%)', -data.totalTds, false, COLORS.amber);
  if (data.totalReturns > 0) {
    addSumRow('Less: Return Deductions', -data.totalReturns, false, COLORS.amber);
  }
  drawRule(doc, y);
  y += 8;

  doc.rect(summaryCol1 - 8, y - 4, 410, 26).fill(COLORS.emerald);
  doc.fillColor(COLORS.white).fontSize(11).font('Helvetica-Bold')
    .text('Net Settlement Amount', summaryCol1, y, { width: 260 })
    .text(fmt(data.netSettlementAmount), summaryCol2, y, { width: 100, align: 'right' });
  doc.fillColor(COLORS.dark);
  y += 36;

  // ── Payment Details ────────────────────────────────────────────────────────
  if (data.utrNumber || data.paymentDate) {
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(COLORS.slate)
      .text('Payment Details:', 48, y);
    y += 14;
    if (data.utrNumber) {
      doc.fontSize(8.5).font('Helvetica').fillColor(COLORS.muted)
        .text(`UTR Number: `, 48, y, { continued: true }).fillColor(COLORS.dark).font('Helvetica-Bold')
        .text(data.utrNumber);
      y += 14;
    }
    if (data.paymentDate) {
      doc.fontSize(8.5).font('Helvetica').fillColor(COLORS.muted)
        .text(`Payment Date: `, 48, y, { continued: true }).fillColor(COLORS.dark).font('Helvetica-Bold')
        .text(new Date(data.paymentDate).toLocaleDateString('en-IN'));
      y += 14;
    }
  }

  // ── Legal Notes ────────────────────────────────────────────────────────────
  y += 10;
  drawRule(doc, y);
  y += 10;
  doc.fontSize(7.5).font('Helvetica').fillColor(COLORS.muted)
    .text(
      'TDS deducted u/s 194-O of Income Tax Act, 1961 @ 1%. GST on commission charged @ 18% (SAC 9985). ' +
      'This document serves as a settlement statement and TDS certificate for vendor records. ' +
      'Vendor may raise query within 7 days of receipt.',
      48, y, { width: 762, align: 'justify' }
    );

  y += 20;
  doc.rect(40, y, 762, 28).fill(COLORS.light);
  doc.fontSize(7).font('Helvetica').fillColor(COLORS.muted)
    .text(
      `Computer-generated document · TrimNova Marketplace · GSTIN: ${data.platformGstin} · ${data.platformAddress}`,
      48, y + 10, { width: 762, align: 'center' }
    );

  return pdfToBuffer(doc);
}
