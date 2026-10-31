/**
 * TrimNova Returns Router  —  /api/v1/returns
 *
 * RMA (Return Merchandise Authorization) lifecycle:
 *   Customer initiates → Vendor/Admin inspects → Admin resolves (REFUND | REPLACEMENT)
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import Decimal from 'decimal.js';
import {
  ReturnReason,
  RmaStatus,
  SettlementStatus,
  SubOrderStatus,
  NotificationType,
  Role,
} from '@prisma/client';

import prisma from '../lib/prisma.js';
import { auth, requireRoles } from '../lib/rbac.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const router = Router();

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const InitiateRmaSchema = z.object({
  subOrderId: z.string().min(1),
  reason: z.nativeEnum(ReturnReason),
  description: z.string().max(2000).optional(),
  evidenceUrls: z.array(z.string().url()).max(10).optional().default([]),
});

const InspectRmaSchema = z.object({
  inspectionNotes: z.string().min(1).max(5000),
  status: z.enum([
    RmaStatus.PICKUP_SCHEDULED,
    RmaStatus.IN_TRANSIT,
    RmaStatus.RECEIVED_AT_HUB,
    RmaStatus.INSPECTION_PENDING,
    RmaStatus.REJECTED,
  ]),
});

const ResolveRmaSchema = z.object({
  resolutionType: z.enum(['REFUND', 'REPLACEMENT']),
  resolutionAmt: z.number().positive().optional(), // required for REFUND
  notes: z.string().optional(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function sendNotification(
  userId: string | null,
  type: NotificationType,
  subject: string,
  body: string,
  metadata?: object
) {
  return prisma.notification.create({
    data: {
      userId,
      type,
      channel: 'IN_PORTAL',
      subject,
      body,
      metadata: metadata ?? undefined,
      sentAt: new Date(),
    },
  });
}

/** Generate RMA number like RMA-2026-00001 */
async function generateRmaNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.rmaRequest.count();
  return `RMA-${year}-${String(count + 1).padStart(5, '0')}`;
}

/**
 * Get return policy window in days from PlatformConfig.
 * Falls back to 10 days if not configured.
 */
async function getReturnPolicyDays(): Promise<number> {
  const config = await prisma.platformConfig.findUnique({
    where: { key: 'return_policy_days' },
  });
  return config ? parseInt(config.value, 10) || 10 : 10;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /
 * Customer: initiate an RMA request.
 * Validates return window: current_time <= deliveredAt + returnPolicyDays
 */
router.post('/', auth, requireRoles.customer, async (req: Request, res: Response): Promise<void> => {
  const parsed = InitiateRmaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, errors: parsed.error.errors });
    return;
  }

  const { subOrderId, reason, description, evidenceUrls } = parsed.data;

  try {
    const customer = await prisma.customer.findUnique({ where: { userId: req.user!.id } });
    if (!customer) { res.status(404).json({ success: false, error: 'Customer profile not found' }); return; }

    // Fetch sub-order with ownership check via order
    const subOrder = await prisma.subOrder.findFirst({
      where: {
        id: subOrderId,
        order: { customerId: customer.id },
      },
      include: {
        order: { select: { id: true, orderNumber: true } },
        vendor: { select: { id: true, userId: true, companyName: true } },
        rmaRequests: { where: { status: { not: RmaStatus.CLOSED } } },
      },
    });

    if (!subOrder) {
      res.status(404).json({ success: false, error: 'Sub-order not found or does not belong to you' });
      return;
    }

    // Must be delivered
    if (subOrder.status !== SubOrderStatus.DELIVERED) {
      res.status(400).json({
        success: false,
        error: `Returns can only be initiated for delivered orders. Current status: ${subOrder.status}`,
      });
      return;
    }

    if (!subOrder.deliveredAt) {
      res.status(400).json({ success: false, error: 'Delivery date not recorded; cannot verify return window' });
      return;
    }

    // Validate return window
    const returnPolicyDays = await getReturnPolicyDays();
    const returnDeadline = new Date(
      subOrder.deliveredAt.getTime() + returnPolicyDays * 24 * 60 * 60 * 1000
    );

    if (new Date() > returnDeadline) {
      res.status(400).json({
        success: false,
        error: `Return window has closed. Returns must be initiated within ${returnPolicyDays} days of delivery. Deadline was ${returnDeadline.toISOString()}`,
        returnDeadline: returnDeadline.toISOString(),
      });
      return;
    }

    // Prevent duplicate open RMA
    if (subOrder.rmaRequests.length > 0) {
      res.status(409).json({
        success: false,
        error: 'An open RMA already exists for this sub-order',
        existingRmaId: subOrder.rmaRequests[0].id,
      });
      return;
    }

    // Create RMA and put sub-order on EXCEPTION_HOLD (atomic)
    const rma = await prisma.$transaction(async (tx) => {
      const rmaNumber = await generateRmaNumber();

      const newRma = await tx.rmaRequest.create({
        data: {
          rmaNumber,
          subOrderId,
          reason,
          description,
          evidenceUrls: evidenceUrls ?? [],
          status: RmaStatus.INITIATED,
        },
      });

      // Put settlement on EXCEPTION_HOLD
      await tx.subOrder.update({
        where: { id: subOrderId },
        data: {
          status: SubOrderStatus.RETURN_REQUESTED,
          settlementStatus: SettlementStatus.EXCEPTION_HOLD,
        },
      });

      return newRma;
    });

    // Notify vendor (best-effort)
    try {
      if (subOrder.vendor.userId) {
        await sendNotification(
          subOrder.vendor.userId,
          NotificationType.RETURN_INITIATED,
          `Return request initiated for ${subOrder.subOrderNumber}`,
          `Customer has initiated a return for sub-order ${subOrder.subOrderNumber}. Reason: ${reason}. RMA: ${rma.rmaNumber}`,
          { rmaId: rma.id, subOrderId }
        );
      }
    } catch (notifyErr) {
      console.error('[returns/POST] Notification error (non-blocking):', notifyErr);
    }

    res.status(201).json({
      success: true,
      data: rma,
      message: `RMA ${rma.rmaNumber} initiated. Our team will contact you within 24 hours.`,
    });
  } catch (err) {
    console.error('[POST /returns]', err);
    res.status(500).json({ success: false, error: 'Failed to initiate return' });
  }
});

/**
 * GET /
 * Customer: list own RMA requests.
 */
router.get('/', auth, requireRoles.customer, async (req: Request, res: Response): Promise<void> => {
  try {
    const customer = await prisma.customer.findUnique({ where: { userId: req.user!.id } });
    if (!customer) { res.status(404).json({ success: false, error: 'Customer not found' }); return; }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const [rmas, total] = await Promise.all([
      prisma.rmaRequest.findMany({
        where: {
          subOrder: { order: { customerId: customer.id } },
        },
        include: {
          subOrder: {
            select: {
              subOrderNumber: true,
              fulfilmentMethod: true,
              deliveredAt: true,
              vendor: { select: { companyName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.rmaRequest.count({
        where: { subOrder: { order: { customerId: customer.id } } },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: rmas,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[GET /returns]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /:rmaId
 * Customer / Vendor / Admin: get RMA detail.
 */
router.get('/:rmaId', auth, async (req: Request, res: Response): Promise<void> => {
  try {
    const rma = await prisma.rmaRequest.findUnique({
      where: { id: req.params.rmaId as string },
      include: {
        subOrder: {
          include: {
            order: {
              include: {
                customer: { select: { companyName: true, customerCode: true, userId: true } },
              },
            },
            vendor: { select: { id: true, companyName: true, userId: true } },
            lineItems: {
              include: { product: { select: { name: true, sku: true, imageUrls: true } } },
            },
          },
        },
      },
    }) as any;

    if (!rma) { res.status(404).json({ success: false, error: 'RMA not found' }); return; }

    const user = req.user!;

    // Access control
    if (user.role === Role.CUSTOMER) {
      if (rma.subOrder.order.customer.userId !== user.id) {
        res.status(403).json({ success: false, error: 'Access denied' });
        return;
      }
    } else if (user.role === Role.VENDOR) {
      const vendor = await prisma.vendor.findUnique({ where: { userId: user.id } });
      if (!vendor || rma.subOrder.vendor.id !== vendor.id) {
        res.status(403).json({ success: false, error: 'Access denied' });
        return;
      }
    }
    // Admins, Finance roles can access any RMA

    res.status(200).json({ success: true, data: rma });
  } catch (err) {
    console.error('[GET /returns/:rmaId]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /:rmaId/inspect
 * Admin / Vendor: add inspection notes and advance RMA status.
 */
router.put('/:rmaId/inspect', auth, async (req: Request, res: Response): Promise<void> => {
  const user = req.user!;
  if (user.role !== Role.ADMIN && user.role !== Role.VENDOR) {
    res.status(403).json({ success: false, error: 'Admin or Vendor role required' });
    return;
  }

  const parsed = InspectRmaSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, errors: parsed.error.errors }); return; }

  try {
    const rma = await prisma.rmaRequest.findUnique({
      where: { id: req.params.rmaId as string },
      include: {
        subOrder: { include: { vendor: { select: { userId: true } } } },
      },
    }) as any;
    if (!rma) { res.status(404).json({ success: false, error: 'RMA not found' }); return; }

    // Vendor-specific scope check
    if (user.role === Role.VENDOR) {
      if (rma.subOrder.vendor.userId !== user.id) {
        res.status(403).json({ success: false, error: 'Access denied — not your sub-order' });
        return;
      }
    }

    if (([RmaStatus.CLOSED, RmaStatus.REFUND_APPROVED, RmaStatus.REPLACEMENT_APPROVED] as RmaStatus[]).includes(rma.status)) {
      res.status(409).json({ success: false, error: `Cannot update RMA in ${rma.status} state` });
      return;
    }

    const updated = await prisma.rmaRequest.update({
      where: { id: rma.id },
      data: {
        inspectionNotes: parsed.data.inspectionNotes,
        status: parsed.data.status,
      },
    });

    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error('[PUT /returns/:rmaId/inspect]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /:rmaId/resolve
 * Admin: resolve RMA (REFUND or REPLACEMENT).
 * Clears EXCEPTION_HOLD if no other open RMAs remain for the sub-order.
 */
router.put('/:rmaId/resolve', auth, requireRoles.admin, async (req: Request, res: Response): Promise<void> => {
  const parsed = ResolveRmaSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, errors: parsed.error.errors }); return; }

  if (parsed.data.resolutionType === 'REFUND' && !parsed.data.resolutionAmt) {
    res.status(400).json({ success: false, error: 'resolutionAmt is required for REFUND resolution' });
    return;
  }

  try {
    const rma = await prisma.rmaRequest.findUnique({
      where: { id: req.params.rmaId as string },
      include: {
        subOrder: {
          include: {
            order: { include: { customer: { select: { userId: true } } } },
            vendor: { select: { userId: true } },
            rmaRequests: {
              where: {
                id: { not: req.params.rmaId as string },
                status: { notIn: [RmaStatus.CLOSED, RmaStatus.REFUND_APPROVED, RmaStatus.REPLACEMENT_APPROVED, RmaStatus.REJECTED] as RmaStatus[] },
              },
            },
          },
        },
      },
    }) as any;

    if (!rma) { res.status(404).json({ success: false, error: 'RMA not found' }); return; }

    if (([RmaStatus.CLOSED, RmaStatus.REFUND_APPROVED, RmaStatus.REPLACEMENT_APPROVED] as RmaStatus[]).includes(rma.status)) {
      res.status(409).json({ success: false, error: `RMA is already in ${rma.status} state` });
      return;
    }

    const resolvedStatus =
      parsed.data.resolutionType === 'REFUND'
        ? RmaStatus.REFUND_APPROVED
        : RmaStatus.REPLACEMENT_APPROVED;

    await prisma.$transaction(async (tx) => {
      // Update RMA
      await tx.rmaRequest.update({
        where: { id: rma.id },
        data: {
          status: resolvedStatus,
          resolutionType: parsed.data.resolutionType,
          resolutionAmt: parsed.data.resolutionAmt
            ? new Decimal(parsed.data.resolutionAmt).toFixed(2)
            : undefined,
          resolvedAt: new Date(),
          inspectionNotes: parsed.data.notes
            ? `${rma.inspectionNotes ?? ''}\n[Resolution] ${parsed.data.notes}`.trim()
            : rma.inspectionNotes,
        },
      });

      // No remaining open RMAs — potentially lift the exception hold
      if (rma.subOrder.rmaRequests.length === 0) {
        const deliveredAt = rma.subOrder.deliveredAt;
        const returnPolicyDays = 10;
        const returnDeadline = deliveredAt
          ? new Date(deliveredAt.getTime() + returnPolicyDays * 24 * 60 * 60 * 1000)
          : null;

        const newSettlementStatus =
          returnDeadline && new Date() > returnDeadline
            ? SettlementStatus.ELIGIBLE
            : SettlementStatus.RETURN_WINDOW_HOLD;

        await tx.subOrder.update({
          where: { id: rma.subOrderId },
          data: { settlementStatus: newSettlementStatus },
        });
      }
    });

    // Notify customer (best-effort)
    try {
      if (rma.subOrder.order.customer.userId) {
        await sendNotification(
          rma.subOrder.order.customer.userId,
          NotificationType.RETURN_INITIATED,
          `Return resolved: ${parsed.data.resolutionType}`,
          parsed.data.resolutionType === 'REFUND'
            ? `Your return (${rma.rmaNumber}) has been approved. A refund of ₹${parsed.data.resolutionAmt} will be processed.`
            : `Your return (${rma.rmaNumber}) has been approved. A replacement will be shipped shortly.`,
          { rmaId: rma.id, resolutionType: parsed.data.resolutionType }
        );
      }
    } catch (notifyErr) {
      console.error('[returns/resolve] Notification error (non-blocking):', notifyErr);
    }

    res.status(200).json({
      success: true,
      message: `RMA resolved as ${parsed.data.resolutionType}`,
      data: { rmaId: rma.id, rmaNumber: rma.rmaNumber, status: resolvedStatus },
    });
  } catch (err) {
    console.error('[PUT /returns/:rmaId/resolve]', err);
    res.status(500).json({ success: false, error: 'Failed to resolve RMA' });
  }
});

export default router;
