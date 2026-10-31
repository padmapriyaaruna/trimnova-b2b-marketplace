/**
 * TrimNova Settlements Router  —  /api/v1/settlements
 *
 * Finance workflow:
 *   evaluateSettlementEligibility() [cron] → Finance Preparer creates batch →
 *   Finance Approver approves batch → Vendor receives payout
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { SettlementStatus, SubOrderStatus, NotificationType } from '@prisma/client';

import prisma from '../lib/prisma.js';
import { auth, requireRoles } from '../lib/rbac.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const router = Router();

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const CreateBatchSchema = z.object({
  subOrderIds: z.array(z.string().min(1)).min(1, 'At least one sub-order required'),
  notes: z.string().max(2000).optional(),
});

const ApproveBatchSchema = z.object({
  bankUtr: z.string().min(1, 'Bank UTR reference is required'),
  notes: z.string().optional(),
});

// ─── Settlement Eligibility Evaluator ────────────────────────────────────────

/**
 * evaluateSettlementEligibility()
 *
 * Called on server startup and every hour via cron.
 * Finds sub-orders that:
 *   - Are DELIVERED
 *   - Have returnDeadline in the past
 *   - Have no open RMA requests
 * Sets settlementStatus = ELIGIBLE and creates a SettlementBatchItem stub.
 */
export async function evaluateSettlementEligibility(): Promise<void> {
  try {
    const now = new Date();

    // Candidates: delivered, return window expired, still on RETURN_WINDOW_HOLD
    const candidates = await prisma.subOrder.findMany({
      where: {
        status: SubOrderStatus.DELIVERED,
        settlementStatus: SettlementStatus.RETURN_WINDOW_HOLD,
        returnDeadline: { lte: now },
      },
      include: {
        rmaRequests: {
          where: {
            status: {
              notIn: ['CLOSED', 'REFUND_APPROVED', 'REPLACEMENT_APPROVED', 'REJECTED'],
            },
          },
          select: { id: true },
        },
      },
    });

    let markedEligible = 0;

    for (const subOrder of candidates) {
      // Skip if any open RMA
      if (subOrder.rmaRequests.length > 0) continue;

      await prisma.subOrder.update({
        where: { id: subOrder.id },
        data: {
          settlementStatus: SettlementStatus.ELIGIBLE,
          settlementEligibleAt: now,
        },
      });

      // Create SettlementBatchItem stub if it doesn't exist yet
      const existingItem = await prisma.settlementBatchItem.findFirst({
        where: { subOrderId: subOrder.id },
      });

      if (!existingItem) {
        const grossAmt = new Decimal(subOrder.netVendorPayable.toString()).plus(
          new Decimal(subOrder.commissionAmount.toString())
        );
        const gstOnCommission = new Decimal(subOrder.commissionAmount.toString())
          .mul('0.18')
          .toDecimalPlaces(2);
        const tdsAmount = new Decimal(subOrder.netVendorPayable.toString())
          .mul('0.01')
          .toDecimalPlaces(2);
        const netPayable = new Decimal(subOrder.netVendorPayable.toString())
          .minus(tdsAmount)
          .toDecimalPlaces(2);

        await prisma.settlementBatchItem.create({
          data: {
            subOrderId: subOrder.id,
            vendorId: subOrder.vendorId,
            grossAmount: grossAmt.toFixed(2),
            commissionAmt: subOrder.commissionAmount.toString(),
            gstOnCommission: gstOnCommission.toFixed(2),
            tdsAmount: tdsAmount.toFixed(2),
            netPayable: netPayable.toFixed(2),
            adjustments: '0.00',
            status: SettlementStatus.ELIGIBLE,
          },
        });
      }

      markedEligible++;
    }

    if (markedEligible > 0) {
      console.log(
        `[Settlement Evaluator] Marked ${markedEligible} sub-order(s) as ELIGIBLE at ${now.toISOString()}`
      );
    }
  } catch (err) {
    console.error('[Settlement Evaluator] Error:', err);
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /eligible
 * Finance Preparer: list all ELIGIBLE settlement items not yet in a batch.
 */
router.get('/eligible', auth, requireRoles.financePrep, async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 50);
    const skip = (page - 1) * limit;
    const vendorId = req.query.vendorId as string | undefined;

    const where: any = { status: SettlementStatus.ELIGIBLE, batchId: null };
    if (vendorId) where.vendorId = vendorId;

    const [items, total] = await Promise.all([
      prisma.settlementBatchItem.findMany({
        where,
        include: {
          subOrder: {
            select: {
              subOrderNumber: true,
              deliveredAt: true,
              returnDeadline: true,
              settlementEligibleAt: true,
              totalAmount: true,
              slabMarginPct: true,
            },
          },
          vendor: { select: { companyName: true, vendorCode: true, gstin: true } },
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      prisma.settlementBatchItem.count({ where }),
    ]);

    const totalNetPayable = items.reduce(
      (sum, i) => sum.plus(new Decimal(i.netPayable.toString())),
      new Decimal('0')
    );

    res.status(200).json({
      success: true,
      data: items,
      summary: { count: total, totalNetPayable: totalNetPayable.toFixed(2) },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[GET /settlements/eligible]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /batches
 * Finance Preparer: create a settlement batch from eligible sub-order IDs.
 */
router.post('/batches', auth, requireRoles.financePrep, async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateBatchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, errors: parsed.error.errors }); return; }

  try {
    const { subOrderIds, notes } = parsed.data;

    const batchItems = await prisma.settlementBatchItem.findMany({
      where: {
        subOrderId: { in: subOrderIds },
        status: SettlementStatus.ELIGIBLE,
        batchId: null,
      },
    });

    if (batchItems.length !== subOrderIds.length) {
      const foundIds = batchItems.map((i) => i.subOrderId);
      const missingIds = subOrderIds.filter((id) => !foundIds.includes(id));
      res.status(400).json({
        success: false,
        error: `Some sub-orders are not eligible or already batched`,
        missingIds,
      });
      return;
    }

    const year = new Date().getFullYear();
    const batchCount = await prisma.settlementBatch.count();
    const batchNumber = `STLB-${year}-${String(batchCount + 1).padStart(3, '0')}`;

    const totalAmount = batchItems.reduce(
      (sum, i) => sum.plus(new Decimal(i.netPayable.toString())),
      new Decimal('0')
    );

    const batch = await prisma.$transaction(async (tx) => {
      const newBatch = await tx.settlementBatch.create({
        data: {
          batchNumber,
          status: SettlementStatus.PENDING_APPROVAL,
          preparedById: req.user!.id,
          totalAmount: totalAmount.toFixed(2),
          itemCount: batchItems.length,
          notes,
        },
      });

      await tx.settlementBatchItem.updateMany({
        where: { id: { in: batchItems.map((i) => i.id) } },
        data: { batchId: newBatch.id, status: SettlementStatus.PENDING_APPROVAL },
      });

      await tx.subOrder.updateMany({
        where: { id: { in: subOrderIds } },
        data: { settlementStatus: SettlementStatus.PENDING_APPROVAL },
      });

      return newBatch;
    });

    res.status(201).json({
      success: true,
      data: {
        id: batch.id,
        batchNumber: batch.batchNumber,
        itemCount: batch.itemCount,
        totalAmount: batch.totalAmount,
        status: batch.status,
      },
      message: `Settlement batch ${batchNumber} created with ${batchItems.length} items`,
    });
  } catch (err) {
    console.error('[POST /settlements/batches]', err);
    res.status(500).json({ success: false, error: 'Failed to create settlement batch' });
  }
});

/**
 * GET /batches
 * Finance Preparer / Approver: list all batches.
 */
router.get('/batches', auth, requireRoles.financeAny, async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;
    const statusFilter = req.query.status ? String(req.query.status) as SettlementStatus : undefined;

    const where: any = {};
    if (statusFilter) where.status = statusFilter;

    const [batches, total] = await Promise.all([
      prisma.settlementBatch.findMany({
        where,
        include: { _count: { select: { items: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.settlementBatch.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: batches,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[GET /settlements/batches]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /batches/:id
 * Detail with items.
 */
router.get('/batches/:id', auth, requireRoles.financeAny, async (req: Request, res: Response): Promise<void> => {
  try {
    const batch = await prisma.settlementBatch.findUnique({
      where: { id: req.params.id as string },
      include: {
        items: {
          include: {
            subOrder: {
              select: {
                subOrderNumber: true,
                deliveredAt: true,
                totalAmount: true,
                slabMarginPct: true,
                commissionAmount: true,
                netVendorPayable: true,
              },
            },
            vendor: { select: { companyName: true, vendorCode: true, gstin: true } },
          },
        },
      },
    });

    if (!batch) { res.status(404).json({ success: false, error: 'Settlement batch not found' }); return; }

    res.status(200).json({ success: true, data: batch });
  } catch (err) {
    console.error('[GET /settlements/batches/:id]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /batches/:id/approve
 * Finance Approver: approve batch, mark PAID with UTR reference.
 * 4-eyes principle: approver ≠ preparer.
 */
router.post('/batches/:id/approve', auth, requireRoles.financeApprover, async (req: Request, res: Response): Promise<void> => {
  const parsed = ApproveBatchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, errors: parsed.error.errors }); return; }

  try {
    const batch = await prisma.settlementBatch.findUnique({
      where: { id: req.params.id as string },
      include: { items: { select: { id: true, subOrderId: true, vendorId: true, vendor: { select: { userId: true } } } } },
    }) as any;

    if (!batch) { res.status(404).json({ success: false, error: 'Settlement batch not found' }); return; }

    if (batch.status !== SettlementStatus.PENDING_APPROVAL) {
      res.status(409).json({ success: false, error: `Batch is in ${batch.status} state, not pending approval` });
      return;
    }

    // 4-eyes principle
    if (batch.preparedById === req.user!.id) {
      res.status(403).json({
        success: false,
        error: 'The Finance Approver cannot be the same person who prepared this batch (4-eyes principle)',
        code: 'SELF_APPROVAL_FORBIDDEN',
      });
      return;
    }

    const paidAt = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.settlementBatch.update({
        where: { id: batch.id },
        data: {
          status: SettlementStatus.PAID,
          approvedById: req.user!.id,
          approvedAt: paidAt,
          paidAt,
          bankUtr: parsed.data.bankUtr,
          notes: parsed.data.notes
            ? `${batch.notes ?? ''}\n[Approval] ${parsed.data.notes}`.trim()
            : batch.notes,
        },
      });

      await tx.settlementBatchItem.updateMany({
        where: { batchId: batch.id },
        data: { status: SettlementStatus.PAID },
      });

      await tx.subOrder.updateMany({
        where: { id: { in: batch.items.map((i) => i.subOrderId) } },
        data: { settlementStatus: SettlementStatus.PAID },
      });
    });

    // Notify vendors (best-effort)
    try {
      const uniqueVendorUsers: Array<[string, string]> = [
        ...new Map<string, string>(batch.items.map((i: any) => [i.vendorId, i.vendor.userId])).entries(),
      ];

      for (const [, vendorUserId] of uniqueVendorUsers) {
        await prisma.notification.create({
          data: {
            userId: vendorUserId,
            type: NotificationType.SETTLEMENT_READY,
            channel: 'IN_PORTAL',
            subject: 'Settlement payment processed',
            body: `Your settlement from batch ${batch.batchNumber} has been paid. UTR: ${parsed.data.bankUtr}`,
            metadata: { batchId: batch.id, batchNumber: batch.batchNumber, utr: parsed.data.bankUtr },
            sentAt: new Date(),
          },
        });
      }
    } catch (notifyErr) {
      console.error('[settlements/approve] Notification error (non-blocking):', notifyErr);
    }

    res.status(200).json({
      success: true,
      message: `Batch ${batch.batchNumber} approved and marked PAID`,
      data: {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        bankUtr: parsed.data.bankUtr,
        paidAt,
        itemCount: batch.itemCount,
        totalAmount: batch.totalAmount,
      },
    });
  } catch (err) {
    console.error('[POST /settlements/batches/:id/approve]', err);
    res.status(500).json({ success: false, error: 'Failed to approve settlement batch' });
  }
});

/**
 * GET /vendor-payouts
 * Vendor: list own settlement history.
 */
router.get('/vendor-payouts', auth, requireRoles.vendor, async (req: Request, res: Response): Promise<void> => {
  try {
    const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      prisma.settlementBatchItem.findMany({
        where: { vendorId: vendor.id },
        include: {
          batch: {
            select: {
              batchNumber: true,
              status: true,
              approvedAt: true,
              paidAt: true,
              bankUtr: true,
            },
          },
          subOrder: {
            select: {
              subOrderNumber: true,
              deliveredAt: true,
              totalAmount: true,
              commissionAmount: true,
              netVendorPayable: true,
              slabMarginPct: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.settlementBatchItem.count({ where: { vendorId: vendor.id } }),
    ]);

    const totalPaid = items
      .filter((i) => i.status === SettlementStatus.PAID)
      .reduce((sum, i) => sum.plus(new Decimal(i.netPayable.toString())), new Decimal('0'));

    const totalPending = items
      .filter((i) => ([SettlementStatus.ELIGIBLE, SettlementStatus.PENDING_APPROVAL] as SettlementStatus[]).includes(i.status))
      .reduce((sum, i) => sum.plus(new Decimal(i.netPayable.toString())), new Decimal('0'));

    res.status(200).json({
      success: true,
      data: items,
      summary: { totalPaid: totalPaid.toFixed(2), totalPending: totalPending.toFixed(2) },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[GET /settlements/vendor-payouts]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
