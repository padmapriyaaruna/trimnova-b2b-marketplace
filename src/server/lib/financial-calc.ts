/**
 * TrimNova Financial Calculation Library
 * All monetary math uses Decimal.js to avoid floating-point errors.
 *
 * Commission Model (Section 4 — MoU):
 *   B  = grossValue - vendorDiscount        (platform discount never reduces vendor entitlement)
 *   C  = round(B × marginRate)
 *   GST on Commission = C × 0.18            (CGST 9% + SGST 9% or IGST 18%)
 *   TDS = (B - C) × 0.01                   (194-O @ 1% on net vendor receipts)
 *   Net = B + shippingCharge - C - GST - TDS
 */

import Decimal from 'decimal.js';

// ─── Decimal Configuration ────────────────────────────────────────────────────
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CommissionResult {
  commissionBasis: Decimal;      // B
  commissionAmt: Decimal;        // C
  gstOnCommission: Decimal;      // GST @ 18% on C
  tdsAmount: Decimal;            // TDS @ 1% on (B - C)
  netVendorPayable: Decimal;     // B + shippingCharge - C - GST - TDS
}

export interface PricingTier {
  minQty: number;
  maxQty: number | null;
  unitPrice: Decimal;
}

export interface MarginSlab {
  minQty: number;
  maxQty: number | null;
  marginPct: Decimal;
  slabNumber: number;
}

export interface MarginSlabResult {
  slabNumber: number;
  marginPct: Decimal;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GST_ON_COMMISSION_RATE = new Decimal('0.18');  // 18%
const TDS_RATE = new Decimal('0.01');                // 194-O @ 1%
const ZERO = new Decimal('0');

// ─── calcCommission ───────────────────────────────────────────────────────────

/**
 * Calculate platform commission, GST on commission, TDS, and net vendor payable.
 *
 * @param grossValue        Gross order value (MRP × qty) before any discounts
 * @param marginRate        Platform margin rate (e.g. 0.12 for 12%)
 * @param vendorDiscount    Vendor-funded discount amount (reduces B)
 * @param platformDiscount  Platform-funded discount (does NOT reduce B — absorbed by platform)
 * @param shippingCharge    Shipping amount passed through to vendor (default 0)
 */
export function calcCommission(
  grossValue: Decimal,
  marginRate: Decimal,
  vendorDiscount: Decimal,
  platformDiscount: Decimal,
  shippingCharge: Decimal = ZERO
): CommissionResult {
  // B = grossValue - vendorDiscount
  // Platform discount is NOT subtracted; it is a platform liability, not vendor's
  const commissionBasis = grossValue.minus(vendorDiscount);

  // C = round(B × marginRate) — half-up rounding to 2dp
  const commissionAmt = commissionBasis
    .mul(marginRate)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // GST on Commission = C × 18%
  const gstOnCommission = commissionAmt
    .mul(GST_ON_COMMISSION_RATE)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // TDS = (B - C) × 1%
  const tdsAmount = commissionBasis
    .minus(commissionAmt)
    .mul(TDS_RATE)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  // Net = B + shippingCharge - C - GST - TDS
  const netVendorPayable = commissionBasis
    .plus(shippingCharge)
    .minus(commissionAmt)
    .minus(gstOnCommission)
    .minus(tdsAmount)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return {
    commissionBasis,
    commissionAmt,
    gstOnCommission,
    tdsAmount,
    netVendorPayable,
  };
}

// ─── calcGst ─────────────────────────────────────────────────────────────────

/**
 * Calculate GST amount for a given base amount and GST rate.
 *
 * @param amount   Base amount (pre-GST)
 * @param gstRate  GST rate as decimal fraction (e.g. 0.12 for 12%)
 * @returns        GST amount rounded to 2 decimal places
 */
export function calcGst(amount: Decimal, gstRate: Decimal): Decimal {
  return amount
    .mul(gstRate)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

// ─── getMatchingPricingTier ───────────────────────────────────────────────────

/**
 * Return the unit price for the tier that matches the given quantity.
 * Tiers are inclusive: minQty <= qty <= maxQty (null maxQty = open-ended).
 *
 * @throws Error if no tier matches the quantity.
 */
export function getMatchingPricingTier(
  qty: number,
  tiers: PricingTier[]
): Decimal {
  // Sort ascending by minQty for deterministic resolution
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);

  for (const tier of sorted) {
    const aboveMin = qty >= tier.minQty;
    const belowMax = tier.maxQty === null || qty <= tier.maxQty;
    if (aboveMin && belowMax) {
      return tier.unitPrice;
    }
  }

  throw new Error(
    `No pricing tier matched for quantity ${qty}. ` +
    `Available tiers: ${JSON.stringify(sorted.map(t => ({ min: t.minQty, max: t.maxQty })))}`
  );
}

// ─── getMatchingMarginSlab ────────────────────────────────────────────────────

/**
 * Return the margin slab that matches the given quantity.
 * Slabs are inclusive: minQty <= qty <= maxQty (null maxQty = open-ended).
 *
 * @throws Error if no slab matches the quantity.
 */
export function getMatchingMarginSlab(
  qty: number,
  slabs: MarginSlab[]
): MarginSlabResult {
  const sorted = [...slabs].sort((a, b) => a.slabNumber - b.slabNumber);

  for (const slab of sorted) {
    const aboveMin = qty >= slab.minQty;
    const belowMax = slab.maxQty === null || qty <= slab.maxQty;
    if (aboveMin && belowMax) {
      return {
        slabNumber: slab.slabNumber,
        marginPct: slab.marginPct,
      };
    }
  }

  throw new Error(
    `No margin slab matched for quantity ${qty}. ` +
    `Available slabs: ${JSON.stringify(sorted.map(s => ({ slab: s.slabNumber, min: s.minQty, max: s.maxQty })))}`
  );
}
