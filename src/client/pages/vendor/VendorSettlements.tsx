/**
 * VendorSettlements.tsx
 * TrimNova — Vendor settlements page with Held / Eligible / Paid balance views
 */

import React, { useState } from "react";
import Decimal from "decimal.js";
import {
  IndianRupee,
  Clock,
  CheckCircle2,
  Banknote,
  Download,
  Info,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatINR(value: Decimal | number | string): string {
  const num = value instanceof Decimal ? value.toNumber() : Number(value);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────
type HeldReason = "IN_WINDOW" | "OPEN_DISPUTE";

interface HeldOrder {
  id: string;
  subOrderNumber: string;
  productName: string;
  deliveredDate: string;
  returnWindowExpires: string;
  amount: string;
  heldReason: HeldReason;
}

interface EligibleOrder {
  id: string;
  subOrderNumber: string;
  deliveredDate: string;
  returnExpiredOn: string;
  grossAmount: string;
  includedInBatch: boolean;
}

interface PaidBatch {
  id: string;
  batchNumber: string;
  paymentDate: string;
  utrRef: string;
  grossAmount: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const COMMISSION_RATE = new Decimal("0.10");

const HELD_ORDERS: HeldOrder[] = [
  {
    id: "h1",
    subOrderNumber: "SO-2026-110423",
    productName: "Wella Professionals INVIGO Colour Care Shampoo 1L",
    deliveredDate: "2026-11-05T14:30:00+05:30",
    returnWindowExpires: "2026-11-12T23:59:59+05:30",
    amount: "3240.00",
    heldReason: "IN_WINDOW",
  },
  {
    id: "h2",
    subOrderNumber: "SO-2026-109817",
    productName: "L'Oréal Professionnel Serie Expert Absolut Repair Mask 500g",
    deliveredDate: "2026-11-03T11:00:00+05:30",
    returnWindowExpires: "2026-11-10T23:59:59+05:30",
    amount: "1850.00",
    heldReason: "OPEN_DISPUTE",
  },
  {
    id: "h3",
    subOrderNumber: "SO-2026-108934",
    productName: "Schwarzkopf IGORA Royal Permanent Hair Color (Pack of 6)",
    deliveredDate: "2026-11-06T16:45:00+05:30",
    returnWindowExpires: "2026-11-13T23:59:59+05:30",
    amount: "5400.00",
    heldReason: "IN_WINDOW",
  },
  {
    id: "h4",
    subOrderNumber: "SO-2026-108001",
    productName: "Kerastase Nutritive Bain Satin Shampoo 250ml (x4)",
    deliveredDate: "2026-11-04T09:15:00+05:30",
    returnWindowExpires: "2026-11-11T23:59:59+05:30",
    amount: "2960.00",
    heldReason: "OPEN_DISPUTE",
  },
];

const ELIGIBLE_ORDERS_RAW: Array<
  Omit<EligibleOrder, "includedInBatch"> & { grossAmount: string }
> = [
  {
    id: "e1",
    subOrderNumber: "SO-2026-105211",
    deliveredDate: "2026-10-25T10:30:00+05:30",
    returnExpiredOn: "2026-11-01T23:59:59+05:30",
    grossAmount: "7200.00",
  },
  {
    id: "e2",
    subOrderNumber: "SO-2026-104887",
    deliveredDate: "2026-10-23T14:00:00+05:30",
    returnExpiredOn: "2026-10-30T23:59:59+05:30",
    grossAmount: "3680.00",
  },
  {
    id: "e3",
    subOrderNumber: "SO-2026-104302",
    deliveredDate: "2026-10-21T11:45:00+05:30",
    returnExpiredOn: "2026-10-28T23:59:59+05:30",
    grossAmount: "12400.00",
  },
  {
    id: "e4",
    subOrderNumber: "SO-2026-103998",
    deliveredDate: "2026-10-19T09:00:00+05:30",
    returnExpiredOn: "2026-10-26T23:59:59+05:30",
    grossAmount: "4950.00",
  },
  {
    id: "e5",
    subOrderNumber: "SO-2026-103421",
    deliveredDate: "2026-10-17T16:20:00+05:30",
    returnExpiredOn: "2026-10-24T23:59:59+05:30",
    grossAmount: "8100.00",
  },
];

const PAID_BATCHES: PaidBatch[] = [
  {
    id: "p1",
    batchNumber: "BATCH-2026-OCT-02",
    paymentDate: "2026-10-15T00:00:00+05:30",
    utrRef: "HDFC2026101500432198",
    grossAmount: "54800.00",
  },
  {
    id: "p2",
    batchNumber: "BATCH-2026-OCT-01",
    paymentDate: "2026-10-01T00:00:00+05:30",
    utrRef: "HDFC2026100100219874",
    grossAmount: "38200.00",
  },
  {
    id: "p3",
    batchNumber: "BATCH-2026-SEP-02",
    paymentDate: "2026-09-15T00:00:00+05:30",
    utrRef: "ICICI2026091500873421",
    grossAmount: "61500.00",
  },
  {
    id: "p4",
    batchNumber: "BATCH-2026-SEP-01",
    paymentDate: "2026-09-01T00:00:00+05:30",
    utrRef: "ICICI2026090100641023",
    grossAmount: "29700.00",
  },
];

// ─── Totals ───────────────────────────────────────────────────────────────────
const heldTotal = HELD_ORDERS.reduce(
  (acc, o) => acc.plus(new Decimal(o.amount)),
  new Decimal(0)
);

const eligibleGross = ELIGIBLE_ORDERS_RAW.reduce(
  (acc, o) => acc.plus(new Decimal(o.grossAmount)),
  new Decimal(0)
);
const eligibleNet = eligibleGross.minus(eligibleGross.times(COMMISSION_RATE));

const paidGross = PAID_BATCHES.reduce(
  (acc, b) => acc.plus(new Decimal(b.grossAmount)),
  new Decimal(0)
);
const paidNet = paidGross.minus(paidGross.times(COMMISSION_RATE));

// ─── Summary Stat Card ────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  amount: Decimal;
  sublabel: string;
  colorClass: string;
  iconBg: string;
  icon: React.ReactNode;
}

function StatCard({
  label,
  amount,
  sublabel,
  colorClass,
  iconBg,
  icon,
}: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        <p className={`font-mono text-xl font-extrabold mt-0.5 ${colorClass}`}>
          {formatINR(amount)}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>
      </div>
    </div>
  );
}

// ─── Held Tab ─────────────────────────────────────────────────────────────────
function HeldTab() {
  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Sub-Order #
              </th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Product
              </th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Delivered
              </th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Return Window Expires
              </th>
              <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Amount
              </th>
              <th className="px-5 py-3.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {HELD_ORDERS.map((order) => (
              <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-5 py-4">
                  <span className="font-mono text-xs font-bold text-slate-800">
                    {order.subOrderNumber}
                  </span>
                </td>
                <td className="px-5 py-4 max-w-[220px]">
                  <span className="text-slate-700 text-xs leading-snug line-clamp-2">
                    {order.productName}
                  </span>
                </td>
                <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">
                  {formatDate(order.deliveredDate)}
                </td>
                <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap font-mono">
                  {formatDateTime(order.returnWindowExpires)}
                </td>
                <td className="px-5 py-4 text-right font-mono text-sm font-semibold text-slate-800 whitespace-nowrap">
                  {formatINR(new Decimal(order.amount))}
                </td>
                <td className="px-5 py-4 text-center">
                  {order.heldReason === "IN_WINDOW" ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                      <Clock className="w-3 h-3" />
                      In Window
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-600">
                      <AlertTriangle className="w-3 h-3" />
                      Open Dispute
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Eligible Tab ─────────────────────────────────────────────────────────────
function EligibleTab() {
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ELIGIBLE_ORDERS_RAW.map((o) => [o.id, true]))
  );

  const toggleAll = () => {
    const allChecked = Object.values(checked).every(Boolean);
    setChecked(Object.fromEntries(ELIGIBLE_ORDERS_RAW.map((o) => [o.id, !allChecked])));
  };

  const selectedNet = ELIGIBLE_ORDERS_RAW.filter((o) => checked[o.id]).reduce(
    (acc, o) => {
      const gross = new Decimal(o.grossAmount);
      return acc.plus(gross.minus(gross.times(COMMISSION_RATE)));
    },
    new Decimal(0)
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-5 py-3.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide w-12">
                  <input
                    type="checkbox"
                    checked={Object.values(checked).every(Boolean)}
                    onChange={toggleAll}
                    className="rounded border-slate-300 text-[#4F46E5] focus:ring-[#4F46E5]"
                  />
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Sub-Order #
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Delivered
                </th>
                <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Return Expired On
                </th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Gross Amount
                </th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Commission (10%)
                </th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Net Payable
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {ELIGIBLE_ORDERS_RAW.map((order) => {
                const gross = new Decimal(order.grossAmount);
                const commission = gross.times(COMMISSION_RATE);
                const net = gross.minus(commission);
                return (
                  <tr
                    key={order.id}
                    className={`hover:bg-slate-50/50 transition-colors ${
                      !checked[order.id] ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-5 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={checked[order.id] ?? false}
                        onChange={(e) =>
                          setChecked((prev) => ({ ...prev, [order.id]: e.target.checked }))
                        }
                        className="rounded border-slate-300 text-[#4F46E5] focus:ring-[#4F46E5]"
                      />
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-mono text-xs font-bold text-slate-800">
                        {order.subOrderNumber}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">
                      {formatDate(order.deliveredDate)}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">
                      {formatDate(order.returnExpiredOn)}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm text-slate-700 whitespace-nowrap">
                      {formatINR(gross)}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm text-red-500 whitespace-nowrap">
                      −{formatINR(commission)}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm font-semibold text-[#10B981] whitespace-nowrap">
                      {formatINR(net)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Batch Summary */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-800">
            {Object.values(checked).filter(Boolean).length} orders selected for next payout batch
          </p>
          <p className="text-xs text-emerald-600 mt-0.5">
            Batches are processed on the 1st and 15th of each month
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-emerald-600 font-medium">Selected Net Payable</p>
          <p className="font-mono text-xl font-extrabold text-emerald-700">
            {formatINR(selectedNet)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Paid Tab ─────────────────────────────────────────────────────────────────
function PaidTab() {
  const handleDownload = (batch: PaidBatch) => {
    // Mock: show toast-like alert
    alert(
      `Commission invoice for ${batch.batchNumber} would download here.\n(Backend endpoint pending)`
    );
  };

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Batch #
              </th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Payment Date
              </th>
              <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                UTR / Bank Ref
              </th>
              <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Gross
              </th>
              <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Commission (10%)
              </th>
              <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Net Paid
              </th>
              <th className="px-5 py-3.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Invoice
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {PAID_BATCHES.map((batch) => {
              const gross = new Decimal(batch.grossAmount);
              const commission = gross.times(COMMISSION_RATE);
              const net = gross.minus(commission);
              return (
                <tr key={batch.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-4">
                    <span className="font-mono text-xs font-bold text-slate-800">
                      {batch.batchNumber}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-500 whitespace-nowrap">
                    {formatDate(batch.paymentDate)}
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">
                      {batch.utrRef}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-sm text-slate-700 whitespace-nowrap">
                    {formatINR(gross)}
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-sm text-red-500 whitespace-nowrap">
                    −{formatINR(commission)}
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-sm font-semibold text-slate-800 whitespace-nowrap">
                    {formatINR(net)}
                  </td>
                  <td className="px-5 py-4 text-center">
                    <button
                      onClick={() => handleDownload(batch)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-semibold rounded-lg hover:bg-indigo-100 transition-colors border border-indigo-200"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Invoice
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 border-t border-slate-200">
            <tr>
              <td colSpan={3} className="px-5 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide">
                All-time Total
              </td>
              <td className="px-5 py-3 text-right font-mono font-bold text-slate-800">
                {formatINR(paidGross)}
              </td>
              <td className="px-5 py-3 text-right font-mono font-bold text-red-500">
                −{formatINR(paidGross.times(COMMISSION_RATE))}
              </td>
              <td className="px-5 py-3 text-right font-mono font-extrabold text-[#4F46E5]">
                {formatINR(paidNet)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Info Box ─────────────────────────────────────────────────────────────────
function WhyHeldInfoBox() {
  const [open, setOpen] = useState(false);

  const conditions = [
    {
      icon: <ShieldCheck className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />,
      text: "Order delivered with proof-of-delivery confirmation from the logistics partner.",
    },
    {
      icon: <Clock className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />,
      text: "7-day return window has fully expired without any return or replacement request.",
    },
    {
      icon: <Banknote className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />,
      text: "Payment captured and settled by the payment gateway (no chargebacks pending).",
    },
    {
      icon: <CheckCircle2 className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" />,
      text: "Tax invoice uploaded and validated — HSN codes and GST rates verified.",
    },
    {
      icon: <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />,
      text: "Zero open return requests or active buyer disputes on the sub-order.",
    },
    {
      icon: <Banknote className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />,
      text: "Your bank account has passed penny-drop verification and is marked active.",
    },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-4 flex items-center gap-3 hover:bg-slate-50/60 transition-colors text-left"
      >
        <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
          <Info className="w-4 h-4 text-indigo-500" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-800">
            Why is my money held?
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            6 conditions must be met before a balance becomes eligible for payout
          </p>
        </div>
        <span className="text-xs text-indigo-500 font-semibold">
          {open ? "Hide" : "Learn more"}
        </span>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-slate-100">
          <p className="text-xs text-slate-500 mt-4 mb-3">
            TrimNova holds settlement amounts until <strong>all 6 conditions</strong> below are
            satisfied. This protects both buyers and the platform from fraudulent or disputed
            transactions.
          </p>
          <div className="space-y-3">
            {conditions.map((c, i) => (
              <div key={i} className="flex gap-3">
                {c.icon}
                <p className="text-xs text-slate-600 leading-relaxed">{c.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-100">
            <p className="text-xs text-amber-700 font-medium">
              💡 Payouts are batched on the 1st and 15th of each month. Orders that clear all
              conditions before the batch cutoff are included in the next disbursement.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
type TabId = "held" | "eligible" | "paid";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "held", label: "Held Balance" },
  { id: "eligible", label: "Eligible Balance" },
  { id: "paid", label: "Paid Balance" },
];

export default function VendorSettlements() {
  const [activeTab, setActiveTab] = useState<TabId>("held");

  return (
    <div className="min-h-screen bg-[#F4F6FB] py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-extrabold text-[#0F172A] flex items-center gap-3">
            <IndianRupee className="w-6 h-6 text-[#4F46E5]" />
            Settlements
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Track your held, eligible, and paid balances
          </p>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Held Balance"
            amount={heldTotal}
            sublabel="In return window or open dispute"
            colorClass="text-amber-600"
            iconBg="bg-amber-50"
            icon={<Clock className="w-5 h-5 text-amber-500" />}
          />
          <StatCard
            label="Eligible Balance"
            amount={eligibleNet}
            sublabel="Ready for next payout batch"
            colorClass="text-[#10B981]"
            iconBg="bg-emerald-50"
            icon={<CheckCircle2 className="w-5 h-5 text-[#10B981]" />}
          />
          <StatCard
            label="Paid Balance"
            amount={paidNet}
            sublabel="All-time net disbursed"
            colorClass="text-slate-700"
            iconBg="bg-slate-100"
            icon={<Banknote className="w-5 h-5 text-slate-500" />}
          />
        </div>

        {/* Info Box */}
        <WhyHeldInfoBox />

        {/* Tabs */}
        <div>
          <div className="flex gap-1 p-1 bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07)] inline-flex mb-5">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  activeTab === tab.id
                    ? "bg-[#4F46E5] text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "held" && <HeldTab />}
          {activeTab === "eligible" && <EligibleTab />}
          {activeTab === "paid" && <PaidTab />}
        </div>
      </div>
    </div>
  );
}
