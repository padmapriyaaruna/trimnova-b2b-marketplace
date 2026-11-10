/**
 * AdminDashboard.tsx — TrimNova Live SLA Dashboard
 * KPI strip · SLA breach alerts · Activity feed · Quick actions
 */

import React, { useState } from 'react';
import Decimal from 'decimal.js';
import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingCart,
  TrendingUp,
  Percent,
  ClipboardCheck,
  AlertTriangle,
  Clock,
  Truck,
  XCircle,
  ShieldAlert,
  Ban,
  Bell,
  CheckCircle2,
  Zap,
  FileCheck,
  Banknote,
  ArrowRight,
  RefreshCw,
  Activity,
  Star,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface OverdueAcceptance {
  orderId:    string;
  vendorName: string;
  hoursOver:  number;
  placedAt:   string;
  buyer:      string;
}

interface LateDispatch {
  orderId:       string;
  sku:           string;
  vendorName:    string;
  daysLate:      number;
  promisedDate:  string;
}

interface ExpiringCert {
  vendorName: string;
  certType:   string;
  expiryDate: string;
  daysLeft:   number;
}

interface ZeroProductVendor {
  vendorId:   string;
  vendorName: string;
  blockedSince: string;
  reason:     string;
}

interface ActivityEvent {
  id:        string;
  icon:      React.ReactNode;
  iconBg:    string;
  event:     string;
  detail:    string;
  timestamp: string;
}

/* ─── Mock Data ──────────────────────────────────────────────────────────── */

const KPI = {
  activeVendors:    247,
  liveProducts:     1_834,
  ordersMTD:        3_418,
  gmvMTD:           new Decimal('47283960.00'),
  commissionMTD:    new Decimal('8471512.80'),
  pendingApprovals: 23,
};

const OVERDUE_ACCEPTANCES: OverdueAcceptance[] = [
  { orderId: 'ORD-2026-5881', vendorName: 'ThreadWorks Manufacturing Pvt Ltd', hoursOver: 31, placedAt: '2026-11-08 09:14', buyer: 'Fashion Forward Ltd' },
  { orderId: 'ORD-2026-5894', vendorName: 'ZipKing International',              hoursOver: 26, placedAt: '2026-11-08 14:30', buyer: 'Stitch & Style Co.' },
  { orderId: 'ORD-2026-5901', vendorName: 'FuseRight Textiles Pvt Ltd',         hoursOver: 14, placedAt: '2026-11-09 10:05', buyer: 'DenimHub Wholesale' },
];

const LATE_DISPATCHES: LateDispatch[] = [
  { orderId: 'ORD-2026-5742', sku: 'THR-HTP-120', vendorName: 'ThreadWorks Manufacturing Pvt Ltd', daysLate: 4, promisedDate: '2026-11-05' },
  { orderId: 'ORD-2026-5769', sku: 'ZIP-ABR-5M',  vendorName: 'ZipKing International',              daysLate: 2, promisedDate: '2026-11-07' },
];

const EXPIRING_CERTS: ExpiringCert[] = [
  { vendorName: 'Ribbonex India Pvt Ltd',   certType: 'GOTS Organic Certificate',      expiryDate: '2026-11-25', daysLeft: 15 },
  { vendorName: 'AccessoryPlus Pvt Ltd',    certType: 'BIS Quality Certification',      expiryDate: '2026-12-01', daysLeft: 21 },
  { vendorName: 'TagTech Solutions',         certType: 'ISO 9001:2015 Certificate',      expiryDate: '2026-12-08', daysLeft: 28 },
];

const ZERO_PRODUCT_VENDORS: ZeroProductVendor[] = [
  { vendorId: 'VND-0082', vendorName: 'AnchorWeave Industries',  blockedSince: '2026-10-15', reason: 'KYC renewal pending' },
  { vendorId: 'VND-0119', vendorName: 'PrintMaster Labels',       blockedSince: '2026-10-28', reason: 'GST certificate expired' },
];

const ACTIVITY_FEED: ActivityEvent[] = [
  { id: 'e1',  icon: <CheckCircle2 className="w-3.5 h-3.5" />, iconBg: 'bg-emerald-500', event: 'Vendor Approved',      detail: 'Silkweave Exports Pvt Ltd — KYC verified',           timestamp: '5m ago'  },
  { id: 'e2',  icon: <Package      className="w-3.5 h-3.5" />, iconBg: 'bg-[#4F46E5]',  event: 'Product Published',    detail: 'SKU LBL-WDM-009 — Woven Damask Labels (Gold)',       timestamp: '12m ago' },
  { id: 'e3',  icon: <ShoppingCart className="w-3.5 h-3.5" />, iconBg: 'bg-sky-500',    event: 'Order Placed',         detail: 'ORD-2026-5921 · ₹14,850.00 · Fashion Forward Ltd',  timestamp: '18m ago' },
  { id: 'e4',  icon: <Banknote     className="w-3.5 h-3.5" />, iconBg: 'bg-teal-500',   event: 'Payout Released',      detail: 'BATCH-NOV-002 · ₹2,34,180.00 · UTR HDFC20261110…', timestamp: '34m ago' },
  { id: 'e5',  icon: <ShoppingCart className="w-3.5 h-3.5" />, iconBg: 'bg-sky-500',    event: 'Order Placed',         detail: 'ORD-2026-5920 · ₹7,200.00 · DenimHub Wholesale',    timestamp: '41m ago' },
  { id: 'e6',  icon: <FileCheck    className="w-3.5 h-3.5" />, iconBg: 'bg-amber-500',  event: 'KYC Submitted',        detail: 'Moonlight Fabrics India — 7 docs uploaded',           timestamp: '1h ago'  },
  { id: 'e7',  icon: <Package      className="w-3.5 h-3.5" />, iconBg: 'bg-[#4F46E5]',  event: 'Product Published',    detail: 'SKU INT-FMD-225 — Fusible Microdot Interlining XL',  timestamp: '1h ago'  },
  { id: 'e8',  icon: <Banknote     className="w-3.5 h-3.5" />, iconBg: 'bg-teal-500',   event: 'Payout Released',      detail: 'BATCH-NOV-001 · ₹1,82,350.00 · UTR ICIC20261110…',  timestamp: '2h ago'  },
  { id: 'e9',  icon: <CheckCircle2 className="w-3.5 h-3.5" />, iconBg: 'bg-emerald-500', event: 'Vendor Approved',     detail: 'BlueLine Buttons Ltd — FSSAI & GST verified',         timestamp: '3h ago'  },
  { id: 'e10', icon: <ShoppingCart className="w-3.5 h-3.5" />, iconBg: 'bg-sky-500',    event: 'Order Placed',         detail: 'ORD-2026-5914 · ₹22,100.00 · Stitch & Style Co.',    timestamp: '3h ago'  },
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function fmt(d: Decimal): string {
  return '₹' + d.toNumber().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type ToastItem = { id: number; msg: string; type: 'success' | 'info' };
function useMiniToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  function add(msg: string, type: ToastItem['type'] = 'success') {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }
  return { toasts, add };
}

function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white animate-slide-down pointer-events-auto ${
            t.type === 'success' ? 'bg-emerald-600' : 'bg-[#4F46E5]'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {t.msg}
        </div>
      ))}
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

interface KpiCardProps {
  icon:    React.ReactNode;
  iconBg:  string;
  label:   string;
  value:   string | number;
  mono?:   boolean;
}
function KpiCard({ icon, iconBg, label, value, mono }: KpiCardProps) {
  return (
    <div className="bg-white rounded-2xl p-5 flex items-center gap-4 shadow-sm border border-slate-100">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">{label}</p>
        <p className={`text-xl font-black text-slate-900 mt-0.5 truncate ${mono ? 'font-mono' : ''}`}>{value}</p>
      </div>
    </div>
  );
}

function SectionHeader({ icon, label, count, urgent }: { icon: React.ReactNode; label: string; count: number; urgent?: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-5 py-3.5 border-b rounded-t-2xl ${
      urgent
        ? 'bg-red-50 border-red-200'
        : 'bg-amber-50 border-amber-200'
    }`}>
      <span className={urgent ? 'text-red-500' : 'text-amber-600'}>{icon}</span>
      <h3 className={`font-black text-sm ${urgent ? 'text-red-800' : 'text-amber-800'}`}>{label}</h3>
      <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${
        urgent ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'
      }`}>{count}</span>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */

export default function AdminDashboard() {
  const { toasts, add: toast } = useMiniToast();

  /* SLA alert counts */
  const totalSlaBreaches =
    OVERDUE_ACCEPTANCES.length +
    LATE_DISPATCHES.length +
    EXPIRING_CERTS.length +
    ZERO_PRODUCT_VENDORS.length;

  return (
    <>
      <ToastStack toasts={toasts} />

      <div className="space-y-6">

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#4F46E5] flex items-center justify-center">
              <LayoutDashboard className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900">Admin Dashboard</h1>
              <p className="text-xs text-slate-400 mt-0.5">Live platform overview · SLA monitoring</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {totalSlaBreaches > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-xl">
                <AlertTriangle className="w-3.5 h-3.5" />
                {totalSlaBreaches} SLA Breach{totalSlaBreaches !== 1 ? 'es' : ''} Active
              </span>
            )}
            <button
              onClick={() => toast('Dashboard refreshed.', 'info')}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-xl transition-all hover:border-slate-300"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        </div>

        {/* ── KPI Strip ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard
            icon={<Users className="w-5 h-5 text-white" />}
            iconBg="bg-[#4F46E5]"
            label="Active Vendors"
            value={KPI.activeVendors.toLocaleString('en-IN')}
          />
          <KpiCard
            icon={<Package className="w-5 h-5 text-white" />}
            iconBg="bg-sky-500"
            label="Live Products"
            value={KPI.liveProducts.toLocaleString('en-IN')}
          />
          <KpiCard
            icon={<ShoppingCart className="w-5 h-5 text-white" />}
            iconBg="bg-violet-500"
            label="Orders MTD"
            value={KPI.ordersMTD.toLocaleString('en-IN')}
          />
          <KpiCard
            icon={<TrendingUp className="w-5 h-5 text-white" />}
            iconBg="bg-emerald-500"
            label="GMV MTD"
            value={fmt(KPI.gmvMTD)}
            mono
          />
          <KpiCard
            icon={<Percent className="w-5 h-5 text-white" />}
            iconBg="bg-teal-500"
            label="Commission MTD"
            value={fmt(KPI.commissionMTD)}
            mono
          />
          <KpiCard
            icon={<ClipboardCheck className="w-5 h-5 text-white" />}
            iconBg="bg-amber-500"
            label="Pending Approvals"
            value={KPI.pendingApprovals}
          />
        </div>

        {/* ── SLA Breach Alerts ─────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="w-5 h-5 text-red-500" />
            <h2 className="text-base font-black text-slate-900">SLA Breach Alerts</h2>
            <span className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full ml-1">
              Requires Immediate Action
            </span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

            {/* Card 1: Overdue Vendor Acceptance */}
            <div className="bg-white rounded-2xl border-2 border-red-200 shadow-sm overflow-hidden">
              <SectionHeader
                icon={<Clock className="w-4 h-4" />}
                label="Orders Awaiting Vendor Acceptance &gt; 1 Business Day"
                count={OVERDUE_ACCEPTANCES.length}
                urgent
              />
              <div className="divide-y divide-slate-100">
                {OVERDUE_ACCEPTANCES.map(item => (
                  <div key={item.orderId} className="px-5 py-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-[#4F46E5] bg-[#4F46E5]/8 px-2 py-0.5 rounded-lg">
                          {item.orderId}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                          <Clock className="w-3 h-3" />
                          {item.hoursOver}h overdue
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800 mt-1 truncate">{item.vendorName}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Buyer: {item.buyer} · Placed {item.placedAt}
                      </p>
                    </div>
                    <button
                      onClick={() => toast(`Notification sent to ${item.vendorName}.`, 'success')}
                      className="flex items-center gap-1.5 flex-shrink-0 px-3 py-1.5 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-all"
                    >
                      <Bell className="w-3 h-3" /> Notify Vendor
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 2: Late Dispatches */}
            <div className="bg-white rounded-2xl border-2 border-amber-200 shadow-sm overflow-hidden">
              <SectionHeader
                icon={<Truck className="w-4 h-4" />}
                label="Orders Dispatched Late — Beyond Lead Time"
                count={LATE_DISPATCHES.length}
              />
              <div className="divide-y divide-slate-100">
                {LATE_DISPATCHES.map(item => (
                  <div key={item.orderId} className="px-5 py-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-[#4F46E5] bg-[#4F46E5]/8 px-2 py-0.5 rounded-lg">
                          {item.orderId}
                        </span>
                        <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">
                          {item.sku}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800 mt-1 truncate">{item.vendorName}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                          <AlertTriangle className="w-3 h-3" />
                          {item.daysLate} day{item.daysLate !== 1 ? 's' : ''} late
                        </span>
                        <span className="text-xs text-slate-400">Promised: {item.promisedDate}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => toast(`Escalation raised for ${item.orderId}.`, 'success')}
                      className="flex items-center gap-1.5 flex-shrink-0 px-3 py-1.5 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-xl transition-all"
                    >
                      <AlertTriangle className="w-3 h-3" /> Escalate
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 3: Expiring Certificates */}
            <div className="bg-white rounded-2xl border-2 border-orange-200 shadow-sm overflow-hidden">
              <SectionHeader
                icon={<ShieldAlert className="w-4 h-4" />}
                label="Vendor Certificates Expiring within 30 Days"
                count={EXPIRING_CERTS.length}
              />
              <div className="divide-y divide-slate-100">
                {EXPIRING_CERTS.map((cert, i) => (
                  <div key={i} className="px-5 py-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{cert.vendorName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{cert.certType}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${
                          cert.daysLeft <= 15
                            ? 'text-red-700 bg-red-50 border-red-200'
                            : 'text-orange-700 bg-orange-50 border-orange-200'
                        }`}>
                          <Clock className="w-3 h-3" />
                          {cert.daysLeft} days left
                        </span>
                        <span className="text-xs font-mono text-slate-400">Expires {cert.expiryDate}</span>
                      </div>
                      <p className="text-xs text-orange-600 font-medium mt-1">
                        ⚠ Badge auto-hidden · Sales blocked on expiry
                      </p>
                    </div>
                    <button
                      onClick={() => toast(`Reminder sent to ${cert.vendorName}.`, 'success')}
                      className="flex items-center gap-1.5 flex-shrink-0 px-3 py-1.5 text-xs font-bold text-orange-800 bg-orange-100 hover:bg-orange-200 rounded-xl transition-all"
                    >
                      <Bell className="w-3 h-3" /> Send Reminder
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 4: Vendors with 0 Live Products */}
            <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">
              <SectionHeader
                icon={<Ban className="w-4 h-4" />}
                label="Vendors with 0 Live Products — Blocked by Compliance"
                count={ZERO_PRODUCT_VENDORS.length}
              />
              <div className="divide-y divide-slate-100">
                {ZERO_PRODUCT_VENDORS.map(vendor => (
                  <div key={vendor.vendorId} className="px-5 py-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">
                          {vendor.vendorId}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                          <XCircle className="w-3 h-3 text-red-400" /> Blocked
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800 mt-1 truncate">{vendor.vendorName}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Since {vendor.blockedSince} · {vendor.reason}
                      </p>
                    </div>
                    <button
                      onClick={() => toast(`KYC queue opened for ${vendor.vendorName}.`, 'info')}
                      className="flex items-center gap-1.5 flex-shrink-0 px-3 py-1.5 text-xs font-bold text-[#4F46E5] bg-[#4F46E5]/10 hover:bg-[#4F46E5]/20 rounded-xl transition-all"
                    >
                      <ArrowRight className="w-3 h-3" /> Review KYC
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* ── Bottom row: Activity Feed + Quick Actions ─────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

          {/* Activity Feed — 2/3 width */}
          <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
              <Activity className="w-4 h-4 text-[#4F46E5]" />
              <h3 className="font-black text-slate-800 text-sm">Recent Platform Activity</h3>
              <span className="ml-auto text-xs text-slate-400">Last 10 events</span>
            </div>
            <div className="divide-y divide-slate-50">
              {ACTIVITY_FEED.map(ev => (
                <div key={ev.id} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-white ${ev.iconBg}`}>
                    {ev.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 justify-between">
                      <p className="text-xs font-bold text-slate-700">{ev.event}</p>
                      <span className="text-xs text-slate-400 flex-shrink-0">{ev.timestamp}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{ev.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions — 1/3 width */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
              <Zap className="w-4 h-4 text-amber-500" />
              <h3 className="font-black text-slate-800 text-sm">Quick Actions</h3>
            </div>
            <div className="p-5 space-y-3">
              <button
                onClick={() => toast('Publishing all pending products…', 'info')}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[#4F46E5] hover:bg-[#3730A3] text-white text-sm font-bold transition-all group"
              >
                <Package className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-left">Publish Pending Products</span>
                <span className="text-xs bg-white/20 text-white/90 font-mono px-1.5 py-0.5 rounded">
                  {KPI.pendingApprovals}
                </span>
                <ArrowRight className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </button>

              <button
                onClick={() => toast('KYC review queue opened.', 'info')}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition-all group"
              >
                <FileCheck className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-left">Review KYC Queue</span>
                <span className="text-xs bg-white/20 text-white/90 font-mono px-1.5 py-0.5 rounded">7</span>
                <ArrowRight className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </button>

              <button
                onClick={() => toast('Settlement batch generation initiated.', 'success')}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold transition-all group"
              >
                <Banknote className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1 text-left">Generate Settlement Batch</span>
                <ArrowRight className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </button>

              {/* SLA summary card */}
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldAlert className="w-4 h-4 text-red-500" />
                  <p className="text-xs font-black text-red-800">SLA Summary</p>
                </div>
                <div className="space-y-1.5">
                  {[
                    { label: 'Overdue acceptances',   val: OVERDUE_ACCEPTANCES.length,  color: 'text-red-700'    },
                    { label: 'Late dispatches',         val: LATE_DISPATCHES.length,      color: 'text-amber-700'  },
                    { label: 'Certs expiring ≤30d',    val: EXPIRING_CERTS.length,       color: 'text-orange-700' },
                    { label: 'Vendors blocked',         val: ZERO_PRODUCT_VENDORS.length, color: 'text-slate-700'  },
                  ].map(r => (
                    <div key={r.label} className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">{r.label}</span>
                      <span className={`font-black ${r.color}`}>{r.val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Platform health */}
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="flex items-center gap-2 mb-1">
                  <Star className="w-4 h-4 text-emerald-600" />
                  <p className="text-xs font-black text-emerald-800">Platform Health</p>
                </div>
                <p className="text-xs text-emerald-700">
                  Uptime 99.97% · Avg order processing 2.3 min · 0 critical errors (24h)
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
