/**
 * CartPage.tsx — TrimNova Multi-Seller Cart
 * Items grouped by vendor/fulfilment, GST breakdown, Razorpay checkout flow.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Decimal from 'decimal.js';
import {
  ShoppingCart, Truck, Zap, ShieldCheck, Shield, Trash2,
  Plus, Minus, Info, AlertCircle, ChevronDown, ChevronUp,
  CreditCard, Clock, Package, ArrowRight, Tag
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────────────── */
type VendorPlan = 'ELITE' | 'GOLD' | 'BASIC';
type FulfilmentMethod = 'ONLINE' | 'INSTA';

interface CartLineItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  packMultiple: number;
  moq: number;
  gstRate: number;
  categoryName: string;
}

interface VendorGroup {
  vendorId: string;
  vendorName: string;
  vendorPlan: VendorPlan;
  items: {
    fulfilment: FulfilmentMethod;
    lines: CartLineItem[];
  }[];
}

/* ─── Mock Cart Data ─────────────────────────────────────────────────────── */
const INITIAL_CART: VendorGroup[] = [
  {
    vendorId: 'v1',
    vendorName: 'ThreadWorks Manufacturing Pvt Ltd',
    vendorPlan: 'ELITE',
    items: [
      {
        fulfilment: 'INSTA',
        lines: [
          { id: 'ci1', productId: 'p3', productName: 'High-Tenacity Bonded Poly Thread Tex-40', sku: 'THR-HTP-120', unitPrice: 2.10, quantity: 500, packMultiple: 50, moq: 100, gstRate: 12, categoryName: 'Sewing Threads' },
        ],
      },
      {
        fulfilment: 'ONLINE',
        lines: [
          { id: 'ci2', productId: 'p4a', productName: 'Fusible Microdot Interlining 45gsm', sku: 'INT-FMD-220', unitPrice: 12.40, quantity: 50, packMultiple: 10, moq: 50, gstRate: 12, categoryName: 'Interlinings & Fusibles' },
        ],
      },
    ],
  },
  {
    vendorId: 'v2',
    vendorName: 'Ribbonex India Pvt Ltd',
    vendorPlan: 'GOLD',
    items: [
      {
        fulfilment: 'ONLINE',
        lines: [
          { id: 'ci3', productId: 'p1', productName: 'Woven Damask Brand Labels 30×20mm', sku: 'LBL-WDM-001', unitPrice: 2.50, quantity: 1000, packMultiple: 100, moq: 500, gstRate: 5, categoryName: 'Woven & Printed Labels' },
          { id: 'ci4', productId: 'p10', productName: 'Barcode Hang Tag 90×55mm', sku: 'TAG-BHT-9055', unitPrice: 0.65, quantity: 500, packMultiple: 100, moq: 500, gstRate: 5, categoryName: 'Barcode & Hang Tags' },
        ],
      },
    ],
  },
  {
    vendorId: 'v3',
    vendorName: 'ZipKing International',
    vendorPlan: 'BASIC',
    items: [
      {
        fulfilment: 'ONLINE',
        lines: [
          { id: 'ci5', productId: 'p5', productName: 'Antique Brass Teeth Zipper #5 — 50cm', sku: 'ZIP-ABR-5M', unitPrice: 8.90, quantity: 200, packMultiple: 50, moq: 200, gstRate: 12, categoryName: 'Zippers & Sliders' },
        ],
      },
    ],
  },
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function lineTotal(line: CartLineItem) {
  return new Decimal(line.unitPrice).mul(line.quantity);
}
function lineGst(line: CartLineItem) {
  return lineTotal(line).mul(line.gstRate).div(100);
}
function vendorSubtotal(group: VendorGroup) {
  return group.items.reduce(
    (acc, fi) => fi.lines.reduce((a, l) => a.add(lineTotal(l)), acc),
    new Decimal(0)
  );
}
function vendorGst(group: VendorGroup) {
  return group.items.reduce(
    (acc, fi) => fi.lines.reduce((a, l) => a.add(lineGst(l)), acc),
    new Decimal(0)
  );
}

const SHIPPING_PER_VENDOR = new Decimal(120);

/* ─── Sub-components ─────────────────────────────────────────────────────── */
function VendorBadge({ plan }: { plan: VendorPlan }) {
  if (plan === 'ELITE' || plan === 'GOLD') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <ShieldCheck className="w-3 h-3" /> Verified Supplier
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
      <Shield className="w-3 h-3" /> Standard
    </span>
  );
}

function FulfilmentTag({ method }: { method: FulfilmentMethod }) {
  if (method === 'INSTA') return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-lg">
      <Zap className="w-3 h-3" /> TrimInsta 6-Hr Express
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg">
      <Truck className="w-3 h-3" /> Standard Online Delivery
    </span>
  );
}

function CountdownTimer({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    if (remaining <= 0) return;
    const t = setInterval(() => setRemaining(r => r - 1), 1000);
    return () => clearInterval(t);
  }, []);
  const m = Math.floor(remaining / 60).toString().padStart(2, '0');
  const s = (remaining % 60).toString().padStart(2, '0');
  return (
    <span className={`font-mono font-bold text-lg ${remaining < 120 ? 'text-[#EF4444]' : 'text-[#F59E0B]'}`}>
      {m}:{s}
    </span>
  );
}

/* ─── Main ───────────────────────────────────────────────────────────────── */
export default function CartPage() {
  const navigate = useNavigate();
  const [cart, setCart]                     = useState<VendorGroup[]>(INITIAL_CART);
  const [collapsedGroups, setCollapsed]     = useState<Set<string>>(new Set());
  const [reservationActive, setReservation] = useState(false);
  const [couponCode, setCouponCode]         = useState('');
  const [couponApplied, setCouponApplied]   = useState(false);

  function toggleGroup(vendorId: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(vendorId) ? next.delete(vendorId) : next.add(vendorId);
      return next;
    });
  }

  function updateQty(vendorId: string, fulfilment: FulfilmentMethod, lineId: string, delta: number) {
    setCart(prev => prev.map(g => {
      if (g.vendorId !== vendorId) return g;
      return {
        ...g,
        items: g.items.map(fi => {
          if (fi.fulfilment !== fulfilment) return fi;
          return {
            ...fi,
            lines: fi.lines.map(l => {
              if (l.id !== lineId) return l;
              const next = l.quantity + delta * l.packMultiple;
              if (next < l.moq) return l;
              return { ...l, quantity: next };
            }),
          };
        }),
      };
    }));
  }

  function removeLine(vendorId: string, fulfilment: FulfilmentMethod, lineId: string) {
    setCart(prev => prev.map(g => {
      if (g.vendorId !== vendorId) return g;
      return {
        ...g,
        items: g.items.map(fi => {
          if (fi.fulfilment !== fulfilment) return fi;
          return { ...fi, lines: fi.lines.filter(l => l.id !== lineId) };
        }).filter(fi => fi.lines.length > 0),
      };
    }).filter(g => g.items.length > 0));
  }

  function applyCoupon() {
    if (couponCode.trim().toUpperCase() === 'TRIM10') setCouponApplied(true);
  }

  const grandSubtotal = cart.reduce((a, g) => a.add(vendorSubtotal(g)), new Decimal(0));
  const grandGst      = cart.reduce((a, g) => a.add(vendorGst(g)), new Decimal(0));
  const totalShipping = new Decimal(cart.length).mul(SHIPPING_PER_VENDOR);
  const discount      = couponApplied ? grandSubtotal.mul(0.1) : new Decimal(0);
  const grandTotal    = grandSubtotal.add(grandGst).add(totalShipping).sub(discount);
  const totalItems    = cart.reduce((a, g) => a + g.items.reduce((b, fi) => b + fi.lines.length, 0), 0);

  if (totalItems === 0) {
    return (
      <div className="min-h-screen bg-[#F4F6FB] flex flex-col items-center justify-center gap-4 px-4">
        <div className="card p-12 text-center max-w-md">
          <ShoppingCart className="w-16 h-16 text-slate-200 mx-auto mb-4" />
          <h2 className="text-xl font-black text-slate-800 mb-2">Your cart is empty</h2>
          <p className="text-slate-500 mb-6">Browse our marketplace to find the trims you need.</p>
          <button onClick={() => navigate('/marketplace')} className="btn-primary mx-auto">Browse Marketplace</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6FB]">
      <div className="bg-white border-b border-slate-100 px-6 py-4">
        <div className="max-w-screen-xl mx-auto flex items-center gap-3">
          <ShoppingCart className="w-5 h-5 text-[#4F46E5]" />
          <h1 className="text-xl font-black text-slate-800">
            Procurement Cart
            <span className="ml-2 text-sm font-normal text-slate-400">({totalItems} item{totalItems !== 1 ? 's' : ''})</span>
          </h1>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {/* Multi-seller banner */}
        <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-2xl mb-6">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700 font-medium">
            <strong>Multiple Sellers Detected:</strong> Multiple sellers generate separate sub-orders, shipments,
            and return policies. Each vendor issues independent GST tax invoices.
          </p>
        </div>

        {reservationActive && (
          <div className="flex items-center gap-4 p-4 bg-amber-50 border border-amber-300 rounded-2xl mb-6">
            <Clock className="w-6 h-6 text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-bold text-amber-800">Stock Reserved — Complete Payment</p>
              <p className="text-sm text-amber-600">Your cart is reserved for <CountdownTimer seconds={900} /></p>
            </div>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* Cart Items */}
          <div className="flex-1 min-w-0 space-y-5">
            {cart.map(group => (
              <div key={group.vendorId} className="card overflow-hidden">
                {/* Vendor header */}
                <button
                  onClick={() => toggleGroup(group.vendorId)}
                  className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-500 font-black text-sm flex-shrink-0">
                      {group.vendorName.charAt(0)}
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-slate-800">{group.vendorName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <VendorBadge plan={group.vendorPlan} />
                        <span className="text-xs text-slate-400">
                          Sub-total: ₹{vendorSubtotal(group).toFixed(2)} + GST
                        </span>
                      </div>
                    </div>
                  </div>
                  {collapsedGroups.has(group.vendorId)
                    ? <ChevronDown className="w-5 h-5 text-slate-400" />
                    : <ChevronUp className="w-5 h-5 text-slate-400" />}
                </button>

                {!collapsedGroups.has(group.vendorId) && (
                  <div className="border-t border-slate-100">
                    {group.items.map((fi, fiIdx) => (
                      <div key={fi.fulfilment + fiIdx}>
                        <div className="flex items-center gap-2 px-5 py-3 bg-slate-50 border-b border-slate-100">
                          <FulfilmentTag method={fi.fulfilment} />
                          <span className="text-xs text-slate-400">
                            {fi.fulfilment === 'INSTA' ? 'Ships within 6 hours' : 'Ships in 48–72 hours'}
                          </span>
                        </div>
                        {fi.lines.map(line => (
                          <div key={line.id} className="flex items-center gap-4 px-5 py-4 border-b border-slate-50 last:border-0">
                            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-100 to-indigo-200 flex items-center justify-center flex-shrink-0">
                              <Package className="w-6 h-6 text-violet-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-slate-800 text-sm line-clamp-1">{line.productName}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="id-chip">{line.sku}</span>
                                <span className="text-xs text-slate-400">{line.categoryName}</span>
                              </div>
                              <div className="text-xs text-slate-400 mt-1">
                                Pack multiple: {line.packMultiple} | MOQ: {line.moq}
                              </div>
                            </div>
                            {/* Qty stepper */}
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={() => updateQty(group.vendorId, fi.fulfilment, line.id, -1)}
                                disabled={line.quantity <= line.moq}
                                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:border-[#4F46E5] hover:text-[#4F46E5] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-14 text-center font-mono font-bold text-slate-800 text-sm">{line.quantity}</span>
                              <button
                                onClick={() => updateQty(group.vendorId, fi.fulfilment, line.id, 1)}
                                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:border-[#4F46E5] hover:text-[#4F46E5] transition-all"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            {/* Price */}
                            <div className="text-right flex-shrink-0 min-w-[80px]">
                              <p className="font-black text-slate-900 text-sm">₹{lineTotal(line).toFixed(2)}</p>
                              <p className="text-xs text-slate-400">+GST ₹{lineGst(line).toFixed(2)}</p>
                            </div>
                            <button
                              onClick={() => removeLine(group.vendorId, fi.fulfilment, line.id)}
                              className="p-2 rounded-lg text-slate-300 hover:text-[#EF4444] hover:bg-red-50 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ))}
                    {/* Vendor footer */}
                    <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs text-slate-500">Shipping from {group.vendorName}</span>
                      <div className="text-right">
                        <span className="text-xs text-slate-500 block">
                          Sub: ₹{vendorSubtotal(group).toFixed(2)} + GST: ₹{vendorGst(group).toFixed(2)}
                          + Ship: ₹{SHIPPING_PER_VENDOR.toFixed(2)}
                        </span>
                        <span className="font-bold text-slate-800">
                          = ₹{vendorSubtotal(group).add(vendorGst(group)).add(SHIPPING_PER_VENDOR).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Order Summary */}
          <div className="w-full lg:w-80 flex-shrink-0">
            <div className="card p-6 space-y-4 sticky top-6">
              <h2 className="font-black text-slate-800 text-lg">Order Summary</h2>

              {/* Coupon */}
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Coupon code"
                    value={couponCode}
                    onChange={e => setCouponCode(e.target.value)}
                    disabled={couponApplied}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20 disabled:bg-slate-50"
                  />
                </div>
                <button onClick={applyCoupon} disabled={couponApplied} className="btn-secondary text-sm px-4 py-2.5 disabled:opacity-50">
                  {couponApplied ? '✓' : 'Apply'}
                </button>
              </div>
              {couponApplied && <p className="text-xs text-emerald-600 font-semibold">✓ TRIM10 applied — 10% off subtotal</p>}

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Subtotal ({totalItems} items)</span>
                  <span className="font-semibold text-slate-800">₹{grandSubtotal.toFixed(2)}</span>
                </div>
                {couponApplied && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Coupon Discount (TRIM10)</span>
                    <span className="font-semibold">−₹{discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">GST (blended)</span>
                  <span className="font-semibold text-slate-800">₹{grandGst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Est. Shipping ({cart.length} sellers)</span>
                  <span className="font-semibold text-slate-800">₹{totalShipping.toFixed(2)}</span>
                </div>
                <div className="border-t border-slate-200 pt-3 flex justify-between items-center">
                  <span className="font-black text-slate-800 text-base">Grand Total</span>
                  <span className="text-2xl font-black text-[#4F46E5]">₹{grandTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-xs text-slate-500">
                  <strong>{cart.length} separate sub-orders</strong> will be created.
                  Each vendor issues their own GST tax invoice and return policy.
                </p>
              </div>

              <button onClick={() => setReservation(true)} className="btn-primary w-full justify-center py-4 text-base">
                <CreditCard className="w-5 h-5" />
                Proceed to Checkout & Pay
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-center text-xs text-slate-400">Powered by Razorpay • SSL Encrypted • GST Compliant</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
