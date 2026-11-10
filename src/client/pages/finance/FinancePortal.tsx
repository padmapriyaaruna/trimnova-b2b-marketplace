/**
 * FinancePortal.tsx — TrimNova Finance Portal
 * Tab 1: Settlement Batches (maker-checker workflow)
 * Tab 2: Commission Invoices
 */

import React, { useState } from 'react';
import Decimal from 'decimal.js';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Banknote,
  FileText,
  Plus,
  CheckCircle2,
  Clock,
  Download,
  ArrowRight,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';

/* ─── Types ─────────────────────────────────────────────────────────────── */

type FinanceTab = 'settlements' | 'invoices';
type BatchStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'PAID';

interface SettlementBatch {
  id:              string;
  batchNo:         string;
  createdDate:     string;
  vendorCount:     number;
  grossAmount:     Decimal;
  totalCommission: Decimal;
  netPayable:      Decimal;
  status:          BatchStatus;
  preparedBy:      string;
  approvedBy?:     string;
  utr?:            string;
}

interface CommissionInvoice {
  id:          string;
  invoiceNo:   string;
  issuedDate:  string;
  periodFrom:  string;
  periodTo:    string;
  vendorName:  string;
  grossSale:   Decimal;
  commPct:     number;
  commAmount:  Decimal;
  gstAmount:   Decimal;
  totalAmount: Decimal;
}

/* ─── Mock Data ──────────────────────────────────────────────────────────── */

const MOCK_BATCHES: SettlementBatch[] = [
  {
    id: 'b1', batchNo: 'BATCH-NOV-001', createdDate: '2026-11-01',
    vendorCount: 12, preparedBy: 'finance.preparer',
    grossAmount:     new Decimal('4_82_350.00'),
    totalCommission: new Decimal('86_823.00'),
    netPayable:      new Decimal('3_95_527.00'),
    status: 'PAID', approvedBy: 'finance.approver', utr: 'HDFC20261101789123',
  },
  {
    id: 'b2', batchNo: 'BATCH-NOV-002', createdDate: '2026-11-05',
    vendorCount: 8, preparedBy: 'finance.preparer',
    grossAmount:     new Decimal('2_34_180.00'),
    totalCommission: new Decimal('42_152.40'),
    netPayable:      new Decimal('1_92_027.60'),
    status: 'PAID', approvedBy: 'finance.approver', utr: 'ICIC20261105234567',
  },
  {
    id: 'b3', batchNo: 'BATCH-NOV-003', createdDate: '2026-11-08',
    vendorCount: 6, preparedBy: 'finance.preparer',
    grossAmount:     new Decimal('1_82_750.00'),
    totalCommission: new Decimal('32_895.00'),
    netPayable:      new Decimal('1_49_855.00'),
    status: 'PENDING_APPROVAL',
  },
  {
    id: 'b4', batchNo: 'BATCH-NOV-004', createdDate: '2026-11-10',
    vendorCount: 4, preparedBy: 'finance.preparer',
    grossAmount:     new Decimal('97_640.00'),
    totalCommission: new Decimal('17_575.20'),
    netPayable:      new Decimal('80_064.80'),
    status: 'DRAFT',
  },
];

const MOCK_INVOICES: CommissionInvoice[] = [
  {
    id: 'inv1', invoiceNo: 'TNINV-2026-0041', issuedDate: '2026-11-01',
    periodFrom: '2026-10-01', periodTo: '2026-10-31',
    vendorName: 'ThreadWorks Manufacturing Pvt Ltd',
    grossSale:   new Decimal('48_200.00'),
    commPct:     18, commAmount: new Decimal('8_676.00'),
    gstAmount:   new Decimal('1_561.68'),
    totalAmount: new Decimal('10_237.68'),
  },
  {
    id: 'inv2', invoiceNo: 'TNINV-2026-0042', issuedDate: '2026-11-01',
    periodFrom: '2026-10-01', periodTo: '2026-10-31',
    vendorName: 'Ribbonex India Pvt Ltd',
    grossSale:   new Decimal('37_500.00'),
    commPct:     20, commAmount: new Decimal('7_500.00'),
    gstAmount:   new Decimal('1_350.00'),
    totalAmount: new Decimal('8_850.00'),
  },
  {
    id: 'inv3', invoiceNo: 'TNINV-2026-0043', issuedDate: '2026-11-01',
    periodFrom: '2026-10-01', periodTo: '2026-10-31',
    vendorName: 'ZipKing International',
    grossSale:   new Decimal('22_650.00'),
    commPct:     22, commAmount: new Decimal('4_983.00'),
    gstAmount:   new Decimal('896.94'),
    totalAmount: new Decimal('5_879.94'),
  },
  {
    id: 'inv4', invoiceNo: 'TNINV-2026-0044', issuedDate: '2026-11-05',
    periodFrom: '2026-11-01', periodTo: '2026-11-04',
    vendorName: 'FuseRight Textiles Pvt Ltd',
    grossSale:   new Decimal('15_300.00'),
    commPct:     16, commAmount: new Decimal('2_448.00'),
    gstAmount:   new Decimal('440.64'),
    totalAmount: new Decimal('2_888.64'),
  },
];

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function fmt(d: Decimal): string {
  return '₹' + d.toNumber().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatusPill({ status }: { status: BatchStatus }) {
  const map: Record<BatchStatus, { cls: string; label: string; icon: React.ReactNode }> = {
    DRAFT:            { cls: 'bg-slate-100 text-slate-600 border border-slate-200',           label: 'Draft',            icon: <Clock className="w-3 h-3" /> },
    PENDING_APPROVAL: { cls: 'bg-amber-50 text-amber-700 border border-amber-300',            label: 'Pending Approval', icon: <AlertTriangle className="w-3 h-3" /> },
    PAID:             { cls: 'bg-emerald-50 text-emerald-700 border border-emerald-300',      label: 'Paid',             icon: <CheckCircle2 className="w-3 h-3" /> },
  };
  const { cls, label, icon } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${cls}`}>
      {icon}{label}
    </span>
  );
}

type ToastItem = { id: number; msg: string };
function useMiniToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  function add(msg: string) {
    const id = Date.now();
    setToasts(p => [...p, { id, msg }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }
  return { toasts, add };
}
function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white bg-teal-600 animate-slide-down pointer-events-auto">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />{t.msg}
        </div>
      ))}
    </div>
  );
}

/* ─── Settlement Batches Tab ─────────────────────────────────────────────── */

function SettlementBatchesTab({
  batches,
  role,
  toast,
}: {
  batches: SettlementBatch[];
  role: string;
  toast: (m: string) => void;
}) {
  const isPreparer = role === 'FINANCE_PREPARER' || role === 'ADMIN' || role === 'SUPERUSER';
  const isApprover = role === 'FINANCE_APPROVER' || role === 'ADMIN' || role === 'SUPERUSER';

  const { user } = useAuth();
  const userId = user?.userId ?? '';

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-slate-500">
          {batches.length} batch{batches.length !== 1 ? 'es' : ''} · Showing all
        </p>
        {isPreparer && (
          <button
            onClick={() => toast('New settlement batch draft created.')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold transition-all"
          >
            <Plus className="w-4 h-4" /> Create Batch
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['Batch #', 'Created Date', '# Vendors', 'Gross Amount', 'Total Commission', 'Net Payable', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.map((batch, i) => {
                const isSelfPrepared = batch.preparedBy === userId;
                const canApprove     = isApprover && !isSelfPrepared && batch.status === 'PENDING_APPROVAL';
                const selfApproveBlocked = isApprover && isSelfPrepared && batch.status === 'PENDING_APPROVAL';

                return (
                  <tr key={batch.id} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-bold text-[#4F46E5] bg-[#4F46E5]/8 px-2 py-0.5 rounded-lg">
                        {batch.batchNo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 font-mono">{batch.createdDate}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-800">{batch.vendorCount}</td>
                    <td className="px-4 py-3 text-sm font-mono font-bold text-slate-900">{fmt(batch.grossAmount)}</td>
                    <td className="px-4 py-3 text-sm font-mono text-red-600 font-bold">−{fmt(batch.totalCommission)}</td>
                    <td className="px-4 py-3 text-sm font-mono font-black text-emerald-700">{fmt(batch.netPayable)}</td>
                    <td className="px-4 py-3"><StatusPill status={batch.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          to={`/finance/settlements/${batch.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-[#4F46E5] bg-[#4F46E5]/10 hover:bg-[#4F46E5]/20 rounded-lg transition-all"
                        >
                          <Eye className="w-3 h-3" /> View
                        </Link>
                        {canApprove && (
                          <button
                            onClick={() => toast(`Batch ${batch.batchNo} approved & released.`)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-all"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Approve
                          </button>
                        )}
                        {selfApproveBlocked && (
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-slate-400 bg-slate-100 rounded-lg cursor-not-allowed"
                            title="You prepared this batch — cannot self-approve"
                          >
                            <AlertTriangle className="w-3 h-3" /> Cannot Self-Approve
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Totals footer */}
            <tfoot>
              <tr className="bg-teal-50 border-t-2 border-teal-200">
                <td colSpan={3} className="px-4 py-3 text-xs font-black text-teal-800 uppercase">Totals</td>
                <td className="px-4 py-3 font-mono font-black text-slate-900">
                  {fmt(batches.reduce((a, b) => a.plus(b.grossAmount), new Decimal(0)))}
                </td>
                <td className="px-4 py-3 font-mono font-black text-red-600">
                  −{fmt(batches.reduce((a, b) => a.plus(b.totalCommission), new Decimal(0)))}
                </td>
                <td className="px-4 py-3 font-mono font-black text-emerald-700">
                  {fmt(batches.reduce((a, b) => a.plus(b.netPayable), new Decimal(0)))}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Maker-checker reminder */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
        <div>
          <p className="font-bold">Maker-Checker Enforcement</p>
          <p className="text-xs mt-0.5 text-amber-700">
            Finance Preparers create and submit batches. Finance Approvers review and release payments.
            The same person cannot approve a batch they prepared. Any post-approval amount change automatically voids the approval.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Commission Invoices Tab ────────────────────────────────────────────── */

function CommissionInvoicesTab({
  invoices,
  toast,
}: {
  invoices: CommissionInvoice[];
  toast: (m: string) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{invoices.length} invoices issued</p>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['Invoice #', 'Issued Date', 'Period', 'Vendor', 'Gross Sale', 'Comm %', 'Commission', 'GST (18%)', 'Total', 'Download'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv, i) => (
                <tr key={inv.id} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-bold text-[#4F46E5] bg-[#4F46E5]/8 px-2 py-0.5 rounded-lg">
                      {inv.invoiceNo}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 font-mono">{inv.issuedDate}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 font-mono whitespace-nowrap">
                    {inv.periodFrom} → {inv.periodTo}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-700 font-semibold max-w-[12rem] truncate">{inv.vendorName}</td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-800">{fmt(inv.grossSale)}</td>
                  <td className="px-4 py-3 text-sm font-mono font-bold text-[#4F46E5]">{inv.commPct}%</td>
                  <td className="px-4 py-3 text-sm font-mono text-red-600 font-bold">{fmt(inv.commAmount)}</td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-500">{fmt(inv.gstAmount)}</td>
                  <td className="px-4 py-3 text-sm font-mono font-black text-slate-900">{fmt(inv.totalAmount)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toast(`Invoice ${inv.invoiceNo} PDF downloaded.`)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
                    >
                      <Download className="w-3 h-3" /> PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-teal-50 border-t-2 border-teal-200">
                <td colSpan={4} className="px-4 py-3 text-xs font-black text-teal-800 uppercase">Totals</td>
                <td className="px-4 py-3 font-mono font-black text-slate-900">
                  {fmt(invoices.reduce((a, b) => a.plus(b.grossSale), new Decimal(0)))}
                </td>
                <td />
                <td className="px-4 py-3 font-mono font-black text-red-600">
                  {fmt(invoices.reduce((a, b) => a.plus(b.commAmount), new Decimal(0)))}
                </td>
                <td className="px-4 py-3 font-mono font-black text-slate-500">
                  {fmt(invoices.reduce((a, b) => a.plus(b.gstAmount), new Decimal(0)))}
                </td>
                <td className="px-4 py-3 font-mono font-black text-emerald-700">
                  {fmt(invoices.reduce((a, b) => a.plus(b.totalAmount), new Decimal(0)))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Portal ────────────────────────────────────────────────────────── */

export default function FinancePortal() {
  const { user }               = useAuth();
  const role                   = user?.role ?? '';
  const location               = useLocation();
  const navigate               = useNavigate();
  /* Derive active tab from URL path */
  const tab: FinanceTab        = location.pathname.includes('/invoices') ? 'invoices' : 'settlements';
  const { toasts, add: toast } = useMiniToast();

  const tabs: { key: FinanceTab; icon: React.ReactNode; label: string }[] = [
    { key: 'settlements', icon: <Banknote className="w-4 h-4" />, label: 'Settlement Batches' },
    { key: 'invoices',    icon: <FileText  className="w-4 h-4" />, label: 'Commission Invoices' },
  ];

  return (
    <>
      <ToastStack toasts={toasts} />
      <div className="space-y-6">

        {/* Page header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center">
            <Banknote className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900">Finance Portal</h1>
            <p className="text-xs text-slate-400 mt-0.5">Settlement management · Commission invoices · Maker-checker workflow</p>
          </div>
          <span className="ml-auto text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-xl">
            {role.replace('_', ' ')}
          </span>
        </div>

        {/* Tab strip */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-2xl p-1.5 w-fit shadow-sm">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => navigate(`/finance/${t.key}`)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                tab === t.key
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'settlements' ? (
          <SettlementBatchesTab batches={MOCK_BATCHES} role={role} toast={toast} />
        ) : (
          <CommissionInvoicesTab invoices={MOCK_INVOICES} toast={toast} />
        )}
      </div>
    </>
  );
}
