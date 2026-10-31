/**
 * TrimNova Payments Router  —  /api/v1/payments
 *
 * Razorpay integration: order creation, payment verification, webhook fallback, refunds.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import Razorpay from 'razorpay';
// @ts-ignore – Razorpay ships this utility but may not have perfect types
import { validatePaymentVerification } from 'razorpay/dist/utils/razorpay-utils.js';
import Decimal from 'decimal.js';
import { OrderStatus, PaymentStatus, SubOrderStatus, SettlementStatus, NotificationType } from '@prisma/client';

import prisma from '../lib/prisma.js';
import { auth, requireRoles } from '../lib/rbac.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const router = Router();

// ─── Razorpay Client ─────────────────────────────────────────────────────────

function getRazorpay(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials not configured');
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const CreateRazorpayOrderSchema = z.object({
  orderId: z.string().min(1, 'TrimNova order ID is required'),
});

const VerifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  trimnovaOrderId: z.string().min(1),
});

const RefundSchema = z.object({
  orderId: z.string().optional(),
  subOrderId: z.string().optional(),
  amount: z.number().positive().optional(), // paise; if omitted = full refund
  reason: z.string().optional(),
}).refine((d) => d.orderId || d.subOrderId, {
  message: 'Either orderId or subOrderId is required',
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

/**
 * Check if stock for a product falls below the LOW_STOCK threshold (50 units).
 * If so, create a StockAlert and notify admins.
 */
async function checkAndRaiseStockAlert(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { vendor: { select: { id: true, userId: true } } },
  });
  if (!product || !product.vendor) return;

  const LOW_STOCK_THRESHOLD = 50;
  const totalStock = product.onlineStock + product.triminstaStock;

  if (totalStock < LOW_STOCK_THRESHOLD) {
    // Avoid duplicate alerts
    const existingAlert = await prisma.stockAlert.findFirst({
      where: {
        productId,
        resolvedAt: null,
        alertType: totalStock === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
      },
    });
    if (existingAlert) return;

    await prisma.stockAlert.create({
      data: {
        productId,
        vendorId: product.vendor.id,
        alertType: totalStock === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
        stockLevel: totalStock,
        threshold: LOW_STOCK_THRESHOLD,
        emailSentAt: new Date(), // In production, trigger real email via SES/SMTP here
      },
    });

    // Notify vendor
    await sendNotification(
      product.vendor.userId,
      NotificationType.LOW_STOCK,
      `Low stock alert: ${product.name}`,
      `Stock for ${product.name} (SKU: ${product.sku}) has fallen to ${totalStock} units. Please replenish soon.`,
      { productId, stockLevel: totalStock }
    );
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /razorpay/create-order
 * Authenticated: create a Razorpay order for a given TrimNova order.
 */
router.post('/razorpay/create-order', auth, async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateRazorpayOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, errors: parsed.error.errors });
    return;
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id: parsed.data.orderId },
    });
    if (!order) {
      res.status(404).json({ success: false, error: 'Order not found' });
      return;
    }

    // Ensure the customer owns this order
    if (req.user!.role === 'CUSTOMER') {
      const customer = await prisma.customer.findUnique({ where: { userId: req.user!.id } });
      if (!customer || order.customerId !== customer.id) {
        res.status(403).json({ success: false, error: 'Access denied' });
        return;
      }
    }

    if (order.status !== OrderStatus.PAYMENT_PENDING) {
      res.status(409).json({ success: false, error: `Order is in ${order.status} state, not awaiting payment` });
      return;
    }

    // Convert totalAmount to paise (INR × 100)
    const amountPaise = new Decimal(order.totalAmount.toString()).mul(100).toNumber();

    const razorpay = getRazorpay();
    const rzpOrder = await razorpay.orders.create({
      amount: Math.round(amountPaise),
      currency: 'INR',
      receipt: order.orderNumber,
      notes: {
        trimnovaOrderId: order.id,
        orderNumber: order.orderNumber,
      },
    });

    // Persist razorpay order id
    await prisma.order.update({
      where: { id: order.id },
      data: { razorpayOrderId: rzpOrder.id },
    });

    res.status(201).json({
      success: true,
      data: {
        razorpayOrderId: rzpOrder.id,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        orderNumber: order.orderNumber,
        trimnovaOrderId: order.id,
      },
    });
  } catch (err) {
    console.error('[POST /payments/razorpay/create-order]', err);
    res.status(500).json({ success: false, error: 'Failed to create payment order' });
  }
});

/**
 * POST /razorpay/verify
 * Authenticated: verify Razorpay payment signature.
 * On success: confirm stock reservations, update order to CONFIRMED, create audit trail.
 */
router.post('/razorpay/verify', auth, async (req: Request, res: Response): Promise<void> => {
  const parsed = VerifyPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, errors: parsed.error.errors });
    return;
  }

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    trimnovaOrderId,
  } = parsed.data;

  try {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      res.status(500).json({ success: false, error: 'Payment verification not configured' });
      return;
    }

    const isValid: boolean = validatePaymentVerification(
      { order_id: razorpay_order_id, payment_id: razorpay_payment_id },
      razorpay_signature,
      keySecret
    );

    if (!isValid) {
      res.status(400).json({ success: false, error: 'Payment signature verification failed' });
      return;
    }

    // Idempotency check — if already confirmed, return early
    const existingOrder = await prisma.order.findUnique({
      where: { id: trimnovaOrderId },
    });
    if (!existingOrder) {
      res.status(404).json({ success: false, error: 'Order not found' });
      return;
    }
    if (existingOrder.status === OrderStatus.CONFIRMED) {
      res.status(200).json({ success: true, message: 'Payment already confirmed', data: { orderId: trimnovaOrderId } });
      return;
    }

    // Atomic: confirm stock reservations + update order
    const confirmedOrder = await prisma.$transaction(async (tx) => {
      // Confirm all pending stock reservations for this order's cart
      const cart = await tx.cart.findFirst({
        where: { customerId: existingOrder.customerId, isActive: false },
        orderBy: { updatedAt: 'desc' },
      });

      if (cart) {
        // Mark reservations as confirmed
        const reservations = await tx.stockReservation.findMany({
          where: {
            reservedForCart: cart.id,
            isConfirmed: false,
            expiresAt: { gt: new Date() },
          },
          include: { product: true },
        });

        for (const res of reservations) {
          await tx.stockReservation.update({
            where: { id: res.id },
            data: { isConfirmed: true, reservedForOrder: trimnovaOrderId },
          });
        }
      }

      // Update order status to CONFIRMED
      const updated = await tx.order.update({
        where: { id: trimnovaOrderId },
        data: {
          status: OrderStatus.CONFIRMED,
          paymentStatus: PaymentStatus.CAPTURED,
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          paymentCapturedAt: new Date(),
        },
        include: {
          subOrders: {
            include: {
              lineItems: { include: { product: true } },
              vendor: { select: { userId: true } },
            },
          },
          customer: { select: { userId: true } },
        },
      });

      return updated;
    });

    // Post-transaction: check stock levels & send notifications (best-effort)
    try {
      for (const subOrder of confirmedOrder.subOrders) {
        // Notify vendor
        if (subOrder.vendor.userId) {
          await sendNotification(
            subOrder.vendor.userId,
            NotificationType.ORDER_PLACED,
            'New sub-order received',
            `You have a new sub-order ${subOrder.subOrderNumber} pending acceptance. Please review and respond within 24 hours.`,
            { subOrderId: subOrder.id, orderNumber: confirmedOrder.orderNumber }
          );
        }

        // Check stock alerts for each line item
        for (const li of subOrder.lineItems) {
          await checkAndRaiseStockAlert(li.productId);
        }
      }

      // Notify customer
      if (confirmedOrder.customer.userId) {
        await sendNotification(
          confirmedOrder.customer.userId,
          NotificationType.ORDER_PLACED,
          'Order confirmed',
          `Your order ${confirmedOrder.orderNumber} has been confirmed. Total: ₹${confirmedOrder.totalAmount}`,
          { orderId: trimnovaOrderId, orderNumber: confirmedOrder.orderNumber }
        );
      }
    } catch (notifyErr) {
      console.error('[payments/verify] Notification error (non-blocking):', notifyErr);
    }

    res.status(200).json({
      success: true,
      message: 'Payment verified and order confirmed',
      data: {
        orderId: trimnovaOrderId,
        orderNumber: confirmedOrder.orderNumber,
        status: confirmedOrder.status,
        subOrders: confirmedOrder.subOrders.map((so) => ({
          id: so.id,
          subOrderNumber: so.subOrderNumber,
          status: so.status,
        })),
      },
    });
  } catch (err) {
    console.error('[POST /payments/razorpay/verify]', err);
    res.status(500).json({ success: false, error: 'Payment verification failed' });
  }
});

/**
 * POST /razorpay/webhook
 * Public (signature verified): idempotent payment confirmation fallback.
 * IMPORTANT: This route must receive the raw body buffer (configured in app.ts).
 */
router.post(
  '/razorpay/webhook',
  // NOTE: Raw body parsing must be applied BEFORE this route in app.ts:
  //   app.use('/api/v1/payments/razorpay/webhook', express.raw({ type: 'application/json' }));
  async (req: Request, res: Response): Promise<void> => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      res.status(500).send('Webhook secret not configured');
      return;
    }

    const signature = req.headers['x-razorpay-signature'] as string;
    if (!signature) {
      res.status(400).send('Missing X-Razorpay-Signature header');
      return;
    }

    // Verify with raw body buffer
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body));

    const expectedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    let signaturesMatch = false;
    try {
      signaturesMatch = crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSig, 'hex')
      );
    } catch {
      // Buffer length mismatch → invalid signature
    }

    if (!signaturesMatch) {
      res.status(400).send('Invalid webhook signature');
      return;
    }

    let event: any;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      res.status(400).send('Invalid JSON body');
      return;
    }

    try {
      switch (event.event) {
        case 'payment.captured': {
          const payment = event.payload?.payment?.entity;
          if (!payment) break;

          const trimnovaOrderId = payment.notes?.trimnovaOrderId;
          if (!trimnovaOrderId) break;

          const order = await prisma.order.findUnique({ where: { id: trimnovaOrderId } });
          if (!order || order.status === OrderStatus.CONFIRMED) break; // Already processed

          // Idempotent confirm
          await prisma.order.update({
            where: { id: trimnovaOrderId },
            data: {
              status: OrderStatus.CONFIRMED,
              paymentStatus: PaymentStatus.CAPTURED,
              razorpayPaymentId: payment.id,
              paymentCapturedAt: new Date(),
            },
          });

          // Mark stock reservations confirmed
          await prisma.stockReservation.updateMany({
            where: { reservedForOrder: trimnovaOrderId, isConfirmed: false },
            data: { isConfirmed: true },
          });

          console.log(`[Webhook] payment.captured — Order ${trimnovaOrderId} confirmed via webhook`);
          break;
        }

        case 'payment.failed': {
          const payment = event.payload?.payment?.entity;
          if (!payment) break;

          const trimnovaOrderId = payment.notes?.trimnovaOrderId;
          if (!trimnovaOrderId) break;

          await prisma.order.updateMany({
            where: { id: trimnovaOrderId, status: { not: OrderStatus.CONFIRMED } },
            data: { status: OrderStatus.PAYMENT_FAILED, paymentStatus: PaymentStatus.FAILED },
          });
          break;
        }

        case 'refund.processed': {
          const refund = event.payload?.refund?.entity;
          if (!refund) break;
          console.log(`[Webhook] refund.processed — refund id: ${refund.id}`);
          break;
        }

        default:
          console.log(`[Webhook] Unhandled event: ${event.event}`);
      }
    } catch (handlerErr) {
      console.error('[Webhook] Handler error:', handlerErr);
      // Still return 200 so Razorpay doesn't retry
    }

    res.status(200).json({ status: 'ok' });
  }
);

/**
 * POST /razorpay/refund
 * Admin: initiate refund for an order or sub-order.
 */
router.post('/razorpay/refund', auth, requireRoles.admin, async (req: Request, res: Response): Promise<void> => {
  const parsed = RefundSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, errors: parsed.error.errors });
    return;
  }

  try {
    let razorpayPaymentId: string | null | undefined = null;
    let totalAmountDecimal: Decimal | null = null;

    if (parsed.data.orderId) {
      const order = await prisma.order.findUnique({ where: { id: parsed.data.orderId } });
      if (!order) { res.status(404).json({ success: false, error: 'Order not found' }); return; }
      if (!order.razorpayPaymentId) { res.status(400).json({ success: false, error: 'No payment found for this order' }); return; }
      razorpayPaymentId = order.razorpayPaymentId;
      totalAmountDecimal = new Decimal(order.totalAmount.toString());
    } else if (parsed.data.subOrderId) {
      const subOrder = await prisma.subOrder.findUnique({
        where: { id: parsed.data.subOrderId },
        include: { order: true },
      });
      if (!subOrder) { res.status(404).json({ success: false, error: 'Sub-order not found' }); return; }
      if (!subOrder.order.razorpayPaymentId) { res.status(400).json({ success: false, error: 'No payment found' }); return; }
      razorpayPaymentId = subOrder.order.razorpayPaymentId;
      totalAmountDecimal = new Decimal(subOrder.totalAmount.toString());
    }

    if (!razorpayPaymentId) { res.status(400).json({ success: false, error: 'No payment ID found' }); return; }

    // Amount in paise
    let amountPaise: number;
    if (parsed.data.amount) {
      amountPaise = Math.round(parsed.data.amount);
    } else {
      amountPaise = Math.round(totalAmountDecimal!.mul(100).toNumber());
    }

    const razorpay = getRazorpay();
    const refund = await razorpay.payments.refund(razorpayPaymentId, {
      amount: amountPaise,
      notes: {
        reason: parsed.data.reason ?? 'Admin-initiated refund',
        orderId: parsed.data.orderId ?? '',
        subOrderId: parsed.data.subOrderId ?? '',
      },
    });

    // Update payment status
    if (parsed.data.orderId) {
      await prisma.order.update({
        where: { id: parsed.data.orderId },
        data: {
          paymentStatus: PaymentStatus.REFUNDED,
          status: OrderStatus.REFUNDED,
        },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        refundId: refund.id,
        amount: refund.amount,
        status: refund.status,
      },
      message: 'Refund initiated successfully',
    });
  } catch (err: any) {
    console.error('[POST /payments/razorpay/refund]', err);
    res.status(500).json({
      success: false,
      error: err?.error?.description ?? 'Refund failed',
    });
  }
});

export default router;
