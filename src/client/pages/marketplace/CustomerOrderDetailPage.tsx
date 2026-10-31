/**
 * CustomerOrderDetailPage.tsx — TrimNova Order Detail with Multi-Vendor Sub-Orders
 * Features: sub-order workflow progress, tracking, invoice download,
 * return window countdown, and slide-in RMA drawer.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Package, Truck, CheckCircle2, Clock, AlertTriangle,
  ShieldCheck, Shield, Download, FileText, RotateCcw, X, Upload,
  ChevronRight, ChevronDown, ChevronUp, Zap, MapPin, Camera
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────────────── */
type OrderStatus    = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'RETURNED' | 'CANCELLED';
type VendorPlan     = 'ELITE' | 'GOLD' | 'BASIC';
type FulfilmentMethod = 'ONLINE' | 'INSTA';

interface SubOrderStep {
  key: OrderStatus;
  label: string;
  ts?: string;
}

interface TrackingEvent {
  location: string;
  status: string;
  timestamp: string;
}

interface LineItem {
  id: string;
  productName: string;
  sku: string;
  qty: number;
  unitPrice: number;
  gstRate: number;
}

interface SubOrder {
  id: string;
  subOrderNo: string;
  vendorName: string;
  vendorPlan: VendorPlan;
  fulfilmentMethod: FulfilmentMethod;
  status: OrderStatus;
  steps: SubOrderStep[];
  currentStep: OrderStatus;
  trackingNo?: string;
  courier?: string;
  trackingEvents: TrackingEvent[];
  lineItems: LineItem[];
  returnDeadlineDays: number;
  returnWindowDaysTotal: number;
  invoiceUrl?: string;
}

interface OrderDetail {
  id: string;
  orderNo: string;
  createdAt: string;
  overallStatus: string;
  customerName: string;
  shippingAddress: string;
  subOrders: SubOrder[];
}

/* ─── Mock Data ──────────────────────────────────────────────────────────── */
const MOCK_ORDER: OrderDetail = {
  id: 'ord1',
  orderNo: 'ORD-2026-4491',
  createdAt: '2026-10-25T10:30:00Z',
  overallStatus: 'PARTIALLY_DELIVERED',
  customerName: 'Fashion Forward Pvt Ltd',
  shippingAddress: 'Plot 7, Andheri Industrial Estate, Mumbai - 400093, Maharashtra',
  subOrders: [
    {
      id: 'so1',
      subOrderNo: 'SUB-4491-001',
      vendorName: 'ThreadWorks Manufacturing Pvt Ltd',
      vendorPlan: 'ELITE',
      fulfilmentMethod: 'INSTA',
      status: 'DELIVERED',
      currentStep: 'DELIVERED',
      steps: [
        { key: 'CONFIRMED',  label: 'Order Confirmed', ts: '2026-10-25 10:35' },
        { key: 'PROCESSING', label: 'Processing',      ts: '2026-10-25 10:50' },
        { key: 'SHIPPED',    label: 'Shipped',         ts: '2026-10-25 11:15' },
        { key: 'DELIVERED',  label: 'Delivered',       ts: '2026-10-25 14:22' },
      ],
      trackingNo: 'INSTA-BHW-20261025-482',
      courier: 'TrimInsta Express',
      trackingEvents: [
        { location: 'Bhiwandi Micro-Hub',  status: 'Order Picked Up',         timestamp: '2026-10-25 11:15' },
        { location: 'Andheri Hub',         status: 'Out for Delivery',        timestamp: '2026-10-25 13:45' },
        { location: 'Mumbai - Andheri',    status: 'Delivered — Signed by Ravi Sharma', timestamp: '2026-10-25 14:22' },
      ],
      lineItems: [
        { id: 'li1', productName: 'High-Tenacity Bonded Poly Thread Tex-40', sku: 'THR-HTP-120', qty: 500, unitPrice: 2.10, gstRate: 12 },
      ],
      returnDeadlineDays: 3,
      returnWindowDaysTotal: 7,
      invoiceUrl: '#',
    },
    {
      id: 'so2',
      subOrderNo: 'SUB-4491-002',
      vendorName: 'Ribbonex India Pvt Ltd',
      vendorPlan: 'GOLD',
      fulfilmentMethod: 'ONLINE',
      status: 'SHIPPED',
      currentStep: 'SHIPPED',
      steps: [
        { key: 'CONFIRMED',  label: 'Order Confirmed', ts: '2026-10-25 10:35' },
        { key: 'PROCESSING', label: 'Processing',      ts: '2026-10-26 09:10' },
        { key: 'SHIPPED',    label: 'Shipped',         ts: '2026-10-27 14:30' },
        { key: 'DELIVERED',  label: 'Delivered' },
      ],
      trackingNo: 'DTDC202610274491',
      courier: 'DTDC Express',
      trackingEvents: [
        { location: 'Bhiwandi Warehouse',  status: 'Picked up by carrier',    timestamp: '2026-10-27 14:30' },
        { location: 'Mumbai Sorting Hub',  status: 'In transit',              timestamp: '2026-10-27 22:15' },
        { location: 'Andheri Delivery Hub',status: 'Out for delivery',        timestamp: '2026-10-28 09:00' },
      ],
      lineItems: [
        { id: 'li2', productName: 'Woven Damask Brand Labels 30×20mm',  sku: 'LBL-WDM-001',  qty: 1000, unitPrice: 2.50, gstRate: 5 },
        { id: 'li3', productName: 'Barcode Hang Tag 90×55mm',           sku: 'TAG-BHT-9055', qty: 500,  unitPrice: 0.65, gstRate: 5 },
      ],
      returnDeadlineDays: 0,
      returnWindowDaysTotal: 7,
      invoiceUrl: '#',
    },
    {
      id: 'so3',
      subOrderNo: 'SUB-4491-003',
      vendorName: 'ZipKing International',
      vendorPlan: 'BASIC',
      fulfilmentMethod: 'ONLINE',
      status: 'PROCESSING',
      currentStep: 'PROCESSING',
      steps: [
        { key: 'CONFIRMED',  label: 'Order Confirmed', ts: '2026-10-25 10:35' },
        { key: 'PROCESSING', label: 'Processing',      ts: '2026-10-25 14:00' },
        { key: 'SHIPPED',    label: 'Shipped' },
        { key: 'DELIVERED',  label: 'Delivered' },
      ],
      trackingEvents: [],
      lineItems: [
        { id: 'li4', productName: 'Antique Brass Teeth Zipper #5 — 50cm', sku: 'ZIP-ABR-5M', qty: 200, unitPrice: 8.90, gstRate: 12 },
      ],
      returnDeadlineDays: 0,
      returnWindowDaysTotal: 7,
    },
  ],
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const STEP_ORDER: OrderStatus[] = ['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

function stepIndex(status: OrderStatus) { return STEP_ORDER.indexOf(status); }

function lineSubtotal(line: LineItem) { return line.qty * line.unitPrice; }
function lineGst(line: LineItem)      { return lineSubtotal(line) * line.gstRate / 100; }

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

function StatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, { cls: string; label: string }> = {
    PENDING:    { cls: 'bg-slate-100 text-slate-600',                              label: 'Pending' },
    CONFIRMED:  { cls: 'bg-blue-50 text-blue-700 border border-blue-200',          label: 'Confirmed' },
    PROCESSING: { cls: 'bg-amber-50 text-amber-700 border border-amber-200',       label: 'Processing' },
    SHIPPED:    { cls: 'bg-indigo-50 text-indigo-700 border border-indigo-200',    label: 'Shipped' },
    DELIVERED:  { cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200', label: 'Delivered' },
    RETURNED:   { cls: 'bg-orange-50 text-orange-700 border border-orange-200',    label: 'Returned' },
    CANCELLED:  { cls: 'bg-red-50 text-red-700 border border-red-200',             label: 'Cancelled' },
  };
  const { cls, label } = map[status];
  return <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}>{label}</span>;
}

/* ─── Return Window Countdown ─────────────────────────────────────────────── */
function ReturnCountdown({ daysLeft, totalDays, status }: { daysLeft: number; totalDays: number; status: OrderStatus }) {
  if (status !== 'DELIVERED') return null;
  if (daysLeft <= 0) {
    return (
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 font-medium">
        ⏱ Return window has closed (7-day policy)
      </div>
    );
  }
  const pct = Math.round((daysLeft / totalDays) * 100);
  return (
    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-amber-800 flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" /> Return Window Closes In
        </span>
        <span className="font-mono font-black text-amber-700 text-sm">{daysLeft} day{daysLeft !== 1 ? 's' : ''}</span>
      </div>
      <div className="h-1.5 bg-amber-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${daysLeft <= 2 ? 'bg-[#EF4444]' : 'bg-amber-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ─── RMA Drawer ─────────────────────────────────────────────────────────── */
type RmaReason = 'WRONG_PRODUCT' | 'DAMAGED' | 'QUALITY_ISSUE' | 'NOT_AS_DESCRIBED' | 'EXCESS_QTY' | 'OTHER';

const RMA_REASONS: { key: RmaReason; label: string }[] = [
  { key: 'WRONG_PRODUCT',     label: 'Wrong Product Received' },
  { key: 'DAMAGED',           label: 'Product Damaged in Transit' },
  { key: 'QUALITY_ISSUE',     label: 'Quality / Defect Issue' },
  { key: 'NOT_AS_DESCRIBED',  label: 'Not As Described (Product Page Mismatch)' },
  { key: 'EXCESS_QTY',        label: 'Excess Quantity Received' },
  { key: 'OTHER',             label: 'Other (specify in description)' },
];

interface RmaDrawerProps { subOrder: SubOrder; onClose: () => void; onSubmit: (subOrderId: string) => void }

function RmaDrawer({ subOrder, onClose, onSubmit }: RmaDrawerProps) {
  const [reason, setReason]       = useState<RmaReason>('QUALITY_ISSUE');
  const [description, setDesc]    = useState('');
  const [files, setFiles]         = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) setFiles(Array.from(e.target.files));
  }

  function handleSubmit() {
    if (!description.trim()) return;
    setSubmitting(true);
    setTimeout(() => { setSubmitting(false); onSubmit(subOrder.id); }, 1200);
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-40 bg-black/50 animate-fade-in" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-white shadow-modal flex flex-col animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 bg-[#0F172A] flex-shrink-0">
          <div>
            <h2 className="font-black text-white">Initiate RMA Return</h2>
            <p className="text-slate-400 text-sm mt-0.5">{subOrder.subOrderNo} · {subOrder.vendorName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Return Reason */}
          <div>
            <label className="text-sm font-bold text-slate-700 block mb-2">Return Reason *</label>
            <div className="space-y-2">
              {RMA_REASONS.map(r => (
                <label key={r.key} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  reason === r.key ? 'border-[#4F46E5] bg-[#4F46E5]/5' : 'border-slate-200 hover:border-slate-300'
                }`}>
                  <input type="radio" name="rma-reason" value={r.key} checked={reason === r.key}
                    onChange={() => setReason(r.key)} className="accent-[#4F46E5]" />
                  <span className="text-sm text-slate-700 font-medium">{r.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-bold text-slate-700 block mb-2">
              Detailed Description *
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={e => setDesc(e.target.value)}
              placeholder="Describe the issue in detail. Include batch numbers, affected quantities, and any quality parameters that were not met…"
              className="w-full input-field resize-none text-sm"
            />
          </div>

          {/* Evidence Upload */}
          <div>
            <label className="text-sm font-bold text-slate-700 block mb-2">
              Evidence Upload (Photos / Videos)
            </label>
            <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-[#4F46E5] hover:bg-[#4F46E5]/5 transition-all">
              <Camera className="w-8 h-8 text-slate-400 mb-2" />
              <span className="text-sm text-slate-500 font-medium">Click to upload photos/videos</span>
              <span className="text-xs text-slate-400 mt-1">PNG, JPG, MP4 — max 10MB each</span>
              <input type="file" className="hidden" multiple accept="image/*,video/*" onChange={handleFiles} />
            </label>
            {files.length > 0 && (
              <div className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    {f.name}
                    <span className="text-slate-400 ml-auto">{(f.size / 1024).toFixed(0)} KB</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Items to return */}
          <div>
            <label className="text-sm font-bold text-slate-700 block mb-2">Items to Return</label>
            <div className="space-y-2">
              {subOrder.lineItems.map(line => (
                <div key={line.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <input type="checkbox" defaultChecked className="w-4 h-4 accent-[#4F46E5] rounded" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 line-clamp-1">{line.productName}</p>
                    <p className="text-xs text-slate-400">{line.sku}</p>
                  </div>
                  <span className="text-sm font-bold text-slate-700">Qty: {line.qty}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex-shrink-0 space-y-3">
          <p className="text-xs text-slate-400 text-center">
            RMA requests are reviewed within 24 hours. A return label will be emailed upon approval.
          </p>
          <button
            onClick={handleSubmit}
            disabled={!description.trim() || submitting}
            className="btn-primary w-full justify-center py-4 text-base disabled:opacity-50"
          >
            {submitting ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Submitting…</>
            ) : (
              <><RotateCcw className="w-5 h-5" /> Submit RMA Return Request</>
            )}
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── Sub-Order Card ─────────────────────────────────────────────────────── */
function SubOrderCard({
  subOrder, onRmaClick,
}: { subOrder: SubOrder; onRmaClick: (so: SubOrder) => void }) {
  const [expanded, setExpanded] = useState(true);
  const activeIdx = stepIndex(subOrder.currentStep);
  const canReturn = subOrder.status === 'DELIVERED' && subOrder.returnDeadlineDays > 0;

  const subtotal = subOrder.lineItems.reduce((a, l) => a + lineSubtotal(l), 0);
  const gst      = subOrder.lineItems.reduce((a, l) => a + lineGst(l), 0);
  const total    = subtotal + gst;

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono font-bold text-slate-700 text-sm">{subOrder.subOrderNo}</span>
          <VendorBadge plan={subOrder.vendorPlan} />
          <StatusBadge status={subOrder.status} />
          {subOrder.fulfilmentMethod === 'INSTA'
            ? <span className="inline-flex items-center gap-1 text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-lg"><Zap className="w-3 h-3" /> TrimInsta Express</span>
            : <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg"><Truck className="w-3 h-3" /> Standard</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-slate-500">{subOrder.vendorName}</span>
          {expanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-5 space-y-5">
          {/* Progress bar */}
          <div>
            <div className="flex items-center justify-between mb-3">
              {STEP_ORDER.map((step, i) => {
                const done   = i < activeIdx;
                const active = i === activeIdx;
                const stepData = subOrder.steps.find(s => s.key === step);
                return (
                  <div key={step} className="flex-1 flex flex-col items-center relative">
                    {/* Connector line */}
                    {i > 0 && (
                      <div className={`absolute left-0 right-1/2 top-4 h-0.5 -z-0 transform -translate-y-1/2 ${
                        done || active ? 'bg-[#4F46E5]' : 'bg-slate-200'
                      }`} style={{ left: '-50%', width: '100%' }} />
                    )}
                    {/* Circle */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center z-10 text-xs font-bold transition-all ${
                      done   ? 'bg-[#10B981] text-white'
                      : active ? 'bg-[#4F46E5] text-white ring-4 ring-[#4F46E5]/20'
                      : 'bg-slate-200 text-slate-500'
                    }`}>
                      {done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                    </div>
                    <p className={`text-xs mt-1.5 font-semibold text-center ${active ? 'text-[#4F46E5]' : done ? 'text-[#10B981]' : 'text-slate-400'}`}>
                      {stepData?.label || step.charAt(0) + step.slice(1).toLowerCase()}
                    </p>
                    {stepData?.ts && (
                      <p className="text-xs text-slate-400 text-center mt-0.5 hidden md:block">{stepData.ts.split(' ')[1]}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Line Items */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Line Items</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Product', 'SKU', 'Qty', 'Unit Price', 'GST', 'Total'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-bold text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {subOrder.lineItems.map(line => (
                    <tr key={line.id} className="border-b border-slate-100">
                      <td className="px-3 py-3 text-slate-800 font-medium">{line.productName}</td>
                      <td className="px-3 py-3"><span className="id-chip">{line.sku}</span></td>
                      <td className="px-3 py-3 font-mono text-slate-700">{line.qty}</td>
                      <td className="px-3 py-3 font-mono text-slate-700">₹{line.unitPrice.toFixed(2)}</td>
                      <td className="px-3 py-3 text-slate-500">{line.gstRate}%</td>
                      <td className="px-3 py-3 font-bold text-slate-900">₹{(lineSubtotal(line) + lineGst(line)).toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50">
                    <td colSpan={5} className="px-3 py-3 text-right font-bold text-slate-700 text-sm">Sub-Order Total (incl. GST)</td>
                    <td className="px-3 py-3 font-black text-[#4F46E5]">₹{total.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Tracking */}
          {subOrder.trackingNo && (
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Tracking</p>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 mb-3 flex items-center gap-3">
                <Truck className="w-4 h-4 text-slate-400" />
                <div>
                  <p className="text-xs text-slate-500">Carrier: {subOrder.courier}</p>
                  <p className="font-mono font-bold text-slate-800 text-sm">{subOrder.trackingNo}</p>
                </div>
              </div>
              {subOrder.trackingEvents.length > 0 && (
                <div className="space-y-2">
                  {subOrder.trackingEvents.map((ev, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${i === 0 ? 'bg-[#4F46E5]' : 'bg-slate-300'}`} />
                      <div>
                        <p className="text-sm font-medium text-slate-800">{ev.status}</p>
                        <p className="text-xs text-slate-400 flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {ev.location} · {ev.timestamp}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Invoice + Return */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
            {subOrder.invoiceUrl && (
              <button className="btn-secondary text-sm py-2">
                <Download className="w-4 h-4" /> Download Seller Tax Invoice
              </button>
            )}

            <ReturnCountdown
              daysLeft={subOrder.returnDeadlineDays}
              totalDays={subOrder.returnWindowDaysTotal}
              status={subOrder.status}
            />

            {canReturn && (
              <button
                onClick={() => onRmaClick(subOrder)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition-all ml-auto"
              >
                <RotateCcw className="w-4 h-4" /> Initiate RMA Return →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main ───────────────────────────────────────────────────────────────── */
export default function CustomerOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const order = MOCK_ORDER; // In real app, useQuery to fetch

  const [rmaTarget, setRmaTarget] = useState<SubOrder | null>(null);
  const [rmaSuccess, setRmaSuccess] = useState<string | null>(null);

  function handleRmaSubmit(subOrderId: string) {
    setRmaTarget(null);
    setRmaSuccess(subOrderId);
    setTimeout(() => setRmaSuccess(null), 4000);
  }

  return (
    <div className="min-h-screen bg-[#F4F6FB]">
      {/* RMA Drawer */}
      {rmaTarget && (
        <RmaDrawer
          subOrder={rmaTarget}
          onClose={() => setRmaTarget(null)}
          onSubmit={handleRmaSubmit}
        />
      )}

      {/* RMA success toast */}
      {rmaSuccess && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl shadow-elevated text-sm font-semibold animate-slide-down">
          <CheckCircle2 className="w-4 h-4" />
          RMA submitted successfully. You'll receive a confirmation email within 24 hours.
        </div>
      )}

      {/* Breadcrumb */}
      <div className="bg-white border-b border-slate-100 px-6 py-3">
        <div className="max-w-screen-xl mx-auto flex items-center gap-2 text-sm">
          <button onClick={() => navigate('/marketplace/orders')} className="text-[#4F46E5] hover:underline flex items-center gap-1">
            <ChevronLeft className="w-4 h-4" /> My Orders
          </button>
          <span className="text-slate-300">/</span>
          <span className="font-mono text-slate-700 font-bold">{order.orderNo}</span>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-6">
        {/* Order Header */}
        <div className="card p-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Package className="w-5 h-5 text-[#4F46E5]" />
                <h1 className="text-2xl font-black text-slate-900 font-mono">{order.orderNo}</h1>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                  order.overallStatus === 'PARTIALLY_DELIVERED' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}>
                  {order.overallStatus.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-slate-500 text-sm">{order.customerName}</p>
              <p className="text-slate-400 text-sm mt-0.5 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> {order.shippingAddress}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 uppercase tracking-wider">Order Date</p>
              <p className="font-bold text-slate-700 mt-0.5">
                {new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {new Date(order.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Sub-Orders</p>
              <p className="font-black text-slate-800 text-xl mt-1">{order.subOrders.length}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Vendors</p>
              <p className="font-black text-slate-800 text-xl mt-1">{order.subOrders.length}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider">Delivered</p>
              <p className="font-black text-emerald-600 text-xl mt-1">
                {order.subOrders.filter(s => s.status === 'DELIVERED').length}/{order.subOrders.length}
              </p>
            </div>
          </div>
        </div>

        {/* Sub-Orders */}
        <div className="space-y-5">
          <h2 className="font-black text-slate-800 text-lg">Sub-Orders by Vendor</h2>
          {order.subOrders.map(so => (
            <SubOrderCard key={so.id} subOrder={so} onRmaClick={setRmaTarget} />
          ))}
        </div>
      </div>
    </div>
  );
}
