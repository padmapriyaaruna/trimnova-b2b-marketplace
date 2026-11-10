/**
 * VendorOrderInbox.tsx
 * TrimNova — Sub-order inbox with accept/reject workflow and invoice generation
 */

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Package,
  Truck,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  FileText,
  Download,
  Zap,
  Globe,
  AlertTriangle,
  Send,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────
type FulfilmentMethod = "ONLINE" | "INSTA";
type SubOrderStatus =
  | "PENDING_VENDOR_ACCEPTANCE"
  | "ACCEPTED"
  | "PARTIALLY_ACCEPTED"
  | "REJECTED"
  | "ALLOCATED"
  | "IN_PREPARATION"
  | "QC_COMPLETE"
  | "PACKED"
  | "READY_FOR_DISPATCH"
  | "SHIPPED"
  | "DELIVERED"
  | "INVOICE_GENERATED";

interface OrderLineItem {
  id: string;
  productName: string;
  sku: string;
  qty: number;
  unitPrice: string;
  total: string;
}

interface SubOrder {
  id: string;
  subOrderNumber: string;
  customerName: string;
  customerEmail: string;
  orderDate: string;
  totalAmount: string;
  fulfilmentMethod: FulfilmentMethod;
  status: SubOrderStatus;
  trackingNumber?: string;
  carrier?: string;
  lineItems: OrderLineItem[];
  /** ISO string — 1 business day after orderDate; computed server-side or mocked here */
  acceptDeadline?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatINR(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Add exactly 1 business day (Mon–Fri) to a Date; keeps the same time-of-day */
function addOneBusinessDay(date: Date): Date {
  const result = new Date(date);
  let added = 0;
  while (added < 1) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++; // skip Sun(0) and Sat(6)
  }
  return result;
}

/** Compute or return a provided accept deadline ISO string */
function getAcceptDeadline(order: SubOrder): Date {
  if (order.acceptDeadline) return new Date(order.acceptDeadline);
  return addOneBusinessDay(new Date(order.orderDate));
}

function formatDateTimeShort(date: Date): string {
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// ─── Accept Deadline Countdown Badge ─────────────────────────────────────────
function AcceptDeadlineBadge({ order }: { order: SubOrder }) {
  const deadline = getAcceptDeadline(order);
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const diffHrs = diffMs / (1000 * 60 * 60);

  if (diffMs <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        <Clock className="w-3 h-3" />
        Deadline passed
      </span>
    );
  }

  const hrs = Math.floor(diffHrs);
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const isUrgent = diffHrs < 6;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
        isUrgent ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
      }`}
    >
      <Clock className="w-3 h-3" />
      Accept by: {formatDateTimeShort(deadline)} ({hrs}h {mins}m remaining)
    </span>
  );
}

// ─── Fulfilment Progress Step Tracker ────────────────────────────────────────
const FULFILMENT_STAGES: SubOrderStatus[] = [
  "ALLOCATED",
  "IN_PREPARATION",
  "QC_COMPLETE",
  "PACKED",
  "READY_FOR_DISPATCH",
  "SHIPPED",
  "DELIVERED",
];

const STAGE_LABELS: Record<SubOrderStatus, string> = {
  PENDING_VENDOR_ACCEPTANCE: "Pending",
  ACCEPTED: "Accepted",
  PARTIALLY_ACCEPTED: "Partial",
  REJECTED: "Rejected",
  ALLOCATED: "Allocated",
  IN_PREPARATION: "In Prep",
  QC_COMPLETE: "QC Done",
  PACKED: "Packed",
  READY_FOR_DISPATCH: "Ready",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  INVOICE_GENERATED: "Invoiced",
};

function FulfilmentStepTracker({ status }: { status: SubOrderStatus }) {
  const currentIdx = FULFILMENT_STAGES.indexOf(status);
  // If not in stages list (e.g. ACCEPTED/INVOICE_GENERATED), don't show tracker
  if (currentIdx === -1 && !["SHIPPED", "DELIVERED"].includes(status)) return null;

  return (
    <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Fulfilment Progress
      </p>
      <div className="flex items-center gap-0 overflow-x-auto pb-1">
        {FULFILMENT_STAGES.map((stage, idx) => {
          const isCompleted = currentIdx > idx;
          const isCurrent = currentIdx === idx;
          const isPending = currentIdx < idx;

          return (
            <React.Fragment key={stage}>
              {/* Step node */}
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                    isCompleted
                      ? "bg-[#10B981] border-[#10B981] text-white"
                      : isCurrent
                      ? "bg-[#4F46E5] border-[#4F46E5] text-white shadow-md"
                      : "bg-white border-slate-200 text-slate-400"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
                <span
                  className={`text-[10px] mt-1.5 font-medium whitespace-nowrap ${
                    isCompleted
                      ? "text-[#10B981]"
                      : isCurrent
                      ? "text-[#4F46E5] font-bold"
                      : "text-slate-400"
                  }`}
                >
                  {STAGE_LABELS[stage]}
                </span>
              </div>

              {/* Connector line (not after last) */}
              {idx < FULFILMENT_STAGES.length - 1 && (
                <div
                  className={`h-0.5 flex-1 min-w-[16px] mb-4 mx-1 transition-colors ${
                    isCompleted ? "bg-[#10B981]" : "bg-slate-200"
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || "Request failed");
  }
  return res.json();
}

// ─── Status Config ────────────────────────────────────────────────────────────
interface StatusCfg {
  label: string;
  cls: string;
  icon: React.ReactNode;
  nextStatus?: SubOrderStatus;
  nextLabel?: string;
}

const STATUS_CONFIG: Record<SubOrderStatus, StatusCfg> = {
  PENDING_VENDOR_ACCEPTANCE: {
    label: "Pending Acceptance",
    cls: "bg-amber-100 text-amber-700",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  ACCEPTED: {
    label: "Accepted",
    cls: "bg-emerald-100 text-emerald-700",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    nextStatus: "ALLOCATED",
    nextLabel: "Allocate to Warehouse →",
  },
  PARTIALLY_ACCEPTED: {
    label: "Partially Accepted",
    cls: "bg-blue-100 text-blue-700",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    nextStatus: "ALLOCATED",
    nextLabel: "Allocate to Warehouse →",
  },
  REJECTED: {
    label: "Rejected",
    cls: "bg-red-100 text-red-600",
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
  ALLOCATED: {
    label: "Allocated",
    cls: "bg-purple-100 text-purple-700",
    icon: <Package className="w-3.5 h-3.5" />,
    nextStatus: "IN_PREPARATION",
    nextLabel: "Start Preparation →",
  },
  IN_PREPARATION: {
    label: "In Preparation",
    cls: "bg-orange-100 text-orange-700",
    icon: <Package className="w-3.5 h-3.5" />,
    nextStatus: "QC_COMPLETE",
    nextLabel: "Mark QC Complete →",
  },
  QC_COMPLETE: {
    label: "QC Complete",
    cls: "bg-teal-100 text-teal-700",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    nextStatus: "PACKED",
    nextLabel: "Mark as Packed →",
  },
  PACKED: {
    label: "Packed",
    cls: "bg-cyan-100 text-cyan-700",
    icon: <Package className="w-3.5 h-3.5" />,
    nextStatus: "READY_FOR_DISPATCH",
    nextLabel: "Ready for Dispatch →",
  },
  READY_FOR_DISPATCH: {
    label: "Ready for Dispatch",
    cls: "bg-lime-100 text-lime-700",
    icon: <Truck className="w-3.5 h-3.5" />,
    nextStatus: "SHIPPED",
    nextLabel: "Mark as Shipped →",
  },
  SHIPPED: {
    label: "Shipped",
    cls: "bg-indigo-100 text-indigo-700",
    icon: <Truck className="w-3.5 h-3.5" />,
    nextStatus: "DELIVERED",
    nextLabel: "Mark as Delivered →",
  },
  DELIVERED: {
    label: "Delivered",
    cls: "bg-teal-100 text-teal-700",
    icon: <Package className="w-3.5 h-3.5" />,
    nextStatus: "INVOICE_GENERATED",
    nextLabel: "Generate Invoice →",
  },
  INVOICE_GENERATED: {
    label: "Invoice Generated",
    cls: "bg-slate-100 text-slate-700",
    icon: <FileText className="w-3.5 h-3.5" />,
  },
};

const FULFILMENT_CONFIG: Record<
  FulfilmentMethod,
  { label: string; cls: string; icon: React.ReactNode }
> = {
  ONLINE: {
    label: "Online Shipment",
    cls: "bg-blue-100 text-blue-700",
    icon: <Globe className="w-3 h-3" />,
  },
  INSTA: {
    label: "Insta 6-Hour Dispatch",
    cls: "bg-orange-100 text-orange-700",
    icon: <Zap className="w-3 h-3" />,
  },
};

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: SubOrderStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.cls}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function FulfilmentBadge({ method }: { method: FulfilmentMethod }) {
  const cfg = FULFILMENT_CONFIG[method];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.cls}`}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ─── Accept / Reject Panel ────────────────────────────────────────────────────
function AcceptRejectPanel({ subOrderId }: { subOrderId: string }) {
  const queryClient = useQueryClient();
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);

  const acceptMutation = useMutation({
    mutationFn: () => apiPost(`/api/v1/vendors/sub-orders/${subOrderId}/accept`),
    onSuccess: () => {
      toast.success("Order accepted successfully!");
      queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      apiPost(`/api/v1/vendors/sub-orders/${subOrderId}/reject`, {
        reason: rejectReason,
      }),
    onSuccess: () => {
      toast.success("Order rejected.");
      queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const partialMutation = useMutation({
    mutationFn: () =>
      apiPost(`/api/v1/vendors/sub-orders/${subOrderId}/partial-accept`, {
        reason: rejectReason,
      }),
    onSuccess: () => {
      toast.success("Partial acceptance recorded.");
      queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="flex flex-wrap gap-3 items-start">
      <button
        onClick={() => acceptMutation.mutate()}
        disabled={acceptMutation.isPending}
        className="px-5 py-2.5 bg-emerald-500 text-white text-sm font-semibold rounded-xl hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-2 transition-colors"
      >
        {acceptMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
        <CheckCircle2 className="w-4 h-4" />
        Accept Order
      </button>

      <button
        onClick={() => partialMutation.mutate()}
        disabled={partialMutation.isPending}
        className="px-5 py-2.5 bg-blue-100 text-blue-700 text-sm font-semibold rounded-xl hover:bg-blue-200 disabled:opacity-50 flex items-center gap-2 transition-colors"
      >
        {partialMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
        Partial Accept
      </button>

      {!showRejectForm ? (
        <button
          onClick={() => setShowRejectForm(true)}
          className="px-5 py-2.5 bg-red-50 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-100 flex items-center gap-2 transition-colors border border-red-200"
        >
          <XCircle className="w-4 h-4" />
          Reject Order
        </button>
      ) : (
        <div className="flex-1 min-w-[280px] space-y-2">
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Enter reason for rejection..."
            rows={2}
            className="w-full px-3 py-2 border border-red-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => rejectMutation.mutate()}
              disabled={!rejectReason || rejectMutation.isPending}
              className="px-4 py-2 bg-[#EF4444] text-white text-sm font-semibold rounded-xl hover:bg-red-600 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
            >
              {rejectMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Confirm Reject
            </button>
            <button
              onClick={() => {
                setShowRejectForm(false);
                setRejectReason("");
              }}
              className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shipping Panel ────────────────────────────────────────────────────────────
function ShippingPanel({ subOrderId }: { subOrderId: string }) {
  const queryClient = useQueryClient();
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState("");

  const shipMutation = useMutation({
    mutationFn: () =>
      apiPost(`/api/v1/vendors/sub-orders/${subOrderId}/ship`, {
        trackingNumber,
        carrier,
      }),
    onSuccess: () => {
      toast.success("Tracking details saved & order marked as shipped!");
      queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
      <div>
        <label className="text-xs font-medium text-slate-500 mb-1 block">Carrier</label>
        <input
          type="text"
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          placeholder="e.g. Delhivery, BlueDart"
          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-500 mb-1 block">Tracking Number</label>
        <input
          type="text"
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          placeholder="AWB / Tracking ID"
          className="w-full font-mono px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
        />
      </div>
      <button
        onClick={() => shipMutation.mutate()}
        disabled={!trackingNumber || !carrier || shipMutation.isPending}
        className="px-5 py-2.5 bg-indigo-500 text-white text-sm font-semibold rounded-xl hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-2 transition-colors"
      >
        {shipMutation.isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        Save Tracking
      </button>
    </div>
  );
}

// ─── Order Detail Panel ────────────────────────────────────────────────────────
function OrderDetailPanel({ order }: { order: SubOrder }) {
  const queryClient = useQueryClient();
  const statusCfg = STATUS_CONFIG[order.status];

  const advanceMutation = useMutation({
    mutationFn: () =>
      apiPost(`/api/v1/vendors/sub-orders/${order.id}/advance`, {
        nextStatus: statusCfg.nextStatus,
      }),
    onSuccess: () => {
      toast.success("Order status updated!");
      queryClient.invalidateQueries({ queryKey: ["vendor-orders"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const invoiceMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/vendors/sub-orders/${order.id}/seller-invoice`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to generate invoice");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `TrimNova_Invoice_${order.subOrderNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => toast.success("Invoice downloaded!"),
    onError: (err: Error) => toast.error(err.message),
  });

  const total = parseFloat(order.totalAmount);

  return (
    <div className="px-6 pb-6 space-y-5 border-t border-slate-100 pt-4">
      {/* Line Items */}
      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          Line Items
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="pb-2 text-left font-semibold text-slate-500 text-xs">Product</th>
                <th className="pb-2 text-center font-semibold text-slate-500 text-xs w-16">Qty</th>
                <th className="pb-2 text-right font-semibold text-slate-500 text-xs">Unit Price</th>
                <th className="pb-2 text-right font-semibold text-slate-500 text-xs">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.lineItems.map((item) => (
                <tr key={item.id} className="border-b border-slate-50">
                  <td className="py-2.5">
                    <div className="font-medium text-slate-700">{item.productName}</div>
                    <div className="text-xs text-slate-400 font-mono">{item.sku}</div>
                  </td>
                  <td className="py-2.5 text-center text-slate-600 font-mono">
                    {item.qty.toLocaleString("en-IN")}
                  </td>
                  <td className="py-2.5 text-right font-mono text-slate-600">
                    {formatINR(parseFloat(item.unitPrice))}
                  </td>
                  <td className="py-2.5 text-right font-mono font-semibold text-slate-800">
                    {formatINR(parseFloat(item.total))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="pt-3 text-right font-bold text-slate-700 text-sm">
                  Total:
                </td>
                <td className="pt-3 text-right font-mono font-bold text-[#4F46E5] text-base">
                  {formatINR(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Fulfilment Step Tracker */}
      <FulfilmentStepTracker status={order.status} />

      {/* Action Area */}
      {order.status === "PENDING_VENDOR_ACCEPTANCE" && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Awaiting your response
            </p>
            <AcceptDeadlineBadge order={order} />
          </div>
          <AcceptRejectPanel subOrderId={order.id} />
        </div>
      )}

      {(order.status === "ACCEPTED" || order.status === "PARTIALLY_ACCEPTED" || order.status === "READY_FOR_DISPATCH") && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <h4 className="text-xs font-semibold text-slate-600">Shipping Information</h4>
          <ShippingPanel subOrderId={order.id} />
        </div>
      )}

      {order.status === "SHIPPED" && order.trackingNumber && (
        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center gap-3">
          <Truck className="w-4 h-4 text-indigo-500" />
          <div className="text-sm">
            <span className="font-semibold text-indigo-700">{order.carrier}</span>
            {" — "}
            <code className="font-mono text-indigo-600">{order.trackingNumber}</code>
          </div>
        </div>
      )}

      {/* Advance Workflow */}
      {statusCfg.nextStatus &&
        order.status !== "PENDING_VENDOR_ACCEPTANCE" &&
        order.status !== "ACCEPTED" &&
        order.status !== "PARTIALLY_ACCEPTED" &&
        order.status !== "READY_FOR_DISPATCH" && (
          <button
            onClick={() => advanceMutation.mutate()}
            disabled={advanceMutation.isPending}
            className="px-6 py-2.5 bg-[#4F46E5] text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {advanceMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            {statusCfg.nextLabel}
          </button>
        )}

      {/* Generate Invoice */}
      {order.status === "INVOICE_GENERATED" && (
        <button
          onClick={() => invoiceMutation.mutate()}
          disabled={invoiceMutation.isPending}
          className="px-6 py-2.5 bg-slate-800 text-white text-sm font-semibold rounded-xl hover:bg-slate-900 disabled:opacity-50 flex items-center gap-2 transition-colors"
        >
          {invoiceMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          Generate Seller Tax Invoice
        </button>
      )}
    </div>
  );
}

// ─── Order Card ───────────────────────────────────────────────────────────────
function OrderCard({ order }: { order: SubOrder }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-6 py-4 flex items-center gap-4 hover:bg-slate-50/60 transition-colors text-left"
      >
        <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-3 items-center">
          <div>
            <p className="text-xs text-slate-400">Sub-Order #</p>
            <p className="font-mono text-sm font-bold text-slate-800">{order.subOrderNumber}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Customer</p>
            <p className="text-sm font-semibold text-slate-700 truncate">{order.customerName}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Date</p>
            <p className="text-sm text-slate-600">{formatDate(order.orderDate)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Amount</p>
            <p className="font-mono text-sm font-bold text-slate-800">
              {formatINR(parseFloat(order.totalAmount))}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <FulfilmentBadge method={order.fulfilmentMethod} />
            <StatusBadge status={order.status} />
            {order.status === "PENDING_VENDOR_ACCEPTANCE" && (
              <AcceptDeadlineBadge order={order} />
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
        )}
      </button>

      {expanded && <OrderDetailPanel order={order} />}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
const STATUS_FILTERS: Array<{ value: SubOrderStatus | "ALL"; label: string }> = [
  { value: "ALL", label: "All Orders" },
  { value: "PENDING_VENDOR_ACCEPTANCE", label: "Pending" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "ALLOCATED", label: "Allocated" },
  { value: "PACKED", label: "Packed" },
  { value: "READY_FOR_DISPATCH", label: "Ready" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "INVOICE_GENERATED", label: "Invoiced" },
];

export default function VendorOrderInbox() {
  const [statusFilter, setStatusFilter] = useState<SubOrderStatus | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: orders = [], isLoading, isError, refetch } = useQuery<SubOrder[]>({
    queryKey: ["vendor-orders", statusFilter],
    queryFn: () =>
      apiFetch(
        `/api/v1/vendors/me/sub-orders${statusFilter !== "ALL" ? `?status=${statusFilter}` : ""}`
      ),
  });

  const filteredOrders = orders.filter(
    (o) =>
      o.subOrderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customerName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pendingCount = orders.filter((o) => o.status === "PENDING_VENDOR_ACCEPTANCE").length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F4F6FB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#4F46E5]" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-[#F4F6FB] flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-10 h-10 text-[#EF4444] mx-auto mb-3" />
          <p className="text-slate-600 font-medium mb-3">Failed to load orders</p>
          <button
            onClick={() => refetch()}
            className="px-5 py-2.5 bg-[#4F46E5] text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6FB] py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-[#0F172A] flex items-center gap-3">
              Order Inbox
              {pendingCount > 0 && (
                <span className="inline-flex items-center justify-center w-6 h-6 bg-amber-500 text-white text-xs font-bold rounded-full">
                  {pendingCount}
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">Manage and fulfil your sub-orders</p>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search orders or customers…"
              className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5] w-64 bg-white"
            />
            <button
              onClick={() => refetch()}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:border-indigo-300 transition-colors shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Status Filter Pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-none">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-colors ${
                statusFilter === f.value
                  ? "bg-[#4F46E5] text-white"
                  : "bg-white text-slate-600 border border-slate-200 hover:border-indigo-300"
              }`}
            >
              {f.label}
              {f.value === "PENDING_VENDOR_ACCEPTANCE" && pendingCount > 0 && (
                <span className="ml-1.5 bg-amber-400 text-white rounded-full px-1.5 py-0.5 text-[10px]">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Order List */}
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] p-12 text-center">
            <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No orders found</p>
            <p className="text-sm text-slate-400 mt-1">
              {searchQuery
                ? "Try adjusting your search"
                : "Orders will appear here when buyers place them"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
