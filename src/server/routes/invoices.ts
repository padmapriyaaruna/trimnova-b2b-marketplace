/**
 * TrimNova Invoices Router  —  /api/v1/invoices
 *
 * Generates PDFs on-the-fly via a pdf-generator service layer.
 * Three invoice types:
 *   1. Customer Tax Invoice  (delivered sub-order)
 *   2. Settlement Invoice    (commission breakdown per batch item)
 *   3. Onboarding Invoice    (vendor plan & registration fee)
 */

import { Router, Request, Response } from 'express';
import Decimal from 'decimal.js';
import { Role } from '@prisma/client';

import prisma from '../lib/prisma.js';
import { auth } from '../lib/rbac.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const router = Router();

// ─── PDF Generator ───────────────────────────────────────────────────────────
// Lightweight inline PDF builder using PDFKit (npm i pdfkit @types/pdfkit).
// Gracefully degrades to a minimal placeholder buffer if PDFKit is not installed.

type PDFRow = Record<string, string | number>;

interface InvoiceTemplate {
  title: string;
  invoiceNumber: string;
  date: string;
  from: { name: string; address?: string; gstin?: string };
  to: { name: string; address?: string; gstin?: string };
  lineItems: PDFRow[];
  totals: PDFRow[];
  footer?: string;
}

async function generatePdfBuffer(template: InvoiceTemplate): Promise<Buffer> {
  try {
    const PDFDocument = (await import('pdfkit')).default;

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── Header ─────────────────────────────────────────────────────
      doc.fontSize(20).fillColor('#4F46E5').text('TrimNova', 50, 50);
      doc.fontSize(10).fillColor('#64748B').text('B2B Garment Trims Marketplace', 50, 73);
      doc.fontSize(16).fillColor('#0F172A').text(template.title, 300, 50, { align: 'right' });
      doc.fontSize(10).fillColor('#64748B')
        .text(`Invoice #: ${template.invoiceNumber}`, 300, 73, { align: 'right' })
        .text(`Date: ${template.date}`, 300, 88, { align: 'right' });

      doc.moveTo(50, 110).lineTo(545, 110).stroke('#E2E8F0');

      // ── From / To ──────────────────────────────────────────────────
      let y = 125;
      doc.fontSize(8).fillColor('#94A3B8').text('FROM', 50, y).text('TO', 300, y);
      y += 14;
      doc.fontSize(10).fillColor('#0F172A').text(template.from.name, 50, y).text(template.to.name, 300, y);
      y += 14;
      if (template.from.address) doc.fontSize(9).fillColor('#64748B').text(template.from.address, 50, y);
      if (template.to.address)   doc.fontSize(9).fillColor('#64748B').text(template.to.address, 300, y);
      y += 14;
      if (template.from.gstin) doc.fontSize(8).fillColor('#94A3B8').text(`GSTIN: ${template.from.gstin}`, 50, y);
      if (template.to.gstin)   doc.fontSize(8).fillColor('#94A3B8').text(`GSTIN: ${template.to.gstin}`, 300, y);
      y += 30;

      doc.moveTo(50, y).lineTo(545, y).stroke('#E2E8F0');
      y += 15;

      // ── Line Items table ───────────────────────────────────────────
      if (template.lineItems.length > 0) {
        const cols = Object.keys(template.lineItems[0]);
        const colWidth = (545 - 50) / cols.length;
        doc.fontSize(8).fillColor('#94A3B8');
        cols.forEach((col, i) => doc.text(col.toUpperCase(), 50 + i * colWidth, y, { width: colWidth }));
        y += 16;
        doc.moveTo(50, y).lineTo(545, y).stroke('#E2E8F0');
        y += 8;
        template.lineItems.forEach((row) => {
          doc.fontSize(9).fillColor('#0F172A');
          cols.forEach((col, i) => doc.text(String(row[col] ?? ''), 50 + i * colWidth, y, { width: colWidth, ellipsis: true }));
          y += 16;
        });
      }

      y += 20;
      doc.moveTo(50, y).lineTo(545, y).stroke('#E2E8F0');
      y += 15;

      // ── Totals ─────────────────────────────────────────────────────
      template.totals.forEach((row) => {
        const [label, value] = Object.entries(row)[0];
        doc.fontSize(10).fillColor('#0F172A')
          .text(label, 350, y)
          .text(String(value), 450, y, { align: 'right', width: 95 });
        y += 16;
      });

      // ── Footer ─────────────────────────────────────────────────────
      if (template.footer) {
        doc.fontSize(8).fillColor('#94A3B8').text(template.footer, 50, 760, { align: 'center', width: 495 });
      }

      doc.end();
    });
  } catch (_err) {
    console.warn('[invoices] PDFKit not available; returning placeholder');
    return Buffer.from(
      `%PDF-1.4\n% TrimNova Invoice — ${template.invoiceNumber}\n% ${template.title}\n`,
      'utf8'
    );
  }
}

function sendPdf(res: Response, buffer: Buffer, filename: string): void {
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': buffer.length,
  });
  res.status(200).end(buffer);
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /customer/:orderId
 * Customer / Admin: Customer Tax Invoice PDF.
 */
router.get('/customer/:orderId', auth, async (req: Request, res: Response): Promise<void> => {
  const user = req.user!;

  try {
    const includeDetails = {
      customer: true,
      subOrders: {
        include: {
          lineItems: true,
          vendor: { select: { companyName: true, gstin: true, address: true } },
        },
      },
    } as const;

    let order: any;

    if (user.role === Role.CUSTOMER) {
      const customer = await prisma.customer.findUnique({ where: { userId: user.id } });
      if (!customer) { res.status(404).json({ success: false, error: 'Customer not found' }); return; }
      order = await prisma.order.findFirst({
        where: { id: req.params.orderId as string, customerId: customer.id },
        include: includeDetails,
      });
    } else if (user.role === Role.ADMIN || user.role === Role.APPROVER) {
      order = await prisma.order.findUnique({ where: { id: req.params.orderId as string }, include: includeDetails });
    } else {
      res.status(403).json({ success: false, error: 'Access denied' }); return;
    }

    if (!order) { res.status(404).json({ success: false, error: 'Order not found' }); return; }

    const lineItems: PDFRow[] = order.subOrders.flatMap((so: any) =>
      so.lineItems.map((li: any) => ({
        'Product': li.productName,
        'SKU': li.sku,
        'HSN': li.hsnCode,
        'Qty': li.quantity,
        'Unit Price': `₹${new Decimal(li.unitPrice.toString()).toFixed(2)}`,
        'GST%': `${li.gstRate}%`,
        'GST Amt': `₹${new Decimal(li.gstAmount.toString()).toFixed(2)}`,
        'Total': `₹${new Decimal(li.lineTotal.toString()).toFixed(2)}`,
      }))
    );

    const platformDiscount = new Decimal(order.platformDiscount.toString());
    const vendorDiscount = new Decimal(order.vendorDiscount.toString());
    const totalDiscount = platformDiscount.plus(vendorDiscount);

    const totals: PDFRow[] = [
      { 'Subtotal':       `₹${new Decimal(order.subtotal.toString()).toFixed(2)}` },
      { 'Total GST':      `₹${new Decimal(order.totalGst.toString()).toFixed(2)}` },
      { 'Shipping':       `₹${new Decimal(order.totalShipping.toString()).toFixed(2)}` },
    ];
    if (totalDiscount.gt(0)) {
      totals.push({ 'Discount': `-₹${totalDiscount.toFixed(2)}` });
    }
    totals.push({ '**Total Payable**': `₹${new Decimal(order.totalAmount.toString()).toFixed(2)}` });

    const invoiceNumber = `TN-INV-${order.orderNumber}`;
    const deliveryAddr: any = order.deliveryAddress ?? {};

    const buffer = await generatePdfBuffer({
      title: 'Customer Tax Invoice',
      invoiceNumber,
      date: new Date().toLocaleDateString('en-IN'),
      from: { name: 'TrimNova Platform Pvt. Ltd.', address: 'Bhiwandi Logistics Hub, MH 421302', gstin: '27AABCT1234Z1Z5' },
      to: {
        name: order.customer.companyName,
        address: `${deliveryAddr.line1 ?? ''}, ${deliveryAddr.city ?? ''}, ${deliveryAddr.state ?? ''} ${deliveryAddr.pincode ?? ''}`,
        gstin: order.customer.gstin ?? 'N/A',
      },
      lineItems,
      totals,
      footer: 'Computer-generated invoice. Queries: support@trimnova.in | GSTIN: 27AABCT1234Z1Z5',
    });

    sendPdf(res, buffer, `${invoiceNumber}.pdf`);
  } catch (err) {
    console.error('[GET /invoices/customer/:orderId]', err);
    res.status(500).json({ success: false, error: 'Failed to generate invoice' });
  }
});

/**
 * GET /settlement/:batchItemId
 * Admin / Vendor: Settlement Invoice PDF showing commission breakdown.
 */
router.get('/settlement/:batchItemId', auth, async (req: Request, res: Response): Promise<void> => {
  const user = req.user!;

  try {
    type SettlementItemWithRelations = {
      id: string;
      grossAmount: any; commissionAmt: any; gstOnCommission: any; tdsAmount: any; netPayable: any;
      adjustments: any; batchId: string | null; subOrderId: string; vendorId: string; status: any;
      createdAt: Date; updatedAt: Date;
      vendor: { companyName: string; gstin: string | null; address: string | null; city: string | null; state: string | null; pincode: string | null; userId: string };
      subOrder: { subOrderNumber: string; totalAmount: any; commissionAmount: any; netVendorPayable: any; slabMarginPct: any; deliveredAt: Date | null };
      batch: { batchNumber: string; paidAt: Date | null; bankUtr: string | null } | null;
    };

    const item = await prisma.settlementBatchItem.findUnique({
      where: { id: String(req.params.batchItemId) },
      include: {
        vendor: { select: { companyName: true, gstin: true, address: true, city: true, state: true, pincode: true, userId: true } },
        subOrder: { select: { subOrderNumber: true, totalAmount: true, commissionAmount: true, netVendorPayable: true, slabMarginPct: true, deliveredAt: true } },
        batch: { select: { batchNumber: true, paidAt: true, bankUtr: true } },
      },
    }) as unknown as SettlementItemWithRelations | null;

    if (!item) { res.status(404).json({ success: false, error: 'Settlement item not found' }); return; }

    if (user.role === Role.VENDOR && item.vendor.userId !== user.id) {
      res.status(403).json({ success: false, error: 'Access denied' }); return;
    }
    if (user.role !== Role.ADMIN && user.role !== Role.VENDOR && user.role !== Role.FINANCE_PREPARER && user.role !== Role.FINANCE_APPROVER) {
      res.status(403).json({ success: false, error: 'Access denied' }); return;
    }

    const gross = new Decimal(item.grossAmount.toString());
    const commission = new Decimal(item.commissionAmt.toString());
    const gstOnComm = new Decimal(item.gstOnCommission.toString());
    const tds = new Decimal(item.tdsAmount.toString());
    const net = new Decimal(item.netPayable.toString());

    const lineItems: PDFRow[] = [{
      'Description':                 `Sub-Order ${item.subOrder.subOrderNumber}`,
      'Gross Amount':                `₹${gross.toFixed(2)}`,
      [`Commission (${item.subOrder.slabMarginPct}%)`]: `₹${commission.toFixed(2)}`,
      'GST on Commission (18%)':     `₹${gstOnComm.toFixed(2)}`,
      'TDS (194-O 1%)':              `₹${tds.toFixed(2)}`,
      'Net Payable':                 `₹${net.toFixed(2)}`,
    }];

    const totals: PDFRow[] = [
      { 'Gross Amount':                    `₹${gross.toFixed(2)}` },
      { 'Less: Platform Commission':       `-₹${commission.toFixed(2)}` },
      { 'Less: GST on Commission (18%)':   `-₹${gstOnComm.toFixed(2)}` },
      { 'Less: TDS (194-O @ 1%)':          `-₹${tds.toFixed(2)}` },
      { '**Net Payable to Vendor**':       `₹${net.toFixed(2)}` },
    ];
    if (item.batch?.bankUtr) totals.push({ 'UTR Reference': item.batch.bankUtr });

    const invoiceNumber = `TN-STL-${item.batch?.batchNumber ?? item.id.slice(-8).toUpperCase()}`;
    const vendorAddress = [item.vendor.address, item.vendor.city, item.vendor.state, item.vendor.pincode].filter(Boolean).join(', ');

    const buffer = await generatePdfBuffer({
      title: 'TrimNova Settlement Invoice',
      invoiceNumber,
      date: item.batch?.paidAt ? item.batch.paidAt.toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN'),
      from: { name: 'TrimNova Platform Pvt. Ltd.', address: 'Bhiwandi Logistics Hub, MH 421302', gstin: '27AABCT1234Z1Z5' },
      to: { name: item.vendor.companyName, address: vendorAddress, gstin: item.vendor.gstin ?? 'N/A' },
      lineItems,
      totals,
      footer: 'Settlement per MoU signed at onboarding. Disputes within 48 hrs: finance@trimnova.in',
    });

    sendPdf(res, buffer, `${invoiceNumber}.pdf`);
  } catch (err) {
    console.error('[GET /invoices/settlement/:batchItemId]', err);
    res.status(500).json({ success: false, error: 'Failed to generate settlement invoice' });
  }
});

/**
 * GET /onboarding/:vendorId
 * Vendor / Admin: Onboarding Invoice PDF.
 */
router.get('/onboarding/:vendorId', auth, async (req: Request, res: Response): Promise<void> => {
  const user = req.user!;

  try {
    if (user.role === Role.VENDOR) {
      const vendor = await prisma.vendor.findUnique({ where: { userId: user.id } });
      if (!vendor || vendor.id !== req.params.vendorId) {
        res.status(403).json({ success: false, error: 'Access denied' }); return;
      }
    } else if (user.role !== Role.ADMIN && user.role !== Role.APPROVER) {
      res.status(403).json({ success: false, error: 'Access denied' }); return;
    }

    const invoice = await prisma.onboardingInvoice.findUnique({
      where: { vendorId: req.params.vendorId as string },
      include: {
        vendor: { select: { companyName: true, gstin: true, pan: true, plan: true, address: true, city: true, state: true, pincode: true } },
      },
    }) as any;

    if (!invoice) { res.status(404).json({ success: false, error: 'Onboarding invoice not found' }); return; }

    const planLabels: Record<string, string> = {
      ELITE: 'Elite Partner Plan — ₹24,999/yr',
      GOLD:  'Gold Partner Plan — ₹14,999/yr',
      BASIC: 'Basic Partner Plan — ₹4,999/yr',
    };

    const regFee    = new Decimal(invoice.registrationFee.toString());
    const planFee   = new Decimal(invoice.planFee.toString());
    const instaFee  = new Decimal(invoice.triminstaFee.toString());
    const subtotal  = new Decimal(invoice.subtotal.toString());
    const igst      = new Decimal(invoice.igst.toString());
    const discount  = new Decimal(invoice.discountAmount.toString());
    const total     = new Decimal(invoice.totalAmount.toString());

    const lineItems: PDFRow[] = [
      { 'Description': 'Vendor Registration Fee', 'HSN': '998311', 'Amount': `₹${regFee.toFixed(2)}` },
      { 'Description': planLabels[invoice.vendor.plan] ?? invoice.vendor.plan, 'HSN': '998311', 'Amount': `₹${planFee.toFixed(2)}` },
    ];
    if (instaFee.gt(0)) {
      lineItems.push({ 'Description': 'TrimInsta Hub Rental', 'HSN': '997212', 'Amount': `₹${instaFee.toFixed(2)}` });
    }

    const totals: PDFRow[] = [
      { 'Subtotal': `₹${subtotal.toFixed(2)}` },
      { 'IGST @ 18%': `₹${igst.toFixed(2)}` },
    ];
    if (discount.gt(0)) totals.push({ 'Coupon Discount': `-₹${discount.toFixed(2)}` });
    totals.push({ '**Total Amount**': `₹${total.toFixed(2)}` });

    const vendorAddress = [invoice.vendor.address, invoice.vendor.city, invoice.vendor.state, invoice.vendor.pincode].filter(Boolean).join(', ');

    const buffer = await generatePdfBuffer({
      title: 'Vendor Onboarding Invoice',
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.createdAt.toLocaleDateString('en-IN'),
      from: { name: 'TrimNova Platform Pvt. Ltd.', address: 'Bhiwandi Logistics Hub, MH 421302', gstin: '27AABCT1234Z1Z5' },
      to: { name: invoice.vendor.companyName, address: vendorAddress, gstin: invoice.vendor.gstin ?? 'N/A' },
      lineItems,
      totals,
      footer: `PAN: ${invoice.vendor.pan ?? 'N/A'} | Payment: ${invoice.paymentStatus} | Thank you for joining TrimNova!`,
    });

    sendPdf(res, buffer, `${invoice.invoiceNumber}.pdf`);
  } catch (err) {
    console.error('[GET /invoices/onboarding/:vendorId]', err);
    res.status(500).json({ success: false, error: 'Failed to generate onboarding invoice' });
  }
});

export default router;
