/**
 * SettlementBatchView.tsx — Detailed view of a single Finance settlement batch
 * Maker-checker: Preparer cannot self-approve. Approver sees "Approve & Release".
 */

import React, { useState } from 'react';
import Decimal from 'decimal.js';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Clock,
  AlertTriangle,
  User,
  Lock,
  ShieldAlert,
  Download,
  FileText,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';

/* ─── Types ─────────────────────────────────────────────────────────────── */

type BatchStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'PAID';

interface BatchLineItem {
  vendorId:          string;
  vendorName:        string;
  grossSale:         Decimal;
  commissionPct:     number;
  commissionAmount:  Decimal;
  tdsPct:            number;
  tdsAmount:         Decimal;
  refundAdjustment:  Decimal;
  netPayable:        Decimal;
}

interface BatchDetail {
  id:          string;
  batchNo:     string;
  createdDate: string;
  preparedBy:  string;
  approvedBy?: string;
  utr?:        string;
  status:      BatchStatus;
  lines:       BatchLineItem[];
}

/* ─── Mock Data ──────────────────────────────────────────────────────────── */

const BATCH_DATA: Record<string, BatchDetail> = {
  b1: {
    id: 'b1', batchNo: 'BATCH-NOV-001', createdDate: '2026-11-01',
    preparedBy: 'finance.preparer', approvedBy: 'finance.approver',
    utr: 'HDFC20261101789123', status: 'PAID',
    lines: [
      { vendorId: 'VND-0021', vendorName: 'ThreadWorks Manufacturing Pvt Ltd', grossSale: new Decimal('48200.00'), commissionPct: 18, commissionAmount: new Decimal('8676.00'),  tdsPct: 1, tdsAmount: new Decimal('86.76'),  refundAdjustment: new Decimal('0.00'),   netPayable: new Decimal('39437.24') },
      { vendorId: 'VND-0034', vendorName: 'Ribbonex India Pvt Ltd',            grossSale: new Decimal('37500.00'), commissionPct: 20, commissionAmount: new Decimal('7500.00'),  tdsPct: 1, tdsAmount: new Decimal('75.00'),  refundAdjustment: new Decimal('1200.00'), netPayable: new Decimal('28725.00') },
      { vendorId: 'VND-0056', vendorName: 'ZipKing International',              grossSale: new Decimal('22650.00'), commissionPct: 22, commissionAmount: new Decimal('4983.00'),  tdsPct: 1, tdsAmount: new Decimal('49.83'),  refundAdjustment: new Decimal('0.00'),   netPayable: new Decimal('17617.17') },
      { vendorId: 'VND-0071', vendorName: 'FuseRight Textiles Pvt Ltd',         grossSale: new Decimal('15300.00'), commissionPct: 16, commissionAmount: new Decimal('2448.00'),  tdsPct: 1, tdsAmount: new Decimal('24.48'),  refundAdjustment: new Decimal('500.00'), netPayable: new Decimal('12327.52') },
      { vendorId: 'VND-0088', vendorName: 'TagTech Solutions',                  grossSale: new Decimal('18200.00'), commissionPct: 18, commissionAmount: new Decimal('3276.00'),  tdsPct: 1, tdsAmount: new Decimal('32.76'),  refundAdjustment: new Decimal('0.00'),   netPayable: new Decimal('14891.24') },
    ],
  },
  b3: {
    id: 'b3', batchNo: 'BATCH-NOV-003', createdDate: '2026-11-08',
    preparedBy: 'finance.preparer', status: 'PENDING_APPROVAL',
    lines: [
      { vendorId: 'VND-0021', vendorName: 'ThreadWorks Manufacturing Pvt Ltd', grossSale: new Decimal('62400.00'), commissionPct: 18, commissionAmount: new Decimal('11232.00'), tdsPct: 1, tdsAmount: new Decimal('112.32'), refundAdjustment: new Decimal('0.00'),   netPayable: new Decimal('51055.68') },
      { vendorId: 'VND-0056', vendorName: 'ZipKing International',              grossSale: new Decimal('41800.00'), commissionPct: 22, commissionAmount: new Decimal('9196.00'),  tdsPct: 1, tdsAmount: new Decimal('91.96'),  refundAdjustment: new Decimal('800.00'), netPayable: new Decimal('31712.04') },
      { vendorId: 'VND-0092', vendorName: 'AccessoryPlus Pvt Ltd',             grossSale: new Decimal('28550.00'), commissionPct: 20, commissionAmount: new Decimal('5710.00'),  tdsPct: 1, tdsAmount: new Decimal('57.10'),  refundAdjustment: new Decimal('0.00'),   netPayable: new Decimal('22782.90') },
    ],
  },
  b4: {
    id: 'b4', batchNo: 'BATCH-NOV-004', createdDate: '2026-11-10',
    preparedBy: 'finance.preparer', status: 'DRAFT',
    lines: [
      { vendorId: 'VND-0034', vendorName: 'Ribbonex India Pvt Ltd',            grossSale: new Decimal('29750.00'), commissionPct: 20, commissionAmount: new Decimal('5950.00'),  tdsPct: 1, tdsAmount: new Decimal('59.50'),  refundAdjustment: new Decimal('0.00'),   netPayable: new Decimal('23740.50') },
      { vendorId: 'VND-0071', vendorName: 'FuseRight Textiles Pvt Ltd',         grossSale: new Decimal('18200.00'), commissionPct: 16, commissionAmount: new Decimal('2912.00'),  tdsPct: 1, tdsAmount: new Decimal('29.12'),  refundAdjustment: new Decimal('350.00'), netPayable: new Decimal('14908.88') },
    ],
  },
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function fmt(d: Decimal): string {
  return '₹' + d.toNumber().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatusPill({ status }: { status: BatchStatus }) {
  const map: Record<BatchStatus, { cls: string; label: string; icon: React.ReactNode }> = {
    DRAFT:            { cls: 'bg-slate-100 text-slate-600 border border-slate-200',      label: 'Draft',            icon: <Clock className="w-3.5 h-3.5" />         },
    PENDING_APPROVAL: { cls: 'bg-amber-50 text-amber-700 border border-amber-300',       label: 'Pending Approval', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    PAID:             { cls: 'bg-emerald-50 text-emerald-700 border border-emerald-300', label: 'Paid',             icon: <CheckCircle2 className="w-3.5 h-3.5" />  },
  };
  const { cls, label, icon } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold ${cls}`}>
      {icon}{label}
    </span>
  );
}

type ToastItem = { id: number; msg: string; type: 'success' | 'error' };
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
        <div key={t.id} className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white animate-slide-down pointer-events-auto ${t.type === 'success' ? 'bg-teal-600' : 'bg-red-500'}`}>
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />{t.msg}
        </div>
      ))}
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */

export default function SettlementBatchView() {
  const { id }                   = useParams<{ id: string }>();
  const { user }                 = useAuth();
  const { toasts, add: toast }   = useMiniToast();
  const [utrInput, setUtrInput]  = useState('');

  const batch = id ? BATCH_DATA[id] : undefined;

  /* Role and maker-checker logic */
  const userId         = user?.userId ?? '';
  const role           = user?.role ?? '';
  const isApproverRole = role === 'FINANCE_APPROVER' || role === 'ADMIN' || role === 'SUPERUSER';
  const isPreparerRole = role === 'FINANCE_PREPARER' || role === 'ADMIN' || role === 'SUPERUSER';
  const isSelfPrepared = batch?.preparedBy === userId;
  const canApprove     = isApproverRole && !isSelfPrepared && batch?.status === 'PENDING_APPROVAL';
  const awaitingApproval = isPreparerRole && isSelfPrepared && batch?.status === 'PENDING_APPROVAL';

  /* ── Not found ── */
  if (!batch) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <span className="text-5xl">🔍</span>
        <p className="text-slate-500 font-semibold">Batch not found.</p>
        <Link to="/finance/settlements" className="text-teal-600 text-sm font-bold hover:underline flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Settlement Batches
        </Link>
      </div>
    );
  }

  /* Computed totals */
  const totals = batch.lines.reduce(
    (acc, line) => ({
      grossSale:        acc.grossSale.plus(line.grossSale),
      commissionAmount: acc.commissionAmount.plus(line.commissionAmount),
      tdsAmount:        acc.tdsAmount.plus(line.tdsAmount),
      refundAdjustment: acc.refundAdjustment.plus(line.refundAdjustment),
      netPayable:       acc.netPayable.plus(line.netPayable),
    }),
    {
      grossSale:        new Decimal(0),
      commissionAmount: new Decimal(0),
      tdsAmount:        new Decimal(0),
      refundAdjustment: new Decimal(0),
      netPayable:       new Decimal(0),
    }
  );

  function handleApprove() {
    if (!utrInput.trim()) {
      toast('UTR number is required to release payout.', 'error');
      return;
    }
    toast(`Batch ${batch!.batchNo} approved & released. UTR: ${utrInput}`, 'success');
    setUtrInput('');
  }

  return (
    <>
      <ToastStack toasts={toasts} />
      <div className="space-y-6">

        {/* Back link */}
        <Link
          to="/finance/settlements"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600 font-semibold transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Settlement Batches
        </Link>

        {/* ── Batch Header Card ───────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-teal-600 flex items-center justify-center flex-shrink-0">
                <Banknote className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-xl font-black text-slate-900 font-mono">{batch.batchNo}</h1>
                  <StatusPill status={batch.status} />
                </div>
                <p className="text-xs text-slate-400 mt-1">Created {batch.createdDate} · {batch.lines.length} vendor{batch.lines.length !== 1 ? 's' : ''}</p>
              </div>
            </div>

            {/* Metadata grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-slate-400 font-semibold flex items-center gap-1 mb-1">
                  <User className="w-3 h-3" /> Prepared By
                </p>
                <p className="font-mono font-bold text-slate-800">{batch.preparedBy}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-slate-400 font-semibold flex items-center gap-1 mb-1">
                  <CheckCircle2 className="w-3 h-3" /> Approved By
                </p>
                <p className="font-mono font-bold text-slate-800">{batch.approvedBy ?? '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-slate-400 font-semibold flex items-center gap-1 mb-1">
                  <FileText className="w-3 h-3" /> UTR Reference
                </p>
                <p className={`font-mono font-bold ${batch.utr ? 'text-teal-700' : 'text-slate-400'}`}>
                  {batch.utr ?? 'Not yet released'}
                </p>
              </div>
            </div>
          </div>

          {/* Summary figures */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 pt-5 border-t border-slate-100">
            {[
              { label: 'Gross Sale',       value: fmt(totals.grossSale),        color: 'text-slate-900' },
              { label: 'Total Commission', value: `−${fmt(totals.commissionAmount)}`, color: 'text-red-600' },
              { label: 'TDS Deducted',     value: `−${fmt(totals.tdsAmount)}`,  color: 'text-amber-600' },
              { label: 'Net Payable',      value: fmt(totals.netPayable),        color: 'text-teal-700 text-xl font-black' },
            ].map(item => (
              <div key={item.label} className="text-center">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">{item.label}</p>
                <p className={`font-mono font-bold ${item.color}`}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Approval Change Warning ─────────────────────────────────── */}
        <div className="flex items-start gap-3 p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl">
          <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-black text-amber-800">Post-Approval Change Warning</p>
            <p className="text-xs text-amber-700 mt-0.5">
              If any line-item amount is modified after approval, the approval is automatically voided and the batch
              must be re-submitted for approval by the Finance Approver. All changes are audit-logged.
            </p>
          </div>
        </div>

        {/* ── Maker-Checker Action Panel ──────────────────────────────── */}
        {batch.status === 'PENDING_APPROVAL' && (
          <>
            {/* Awaiting approval message (preparer's view) */}
            {awaitingApproval && (
              <div className="flex items-center gap-3 p-5 bg-blue-50 border-2 border-blue-200 rounded-2xl">
                <Lock className="w-5 h-5 text-blue-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-black text-blue-800">Awaiting Approval from Finance Approver</p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    You prepared this batch. Maker-checker rules prevent self-approval.
                    A Finance Approver must review and release this batch.
                  </p>
                </div>
              </div>
            )}

            {/* Approve & Release panel (approver's view) */}
            {canApprove && (
              <div className="bg-teal-50 border-2 border-teal-300 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 className="w-5 h-5 text-teal-600" />
                  <h3 className="text-sm font-black text-teal-800">Finance Approver: Review & Release</h3>
                </div>
                <p className="text-xs text-teal-700 mb-4">
                  By approving, you confirm all line items are accurate. Payout will be queued immediately.
                  Enter the bank UTR reference number before approving.
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-teal-700 uppercase tracking-wider">UTR Reference Number *</label>
                    <input
                      type="text"
                      value={utrInput}
                      onChange={e => setUtrInput(e.target.value)}
                      placeholder="e.g. HDFC20261110123456"
                      className="font-mono text-sm px-4 py-2.5 rounded-xl border-2 border-teal-200 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200/50 bg-white w-72"
                    />
                  </div>
                  <button
                    onClick={handleApprove}
                    className="mt-5 flex items-center gap-2 px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm transition-all"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Approve & Release Payout
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Line Items Table ────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="font-black text-slate-800">Settlement Line Items</h2>
            <button
              onClick={() => toast(`Batch ${batch.batchNo} exported.`, 'success')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {[
                    'Vendor', 'Gross Sale',
                    'Comm %', 'Commission',
                    'TDS %', 'TDS',
                    'Refund Adj.', 'Net Payable',
                  ].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batch.lines.map((line, i) => (
                  <tr key={line.vendorId} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-slate-800 max-w-[14rem] truncate">{line.vendorName}</p>
                      <p className="text-xs font-mono text-slate-400">{line.vendorId}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-slate-900 font-bold">{fmt(line.grossSale)}</td>
                    <td className="px-4 py-3 font-mono text-sm font-bold text-[#4F46E5]">{line.commissionPct}%</td>
                    <td className="px-4 py-3 font-mono text-sm text-red-600 font-bold">−{fmt(line.commissionAmount)}</td>
                    <td className="px-4 py-3 font-mono text-sm font-bold text-amber-600">{line.tdsPct}%</td>
                    <td className="px-4 py-3 font-mono text-sm text-amber-600 font-bold">−{fmt(line.tdsAmount)}</td>
                    <td className="px-4 py-3 font-mono text-sm text-slate-500">
                      {line.refundAdjustment.gt(0) ? `−${fmt(line.refundAdjustment)}` : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm font-black text-teal-700">{fmt(line.netPayable)}</td>
                  </tr>
                ))}
              </tbody>

              {/* Totals row */}
              <tfoot>
                <tr className="bg-teal-50 border-t-2 border-teal-200 font-black">
                  <td className="px-4 py-3 text-xs font-black text-teal-800 uppercase tracking-wider">
                    Grand Total ({batch.lines.length} vendor{batch.lines.length !== 1 ? 's' : ''})
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-slate-900">{fmt(totals.grossSale)}</td>
                  <td />
                  <td className="px-4 py-3 font-mono text-sm text-red-600">−{fmt(totals.commissionAmount)}</td>
                  <td />
                  <td className="px-4 py-3 font-mono text-sm text-amber-600">−{fmt(totals.tdsAmount)}</td>
                  <td className="px-4 py-3 font-mono text-sm text-slate-500">
                    {totals.refundAdjustment.gt(0) ? `−${fmt(totals.refundAdjustment)}` : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-base text-teal-700">{fmt(totals.netPayable)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

      </div>
    </>
  );
}
