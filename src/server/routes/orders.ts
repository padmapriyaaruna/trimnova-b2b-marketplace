/**
 * TrimNova Orders Router  —  /api/v1/orders
 *
 * Covers the full order lifecycle:
 *   Cart CRUD → Stock Reservation → Order Creation → Vendor Inbox workflow
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import Decimal from 'decimal.js';
import {
  FulfilmentMethod,
  OrderStatus,
  SubOrderStatus,
  SettlementStatus,
  Role,
} from '@prisma/client';

import prisma from '../lib/prisma.js';
import { auth, requireRoles } from '../lib/rbac.js';
import {
  calcGst,
  calcCommission,
  getMatchingPricingTier,
  getMatchingMarginSlab,
} from '../lib/financial-calc.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const router = Router();

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const AddToCartSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  fulfilmentMethod: z.nativeEnum(FulfilmentMethod).default('ONLINE'),
});

const UpdateCartItemSchema = z.object({
  quantity: z.number().int().positive(),
});

const CreateOrderSchema = z.object({
  deliveryAddress: z.object({
    name: z.string().min(1),
    line1: z.string().min(1),
    line2: z.string().optional(),
    city: z.string().min(1),
    state: z.string().min(1),
    pincode: z.string().regex(/^\d{6}$/),
    phone: z.string().min(10),
  }),
  couponCode: z.string().optional(),
  notes: z.string().optional(),
});

const RejectSubOrderSchema = z.object({
  reason: z.string().min(1),
});

const PartialAcceptSchema = z.object({
  acceptedItems: z.array(
    z.object({
      lineItemId: z.string(),
      acceptedQty: z.number().int().nonnegative(),
    })
  ),
  rejectionNote: z.string().optional(),
});

const AddTrackingSchema = z.object({
  trackingNumber: z.string().min(1),
  carrier: z.string().min(1),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve or create the active cart for the authenticated customer. */
async function resolveActiveCart(customerId: string) {
  let cart = await prisma.cart.findFirst({
    where: { customerId, isActive: true },
    include: {
      items: {
        include: {
          product: {
            include: { pricingTiers: true, marginSlabs: true },
          },
        },
      },
    },
  });

  if (!cart) {
    cart = await prisma.cart.create({
      data: { customerId },
      include: {
        items: {
          include: {
            product: {
              include: { pricingTiers: true, marginSlabs: true },
            },
          },
        },
      },
    });
  }

  return cart;
}

/** Generate sequential order numbers like ORD-2026-00001 */
async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.order.count();
  return `ORD-${year}-${String(count + 1).padStart(5, '0')}`;
}

/** Generate sub-order numbers like ORD-2026-00001-V1 */
function generateSubOrderNumber(orderNumber: string, index: number): string {
  return `${orderNumber}-V${index + 1}`;
}

/** Generate RMA number */
async function generateRmaNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.rmaRequest.count();
  return `RMA-${year}-${String(count + 1).padStart(5, '0')}`;
}

/** Send an in-portal notification */
async function sendNotification(
  userId: string | null,
  type: any,
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

// ─── Cart Routes ─────────────────────────────────────────────────────────────

/**
 * POST /cart/add
 * Add (or increment) a product in the customer's active cart.
 */
router.post('/cart/add', auth, requireRoles.customer, async (req: Request, res: Response): Promise<void> => {
  const parsed = AddToCartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, errors: parsed.error.errors });
    return;
  }
  const { productId, quantity, fulfilmentMethod } = parsed.data;

  try {
    const customer = await prisma.customer.findUnique({
      where: { userId: req.user!.id },
    });
    if (!customer) { res.status(404).json({ success: false, error: 'Customer profile not found' }); return; }

    // Validate product exists and is approved
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { pricingTiers: { where: { isActive: true } } },
    });
    if (!product || product.status !== 'APPROVED') {
      res.status(404).json({ success: false, error: 'Product not found or not available' });
      return;
    }

    // Validate MOQ
    if (quantity < product.moq) {
      res.status(400).json({
        success: false,
        error: `Minimum order quantity is ${product.moq} ${product.uom}`,
        moq: product.moq,
      });
      return;
    }

    // Validate pack multiple
    if (quantity % product.packMultiple !== 0) {
      res.status(400).json({
        success: false,
        error: `Quantity must be a multiple of ${product.packMultiple}`,
        packMultiple: product.packMultiple,
      });
      return;
    }

    // Check stock
    const availableStock =
      fulfilmentMethod === 'INSTA' ? product.triminstaStock : product.onlineStock;
    if (quantity > availableStock) {
      res.status(400).json({
        success: false,
        error: `Insufficient stock. Available: ${availableStock}`,
        availableStock,
      });
      return;
    }

    if (fulfilmentMethod === 'INSTA' && !product.triminstaEnabled) {
      res.status(400).json({ success: false, error: 'TrimInsta not available for this product' });
      return;
    }

    // Resolve unit price from tiers
    const tiers = product.pricingTiers.map((t) => ({
      minQty: t.minQty,
      maxQty: t.maxQty,
      unitPrice: new Decimal(t.unitPrice.toString()),
    }));

    let unitPrice: Decimal;
    try {
      unitPrice = getMatchingPricingTier(quantity, tiers);
    } catch {
      unitPrice = new Decimal(product.baseUnitPrice.toString());
    }

    const cart = await resolveActiveCart(customer.id);

    // Check if item already exists in cart
    const existingItem = cart.items.find(
      (i) => i.productId === productId && i.fulfilmentMethod === fulfilmentMethod
    );

    if (existingItem) {
      const newQty = existingItem.quantity + quantity;
      if (newQty > availableStock) {
        res.status(400).json({ success: false, error: `Total quantity would exceed available stock (${availableStock})` });
        return;
      }
      const newTierPrice = getMatchingPricingTier(newQty, tiers).toFixed(2);
      const updatedItem = await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: newQty, unitPrice: newTierPrice },
        include: { product: true },
      });
      res.status(200).json({ success: true, data: updatedItem, message: 'Cart updated' });
      return;
    }

    const cartItem = await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId,
        quantity,
        fulfilmentMethod,
        unitPrice: unitPrice.toFixed(2),
      },
      include: { product: true },
    });

    res.status(201).json({ success: true, data: cartItem, message: 'Added to cart' });
  } catch (err) {
    console.error('[POST /cart/add]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /cart/items/:id
 * Update quantity of a cart item.
 */
router.put('/cart/items/:id', auth, requireRoles.customer, async (req: Request, res: Response): Promise<void> => {
  const parsed = UpdateCartItemSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, errors: parsed.error.errors }); return; }
  const { quantity } = parsed.data;

  try {
    const customer = await prisma.customer.findUnique({ where: { userId: req.user!.id } });
    if (!customer) { res.status(404).json({ success: false, error: 'Customer not found' }); return; }

    const cartItem = await prisma.cartItem.findUnique({
      where: { id: req.params.id as string },
      include: {
        cart: true,
        product: { include: { pricingTiers: { where: { isActive: true } } } },
      },
    }) as any;

    if (!cartItem || cartItem.cart.customerId !== customer.id) {
      res.status(404).json({ success: false, error: 'Cart item not found' });
      return;
    }

    // MOQ & pack multiple validation
    if (quantity < cartItem.product.moq) {
      res.status(400).json({ success: false, error: `Minimum order quantity is ${cartItem.product.moq}` });
      return;
    }
    if (quantity % cartItem.product.packMultiple !== 0) {
      res.status(400).json({ success: false, error: `Quantity must be a multiple of ${cartItem.product.packMultiple}` });
      return;
    }

    const availableStock =
      cartItem.fulfilmentMethod === 'INSTA'
        ? cartItem.product.triminstaStock
        : cartItem.product.onlineStock;

    if (quantity > availableStock) {
      res.status(400).json({ success: false, error: `Insufficient stock. Available: ${availableStock}` });
      return;
    }

    const tiers = cartItem.product.pricingTiers.map((t) => ({
      minQty: t.minQty,
      maxQty: t.maxQty,
      unitPrice: new Decimal(t.unitPrice.toString()),
    }));

    let unitPrice: Decimal;
    try {
      unitPrice = getMatchingPricingTier(quantity, tiers);
    } catch {
      unitPrice = new Decimal(cartItem.product.baseUnitPrice.toString());
    }

    const updated = await prisma.cartItem.update({
      where: { id: req.params.id as string },
      data: { quantity, unitPrice: unitPrice.toFixed(2) },
      include: { product: true },
    });

    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error('[PUT /cart/items/:id]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * DELETE /cart/items/:id
 * Remove a cart item.
 */
router.delete('/cart/items/:id', auth, requireRoles.customer, async (req: Request, res: Response): Promise<void> => {
  try {
    const customer = await prisma.customer.findUnique({ where: { userId: req.user!.id } });
    if (!customer) { res.status(404).json({ success: false, error: 'Customer not found' }); return; }

    const cartItem = await prisma.cartItem.findUnique({
      where: { id: req.params.id as string },
      include: { cart: true },
    }) as any;
    if (!cartItem || cartItem.cart.customerId !== customer.id) {
      res.status(404).json({ success: false, error: 'Cart item not found' });
      return;
    }

    await prisma.cartItem.delete({ where: { id: req.params.id as string } });
    res.status(200).json({ success: true, message: 'Item removed from cart' });
  } catch (err) {
    console.error('[DELETE /cart/items/:id]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /cart
 * Get the active cart with items grouped by vendor and fulfilment method.
 */
router.get('/cart', auth, requireRoles.customer, async (req: Request, res: Response): Promise<void> => {
  try {
    const customer = await prisma.customer.findUnique({ where: { userId: req.user!.id } });
    if (!customer) { res.status(404).json({ success: false, error: 'Customer not found' }); return; }

    const cart = await prisma.cart.findFirst({
      where: { customerId: customer.id, isActive: true },
      include: {
        items: {
          include: {
            product: {
              include: {
                vendor: { select: { id: true, companyName: true, vendorCode: true, triminstaEnabled: true } },
                pricingTiers: { where: { isActive: true } },
              },
            },
          },
        },
      },
    });

    if (!cart) {
      res.status(200).json({ success: true, data: { items: [], groups: [], subtotal: '0.00', totalGst: '0.00', totalAmount: '0.00' } });
      return;
    }

    // Group by vendor + fulfilment method
    type CartGroup = {
      vendorId: string;
      vendorName: string;
      vendorCode: string;
      fulfilmentMethod: FulfilmentMethod;
      items: (typeof cart.items)[number][];
      subtotal: string;
      totalGst: string;
    };
    const groupMap = new Map<string, CartGroup>();

    let cartSubtotal = new Decimal(0);
    let cartTotalGst = new Decimal(0);

    for (const item of cart.items) {
      const key = `${item.product.vendorId ?? 'PLATFORM'}_${item.fulfilmentMethod}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          vendorId: item.product.vendorId ?? '',
          vendorName: item.product.vendor?.companyName ?? 'TrimNova',
          vendorCode: item.product.vendor?.vendorCode ?? '',
          fulfilmentMethod: item.fulfilmentMethod,
          items: [],
          subtotal: '0.00',
          totalGst: '0.00',
        });
      }
      const group = groupMap.get(key)!;
      group.items.push(item);

      const lineSubtotal = new Decimal(item.unitPrice.toString()).mul(item.quantity);
      const lineGst = calcGst(lineSubtotal, new Decimal(item.product.gstRate.toString()).div(100));
      group.subtotal = new Decimal(group.subtotal).plus(lineSubtotal).toFixed(2);
      group.totalGst = new Decimal(group.totalGst).plus(lineGst).toFixed(2);
      cartSubtotal = cartSubtotal.plus(lineSubtotal);
      cartTotalGst = cartTotalGst.plus(lineGst);
    }

    res.status(200).json({
      success: true,
      data: {
        id: cart.id,
        items: cart.items,
        groups: Array.from(groupMap.values()),
        subtotal: cartSubtotal.toFixed(2),
        totalGst: cartTotalGst.toFixed(2),
        totalAmount: cartSubtotal.plus(cartTotalGst).toFixed(2),
      },
    });
  } catch (err) {
    console.error('[GET /cart]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /cart/reserve
 * Atomically reserve all cart items for 15 minutes.
 * Deducts from triminstaStock (INSTA) or onlineStock (ONLINE) atomically.
 */
router.post('/cart/reserve', auth, requireRoles.customer, async (req: Request, res: Response): Promise<void> => {
  try {
    const customer = await prisma.customer.findUnique({ where: { userId: req.user!.id } });
    if (!customer) { res.status(404).json({ success: false, error: 'Customer not found' }); return; }

    const cart = await prisma.cart.findFirst({
      where: { customerId: customer.id, isActive: true },
      include: {
        items: { include: { product: true } },
      },
    });

    if (!cart || cart.items.length === 0) {
      res.status(400).json({ success: false, error: 'Cart is empty' });
      return;
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const reservations = await prisma.$transaction(async (tx) => {
      const created: { id: string; productId: string; quantity: number }[] = [];

      for (const item of cart.items) {
        // Re-read product with row-lock semantics (Prisma doesn't have SELECT FOR UPDATE
        // but within $transaction isolation, we check latest values)
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) throw new Error(`Product ${item.productId} not found`);

        const stockField = item.fulfilmentMethod === 'INSTA' ? 'triminstaStock' : 'onlineStock';
        const availableStock =
          item.fulfilmentMethod === 'INSTA' ? product.triminstaStock : product.onlineStock;

        if (item.quantity > availableStock) {
          throw new Error(
            `Insufficient stock for ${product.name}. Requested: ${item.quantity}, Available: ${availableStock}`
          );
        }

        // Deduct from stock
        await tx.product.update({
          where: { id: item.productId },
          data: { [stockField]: { decrement: item.quantity } },
        });

        // Create reservation record
        const reservation = await tx.stockReservation.create({
          data: {
            productId: item.productId,
            quantity: item.quantity,
            fulfilmentMethod: item.fulfilmentMethod,
            reservedForCart: cart.id,
            expiresAt,
            isConfirmed: false,
          },
        });

        created.push({ id: reservation.id, productId: item.productId, quantity: item.quantity });
      }

      return created;
    });

    res.status(200).json({
      success: true,
      data: {
        reservations,
        expiresAt,
        cartId: cart.id,
      },
      message: 'Stock reserved for 15 minutes',
    });
  } catch (err: any) {
    const isStockError = err.message?.includes('Insufficient stock');
    console.error('[POST /cart/reserve]', err);
    res.status(isStockError ? 409 : 500).json({
      success: false,
      error: isStockError ? err.message : 'Reservation failed',
    });
  }
});

// ─── Order Creation ───────────────────────────────────────────────────────────

/**
 * POST /
 * Create Order from active cart. Groups items by vendorId + fulfilmentMethod
 * into SubOrders. Applies coupon if provided.
 */
router.post('/', auth, requireRoles.customer, async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateOrderSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, errors: parsed.error.errors }); return; }
  const { deliveryAddress, couponCode, notes } = parsed.data;

  try {
    const customer = await prisma.customer.findUnique({ where: { userId: req.user!.id } });
    if (!customer) { res.status(404).json({ success: false, error: 'Customer not found' }); return; }

    const cart = await prisma.cart.findFirst({
      where: { customerId: customer.id, isActive: true },
      include: {
        items: {
          include: {
            product: {
              include: {
                pricingTiers: { where: { isActive: true } },
                marginSlabs: { where: { isActive: true } },
                vendor: true,
              },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      res.status(400).json({ success: false, error: 'Cart is empty' });
      return;
    }

    // Validate active reservations exist for all items
    for (const item of cart.items) {
      const reservation = await prisma.stockReservation.findFirst({
        where: {
          productId: item.productId,
          reservedForCart: cart.id,
          fulfilmentMethod: item.fulfilmentMethod,
          isConfirmed: false,
          expiresAt: { gt: new Date() },
        },
      });
      if (!reservation) {
        res.status(409).json({
          success: false,
          error: `Stock reservation expired for ${item.product.name}. Please reserve again.`,
        });
        return;
      }
    }

    // Validate coupon
    let coupon: any = null;
    if (couponCode) {
      coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });
      if (!coupon || coupon.applicableTo !== 'CUSTOMER_ORDER') {
        res.status(400).json({ success: false, error: 'Invalid or inapplicable coupon code' });
        return;
      }
      if (coupon.isUsed) {
        res.status(400).json({ success: false, error: 'Coupon already used' });
        return;
      }
      if (coupon.expiresAt && coupon.expiresAt < new Date()) {
        res.status(400).json({ success: false, error: 'Coupon has expired' });
        return;
      }
    }

    const order = await prisma.$transaction(async (tx) => {
      // Group cart items by vendorId + fulfilmentMethod
      type GroupKey = { vendorId: string; fulfilmentMethod: FulfilmentMethod };
      const groupMap = new Map<string, { key: GroupKey; items: typeof cart.items }>();

      for (const item of cart.items) {
        const vendorId = item.product.vendorId ?? 'PLATFORM';
        const key = `${vendorId}_${item.fulfilmentMethod}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, { key: { vendorId, fulfilmentMethod: item.fulfilmentMethod }, items: [] });
        }
        groupMap.get(key)!.items.push(item);
      }

      let orderSubtotal = new Decimal(0);
      let orderTotalGst = new Decimal(0);
      let orderShipping = new Decimal(0);
      let platformDiscountTotal = new Decimal(0);
      let vendorDiscountTotal = new Decimal(0);

      // Pre-compute all group financials
      type GroupFinancials = {
        key: GroupKey;
        items: typeof cart.items;
        subtotal: Decimal;
        totalGst: Decimal;
        shippingCharge: Decimal;
        vendorDiscount: Decimal;
        totalAmount: Decimal;
        slabMarginPct: Decimal;
        commissionAmount: Decimal;
        netVendorPayable: Decimal;
      };

      const groupFinancials: GroupFinancials[] = [];

      for (const [, group] of groupMap.entries()) {
        let groupSubtotal = new Decimal(0);
        let groupGst = new Decimal(0);
        const shippingCharge = new Decimal('0'); // TBD: logistics integration
        const vendorDiscount = new Decimal('0');

        for (const item of group.items) {
          const tiers = item.product.pricingTiers.map((t) => ({
            minQty: t.minQty,
            maxQty: t.maxQty,
            unitPrice: new Decimal(t.unitPrice.toString()),
          }));

          let unitPrice: Decimal;
          try {
            unitPrice = getMatchingPricingTier(item.quantity, tiers);
          } catch {
            unitPrice = new Decimal(item.product.baseUnitPrice.toString());
          }

          const lineSubtotal = unitPrice.mul(item.quantity);
          const lineGst = calcGst(lineSubtotal, new Decimal(item.product.gstRate.toString()).div(100));

          groupSubtotal = groupSubtotal.plus(lineSubtotal);
          groupGst = groupGst.plus(lineGst);
        }

        // Use the slab for the total group qty — simplified to first item's qty for now
        // In production you'd sum by product across slabs
        const totalQtyForSlab = group.items.reduce((s, i) => s + i.quantity, 0);
        const slabs = group.items[0]?.product.marginSlabs.map((s) => ({
          slabNumber: s.slabNumber,
          minQty: s.minQty,
          maxQty: s.maxQty,
          marginPct: new Decimal(s.marginPct.toString()),
        })) ?? [];

        let slabMarginPct = new Decimal('8'); // Default 8%
        try {
          const slabResult = getMatchingMarginSlab(totalQtyForSlab, slabs);
          slabMarginPct = slabResult.marginPct;
        } catch { /* use default */ }

        const commission = calcCommission(
          groupSubtotal,
          slabMarginPct.div(100),
          vendorDiscount,
          new Decimal('0'),
          shippingCharge
        );

        const groupTotal = groupSubtotal.plus(groupGst).plus(shippingCharge);

        groupFinancials.push({
          key: group.key,
          items: group.items,
          subtotal: groupSubtotal,
          totalGst: groupGst,
          shippingCharge,
          vendorDiscount,
          totalAmount: groupTotal,
          slabMarginPct,
          commissionAmount: commission.commissionAmt,
          netVendorPayable: commission.netVendorPayable,
        });

        orderSubtotal = orderSubtotal.plus(groupSubtotal);
        orderTotalGst = orderTotalGst.plus(groupGst);
        orderShipping = orderShipping.plus(shippingCharge);
      }

      // Compute coupon discount
      let platformDiscount = new Decimal('0');
      if (coupon) {
        if (coupon.type === 'PERCENT_OFF') {
          const computed = orderSubtotal.mul(new Decimal(coupon.value.toString()).div(100));
          platformDiscount = coupon.maxDiscountAmt
            ? Decimal.min(computed, new Decimal(coupon.maxDiscountAmt.toString()))
            : computed;
        } else {
          platformDiscount = new Decimal(coupon.value.toString());
        }
        platformDiscount = platformDiscount.toDecimalPlaces(2);
        if (coupon.funder === 'PLATFORM') {
          platformDiscountTotal = platformDiscount;
        } else {
          vendorDiscountTotal = platformDiscount;
        }
      }

      const orderTotal = orderSubtotal
        .plus(orderTotalGst)
        .plus(orderShipping)
        .minus(platformDiscountTotal)
        .minus(vendorDiscountTotal)
        .toDecimalPlaces(2);

      const orderNumber = await generateOrderNumber();

      // Create the Order
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          customerId: customer.id,
          status: OrderStatus.PAYMENT_PENDING,
          subtotal: orderSubtotal.toFixed(2),
          totalGst: orderTotalGst.toFixed(2),
          totalShipping: orderShipping.toFixed(2),
          platformDiscount: platformDiscountTotal.toFixed(2),
          vendorDiscount: vendorDiscountTotal.toFixed(2),
          totalAmount: orderTotal.toFixed(2),
          couponCode: coupon?.code,
          couponId: coupon?.id,
          deliveryAddress: deliveryAddress as any,
          notes,
          paymentStatus: 'PENDING',
        },
      });

      // Create SubOrders + LineItems
      let subOrderIndex = 0;
      for (const gf of groupFinancials) {
        const subOrderNumber = generateSubOrderNumber(orderNumber, subOrderIndex++);

        const subOrder = await tx.subOrder.create({
          data: {
            subOrderNumber,
            orderId: newOrder.id,
            vendorId: gf.key.vendorId,
            fulfilmentMethod: gf.key.fulfilmentMethod,
            status: SubOrderStatus.PENDING_VENDOR_ACCEPTANCE,
            subtotal: gf.subtotal.toFixed(2),
            totalGst: gf.totalGst.toFixed(2),
            shippingCharge: gf.shippingCharge.toFixed(2),
            vendorDiscount: gf.vendorDiscount.toFixed(2),
            totalAmount: gf.totalAmount.toFixed(2),
            slabMarginPct: gf.slabMarginPct.toFixed(3),
            commissionAmount: gf.commissionAmount.toFixed(2),
            netVendorPayable: gf.netVendorPayable.toFixed(2),
            listingVersion: gf.items[0].product.version,
            settlementStatus: SettlementStatus.RETURN_WINDOW_HOLD,
          },
        });

        // Create line items
        for (const item of gf.items) {
          const tiers = item.product.pricingTiers.map((t) => ({
            minQty: t.minQty,
            maxQty: t.maxQty,
            unitPrice: new Decimal(t.unitPrice.toString()),
          }));
          let unitPrice: Decimal;
          try {
            unitPrice = getMatchingPricingTier(item.quantity, tiers);
          } catch {
            unitPrice = new Decimal(item.product.baseUnitPrice.toString());
          }

          const lineSubtotal = unitPrice.mul(item.quantity);
          const gstRate = new Decimal(item.product.gstRate.toString());
          const gstAmt = calcGst(lineSubtotal, gstRate.div(100));

          const slabs = item.product.marginSlabs.map((s) => ({
            slabNumber: s.slabNumber,
            minQty: s.minQty,
            maxQty: s.maxQty,
            marginPct: new Decimal(s.marginPct.toString()),
          }));
          let lineSlabMarginPct = new Decimal('8');
          let lineSlabNumber = 1;
          try {
            const slabRes = getMatchingMarginSlab(item.quantity, slabs);
            lineSlabMarginPct = slabRes.marginPct;
            lineSlabNumber = slabRes.slabNumber;
          } catch { /* default */ }

          const lineCommission = lineSubtotal.mul(lineSlabMarginPct.div(100)).toDecimalPlaces(2);
          const lineNetVendor = lineSubtotal.minus(lineCommission).toDecimalPlaces(2);

          await tx.orderLineItem.create({
            data: {
              subOrderId: subOrder.id,
              productId: item.productId,
              productSnapshot: item.product as any,
              sku: item.product.sku,
              hsnCode: item.product.hsnCode,
              productName: item.product.name,
              quantity: item.quantity,
              unitPrice: unitPrice.toFixed(2),
              gstRate: gstRate.toFixed(2),
              gstAmount: gstAmt.toFixed(2),
              lineTotal: lineSubtotal.plus(gstAmt).toFixed(2),
              fulfilmentMethod: item.fulfilmentMethod,
              slabNumber: lineSlabNumber,
              marginPct: lineSlabMarginPct.toFixed(3),
              commissionAmt: lineCommission.toFixed(2),
              netVendorAmt: lineNetVendor.toFixed(2),
            },
          });
        }
      }

      // Mark cart inactive
      await tx.cart.update({ where: { id: cart.id }, data: { isActive: false } });

      // Mark coupon used
      if (coupon) {
        await tx.coupon.update({
          where: { id: coupon.id },
          data: { isUsed: true, usedAt: new Date(), usedByOrderId: newOrder.id },
        });
      }

      return newOrder;
    });

    res.status(201).json({
      success: true,
      data: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        status: order.status,
      },
      message: 'Order created. Proceed to payment.',
    });
  } catch (err) {
    console.error('[POST /orders]', err);
    res.status(500).json({ success: false, error: 'Order creation failed' });
  }
});

// ─── Customer Order List / Detail ─────────────────────────────────────────────

/**
 * GET /
 * List own orders with sub-orders and line items.
 */
router.get('/', auth, requireRoles.customer, async (req: Request, res: Response): Promise<void> => {
  try {
    const customer = await prisma.customer.findUnique({ where: { userId: req.user!.id } });
    if (!customer) { res.status(404).json({ success: false, error: 'Customer not found' }); return; }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { customerId: customer.id, status: { not: OrderStatus.CART } },
        include: {
          subOrders: {
            include: {
              lineItems: true,
              vendor: { select: { companyName: true, vendorCode: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.order.count({
        where: { customerId: customer.id, status: { not: OrderStatus.CART } },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: orders,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[GET /orders]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /:orderId
 * Order detail for customer.
 */
router.get('/:orderId', auth, requireRoles.customer, async (req: Request, res: Response): Promise<void> => {
  try {
    const customer = await prisma.customer.findUnique({ where: { userId: req.user!.id } });
    if (!customer) { res.status(404).json({ success: false, error: 'Customer not found' }); return; }

    const order = await prisma.order.findFirst({
      where: { id: req.params.orderId as string, customerId: customer.id },
      include: {
        subOrders: {
          include: {
            lineItems: { include: { product: { select: { name: true, sku: true, imageUrls: true } } } },
            vendor: { select: { companyName: true, vendorCode: true, phone: true } },
            rmaRequests: { select: { id: true, rmaNumber: true, status: true, createdAt: true } },
          },
        },
      },
    });

    if (!order) { res.status(404).json({ success: false, error: 'Order not found' }); return; }
    res.status(200).json({ success: true, data: order });
  } catch (err) {
    console.error('[GET /orders/:orderId]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─── Vendor Inbox ─────────────────────────────────────────────────────────────

/**
 * GET /vendor-inbox
 * Vendor: list all sub-orders for own vendor account.
 */
router.get('/vendor-inbox', auth, requireRoles.vendor, async (req: Request, res: Response): Promise<void> => {
  try {
    const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;
    const statusFilter = req.query.status ? String(req.query.status) as SubOrderStatus : undefined;

    const where: any = { vendorId: vendor.id };
    if (statusFilter) where.status = statusFilter;

    const [subOrders, total] = await Promise.all([
      prisma.subOrder.findMany({
        where,
        include: {
          order: { select: { orderNumber: true, createdAt: true, customer: { select: { companyName: true, customerCode: true } } } },
          lineItems: { include: { product: { select: { name: true, sku: true, imageUrls: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.subOrder.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: subOrders,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[GET /vendor-inbox]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /vendor-inbox/:subOrderId
 * Vendor: sub-order detail with line items.
 */
router.get('/vendor-inbox/:subOrderId', auth, requireRoles.vendor, async (req: Request, res: Response): Promise<void> => {
  try {
    const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

    const subOrder = await prisma.subOrder.findFirst({
      where: { id: req.params.subOrderId as string, vendorId: vendor.id },
      include: {
        order: {
          include: {
            customer: { select: { companyName: true, customerCode: true, phone: true, deliveryAddress: true } },
          },
        },
        lineItems: { include: { product: true } },
        rmaRequests: true,
      },
    });

    if (!subOrder) { res.status(404).json({ success: false, error: 'Sub-order not found' }); return; }
    res.status(200).json({ success: true, data: subOrder });
  } catch (err) {
    console.error('[GET /vendor-inbox/:subOrderId]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /vendor-inbox/:subOrderId/accept
 * Vendor: accept sub-order.
 */
router.put('/vendor-inbox/:subOrderId/accept', auth, requireRoles.vendor, async (req: Request, res: Response): Promise<void> => {
  try {
    const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

    const subOrder = await prisma.subOrder.findFirst({
      where: { id: req.params.subOrderId as string, vendorId: vendor.id },
    });
    if (!subOrder) { res.status(404).json({ success: false, error: 'Sub-order not found' }); return; }

    if (subOrder.status !== SubOrderStatus.PENDING_VENDOR_ACCEPTANCE) {
      res.status(409).json({ success: false, error: `Cannot accept sub-order in ${subOrder.status} state` });
      return;
    }

    const updated = await prisma.subOrder.update({
      where: { id: subOrder.id },
      data: {
        status: SubOrderStatus.ACCEPTED,
        vendorAcceptedAt: new Date(),
      },
    });

    // Notify customer
    const customerUserId = await prisma.order.findUnique({
      where: { id: subOrder.orderId },
      select: { customer: { select: { userId: true } } },
    });
    if (customerUserId?.customer.userId) {
      await sendNotification(
        customerUserId.customer.userId,
        'ORDER_ACCEPTED',
        'Sub-order accepted',
        `Sub-order ${subOrder.subOrderNumber} has been accepted by the vendor.`,
        { subOrderId: subOrder.id }
      );
    }

    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error('[PUT /vendor-inbox/:subOrderId/accept]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /vendor-inbox/:subOrderId/reject
 * Vendor: reject sub-order with reason.
 */
router.put('/vendor-inbox/:subOrderId/reject', auth, requireRoles.vendor, async (req: Request, res: Response): Promise<void> => {
  const parsed = RejectSubOrderSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, errors: parsed.error.errors }); return; }

  try {
    const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

    const subOrder = await prisma.subOrder.findFirst({
      where: { id: req.params.subOrderId as string, vendorId: vendor.id },
      include: { order: { include: { customer: { select: { userId: true } } } }, lineItems: true },
    }) as any;
    if (!subOrder) { res.status(404).json({ success: false, error: 'Sub-order not found' }); return; }

    if (subOrder.status !== SubOrderStatus.PENDING_VENDOR_ACCEPTANCE) {
      res.status(409).json({ success: false, error: `Cannot reject sub-order in ${subOrder.status} state` });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const so = await tx.subOrder.update({
        where: { id: subOrder.id },
        data: {
          status: SubOrderStatus.REJECTED,
          vendorRejectedAt: new Date(),
          vendorRejectionNote: parsed.data.reason,
        },
      });

      // Restore stock reservations
      for (const li of subOrder.lineItems) {
        const stockField = subOrder.fulfilmentMethod === 'INSTA' ? 'triminstaStock' : 'onlineStock';
        await tx.product.update({
          where: { id: li.productId },
          data: { [stockField]: { increment: li.quantity } },
        });
      }

      return so;
    });

    if (subOrder.order.customer.userId) {
      await sendNotification(
        subOrder.order.customer.userId,
        'REJECTION',
        'Sub-order rejected',
        `Sub-order ${subOrder.subOrderNumber} was rejected by vendor. Reason: ${parsed.data.reason}. A refund will be processed.`,
        { subOrderId: subOrder.id }
      );
    }

    res.status(200).json({ success: true, data: updated, message: 'Sub-order rejected. Refund will be processed.' });
  } catch (err) {
    console.error('[PUT /vendor-inbox/:subOrderId/reject]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /vendor-inbox/:subOrderId/partial-accept
 * Vendor: accept some qty, reject rest.
 */
router.put('/vendor-inbox/:subOrderId/partial-accept', auth, requireRoles.vendor, async (req: Request, res: Response): Promise<void> => {
  const parsed = PartialAcceptSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, errors: parsed.error.errors }); return; }

  try {
    const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

    const subOrder = await prisma.subOrder.findFirst({
      where: { id: req.params.subOrderId as string, vendorId: vendor.id },
      include: { lineItems: true },
    }) as any;
    if (!subOrder) { res.status(404).json({ success: false, error: 'Sub-order not found' }); return; }

    if (subOrder.status !== SubOrderStatus.PENDING_VENDOR_ACCEPTANCE) {
      res.status(409).json({ success: false, error: `Cannot partially accept sub-order in ${subOrder.status} state` });
      return;
    }

    // Validate accepted quantities
    for (const accepted of parsed.data.acceptedItems) {
      const lineItem = subOrder.lineItems.find((li) => li.id === accepted.lineItemId);
      if (!lineItem) {
        res.status(400).json({ success: false, error: `Line item ${accepted.lineItemId} not found in sub-order` });
        return;
      }
      if (accepted.acceptedQty > lineItem.quantity) {
        res.status(400).json({ success: false, error: `Accepted qty (${accepted.acceptedQty}) exceeds ordered qty (${lineItem.quantity}) for item ${accepted.lineItemId}` });
        return;
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const accepted of parsed.data.acceptedItems) {
        const lineItem = subOrder.lineItems.find((li) => li.id === accepted.lineItemId)!;
        const rejectedQty = lineItem.quantity - accepted.acceptedQty;

        if (rejectedQty > 0) {
          // Restore stock for rejected portion
          const stockField = subOrder.fulfilmentMethod === 'INSTA' ? 'triminstaStock' : 'onlineStock';
          await tx.product.update({
            where: { id: lineItem.productId },
            data: { [stockField]: { increment: rejectedQty } },
          });
          // Update line item quantity
          await tx.orderLineItem.update({
            where: { id: accepted.lineItemId },
            data: { quantity: accepted.acceptedQty },
          });
        }
      }

      await tx.subOrder.update({
        where: { id: subOrder.id },
        data: {
          status: SubOrderStatus.PARTIAL_ACCEPTED,
          vendorAcceptedAt: new Date(),
          vendorRejectionNote: parsed.data.rejectionNote,
        },
      });
    });

    res.status(200).json({ success: true, message: 'Partial acceptance recorded' });
  } catch (err) {
    console.error('[PUT /vendor-inbox/:subOrderId/partial-accept]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Workflow state machine
const WORKFLOW_TRANSITIONS: Partial<Record<SubOrderStatus, SubOrderStatus>> = {
  [SubOrderStatus.ACCEPTED]: SubOrderStatus.ALLOCATED,
  [SubOrderStatus.PARTIAL_ACCEPTED]: SubOrderStatus.ALLOCATED,
  [SubOrderStatus.ALLOCATED]: SubOrderStatus.IN_PREPARATION,
  [SubOrderStatus.IN_PREPARATION]: SubOrderStatus.QC_COMPLETE,
  [SubOrderStatus.QC_COMPLETE]: SubOrderStatus.PACKED,
  [SubOrderStatus.PACKED]: SubOrderStatus.INVOICE_GENERATED,
  [SubOrderStatus.INVOICE_GENERATED]: SubOrderStatus.SHIPPED,
  [SubOrderStatus.SHIPPED]: SubOrderStatus.DELIVERED,
};

/**
 * PUT /vendor-inbox/:subOrderId/advance-status
 * Vendor: advance sub-order through the workflow state machine.
 */
router.put('/vendor-inbox/:subOrderId/advance-status', auth, requireRoles.vendor, async (req: Request, res: Response): Promise<void> => {
  try {
    const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

    const subOrder = await prisma.subOrder.findFirst({
      where: { id: req.params.subOrderId as string, vendorId: vendor.id },
    });
    if (!subOrder) { res.status(404).json({ success: false, error: 'Sub-order not found' }); return; }

    const nextStatus = WORKFLOW_TRANSITIONS[subOrder.status];
    if (!nextStatus) {
      res.status(409).json({
        success: false,
        error: `No workflow transition available from status ${subOrder.status}`,
        currentStatus: subOrder.status,
      });
      return;
    }

    const updateData: any = { status: nextStatus };

    if (nextStatus === SubOrderStatus.SHIPPED) {
      updateData.dispatchedAt = new Date();
    }
    if (nextStatus === SubOrderStatus.DELIVERED) {
      const deliveredAt = new Date();
      updateData.deliveredAt = deliveredAt;
      // Set return deadline from PlatformConfig
      const config = await prisma.platformConfig.findUnique({ where: { key: 'return_policy_days' } });
      const returnDays = config ? parseInt(config.value) : 10;
      const returnDeadline = new Date(deliveredAt.getTime() + returnDays * 24 * 60 * 60 * 1000);
      updateData.returnDeadline = returnDeadline;
      // Set settlement to return window hold
      updateData.settlementStatus = SettlementStatus.RETURN_WINDOW_HOLD;
    }

    const updated = await prisma.subOrder.update({
      where: { id: subOrder.id },
      data: updateData,
    });

    // Notify customer on key milestones
    const NOTIFY_STATUSES: SubOrderStatus[] = [SubOrderStatus.SHIPPED, SubOrderStatus.DELIVERED];
    if (NOTIFY_STATUSES.includes(nextStatus)) {
      const orderData = await prisma.order.findUnique({
        where: { id: subOrder.orderId },
        select: { customer: { select: { userId: true } } },
      });
      if (orderData?.customer.userId) {
        await sendNotification(
          orderData.customer.userId,
          nextStatus === SubOrderStatus.SHIPPED ? 'ORDER_SHIPPED' : 'ORDER_DELIVERED',
          nextStatus === SubOrderStatus.SHIPPED ? 'Your order has shipped' : 'Your order has been delivered',
          `Sub-order ${subOrder.subOrderNumber} is now ${nextStatus}.`,
          { subOrderId: subOrder.id }
        );
      }
    }

    res.status(200).json({
      success: true,
      data: { id: updated.id, previousStatus: subOrder.status, newStatus: nextStatus },
    });
  } catch (err) {
    console.error('[PUT /vendor-inbox/:subOrderId/advance-status]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /vendor-inbox/:subOrderId/add-tracking
 * Vendor: add tracking number and carrier.
 */
router.post('/vendor-inbox/:subOrderId/add-tracking', auth, requireRoles.vendor, async (req: Request, res: Response): Promise<void> => {
  const parsed = AddTrackingSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, errors: parsed.error.errors }); return; }

  try {
    const vendor = await prisma.vendor.findUnique({ where: { userId: req.user!.id } });
    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

    const subOrder = await prisma.subOrder.findFirst({
      where: { id: req.params.subOrderId as string, vendorId: vendor.id },
    });
    if (!subOrder) { res.status(404).json({ success: false, error: 'Sub-order not found' }); return; }

    const updated = await prisma.subOrder.update({
      where: { id: subOrder.id },
      data: {
        trackingNumber: parsed.data.trackingNumber,
        trackingCarrier: parsed.data.carrier,
      },
    });

    res.status(200).json({ success: true, data: updated, message: 'Tracking added' });
  } catch (err) {
    console.error('[POST /vendor-inbox/:subOrderId/add-tracking]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
