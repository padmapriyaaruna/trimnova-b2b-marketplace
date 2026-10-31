/**
 * AdminConsole.tsx — TrimNova 5-Tab Admin Console
 * Tab 1: Escalations (Case #ESC-9482)
 * Tab 2: Margin % Manager
 * Tab 3: Coupon Generator
 * Tab 4: Settlement Manager (Ledger + Invoice Preview)
 * Tab 5: Platform Config
 */

import React, { useState } from 'react';
import Decimal from 'decimal.js';
import {
  AlertTriangle, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp,
  MessageSquare, Shield, Zap, Truck, BarChart3, Tag, Receipt,
  Settings, Edit3, Save, RefreshCw, Plus, Trash2, Download,
  FileText, CreditCard, ArrowRight, Check, X, Info
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────────────── */
type AdminTab = 'escalations' | 'margins' | 'coupons' | 'settlements' | 'config';
type SettlementSubTab = 'ledger' | 'invoice';
type BatchStatus = 'BATCH_DRAFT' | 'PENDING_APPROVAL' | 'PAID';

interface AuditMessage {
  id: string;
  actor: 'APPROVER' | 'VENDOR' | 'ADMIN';
  actorName: string;
  message: string;
  timestamp: string;
}

interface EscalationSku {
  sku: string;
  name: string;
  agreed?: { slab1: number; slab2: number; slab3: number; slab4: number; slab5: number };
  vendorPct?: number;
  trimnovanPct?: number;
  gap?: number;
}

interface CouponRecord {
  id: string;
  code: string;
  type: '% Off' | 'Flat ₹ Off';
  value: number;
  funder: 'Platform' | 'Vendor';
  applicableTo: string;
  expiry: string;
  used: number;
  limit: number;
  status: 'Active' | 'Used' | 'Expired';
}

interface SubOrderLedger {
  id: string;
  orderId: string;
  vendor: string;
  amount: number;
  returnDeadlinePassed: boolean;
  status: 'ELIGIBLE' | 'SETTLED';
}

interface SettlementBatch {
  id: string;
  batchNo: string;
  status: BatchStatus;
  totalAmount: number;
  orderCount: number;
  createdAt: string;
  utr?: string;
}

interface ConfigKey {
  key: string;
  label: string;
  value: string;
  unit: string;
  group: string;
}

/* ─── Mock Data ──────────────────────────────────────────────────────────── */
const AGREED_SKUS: EscalationSku[] = [
  { sku: 'LBL-WDM-001', name: 'Woven Damask Brand Labels',       agreed: { slab1: 22, slab2: 20, slab3: 18, slab4: 16, slab5: 14 } },
  { sku: 'LBL-RFID-007',name: 'RFID Smart Inventory Labels',     agreed: { slab1: 24, slab2: 22, slab3: 20, slab4: 18, slab5: 16 } },
  { sku: 'INT-FMD-220',  name: 'Fusible Microdot Interlining',   agreed: { slab1: 20, slab2: 18, slab3: 16, slab4: 14, slab5: 12 } },
];
const DISPUTED_SKUS: EscalationSku[] = [
  { sku: 'THR-HTP-120', name: 'High-Tenacity Bonded Poly Threads', vendorPct: 14, trimnovanPct: 18, gap: 4 },
  { sku: 'ZIP-ABR-5M',  name: 'Antique Brass Teeth Zippers #5',   vendorPct: 16, trimnovanPct: 22, gap: 6 },
];
const AUDIT_STREAM: AuditMessage[] = [
  { id: 'm1', actor: 'APPROVER', actorName: 'Priya Sharma',    message: 'Initial margin proposal reviewed. 3 SKUs agreed. 2 SKUs flagged as disputed — vendor margin below platform minimum.',  timestamp: '2026-10-28 14:32:00' },
  { id: 'm2', actor: 'VENDOR',   actorName: 'ThreadWorks Mfg', message: 'Requesting reconsideration on THR-HTP-120. Our raw material costs increased 12% in Q3. 14% is our floor margin.',     timestamp: '2026-10-29 09:15:00' },
  { id: 'm3', actor: 'APPROVER', actorName: 'Priya Sharma',    message: 'ZIP-ABR-5M: Standard brass commodity pricing. TrimNova target 22% is non-negotiable for Category A metals.',            timestamp: '2026-10-29 11:47:00' },
  { id: 'm4', actor: 'VENDOR',   actorName: 'ZipKing Intl',    message: 'Acknowledged on ZIP-ABR-5M. We cannot accept 22%. Requesting escalation to Senior Finance.',                           timestamp: '2026-10-30 10:03:00' },
  { id: 'm5', actor: 'ADMIN',    actorName: 'Admin Console',   message: 'Escalation docket ESC-9482 raised. Pending Admin decision on 2 disputed SKUs.',                                        timestamp: '2026-10-30 10:05:00' },
];

const MOCK_COUPONS: CouponRecord[] = [
  { id: 'cp1', code: 'TRIM10',    type: '% Off',    value: 10,   funder: 'Platform', applicableTo: 'All Products', expiry: '2026-12-31', used: 42,  limit: 500,  status: 'Active' },
  { id: 'cp2', code: 'FLAT500',   type: 'Flat ₹ Off',value: 500, funder: 'Platform', applicableTo: 'Orders > ₹5000', expiry: '2026-11-15', used: 18, limit: 100, status: 'Active' },
  { id: 'cp3', code: 'VENDOR20',  type: '% Off',    value: 20,   funder: 'Vendor',   applicableTo: 'ThreadWorks SKUs', expiry: '2026-10-31', used: 75, limit: 75, status: 'Expired' },
];

const LEDGER_ITEMS: SubOrderLedger[] = [
  { id: 'so1', orderId: 'ORD-2026-4491', vendor: 'ThreadWorks Manufacturing', amount: 12050.00, returnDeadlinePassed: true,  status: 'ELIGIBLE' },
  { id: 'so2', orderId: 'ORD-2026-4492', vendor: 'Ribbonex India Pvt Ltd',   amount: 8750.00,  returnDeadlinePassed: true,  status: 'ELIGIBLE' },
  { id: 'so3', orderId: 'ORD-2026-4495', vendor: 'ThreadWorks Manufacturing', amount: 6200.00,  returnDeadlinePassed: false, status: 'ELIGIBLE' },
  { id: 'so4', orderId: 'ORD-2026-4488', vendor: 'AccessoryPlus Pvt Ltd',    amount: 5400.00,  returnDeadlinePassed: true,  status: 'SETTLED' },
];

const MOCK_BATCHES: SettlementBatch[] = [
  { id: 'b1', batchNo: 'BATCH-OCT-001', status: 'PAID',             totalAmount: 48200.00, orderCount: 5, createdAt: '2026-10-25', utr: 'HDFC20261025123456' },
  { id: 'b2', batchNo: 'BATCH-OCT-002', status: 'PENDING_APPROVAL', totalAmount: 21900.00, orderCount: 3, createdAt: '2026-10-30' },
];

const CONFIG_KEYS: ConfigKey[] = [
  { key: 'REGISTRATION_FEE',     label: 'Vendor Registration Fee',    value: '999',   unit: '₹',         group: 'Fees' },
  { key: 'PLAN_ELITE_FEE',       label: 'ELITE Plan Monthly Fee',     value: '9999',  unit: '₹/month',   group: 'Fees' },
  { key: 'PLAN_GOLD_FEE',        label: 'GOLD Plan Monthly Fee',      value: '4999',  unit: '₹/month',   group: 'Fees' },
  { key: 'PLAN_BASIC_FEE',       label: 'BASIC Plan Monthly Fee',     value: '0',     unit: '₹/month',   group: 'Fees' },
  { key: 'RETURN_POLICY_DAYS',   label: 'Customer Return Window',     value: '7',     unit: 'days',      group: 'Policy' },
  { key: 'TRIMINSTA_RATE_SQFT',  label: 'TrimInsta Storage Rate',     value: '2.50',  unit: '₹/sqft/day',group: 'TrimInsta' },
  { key: 'TDS_RATE',             label: 'TDS Deduction Rate',         value: '1',     unit: '%',         group: 'Tax' },
  { key: 'PLATFORM_GST',         label: 'Platform Commission GST',    value: '18',    unit: '%',         group: 'Tax' },
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */
type ToastItem = { id: number; message: string; type: 'success' | 'error' };

function useMiniToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  function add(message: string, type: 'success' | 'error' = 'success') {
    const id = Date.now();
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
  }
  return { toasts, add };
}

function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-elevated text-sm font-semibold animate-slide-down pointer-events-auto ${
          t.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-[#EF4444] text-white'
        }`}>
          {t.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {t.message}
        </div>
      ))}
    </div>
  );
}

function BatchStatusBadge({ status }: { status: BatchStatus }) {
  const map: Record<BatchStatus, { cls: string; label: string }> = {
    BATCH_DRAFT:       { cls: 'bg-slate-100 text-slate-600',       label: 'Draft' },
    PENDING_APPROVAL:  { cls: 'bg-amber-50 text-amber-700 border border-amber-200',   label: 'Pending Approval' },
    PAID:              { cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200', label: 'Paid' },
  };
  const { cls, label } = map[status];
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{label}</span>;
}

/* ════════════════════════════════════════════════════════════════════════════
   TAB COMPONENTS
════════════════════════════════════════════════════════════════════════════ */

/* Tab 1: Escalations */
function EscalationsTab({ toast }: { toast: (m: string, t?: 'success' | 'error') => void }) {
  const [decision, setDecision] = useState<string | null>(null);
  const decisions = [
    { key: 'accept_partial',  label: 'Accept Partial Agreement (Recommended)', desc: 'Publishes 3 agreed SKUs to marketplace immediately. Gates 2 disputed SKUs pending further negotiation.', cls: 'border-emerald-300 bg-emerald-50', btnCls: 'bg-emerald-600 hover:bg-emerald-700', icon: <CheckCircle2 className="w-5 h-5" /> },
    { key: 'negotiate_further',label: 'Negotiate Further',                    desc: 'Returns all 5 SKUs to Approver for another round. Vendor receives a clarification request email.', cls: 'border-amber-300 bg-amber-50', btnCls: 'bg-amber-500 hover:bg-amber-600', icon: <MessageSquare className="w-5 h-5" /> },
    { key: 'approve_all',      label: 'Approve All Terms (Override)',          desc: 'Accepts all 5 SKUs including disputed margins. Admin override bypasses standard margin floor. Audit trail entry created.', cls: 'border-[#4F46E5]/30 bg-[#4F46E5]/5', btnCls: 'bg-[#4F46E5] hover:bg-[#3730A3]', icon: <Shield className="w-5 h-5" /> },
    { key: 'reject_all',       label: 'Reject Proposal (Full Archive)',        desc: 'Rejects entire margin proposal. All 5 SKUs archived. Vendor must re-submit with revised margin structure.', cls: 'border-red-300 bg-red-50', btnCls: 'bg-[#EF4444] hover:bg-red-600', icon: <XCircle className="w-5 h-5" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Docket header */}
      <div className="flex items-center gap-3 p-5 bg-amber-50 border-2 border-amber-300 rounded-2xl">
        <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
        <div>
          <h2 className="font-black text-slate-900 text-lg">
            ⚠ Escalation Docket: Case <span className="text-amber-700 font-mono">#ESC-9482</span> — Margin Negotiation Dispute
          </h2>
          <p className="text-slate-500 text-sm mt-0.5">
            Raised 2026-10-30 · ThreadWorks Manufacturing Pvt Ltd × ZipKing International
          </p>
        </div>
        <span className="ml-auto px-3 py-1 bg-amber-600 text-white text-xs font-bold rounded-xl whitespace-nowrap">OPEN</span>
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        <div className="flex-1 min-w-0 space-y-5">
          {/* Section A: Agreed */}
          <div className="card overflow-hidden border-2 border-emerald-200">
            <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="font-bold text-emerald-800 text-sm">Section A — Agreed Products (3 SKUs)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase">SKU</th>
                    <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase">Product Name</th>
                    {[1,2,3,4,5].map(n => (
                      <th key={n} className="px-3 py-2.5 text-center text-xs font-bold text-slate-500 uppercase">Slab {n}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {AGREED_SKUS.map((s, i) => (
                    <tr key={s.sku} className={i % 2 === 0 ? 'bg-white' : 'bg-emerald-50/30'}>
                      <td className="px-4 py-3"><span className="id-chip">{s.sku}</span></td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{s.name}</td>
                      {Object.values(s.agreed!).map((pct, j) => (
                        <td key={j} className="px-3 py-3 text-center font-mono font-bold text-emerald-700 text-sm">{pct}%</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section B: Disputed */}
          <div className="card overflow-hidden border-2 border-amber-200">
            <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="font-bold text-amber-800 text-sm">Section B — Disputed Products (2 SKUs)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase">SKU</th>
                    <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase">Product Name</th>
                    <th className="px-4 py-2.5 text-center text-xs font-bold text-slate-500 uppercase">Vendor %</th>
                    <th className="px-4 py-2.5 text-center text-xs font-bold text-slate-500 uppercase">TrimNova %</th>
                    <th className="px-4 py-2.5 text-center text-xs font-bold text-slate-500 uppercase">Gap</th>
                  </tr>
                </thead>
                <tbody>
                  {DISPUTED_SKUS.map((s, i) => (
                    <tr key={s.sku} className={i % 2 === 0 ? 'bg-white' : 'bg-amber-50/20'}>
                      <td className="px-4 py-3"><span className="id-chip">{s.sku}</span></td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{s.name}</td>
                      <td className="px-4 py-3 text-center font-mono font-bold text-[#4F46E5]">{s.vendorPct}%</td>
                      <td className="px-4 py-3 text-center font-mono font-bold text-emerald-600">{s.trimnovanPct}%</td>
                      <td className="px-4 py-3 text-center font-mono font-bold text-amber-600">+{s.gap}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section C: Audit Stream */}
          <div className="card p-5">
            <h3 className="font-bold text-slate-800 mb-4">Section C — Negotiation Audit Stream</h3>
            <div className="space-y-3">
              {AUDIT_STREAM.map(msg => (
                <div key={msg.id} className={`flex gap-3 ${msg.actor === 'VENDOR' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black ${
                    msg.actor === 'APPROVER' ? 'bg-[#4F46E5] text-white'
                    : msg.actor === 'VENDOR' ? 'bg-amber-500 text-white'
                    : 'bg-slate-700 text-white'
                  }`}>
                    {msg.actorName.charAt(0)}
                  </div>
                  <div className={`flex-1 max-w-lg ${msg.actor === 'VENDOR' ? 'items-end' : ''} flex flex-col`}>
                    <div className={`p-3 rounded-2xl text-sm ${
                      msg.actor === 'APPROVER' ? 'bg-[#4F46E5]/5 border border-[#4F46E5]/20 text-slate-800'
                      : msg.actor === 'VENDOR' ? 'bg-amber-50 border border-amber-200 text-amber-800'
                      : 'bg-slate-100 border border-slate-200 text-slate-600 italic'
                    }`}>
                      <span className="font-bold text-xs block mb-1">{msg.actorName}</span>
                      {msg.message}
                    </div>
                    <span className="text-xs text-slate-400 mt-1 px-1">{msg.timestamp}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel: Admin Decision */}
        <div className="xl:w-72 flex-shrink-0 space-y-3">
          <h3 className="font-bold text-slate-800">Administrative Decision</h3>
          {decisions.map(d => (
            <div
              key={d.key}
              className={`card p-4 border-2 transition-all cursor-pointer ${d.cls} ${decision === d.key ? 'ring-2 ring-offset-1 ring-[#4F46E5]' : ''}`}
              onClick={() => setDecision(d.key)}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`p-1.5 rounded-lg ${d.btnCls} text-white`}>{d.icon}</span>
                <p className="font-bold text-slate-800 text-sm leading-tight">{d.label}</p>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">{d.desc}</p>
              {decision === d.key && (
                <button
                  onClick={e => { e.stopPropagation(); toast(`Decision applied: ${d.label}`, 'success'); }}
                  className={`mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-white text-xs font-bold transition-all ${d.btnCls}`}
                >
                  <Check className="w-3.5 h-3.5" /> Confirm Decision
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Tab 2: Margin Manager */
function MarginManagerTab({ toast }: { toast: (m: string, t?: 'success' | 'error') => void }) {
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(new Set(['THR-HTP-120']));
  const [margins, setMargins] = useState<Record<string, number[]>>({
    'LBL-WDM-001':  [22, 20, 18, 16, 14],
    'LBL-RFID-007': [24, 22, 20, 18, 16],
    'INT-FMD-220':  [20, 18, 16, 14, 12],
    'THR-HTP-120':  [22, 20, 18, 16, 14],
    'ZIP-ABR-5M':   [22, 20, 18, 16, 14],
  });

  const products = [
    { sku: 'LBL-WDM-001', name: 'Woven Damask Brand Labels',         vendor: 'Ribbonex India Pvt Ltd' },
    { sku: 'LBL-RFID-007',name: 'RFID Smart Inventory Labels',       vendor: 'TagTech Solutions' },
    { sku: 'INT-FMD-220',  name: 'Fusible Microdot Interlining',     vendor: 'FuseRight Textiles' },
    { sku: 'THR-HTP-120',  name: 'High-Tenacity Bonded Poly Thread', vendor: 'ThreadWorks Manufacturing Pvt Ltd' },
    { sku: 'ZIP-ABR-5M',   name: 'Antique Brass Teeth Zipper #5',    vendor: 'ZipKing International' },
  ];

  function toggleSku(sku: string) {
    setExpandedSkus(prev => { const n = new Set(prev); n.has(sku) ? n.delete(sku) : n.add(sku); return n; });
  }
  function updateMargin(sku: string, slabIdx: number, val: string) {
    setMargins(prev => {
      const arr = [...(prev[sku] || [22,20,18,16,14])];
      arr[slabIdx] = parseFloat(val) || arr[slabIdx];
      return { ...prev, [sku]: arr };
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 font-medium">
        <Info className="w-4 h-4 flex-shrink-0" />
        MAR-03: Changes apply to future orders only. Existing orders are unaffected.
      </div>
      {products.map(p => (
        <div key={p.sku} className="card overflow-hidden">
          <button
            onClick={() => toggleSku(p.sku)}
            className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="id-chip">{p.sku}</span>
              <div className="text-left">
                <p className="font-bold text-slate-800">{p.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{p.vendor}</p>
              </div>
            </div>
            {expandedSkus.has(p.sku) ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>
          {expandedSkus.has(p.sku) && (
            <div className="border-t border-slate-100 p-5">
              <div className="grid grid-cols-5 gap-3 mb-4">
                {(margins[p.sku] || [22,20,18,16,14]).map((val, i) => (
                  <div key={i}>
                    <label className="text-xs text-slate-500 font-medium block mb-1">Slab {i+1} %</label>
                    <input
                      type="number" min={0} max={100} step={0.5}
                      value={val}
                      onChange={e => updateMargin(p.sku, i, e.target.value)}
                      className="w-full text-center font-mono font-bold text-[#4F46E5] px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5]/20"
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={() => toast(`Margins saved & synced to vendor read-only view for ${p.sku}`, 'success')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#4F46E5] hover:bg-[#3730A3] text-white text-sm font-bold transition-all"
              >
                <Save className="w-4 h-4" /> Save & Sync to Vendor Read-Only View
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* Tab 3: Coupon Generator */
function CouponManagerTab({ toast }: { toast: (m: string, t?: 'success' | 'error') => void }) {
  const [coupons, setCoupons] = useState<CouponRecord[]>(MOCK_COUPONS);
  const [form, setForm] = useState({
    type: '% Off' as '% Off' | 'Flat ₹ Off',
    value: '',
    applicableTo: 'All Products',
    funder: 'Platform' as 'Platform' | 'Vendor',
    expiry: '',
  });

  function generateCoupon() {
    if (!form.value || !form.expiry) { toast('Please fill all required fields.', 'error'); return; }
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    const code = `TN-${rand}`;
    const newCoupon: CouponRecord = {
      id: `cp${Date.now()}`, code,
      type: form.type, value: parseFloat(form.value),
      funder: form.funder, applicableTo: form.applicableTo,
      expiry: form.expiry, used: 0, limit: 1000, status: 'Active',
    };
    setCoupons(prev => [newCoupon, ...prev]);
    toast(`Cryptographic coupon code ${code} generated successfully.`, 'success');
    setForm({ type: '% Off', value: '', applicableTo: 'All Products', funder: 'Platform', expiry: '' });
  }

  const statusCls: Record<string, string> = {
    Active:  'bg-emerald-50 text-emerald-700 border border-emerald-200',
    Expired: 'bg-slate-100 text-slate-500',
    Used:    'bg-blue-50 text-blue-700 border border-blue-200',
  };

  return (
    <div className="space-y-6">
      {/* Generator form */}
      <div className="card p-6">
        <h3 className="font-black text-slate-800 text-lg mb-5">Generate New Coupon</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Code Type</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))} className="input-field">
              <option value="% Off">% Off</option>
              <option value="Flat ₹ Off">Flat ₹ Off</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
              Value ({form.type === '% Off' ? '%' : '₹'})
            </label>
            <input type="number" min={0} value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} className="input-field" placeholder="e.g. 10" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Applicable To</label>
            <input type="text" value={form.applicableTo} onChange={e => setForm(f => ({ ...f, applicableTo: e.target.value }))} className="input-field" placeholder="All Products" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Funder</label>
            <select value={form.funder} onChange={e => setForm(f => ({ ...f, funder: e.target.value as any }))} className="input-field">
              <option value="Platform">Platform</option>
              <option value="Vendor">Vendor</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Expiry Date</label>
            <input type="date" value={form.expiry} onChange={e => setForm(f => ({ ...f, expiry: e.target.value }))} className="input-field" />
          </div>
        </div>
        <button onClick={generateCoupon} className="btn-primary">
          <Tag className="w-4 h-4" /> Generate Cryptographic Code →
        </button>
      </div>

      {/* Existing coupons */}
      <div className="card overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Existing Coupons</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['Code', 'Type', 'Value', 'Funder', 'Applicable To', 'Expiry', 'Usage', 'Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coupons.map((cp, i) => (
                <tr key={cp.id} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                  <td className="px-4 py-3"><span className="font-mono font-bold text-[#4F46E5] text-sm bg-[#4F46E5]/5 px-2 py-0.5 rounded-lg">{cp.code}</span></td>
                  <td className="px-4 py-3 text-sm text-slate-700">{cp.type}</td>
                  <td className="px-4 py-3 font-bold text-slate-900">{cp.type === '% Off' ? `${cp.value}%` : `₹${cp.value}`}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{cp.funder}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{cp.applicableTo}</td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-600">{cp.expiry}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{cp.used}/{cp.limit}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${statusCls[cp.status] || ''}`}>{cp.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* Tab 4: Settlement Manager */
function SettlementManagerTab({ toast }: { toast: (m: string, t?: 'success' | 'error') => void }) {
  const [subTab, setSubTab]           = useState<SettlementSubTab>('ledger');
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [batches, setBatches]         = useState<SettlementBatch[]>(MOCK_BATCHES);
  const [utrInput, setUtrInput]       = useState('');

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const eligibleItems = LEDGER_ITEMS.filter(i => i.status === 'ELIGIBLE');
  const selectedTotal = eligibleItems
    .filter(i => selected.has(i.id))
    .reduce((a, i) => a + i.amount, 0);

  function createBatch() {
    if (selected.size === 0) { toast('Select at least one sub-order.', 'error'); return; }
    const batch: SettlementBatch = {
      id: `b${Date.now()}`,
      batchNo: `BATCH-NOV-${String(batches.length + 1).padStart(3, '0')}`,
      status: 'BATCH_DRAFT',
      totalAmount: selectedTotal,
      orderCount: selected.size,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setBatches(prev => [batch, ...prev]);
    setSelected(new Set());
    toast('Settlement batch created successfully.', 'success');
  }

  function approveBatch(batchId: string) {
    if (!utrInput.trim()) { toast('UTR number is required for approval.', 'error'); return; }
    setBatches(prev => prev.map(b => b.id === batchId ? { ...b, status: 'PAID', utr: utrInput } : b));
    setUtrInput('');
    toast('Payout approved & executed. UTR recorded.', 'success');
  }

  /* Sample invoice data */
  const invoiceLines = [
    { desc: 'High-Tenacity Poly Thread Tex-40', qty: 500, rate: 2.10, total: 1050.00, hsn: '5402.11', gstPct: 12 },
    { desc: 'Fusible Microdot Interlining',     qty: 50,  rate: 12.40,total: 620.00,  hsn: '5903',    gstPct: 12 },
  ];
  const invSubtotal  = invoiceLines.reduce((a, l) => a + l.total, 0);
  const invGst       = invoiceLines.reduce((a, l) => a + l.total * l.gstPct / 100, 0);
  const invTotal     = invSubtotal + invGst;
  const commission   = invSubtotal * 0.20;
  const tds          = commission * 0.01;
  const settlement   = commission - tds;

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {[{ key: 'ledger', label: 'Settlement Ledger' }, { key: 'invoice', label: 'Invoice Preview' }].map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key as SettlementSubTab)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${subTab === t.key ? 'bg-white text-[#4F46E5] shadow' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'ledger' && (
        <div className="space-y-5">
          {/* Eligible orders */}
          <div className="card overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-bold text-slate-800">Eligible Sub-Orders</h3>
                <p className="text-xs text-slate-400 mt-0.5">Return deadline must have passed before settlement</p>
              </div>
              <div className="flex items-center gap-3">
                {selected.size > 0 && (
                  <span className="text-sm font-bold text-[#4F46E5]">
                    {selected.size} selected · ₹{selectedTotal.toFixed(2)}
                  </span>
                )}
                <button onClick={createBatch} className="btn-primary text-sm py-2">
                  <Plus className="w-4 h-4" /> Create Settlement Batch →
                </button>
              </div>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 w-10"></th>
                  {['Sub-Order ID', 'Vendor', 'Amount', 'Return Deadline', 'Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LEDGER_ITEMS.map((item, i) => (
                  <tr key={item.id} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                    <td className="px-4 py-3">
                      {item.status === 'ELIGIBLE' && (
                        <input type="checkbox" checked={selected.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="w-4 h-4 accent-[#4F46E5] rounded cursor-pointer"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3"><span className="id-chip">{item.orderId}</span></td>
                    <td className="px-4 py-3 text-sm text-slate-700">{item.vendor}</td>
                    <td className="px-4 py-3 font-bold text-slate-900">₹{item.amount.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      {item.returnDeadlinePassed
                        ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-semibold"><CheckCircle2 className="w-3 h-3" /> Passed</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 font-semibold"><Clock className="w-3 h-3" /> Active</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${item.status === 'ELIGIBLE' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-500'}`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Batches */}
          <div className="card overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Settlement Batches</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {batches.map(batch => (
                <div key={batch.id} className="p-5 flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <span className="font-mono font-bold text-slate-800 text-sm">{batch.batchNo}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <BatchStatusBadge status={batch.status} />
                      <span className="text-xs text-slate-400">{batch.orderCount} orders · Created {batch.createdAt}</span>
                    </div>
                    {batch.utr && <p className="text-xs font-mono text-emerald-600 mt-1">UTR: {batch.utr}</p>}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-black text-xl text-slate-900">₹{batch.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    {batch.status === 'PENDING_APPROVAL' && (
                      <div className="flex items-center gap-2">
                        <input
                          type="text" placeholder="Enter UTR"
                          value={utrInput} onChange={e => setUtrInput(e.target.value)}
                          className="input-field w-40 text-sm py-2"
                        />
                        <button onClick={() => approveBatch(batch.id)} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-all">
                          <Check className="w-4 h-4" /> Approve & Execute Payout
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {subTab === 'invoice' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Customer Tax Invoice */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-800">Customer Tax Invoice</h3>
                <p className="text-xs text-slate-400 mt-0.5">Seller-to-Buyer | GST Compliant</p>
              </div>
              <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">INV-2026-8841</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl"><p className="font-bold text-slate-700">Billed From (Seller)</p><p className="text-slate-500 mt-0.5">ThreadWorks Manufacturing Pvt Ltd<br/>GSTIN: 27AAACT2727Q1ZV</p></div>
              <div className="p-3 bg-slate-50 rounded-xl"><p className="font-bold text-slate-700">Billed To (Buyer)</p><p className="text-slate-500 mt-0.5">Fashion Forward Pvt Ltd<br/>GSTIN: 29AAAFF1234Q1ZV</p></div>
            </div>
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-100"><th className="p-2 text-left font-bold text-slate-500">Description</th><th className="p-2 text-right font-bold text-slate-500">HSN</th><th className="p-2 text-right font-bold text-slate-500">Qty</th><th className="p-2 text-right font-bold text-slate-500">Rate</th><th className="p-2 text-right font-bold text-slate-500">Total</th></tr></thead>
              <tbody>
                {invoiceLines.map((l, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="p-2 text-slate-700">{l.desc}</td>
                    <td className="p-2 text-right font-mono text-slate-500">{l.hsn}</td>
                    <td className="p-2 text-right">{l.qty}</td>
                    <td className="p-2 text-right">₹{l.rate}</td>
                    <td className="p-2 text-right font-bold">₹{l.total.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="border-t border-slate-200"><td colSpan={4} className="p-2 text-right font-bold text-slate-600">Subtotal</td><td className="p-2 text-right font-bold">₹{invSubtotal.toFixed(2)}</td></tr>
                <tr><td colSpan={4} className="p-2 text-right text-slate-500">IGST @ 12%</td><td className="p-2 text-right">₹{invGst.toFixed(2)}</td></tr>
                <tr className="bg-[#4F46E5]/5"><td colSpan={4} className="p-2 text-right font-black text-[#4F46E5]">Grand Total</td><td className="p-2 text-right font-black text-[#4F46E5]">₹{invTotal.toFixed(2)}</td></tr>
              </tbody>
            </table>
            <button onClick={() => toast('Customer invoice PDF downloaded.', 'success')} className="btn-secondary text-sm w-full justify-center py-2.5">
              <Download className="w-4 h-4" /> Download Customer Invoice PDF
            </button>
          </div>

          {/* TrimNova Settlement Invoice */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-black text-slate-800">TrimNova Settlement Invoice</h3>
                <p className="text-xs text-slate-400 mt-0.5">Commission Calculation Breakdown</p>
              </div>
              <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">STLM-2026-0042</span>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl text-xs space-y-2">
              {[
                { label: 'Order Subtotal (Gross GMV)',       value: invSubtotal, cls: '' },
                { label: 'TrimNova Platform Commission (20%)', value: -commission, cls: 'text-[#EF4444]' },
                { label: 'TDS Deducted @ 1%',                value: -tds,        cls: 'text-amber-600' },
                { label: 'Net Settlement Amount',             value: invSubtotal - commission - tds, cls: 'text-emerald-600 font-black text-base' },
              ].map(r => (
                <div key={r.label} className={`flex justify-between ${r.cls || 'text-slate-700'}`}>
                  <span>{r.label}</span>
                  <span className="font-mono font-bold">₹{Math.abs(r.value).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl"><p className="font-bold text-slate-700">Vendor</p><p className="text-slate-500 mt-0.5">ThreadWorks Manufacturing<br/>Bank: HDFC •••• 4421</p></div>
              <div className="p-3 bg-slate-50 rounded-xl"><p className="font-bold text-slate-700">TDS Certificate</p><p className="text-slate-500 mt-0.5">Form 16A to be issued<br/>Q3 FY 2026-27</p></div>
            </div>
            <button onClick={() => toast('Settlement invoice PDF downloaded.', 'success')} className="btn-secondary text-sm w-full justify-center py-2.5">
              <Download className="w-4 h-4" /> Download Settlement Invoice PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Tab 5: Platform Config */
function PlatformConfigTab({ toast }: { toast: (m: string, t?: 'success' | 'error') => void }) {
  const [config, setConfig] = useState<ConfigKey[]>(CONFIG_KEYS);

  function updateConfig(key: string, val: string) {
    setConfig(prev => prev.map(c => c.key === key ? { ...c, value: val } : c));
  }

  const groups = [...new Set(config.map(c => c.group))];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 font-medium">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        Configuration changes take effect immediately. Ensure values are validated before saving.
      </div>
      {groups.map(group => (
        <div key={group} className="card overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider">{group}</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {config.filter(c => c.group === group).map(c => (
              <div key={c.key} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm">{c.label}</p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{c.key}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text" value={c.value}
                    onChange={e => updateConfig(c.key, e.target.value)}
                    className="w-32 text-center font-mono font-bold text-[#4F46E5] px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5]/20 text-sm"
                  />
                  <span className="text-xs text-slate-400 w-20 flex-shrink-0">{c.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <button
        onClick={() => toast('Platform configuration saved successfully.', 'success')}
        className="btn-primary"
      >
        <Save className="w-4 h-4" /> Save All Configuration
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════════════════════════════════════ */
export default function AdminConsole() {
  const [activeTab, setActiveTab] = useState<AdminTab>('escalations');
  const { toasts, add: toast }    = useMiniToast();

  const tabs: { key: AdminTab; label: string; icon: React.ReactNode }[] = [
    { key: 'escalations', label: 'Escalations',     icon: <AlertTriangle className="w-4 h-4" /> },
    { key: 'margins',     label: 'Margin % Manager',icon: <BarChart3 className="w-4 h-4" /> },
    { key: 'coupons',     label: 'Coupon Generator',icon: <Tag className="w-4 h-4" /> },
    { key: 'settlements', label: 'Settlement Mgr',  icon: <Receipt className="w-4 h-4" /> },
    { key: 'config',      label: 'Platform Config', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#F4F6FB]">
      <ToastStack toasts={toasts} />

      {/* Header */}
      <div className="bg-[#0F172A] border-b border-white/10 px-6 py-4">
        <div className="max-w-screen-xl mx-auto">
          <h1 className="text-xl font-black text-white">Admin Console</h1>
          <p className="text-slate-400 text-sm mt-0.5">TrimNova Platform Administration</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-200 px-6">
        <div className="max-w-screen-xl mx-auto flex gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-4 text-sm font-semibold whitespace-nowrap border-b-2 transition-all ${
                activeTab === tab.key
                  ? 'border-[#4F46E5] text-[#4F46E5]'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              {tab.icon} {tab.label}
              {tab.key === 'escalations' && (
                <span className="ml-1 w-5 h-5 rounded-full bg-[#EF4444] text-white text-xs font-black flex items-center justify-center">1</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        {activeTab === 'escalations' && <EscalationsTab toast={toast} />}
        {activeTab === 'margins'     && <MarginManagerTab toast={toast} />}
        {activeTab === 'coupons'     && <CouponManagerTab toast={toast} />}
        {activeTab === 'settlements' && <SettlementManagerTab toast={toast} />}
        {activeTab === 'config'      && <PlatformConfigTab toast={toast} />}
      </div>
    </div>
  );
}
