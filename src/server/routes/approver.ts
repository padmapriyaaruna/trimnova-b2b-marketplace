/**
 * TrimNova — Approver Routes
 * /api/v1/approver
 *
 * KYC review queue, certificate actions, margin slab negotiation,
 * and partial escalation to Admin docket.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodemailer = require('nodemailer') as {
  createTransport(opts: Record<string, unknown>): {
    sendMail(opts: Record<string, unknown>): Promise<void>;
  };
};
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { CertificateStatus, ProductStatus, EscalationStatus, Role } from '@prisma/client';

import prisma from '../lib/prisma.js';
import { authenticateToken, requireRole } from '../lib/rbac.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const router = Router();
const auth = authenticateToken;
const onlyApprover = requireRole(Role.APPROVER);

// ─── Mailer ───────────────────────────────────────────────────────────────────
function getMailTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.mailtrap.io',
    port: Number(process.env.SMTP_PORT ?? 2525),
    auth: { user: process.env.SMTP_USER ?? '', pass: process.env.SMTP_PASS ?? '' },
  });
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? 'smtp.mailtrap.io',
      port: Number(process.env.SMTP_PORT ?? 2525),
      auth: { user: process.env.SMTP_USER ?? '', pass: process.env.SMTP_PASS ?? '' },
    });
    await (transport as ReturnType<typeof nodemailer.createTransport>).sendMail({
      from: process.env.SMTP_FROM ?? 'noreply@trimnova.com',
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error('[mailer]', err);
  }
}

async function createNotification(
  userId: string,
  subject: string,
  body: string,
  type: 'APPROVAL' | 'REJECTION' | 'ON_HOLD' | 'SYSTEM' | 'ESCALATION' = 'SYSTEM'
): Promise<void> {
  await prisma.notification.create({
    data: { userId, subject, body, type, channel: 'IN_PORTAL' },
  });
}

async function notifyAllAdmins(subject: string, body: string, type: 'SYSTEM' | 'ESCALATION' = 'SYSTEM'): Promise<void> {
  const admins = await prisma.user.findMany({ where: { role: Role.ADMIN, isActive: true }, select: { id: true } });
  for (const a of admins) {
    await createNotification(a.id, subject, body, type);
  }
}

/** Safe string coerce from req.query value */
function qstr(val: unknown): string | undefined {
  return typeof val === 'string' && val ? val : undefined;
}

/** Coerce req.params value to string (Express types as string | string[]) */
const p = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? '';

// ─── GET /queue ────────────────────────────────────────────────────────────────
router.get('/queue', auth, onlyApprover, async (_req: Request, res: Response): Promise<void> => {
  try {
    const vendors = await prisma.vendor.findMany({
      where: { status: { in: ['KYC_SUBMITTED', 'KYC_UNDER_REVIEW'] } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        vendorCode: true,
        companyName: true,
        gstin: true,
        pan: true,
        gstVerifiedAt: true,
        panVerifiedAt: true,
        status: true,
        plan: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { email: true } },
        certificates: { select: { id: true, certType: true, status: true, uploadedAt: true } },
        _count: { select: { certificates: true } },
      },
    });

    const now = Date.now();
    const queue = vendors.map((v) => ({
      ...v,
      slaHoursElapsed: Math.floor((now - v.createdAt.getTime()) / (1000 * 60 * 60)),
      pendingCertCount: v.certificates.filter((c) => c.status === 'PENDING').length,
    }));

    res.json({ success: true, data: queue, total: queue.length });
  } catch (err) {
    console.error('[approver-queue]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch review queue' });
  }
});

// ─── GET /vendors/:vendorId ───────────────────────────────────────────────────
router.get('/vendors/:vendorId', auth, onlyApprover, async (req: Request, res: Response): Promise<void> => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: p(req.params.vendorId) },
      include: {
        user: { select: { email: true, isActive: true, lastLoginAt: true, createdAt: true } },
        certificates: { orderBy: { uploadedAt: 'desc' } },
        capabilities: { include: { category: { select: { name: true, code: true } } } },
        onboardingInvoice: true,
      },
    });

    if (!vendor) {
      res.status(404).json({ success: false, error: 'Vendor not found' });
      return;
    }

    if (vendor.status === 'KYC_SUBMITTED') {
      await prisma.vendor.update({ where: { id: vendor.id }, data: { status: 'KYC_UNDER_REVIEW' } });
    }

    res.json({ success: true, data: vendor });
  } catch (err) {
    console.error('[approver-vendor-detail]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch vendor profile' });
  }
});

// ─── POST /vendors/:vendorId/certificates/:certId/action ─────────────────────
const CertActionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'ON_HOLD']),
  comment: z.string().max(1000).optional(),
});

router.post(
  '/vendors/:vendorId/certificates/:certId/action',
  auth,
  onlyApprover,
  async (req: Request, res: Response): Promise<void> => {
    const parse = CertActionSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ success: false, error: 'Validation error', details: parse.error.flatten() });
      return;
    }

    const { action, comment } = parse.data;

    try {
      // Fetch cert WITH vendor relation included
      const certId = req.params.certId as string;
      const vendorId = req.params.vendorId as string;
      const cert = await prisma.vendorCertificate.findFirst({
        where: {
          id: certId,
          vendorId: vendorId,
        },
        include: {
          vendor: {
            select: {
              id: true,
              companyName: true,
              vendorCode: true,
              userId: true,
              user: { select: { email: true } },
            },
          },
        },
      }) as any;

      if (!cert) {
        res.status(404).json({ success: false, error: 'Certificate not found' });
        return;
      }

      const now = new Date();
      let newStatus: CertificateStatus;
      let notifType: 'APPROVAL' | 'REJECTION' | 'ON_HOLD';
      const dateField: Record<string, Date> = {};

      switch (action) {
        case 'APPROVE':
          newStatus = CertificateStatus.APPROVED;
          notifType = 'APPROVAL';
          dateField.approvedAt = now;
          break;
        case 'REJECT':
          newStatus = CertificateStatus.REJECTED;
          notifType = 'REJECTION';
          dateField.rejectedAt = now;
          break;
        default: // ON_HOLD
          newStatus = CertificateStatus.ON_HOLD;
          notifType = 'ON_HOLD';
          dateField.onHoldAt = now;
          break;
      }

      const updated = await prisma.vendorCertificate.update({
        where: { id: cert.id },
        data: {
          status: newStatus,
          approverComment: comment,
          approvedBy: req.user!.userId,
          ...dateField,
        },
      });

      // In-portal notification
      await createNotification(
        cert.vendor.userId,
        `Certificate ${action}: ${cert.certType}`,
        `Your ${cert.certType} certificate has been ${action.toLowerCase()}.${comment ? ` Note: ${comment}` : ''}`,
        notifType
      );

      // Email vendor
      await sendEmail(
        cert.vendor.user.email,
        `[TrimNova] ${cert.certType} Certificate ${action}`,
        `<h2>Certificate ${action}</h2><p>Dear ${cert.vendor.companyName}, your <strong>${cert.certType}</strong> certificate is <strong>${action.toLowerCase()}</strong>.</p>${comment ? `<p>Comment: ${comment}</p>` : ''}`
      );

      // Check if all certs resolved — auto-activate vendor if fully approved
      const [pendingCount, rejectedCount] = await Promise.all([
        prisma.vendorCertificate.count({ where: { vendorId: cert.vendor.id, status: 'PENDING' } }),
        prisma.vendorCertificate.count({ where: { vendorId: cert.vendor.id, status: 'REJECTED' } }),
      ]);

      let vendorActivated = false;
      if (pendingCount === 0 && rejectedCount === 0) {
        await prisma.vendor.update({ where: { id: cert.vendor.id }, data: { status: 'ACTIVE' } });
        vendorActivated = true;

        await createNotification(
          cert.vendor.userId,
          'KYC Approved — Account is now ACTIVE',
          'All certificates approved. Your vendor account is now ACTIVE on TrimNova.',
          'APPROVAL'
        );

        await sendEmail(
          cert.vendor.user.email,
          '[TrimNova] 🎉 KYC Complete — You are Active!',
          `<h2>Welcome to TrimNova!</h2><p>Dear ${cert.vendor.companyName}, all certificates approved. Your account is live.`
        );
      }

      res.json({ success: true, message: `Certificate ${action.toLowerCase()}`, data: updated, vendorActivated });
    } catch (err) {
      console.error('[cert-action]', err);
      res.status(500).json({ success: false, error: 'Failed to process certificate action' });
    }
  }
);

// ─── GET /margin-review ───────────────────────────────────────────────────────
router.get('/margin-review', auth, onlyApprover, async (_req: Request, res: Response): Promise<void> => {
  try {
    const capabilities = await prisma.vendorCapability.findMany({
      where: { status: ProductStatus.SUBMITTED_FOR_REVIEW },
      include: {
        vendor: { select: { id: true, vendorCode: true, companyName: true, plan: true } },
        category: { select: { name: true, code: true } },
      },
      orderBy: { submittedAt: 'asc' },
    });

    // Group by vendor
    const vendorMap = new Map<string, { vendor: (typeof capabilities)[0]['vendor']; capabilities: typeof capabilities; submittedAt: Date | null }>();
    for (const cap of capabilities) {
      const vid = cap.vendor.id;
      if (!vendorMap.has(vid)) {
        vendorMap.set(vid, { vendor: cap.vendor, capabilities: [], submittedAt: cap.submittedAt });
      }
      vendorMap.get(vid)!.capabilities.push(cap);
    }

    res.json({ success: true, data: Array.from(vendorMap.values()), total: vendorMap.size });
  } catch (err) {
    console.error('[margin-review]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch margin review queue' });
  }
});

// ─── GET /margin-review/:vendorId ─────────────────────────────────────────────
router.get('/margin-review/:vendorId', auth, onlyApprover, async (req: Request, res: Response): Promise<void> => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: p(req.params.vendorId) },
      select: { id: true, vendorCode: true, companyName: true, plan: true },
    });

    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

    const products = await prisma.product.findMany({
      where: { vendorId: vendor.id },
      include: {
        marginSlabs: { where: { isActive: true }, orderBy: { slabNumber: 'asc' } },
        subcategory: { select: { name: true, code: true, category: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ success: true, data: { vendor, products } });
  } catch (err) {
    console.error('[margin-review-vendor]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch vendor products for margin review' });
  }
});

// ─── PUT /margin-review/:vendorId/products/:productId/slab ───────────────────
const UpdateSlabSchema = z.object({
  slabNumber: z.number().int().min(1).max(5),
  marginPct: z.number().min(0).max(100),
  agreedStatus: z.enum(['AGREED', 'DISAGREEMENT', 'PENDING']),
  disputeNote: z.string().max(500).optional(),
});

router.put(
  '/margin-review/:vendorId/products/:productId/slab',
  auth,
  onlyApprover,
  async (req: Request, res: Response): Promise<void> => {
    const parse = UpdateSlabSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ success: false, error: 'Validation error', details: parse.error.flatten() });
      return;
    }

    const { slabNumber, marginPct, agreedStatus, disputeNote } = parse.data;

    try {
      const product = await prisma.product.findFirst({
        where: { id: req.params.productId as string, vendorId: req.params.vendorId as string },
        select: { id: true },
      });

      if (!product) { res.status(404).json({ success: false, error: 'Product not found for this vendor' }); return; }

      const marginD = new Decimal(marginPct);
      const vendorNetPct = new Decimal(100).minus(marginD);

      const result = await prisma.marginSlab.updateMany({
        where: { productId: product.id, slabNumber },
        data: {
          marginPct: marginD.toFixed(3),
          vendorNetPct: vendorNetPct.toFixed(3),
          agreedStatus,
          disputeNote: disputeNote ?? null,
          setByApprover: req.user!.userId,
          setAt: new Date(),
          appliesFrom: new Date(),
        },
      });

      if (result.count === 0) {
        res.status(404).json({ success: false, error: `Slab ${slabNumber} not found` });
        return;
      }

      const slab = await prisma.marginSlab.findFirst({ where: { productId: product.id, slabNumber, isActive: true } });
      res.json({ success: true, message: `Slab ${slabNumber} updated`, data: slab });
    } catch (err) {
      console.error('[slab-update]', err);
      res.status(500).json({ success: false, error: 'Failed to update margin slab' });
    }
  }
);

// ─── POST /margin-review/:vendorId/submit ─────────────────────────────────────
const MarginSubmitSchema = z.object({
  action: z.enum(['FULLY_AGREED', 'PARTIAL_ESCALATE']),
  adminNote: z.string().max(2000).optional(),
});

router.post(
  '/margin-review/:vendorId/submit',
  auth,
  onlyApprover,
  async (req: Request, res: Response): Promise<void> => {
    const parse = MarginSubmitSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ success: false, error: 'Validation error', details: parse.error.flatten() });
      return;
    }

    const { action, adminNote } = parse.data;

    try {
      const vendor = await prisma.vendor.findUnique({
        where: { id: req.params.vendorId as string },
        include: { user: { select: { email: true } } },
      }) as any;

      if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

      const products = await prisma.product.findMany({
        where: { vendorId: vendor.id },
        include: {
          marginSlabs: { where: { isActive: true }, orderBy: { slabNumber: 'asc' } },
          subcategory: { select: { name: true } },
        },
      });

      if (action === 'FULLY_AGREED') {
        const productIds = products.map((p) => p.id);

        await prisma.$transaction([
          prisma.product.updateMany({ where: { id: { in: productIds } }, data: { status: ProductStatus.APPROVED } }),
          prisma.vendorCapability.updateMany({
            where: { vendorId: vendor.id, status: ProductStatus.SUBMITTED_FOR_REVIEW },
            data: { status: ProductStatus.APPROVED, reviewedAt: new Date(), reviewedBy: req.user!.userId },
          }),
        ]);

        const msg = `Approver ${req.user!.userId} FULLY AGREED margins for vendor ${vendor.vendorCode}. ${products.length} product(s) published.`;
        await notifyAllAdmins('Margin Review — Fully Agreed', msg);

        const adminUsers = await prisma.user.findMany({ where: { role: Role.ADMIN }, select: { email: true } });
        for (const a of adminUsers) {
          await sendEmail(a.email, `[TrimNova] Margin Fully Agreed — ${vendor.vendorCode}`,
            `<h2>Margin Review Complete</h2><p>${msg}</p>${adminNote ? `<p>Note: ${adminNote}</p>` : ''}`);
        }

        await createNotification(vendor.userId, 'Your products are now LIVE!',
          `${products.length} product(s) approved and live on the marketplace.`, 'APPROVAL');

        res.json({ success: true, message: `${products.length} products approved`, data: { action, approvedCount: products.length } });
      } else {
        // PARTIAL_ESCALATE
        const agreedProducts = products.filter((p) => !p.marginSlabs.some((s) => s.agreedStatus === 'DISAGREEMENT'));
        const disputedProducts = products.filter((p) => p.marginSlabs.some((s) => s.agreedStatus === 'DISAGREEMENT'));

        if (agreedProducts.length > 0) {
          await prisma.product.updateMany({
            where: { id: { in: agreedProducts.map((p) => p.id) } },
            data: { status: ProductStatus.APPROVED },
          });
        }

        const caseNumber = `ESC-${Math.floor(Math.random() * 90000 + 10000)}`;

        const escalation = await prisma.escalation.create({
          data: {
            caseNumber,
            vendorId: vendor.id,
            title: `Margin Disagreement — ${vendor.vendorCode}`,
            description: adminNote ?? `Partial escalation from approver ${req.user!.userId}. ${disputedProducts.length} SKU(s) disputed.`,
            status: EscalationStatus.OPEN,
            items: {
              create: disputedProducts.flatMap((p) =>
                p.marginSlabs
                  .filter((s) => s.agreedStatus === 'DISAGREEMENT')
                  .map((s) => ({
                    productId: p.id,
                    productName: p.name,
                    sku: p.sku,
                    vendorMarginPct: s.marginPct,
                    targetMarginPct: s.marginPct,
                    disputeNote: s.disputeNote ?? '',
                    status: 'DISPUTED',
                  }))
              ),
            },
            timeline: {
              create: {
                actorId: req.user!.id,
                actorRole: Role.APPROVER,
                action: 'ESCALATED_TO_ADMIN',
                detail: `Escalated ${disputedProducts.length} disputed SKU(s). Agreed published: ${agreedProducts.length}.`,
              },
            },
          },
          include: { items: true },
        });

        if (disputedProducts.length > 0) {
          await prisma.vendorCapability.updateMany({
            where: { vendorId: vendor.id, status: ProductStatus.SUBMITTED_FOR_REVIEW },
            data: { status: ProductStatus.UNDER_REVIEW, reviewedAt: new Date(), reviewedBy: req.user!.userId },
          });
        }

        const adminMsg = `Approver ${req.user!.userId} escalated ${disputedProducts.length} SKU(s) for vendor ${vendor.vendorCode}. Case: ${caseNumber}. ${agreedProducts.length} agreed SKUs published.`;
        await notifyAllAdmins('⚠ Margin Escalation Created', adminMsg, 'ESCALATION');

        const adminUsers = await prisma.user.findMany({ where: { role: Role.ADMIN }, select: { email: true } });
        for (const a of adminUsers) {
          await sendEmail(a.email, `[TrimNova] Margin Escalation — ${caseNumber}`,
            `<h2>Escalation Created</h2><p>${adminMsg}</p>`);
        }

        res.json({
          success: true,
          message: `${agreedProducts.length} published, ${disputedProducts.length} escalated.`,
          data: { action, agreedPublished: agreedProducts.length, escalatedCount: disputedProducts.length, escalationCase: escalation.caseNumber },
        });
      }
    } catch (err) {
      console.error('[margin-submit]', err);
      res.status(500).json({ success: false, error: 'Failed to submit margin review decision' });
    }
  }
);

// Unused import suppression
void qstr;

export default router;
