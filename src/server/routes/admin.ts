/**
 * TrimNova — Admin Routes
 * /api/v1/admin
 *
 * Dashboard stats, escalation management, margin manager, coupon CRUD,
 * vendor management, platform config, and settlement batch workflows.
 *
 * NOTE: @types/express v5 types req.params[key] as `string | string[]`.
 * All param/query values are coerced via p() and q() helpers.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodemailer = require('nodemailer') as {
  createTransport(opts: Record<string, unknown>): {
    sendMail(opts: Record<string, unknown>): Promise<void>;
  };
};

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import Decimal from 'decimal.js';
import {
  Role,
  VendorStatus,
  ProductStatus,
  EscalationStatus,
  SettlementStatus,
  CouponType,
  CouponApplicableTo,
  CouponFunder,
} from '@prisma/client';

import prisma from '../lib/prisma.js';
import { authenticateToken, requireRole } from '../lib/rbac.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const router = Router();
const auth = authenticateToken;
const onlyAdmin = requireRole(Role.ADMIN);

// ─── Coerce helpers ───────────────────────────────────────────────────────────
/** Coerce req.params / req.query value → string */
const p = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? '';
const q = (v: unknown): string | undefined => {
  if (typeof v === 'string' && v) return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0] || undefined;
  return undefined;
};
const qint = (v: unknown, def: number): number => { const n = Number(v); return isNaN(n) ? def : Math.floor(n); };

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.mailtrap.io',
      port: Number(process.env.SMTP_PORT ?? 2525),
      auth: { user: process.env.SMTP_USER ?? '', pass: process.env.SMTP_PASS ?? '' },
    });
    await (transport as ReturnType<typeof nodemailer.createTransport>).sendMail({
      from: process.env.SMTP_FROM ?? 'noreply@trimnova.com',
      to, subject, html,
    });
  } catch (err) { console.error('[mailer]', err); }
}

async function createNotification(userId: string, subject: string, body: string,
  type: 'APPROVAL' | 'REJECTION' | 'SYSTEM' | 'ESCALATION' = 'SYSTEM'): Promise<void> {
  await prisma.notification.create({ data: { userId, subject, body, type, channel: 'IN_PORTAL' } });
}

// ─── GET /dashboard ───────────────────────────────────────────────────────────
router.get('/dashboard', auth, onlyAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const [
      vendorCountByStatus, vendorCountByPlan, orderVolume,
      settlementTotals, escalationCounts, activeProductCount,
    ] = await Promise.all([
      prisma.vendor.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.vendor.groupBy({ by: ['plan'], _count: { id: true } }),
      prisma.order.aggregate({
        _count: { id: true }, _sum: { totalAmount: true },
        where: { status: { notIn: ['CART', 'PAYMENT_PENDING', 'PAYMENT_FAILED'] } },
      }),
      prisma.settlementBatchItem.aggregate({
        _sum: { netPayable: true, grossAmount: true, commissionAmt: true },
        where: { status: SettlementStatus.PAID },
      }),
      prisma.escalation.groupBy({ by: ['status'], _count: { id: true } }),
      prisma.product.count({ where: { status: ProductStatus.APPROVED, isTemplate: false } }),
    ]);

    res.json({
      success: true,
      data: {
        vendors: {
          byStatus: Object.fromEntries(vendorCountByStatus.map((r) => [r.status, r._count.id])),
          byPlan: Object.fromEntries(vendorCountByPlan.map((r) => [r.plan, r._count.id])),
        },
        orders: { total: orderVolume._count.id, totalGmv: orderVolume._sum.totalAmount?.toString() ?? '0.00' },
        settlements: {
          totalPaid: settlementTotals._sum.netPayable?.toString() ?? '0.00',
          totalGross: settlementTotals._sum.grossAmount?.toString() ?? '0.00',
          totalCommission: settlementTotals._sum.commissionAmt?.toString() ?? '0.00',
        },
        escalations: Object.fromEntries(escalationCounts.map((r) => [r.status, r._count.id])),
        activeProducts: activeProductCount,
      },
    });
  } catch (err) {
    console.error('[admin-dashboard]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard stats' });
  }
});

// ─── GET /escalations ─────────────────────────────────────────────────────────
router.get('/escalations', auth, onlyAdmin, async (req: Request, res: Response): Promise<void> => {
  const statusRaw = q(req.query.status) as EscalationStatus | undefined;
  try {
    const escalations = await prisma.escalation.findMany({
      where: statusRaw ? { status: statusRaw } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        vendor: { select: { vendorCode: true, companyName: true, plan: true } },
        _count: { select: { items: true } },
      },
    });
    res.json({ success: true, data: escalations, total: escalations.length });
  } catch { res.status(500).json({ success: false, error: 'Failed to fetch escalations' }); }
});

// ─── GET /escalations/:caseId ─────────────────────────────────────────────────
router.get('/escalations/:caseId', auth, onlyAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const escalation = await prisma.escalation.findUnique({
      where: { id: p(req.params.caseId) },
      include: {
        vendor: { select: { id: true, vendorCode: true, companyName: true, plan: true, user: { select: { email: true } } } },
        items: { orderBy: { createdAt: 'asc' } },
        timeline: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!escalation) { res.status(404).json({ success: false, error: 'Escalation case not found' }); return; }
    res.json({ success: true, data: escalation });
  } catch { res.status(500).json({ success: false, error: 'Failed to fetch escalation detail' }); }
});

// ─── POST /escalations/:caseId/action ────────────────────────────────────────
const EscalationActionSchema = z.object({
  action: z.enum(['ACCEPT_PARTIAL', 'NEGOTIATE_FURTHER', 'APPROVE_ALL', 'REJECT_ALL']),
  adminNote: z.string().max(2000).optional(),
  corridorMarginPct: z.number().min(0).max(100).optional(),
});

router.post('/escalations/:caseId/action', auth, onlyAdmin, async (req: Request, res: Response): Promise<void> => {
  const parse = EscalationActionSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ success: false, error: 'Validation error', details: parse.error.flatten() }); return; }

  const { action, adminNote, corridorMarginPct } = parse.data;

  try {
    const escalation = await prisma.escalation.findUnique({
      where: { id: p(req.params.caseId) },
      include: {
        vendor: { select: { id: true, vendorCode: true, companyName: true, userId: true, user: { select: { email: true } } } },
        items: true,
      },
    }) as any;

    if (!escalation) { res.status(404).json({ success: false, error: 'Escalation case not found' }); return; }
    if (escalation.status === EscalationStatus.RESOLVED || escalation.status === EscalationStatus.ARCHIVED) {
      res.status(409).json({ success: false, error: `Case is already ${escalation.status}` }); return;
    }

    const now = new Date();
    const productIds = escalation.items.filter((i) => i.productId).map((i) => i.productId as string);

    switch (action) {
      case 'APPROVE_ALL': {
        const margin = corridorMarginPct !== undefined ? new Decimal(corridorMarginPct) : null;
        await prisma.$transaction(async (tx) => {
          if (margin !== null && productIds.length > 0) {
            for (const pid of productIds) {
              await tx.marginSlab.updateMany({
                where: { productId: pid, isActive: true },
                data: { marginPct: margin.toFixed(3), vendorNetPct: new Decimal(100).minus(margin).toFixed(3), agreedStatus: 'AGREED', setAt: now, appliesFrom: now },
              });
            }
          }
          if (productIds.length > 0) await tx.product.updateMany({ where: { id: { in: productIds } }, data: { status: ProductStatus.APPROVED } });
          await tx.escalationItem.updateMany({ where: { escalationId: escalation.id }, data: { status: 'ADMIN_OVERRIDDEN', resolvedMarginPct: margin?.toFixed(3) } });
          await tx.escalation.update({ where: { id: escalation.id }, data: { status: EscalationStatus.RESOLVED, resolvedById: req.user!.id, resolvedAt: now } });
          await tx.escalationTimeline.create({ data: { escalationId: escalation.id, actorId: req.user!.id, actorRole: Role.ADMIN, action: 'ADMIN_APPROVED_ALL', detail: `Corridor: ${margin?.toFixed(2) ?? 'unchanged'}. Note: ${adminNote ?? '-'}` } });
        });
        await createNotification(escalation.vendor.userId, 'Margin Dispute Resolved — Products Published', `Admin approved all disputed products for ${escalation.vendor.vendorCode}.`, 'APPROVAL');
        break;
      }

      case 'REJECT_ALL': {
        await prisma.$transaction([
          prisma.escalation.update({ where: { id: escalation.id }, data: { status: EscalationStatus.ARCHIVED, resolvedById: req.user!.id, resolvedAt: now } }),
          prisma.escalationTimeline.create({ data: { escalationId: escalation.id, actorId: req.user!.id, actorRole: Role.ADMIN, action: 'ADMIN_REJECTED_ALL', detail: adminNote ?? 'Admin rejected all.' } }),
        ]);
        await createNotification(escalation.vendor.userId, 'Margin Dispute Closed', `Admin declined all items for case ${escalation.caseNumber}.`, 'REJECTION');
        break;
      }

      case 'ACCEPT_PARTIAL': {
        if (corridorMarginPct === undefined) { res.status(400).json({ success: false, error: 'corridorMarginPct required for ACCEPT_PARTIAL' }); return; }
        const margin = new Decimal(corridorMarginPct);
        await prisma.$transaction(async (tx) => {
          for (const pid of productIds) {
            await tx.marginSlab.updateMany({ where: { productId: pid, isActive: true }, data: { marginPct: margin.toFixed(3), vendorNetPct: new Decimal(100).minus(margin).toFixed(3), agreedStatus: 'AGREED', setAt: now, appliesFrom: now } });
          }
          if (productIds.length > 0) await tx.product.updateMany({ where: { id: { in: productIds } }, data: { status: ProductStatus.APPROVED } });
          await tx.escalationItem.updateMany({ where: { escalationId: escalation.id }, data: { status: 'ADMIN_OVERRIDDEN', resolvedMarginPct: margin.toFixed(3) } });
          await tx.escalation.update({ where: { id: escalation.id }, data: { status: EscalationStatus.PARTIALLY_RESOLVED, resolvedById: req.user!.id, resolvedAt: now } });
          await tx.escalationTimeline.create({ data: { escalationId: escalation.id, actorId: req.user!.id, actorRole: Role.ADMIN, action: 'ADMIN_PARTIAL_ACCEPT', detail: `Corridor: ${margin.toFixed(2)}%. ${adminNote ?? ''}` } });
        });
        await createNotification(escalation.vendor.userId, 'Margin Dispute Partially Resolved', `Corridor margin ${corridorMarginPct}% applied. Products live.`, 'APPROVAL');
        break;
      }

      case 'NEGOTIATE_FURTHER': {
        await prisma.$transaction([
          prisma.escalation.update({ where: { id: escalation.id }, data: { status: EscalationStatus.UNDER_NEGOTIATION } }),
          prisma.escalationTimeline.create({ data: { escalationId: escalation.id, actorId: req.user!.id, actorRole: Role.ADMIN, action: 'ADMIN_RETURNED_FOR_NEGOTIATION', detail: adminNote ?? 'Admin returned.' } }),
        ]);
        const approvers = await prisma.user.findMany({ where: { role: Role.APPROVER, isActive: true }, select: { id: true } });
        for (const a of approvers) await createNotification(a.id, `Escalation Returned — ${escalation.caseNumber}`, `Re-negotiation required. Note: ${adminNote ?? '-'}`, 'SYSTEM');
        break;
      }
    }

    res.json({ success: true, message: `Escalation action '${action}' applied`, data: { caseNumber: escalation.caseNumber, action } });
  } catch (err) {
    console.error('[escalation-action]', err);
    res.status(500).json({ success: false, error: 'Failed to process escalation action' });
  }
});

// ─── GET /margin-manager ──────────────────────────────────────────────────────
router.get('/margin-manager', auth, onlyAdmin, async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, qint(req.query.page, 1));
  const limit = Math.min(100, Math.max(1, qint(req.query.limit, 50)));
  try {
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: { status: ProductStatus.APPROVED, isTemplate: false, vendorId: { not: null } },
        skip: (page - 1) * limit, take: limit, orderBy: { updatedAt: 'desc' },
        include: {
          marginSlabs: { where: { isActive: true }, orderBy: { slabNumber: 'asc' } },
          vendor: { select: { vendorCode: true, companyName: true, plan: true } },
          subcategory: { select: { name: true, category: { select: { name: true } } } },
        },
      }),
      prisma.product.count({ where: { status: ProductStatus.APPROVED, isTemplate: false, vendorId: { not: null } } }),
    ]);
    res.json({ success: true, data: products, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch { res.status(500).json({ success: false, error: 'Failed to fetch margin manager' }); }
});

// ─── PUT /margin-manager/products/:productId/slab/:slabNumber ─────────────────
const AdminUpdateSlabSchema = z.object({ marginPct: z.number().min(0).max(100), reason: z.string().max(500).optional() });

router.put('/margin-manager/products/:productId/slab/:slabNumber', auth, onlyAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const parse = AdminUpdateSlabSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ success: false, error: 'Validation error', details: parse.error.flatten() }); return; }

    const slabNumber = parseInt(p(req.params.slabNumber), 10);
    if (isNaN(slabNumber) || slabNumber < 1 || slabNumber > 5) { res.status(400).json({ success: false, error: 'slabNumber must be 1-5' }); return; }

    const { marginPct } = parse.data;
    try {
      const product = await prisma.product.findUnique({ where: { id: p(req.params.productId) }, select: { id: true, name: true, sku: true, vendorId: true } });
      if (!product) { res.status(404).json({ success: false, error: 'Product not found' }); return; }

      const marginD = new Decimal(marginPct);
      const now = new Date();
      const updated = await prisma.marginSlab.updateMany({
        where: { productId: product.id, slabNumber, isActive: true },
        data: { marginPct: marginD.toFixed(3), vendorNetPct: new Decimal(100).minus(marginD).toFixed(3), agreedStatus: 'AGREED', setByApprover: req.user!.userId, setAt: now, appliesFrom: now },
      });
      if (updated.count === 0) { res.status(404).json({ success: false, error: `Slab ${slabNumber} not found` }); return; }

      const slab = await prisma.marginSlab.findFirst({ where: { productId: product.id, slabNumber, isActive: true } });
      if (product.vendorId) {
        const vendor = await prisma.vendor.findUnique({ where: { id: product.vendorId }, select: { userId: true } });
        if (vendor) await createNotification(vendor.userId, `Margin Updated — Slab ${slabNumber}`, `Slab ${slabNumber} of ${product.name} set to ${marginPct}% (future orders).`, 'SYSTEM');
      }
      res.json({ success: true, message: `Slab ${slabNumber} updated (future orders only)`, data: slab });
    } catch (err) { console.error('[admin-slab-update]', err); res.status(500).json({ success: false, error: 'Failed to update margin slab' }); }
  }
);

// ─── POST /coupons ────────────────────────────────────────────────────────────
const CreateCouponSchema = z.object({
  type: z.nativeEnum(CouponType),
  value: z.number().positive(),
  maxDiscountAmt: z.number().positive().optional(),
  applicableTo: z.nativeEnum(CouponApplicableTo),
  funder: z.nativeEnum(CouponFunder).default(CouponFunder.PLATFORM),
  vendorId: z.string().cuid().optional(),
  expiresAt: z.string().datetime().optional(),
  isSingleUse: z.boolean().default(true),
  customCode: z.string().min(4).max(20).toUpperCase().optional(),
});

router.post('/coupons', auth, onlyAdmin, async (req: Request, res: Response): Promise<void> => {
  const parse = CreateCouponSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ success: false, error: 'Validation error', details: parse.error.flatten() }); return; }

  const { customCode, ...data } = parse.data;
  try {
    const code = customCode ?? crypto.randomBytes(9).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(12, '0').slice(0, 12);
    const existing = await prisma.coupon.findUnique({ where: { code } });
    if (existing) { res.status(409).json({ success: false, error: 'Coupon code already exists.' }); return; }

    const coupon = await prisma.coupon.create({
      data: {
        code, type: data.type,
        value: new Decimal(data.value).toFixed(2),
        maxDiscountAmt: data.maxDiscountAmt !== undefined ? new Decimal(data.maxDiscountAmt).toFixed(2) : null,
        applicableTo: data.applicableTo, funder: data.funder,
        vendorId: data.vendorId ?? null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        isSingleUse: data.isSingleUse, isUsed: false, createdById: req.user!.id,
      },
    });
    res.status(201).json({ success: true, data: coupon });
  } catch (err) { console.error('[create-coupon]', err); res.status(500).json({ success: false, error: 'Failed to create coupon' }); }
});

// ─── GET /coupons ─────────────────────────────────────────────────────────────
router.get('/coupons', auth, onlyAdmin, async (req: Request, res: Response): Promise<void> => {
  const usedStr = q(req.query.used);
  const filterUsed = usedStr !== undefined ? usedStr === 'true' : undefined;
  try {
    const coupons = await prisma.coupon.findMany({ where: filterUsed !== undefined ? { isUsed: filterUsed } : undefined, orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: coupons, total: coupons.length });
  } catch { res.status(500).json({ success: false, error: 'Failed to list coupons' }); }
});

// ─── DELETE /coupons/:id ──────────────────────────────────────────────────────
router.delete('/coupons/:id', auth, onlyAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const coupon = await prisma.coupon.findUnique({ where: { id: p(req.params.id) } });
    if (!coupon) { res.status(404).json({ success: false, error: 'Coupon not found' }); return; }
    if (coupon.isUsed) { res.status(409).json({ success: false, error: 'Cannot revoke a used coupon', usedAt: coupon.usedAt }); return; }
    await prisma.coupon.delete({ where: { id: coupon.id } });
    res.json({ success: true, message: `Coupon ${coupon.code} revoked` });
  } catch { res.status(500).json({ success: false, error: 'Failed to revoke coupon' }); }
});

// ─── GET /vendors ─────────────────────────────────────────────────────────────
router.get('/vendors', auth, onlyAdmin, async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, qint(req.query.page, 1));
  const limit = Math.min(100, Math.max(1, qint(req.query.limit, 25)));
  const statusRaw = q(req.query.status) as VendorStatus | undefined;

  try {
    const where = statusRaw ? { status: statusRaw } : {};
    const [vendors, total] = await Promise.all([
      prisma.vendor.findMany({
        where, skip: (page - 1) * limit, take: limit, orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { email: true, isActive: true, lastLoginAt: true } },
          certificates: { select: { certType: true, status: true } },
          onboardingInvoice: { select: { totalAmount: true, paymentStatus: true, paidAt: true } },
          _count: { select: { products: true, subOrders: true } },
        },
      }),
      prisma.vendor.count({ where }),
    ]);
    res.json({ success: true, data: vendors, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch { res.status(500).json({ success: false, error: 'Failed to list vendors' }); }
});

// ─── PUT /vendors/:vendorId/status ────────────────────────────────────────────
const UpdateVendorStatusSchema = z.object({ status: z.nativeEnum(VendorStatus), reason: z.string().max(500).optional() });

router.put('/vendors/:vendorId/status', auth, onlyAdmin, async (req: Request, res: Response): Promise<void> => {
  const parse = UpdateVendorStatusSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ success: false, error: 'Validation error', details: parse.error.flatten() }); return; }

  const { status, reason } = parse.data;
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: p(req.params.vendorId) },
      include: { user: { select: { email: true } } },
    }) as any;
    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

    const updated = await prisma.vendor.update({ where: { id: vendor.id }, data: { status } });

    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'VENDOR_STATUS_UPDATE', resource: 'vendor', resourceId: vendor.id, detail: { vendorCode: vendor.vendorCode, newStatus: status, reason } } });
    await createNotification(vendor.userId, `Account Status: ${status}`, `Your account is now ${status}.${reason ? ` Reason: ${reason}` : ''}`, 'SYSTEM');
    await sendEmail(vendor.user.email, `[TrimNova] Account Status — ${status}`, `<h2>Status Changed</h2><p>Dear ${vendor.companyName}, your account is now <strong>${status}</strong>.</p>${reason ? `<p>Reason: ${reason}</p>` : ''}`);

    res.json({ success: true, data: updated });
  } catch { res.status(500).json({ success: false, error: 'Failed to update vendor status' }); }
});

// ─── GET /platform-config ─────────────────────────────────────────────────────
router.get('/platform-config', auth, onlyAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const configs = await prisma.platformConfig.findMany({ orderBy: { key: 'asc' } });
    res.json({ success: true, data: configs, total: configs.length });
  } catch { res.status(500).json({ success: false, error: 'Failed to fetch platform config' }); }
});

// ─── PUT /platform-config/:key ────────────────────────────────────────────────
const UpdateConfigSchema = z.object({ value: z.string().min(1).max(1000), description: z.string().max(500).optional() });

const ALLOWED_CONFIG_KEYS = ['registrationFeeAmount', 'elitePlanFee', 'goldPlanFee', 'basicPlanFee',
  'returnPolicyDays', 'triminstaRatePerSqft', 'defaultGstRate', 'tdsRate',
  'platformCommissionDefault', 'settlementCycleDays', 'maxOrderLineItems'];

router.put('/platform-config/:key', auth, onlyAdmin, async (req: Request, res: Response): Promise<void> => {
  const parse = UpdateConfigSchema.safeParse(req.body);
  if (!parse.success) { res.status(400).json({ success: false, error: 'Validation error', details: parse.error.flatten() }); return; }

  const key = p(req.params.key);
  if (!ALLOWED_CONFIG_KEYS.includes(key)) {
    res.status(422).json({ success: false, error: `Key '${key}' not updatable here`, allowedKeys: ALLOWED_CONFIG_KEYS }); return;
  }

  try {
    const config = await prisma.platformConfig.upsert({
      where: { key },
      update: { value: parse.data.value, description: parse.data.description, updatedById: req.user!.id },
      create: { key, value: parse.data.value, description: parse.data.description, updatedById: req.user!.id },
    });
    await prisma.auditLog.create({ data: { userId: req.user!.id, action: 'PLATFORM_CONFIG_UPDATE', resource: 'platform_config', resourceId: config.id, detail: { key, newValue: parse.data.value } } });
    res.json({ success: true, data: config });
  } catch { res.status(500).json({ success: false, error: 'Failed to update config' }); }
});

// ─── GET /settlements/eligible ────────────────────────────────────────────────
router.get('/settlements/eligible', auth, requireRole(Role.ADMIN, Role.FINANCE_PREPARER, Role.FINANCE_APPROVER),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const items = await prisma.settlementBatchItem.findMany({
        where: { status: SettlementStatus.ELIGIBLE, batchId: null },
        orderBy: { createdAt: 'asc' },
        include: {
          vendor: { select: { vendorCode: true, companyName: true } },
          subOrder: { select: { subOrderNumber: true, deliveredAt: true } },
        },
      });
      const totalPayable = items.reduce((s, i) => s.plus(new Decimal(i.netPayable.toString())), new Decimal(0)).toFixed(2);
      res.json({ success: true, data: items, total: items.length, totalPayable });
    } catch { res.status(500).json({ success: false, error: 'Failed to fetch eligible settlements' }); }
  }
);

// ─── POST /settlements/batches ────────────────────────────────────────────────
const CreateBatchSchema = z.object({
  itemIds: z.array(z.string().cuid()).min(1),
  notes: z.string().max(500).optional(),
});

router.post('/settlements/batches', auth, requireRole(Role.ADMIN, Role.FINANCE_PREPARER),
  async (req: Request, res: Response): Promise<void> => {
    const parse = CreateBatchSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ success: false, error: 'Validation error', details: parse.error.flatten() }); return; }

    const { itemIds, notes } = parse.data;
    try {
      const items = await prisma.settlementBatchItem.findMany({ where: { id: { in: itemIds }, status: SettlementStatus.ELIGIBLE, batchId: null } });
      if (items.length !== itemIds.length) { res.status(422).json({ success: false, error: `Found ${items.length} of ${itemIds.length} eligible items.` }); return; }

      const totalAmount = items.reduce((s, i) => s.plus(new Decimal(i.netPayable.toString())), new Decimal(0)).toFixed(2);
      const batchNumber = `STLB-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000 + 1000))}`;

      const batch = await prisma.$transaction(async (tx) => {
        const newBatch = await tx.settlementBatch.create({ data: { batchNumber, status: SettlementStatus.BATCH_DRAFT, preparedById: req.user!.id, totalAmount, itemCount: items.length, notes } });
        await tx.settlementBatchItem.updateMany({ where: { id: { in: itemIds } }, data: { batchId: newBatch.id, status: SettlementStatus.PENDING_APPROVAL } });
        return newBatch;
      });

      res.status(201).json({ success: true, message: `Batch ${batchNumber} created with ${items.length} items`, data: batch });
    } catch (err) { console.error('[create-batch]', err); res.status(500).json({ success: false, error: 'Failed to create batch' }); }
  }
);

// ─── GET /settlements/batches ─────────────────────────────────────────────────
router.get('/settlements/batches', auth, requireRole(Role.ADMIN, Role.FINANCE_PREPARER, Role.FINANCE_APPROVER),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const batches = await prisma.settlementBatch.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { items: true } } } });
      res.json({ success: true, data: batches, total: batches.length });
    } catch { res.status(500).json({ success: false, error: 'Failed to list batches' }); }
  }
);

// ─── GET /settlements/batches/:batchId ───────────────────────────────────────
router.get('/settlements/batches/:batchId', auth, requireRole(Role.ADMIN, Role.FINANCE_PREPARER, Role.FINANCE_APPROVER),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const batch = await prisma.settlementBatch.findUnique({
        where: { id: p(req.params.batchId) },
        include: {
          items: {
            include: {
              vendor: { select: { vendorCode: true, companyName: true } },
              subOrder: { select: { subOrderNumber: true, deliveredAt: true, totalAmount: true } },
            },
          },
        },
      });
      if (!batch) { res.status(404).json({ success: false, error: 'Settlement batch not found' }); return; }
      res.json({ success: true, data: batch });
    } catch { res.status(500).json({ success: false, error: 'Failed to fetch batch' }); }
  }
);

// ─── POST /settlements/batches/:batchId/approve ───────────────────────────────
const ApproveBatchSchema = z.object({ bankUtr: z.string().min(4).max(50), notes: z.string().max(500).optional() });

router.post('/settlements/batches/:batchId/approve', auth, requireRole(Role.FINANCE_APPROVER, Role.ADMIN),
  async (req: Request, res: Response): Promise<void> => {
    const parse = ApproveBatchSchema.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ success: false, error: 'Validation error', details: parse.error.flatten() }); return; }

    const { bankUtr, notes } = parse.data;
    try {
      const batch = await prisma.settlementBatch.findUnique({
        where: { id: p(req.params.batchId) },
        include: { items: { select: { id: true, vendorId: true } } },
      }) as any;
      if (!batch) { res.status(404).json({ success: false, error: 'Batch not found' }); return; }

      if (batch.preparedById === req.user!.id) { res.status(403).json({ success: false, error: 'Finance Approver must differ from Preparer (maker-checker)', code: 'MAKER_CHECKER_VIOLATION' }); return; }
      if (batch.status !== SettlementStatus.PENDING_APPROVAL && batch.status !== SettlementStatus.BATCH_DRAFT) { res.status(409).json({ success: false, error: `Batch is already ${batch.status}` }); return; }

      const now = new Date();
      const approved = await prisma.$transaction(async (tx) => {
        const b = await tx.settlementBatch.update({ where: { id: batch.id }, data: { status: SettlementStatus.PAID, approvedById: req.user!.id, approvedAt: now, paidAt: now, bankUtr, notes } });
        await tx.settlementBatchItem.updateMany({ where: { batchId: batch.id }, data: { status: SettlementStatus.PAID } });
        return b;
      });

      const vendorIds: string[] = [...new Set<string>((batch.items as Array<{ vendorId: string }>).map((i) => i.vendorId))];
      const vendorUsers = await prisma.vendor.findMany({ where: { id: { in: vendorIds } }, select: { userId: true } });
      for (const v of vendorUsers) await createNotification(v.userId, 'Settlement Payment Dispatched', `UTR: ${bankUtr}.`, 'SYSTEM');

      res.json({ success: true, message: `Batch ${batch.batchNumber} approved and PAID`, data: approved });
    } catch (err) { console.error('[batch-approve]', err); res.status(500).json({ success: false, error: 'Failed to approve batch' }); }
  }
);

export default router;
