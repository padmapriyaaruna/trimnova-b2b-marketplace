/**
 * ApproverQueue.tsx — TrimNova Two-Stage Approver Console
 * Stage 1: Certificate & Compliance Audit (3-panel layout)
 * Stage 2: Margin Slab Negotiation (tab switch)
 */

import React, { useState } from 'react';
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, Shield, ShieldCheck,
  FileText, BarChart3
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────────────── */
type CertStatus    = 'APPROVED' | 'PENDING' | 'REJECTED' | 'ON_HOLD';
type SlabStatus    = 'AGREED' | 'DISPUTED' | 'PENDING';
type ApproverStage = 'certs' | 'margins';

interface CertEntry {
  id: string;
  type: string;
  label: string;
  status: CertStatus;
  issueDate?: string;
  expiryDate?: string;
}

interface VendorQueueItem {
  id: string;
  vendorName: string;
  submissionDate: string;
  slaDeadline: string;
  isOverdue: boolean;
  certCount: number;
  gstin: string;
  pan: string;
  gstinVerified: boolean;
  panVerified: boolean;
  companyType: string;
  registeredAddress: string;
  certs: CertEntry[];
}

interface MarginSlab {
  slabNo: number;
  label: string;
  qtyRange: string;
  vendorPct: number;
  trimnovanPct: number;
  status: SlabStatus;
  disputeNote?: string;
}

interface VendorMarginRecord {
  vendorId: string;
  vendorName: string;
  productName: string;
  sku: string;
  slabs: MarginSlab[];
}

/* ─── Mock Data ──────────────────────────────────────────────────────────── */
const MOCK_QUEUE: VendorQueueItem[] = [
  {
    id: 'vq1', vendorName: 'Ribbonex India Pvt Ltd', submissionDate: '2026-10-28',
    slaDeadline: '2026-11-01', isOverdue: false, certCount: 4,
    gstin: '27AAACR1234Q1ZV', pan: 'AAACR1234Q', gstinVerified: true, panVerified: true,
    companyType: 'Private Limited', registeredAddress: 'Plot 42, MIDC, Bhiwandi, Thane - 421302, Maharashtra',
    certs: [
      { id: 'c1', type: 'OEKO_TEX', label: 'OEKO-TEX® Standard 100', status: 'PENDING', issueDate: '2024-01-15', expiryDate: '2026-01-14' },
      { id: 'c2', type: 'GOTS',     label: 'GOTS v6.0 Certified',    status: 'PENDING', issueDate: '2024-03-20', expiryDate: '2025-03-19' },
      { id: 'c3', type: 'FSC',      label: 'FSC Chain-of-Custody',   status: 'PENDING', issueDate: '2023-11-10', expiryDate: '2025-11-09' },
      { id: 'c4', type: 'REACH',    label: 'REACH Compliance Report', status: 'PENDING', issueDate: '2024-06-01', expiryDate: '2025-05-31' },
    ],
  },
  {
    id: 'vq2', vendorName: 'ZipKing International', submissionDate: '2026-10-25',
    slaDeadline: '2026-10-30', isOverdue: true, certCount: 2,
    gstin: '29AAACZ5678Q1ZV', pan: 'AAACZ5678Q', gstinVerified: true, panVerified: false,
    companyType: 'Partnership Firm', registeredAddress: '12B, Agrahara Layout, Yelahanka, Bengaluru - 560064, Karnataka',
    certs: [
      { id: 'c5', type: 'OEKO_TEX', label: 'OEKO-TEX® Standard 100', status: 'PENDING' },
      { id: 'c6', type: 'REACH',    label: 'REACH Compliance Report', status: 'PENDING' },
    ],
  },
  {
    id: 'vq3', vendorName: 'AccessoryPlus Pvt Ltd', submissionDate: '2026-10-29',
    slaDeadline: '2026-11-03', isOverdue: false, certCount: 3,
    gstin: '33AAACA9012Q1ZV', pan: 'AAACA9012Q', gstinVerified: true, panVerified: true,
    companyType: 'Private Limited', registeredAddress: 'SF-8, SIPCOT Industrial Park, Perundurai, Erode - 638052, Tamil Nadu',
    certs: [
      { id: 'c7', type: 'OEKO_TEX', label: 'OEKO-TEX® Standard 100', status: 'PENDING' },
      { id: 'c8', type: 'GINETEX',  label: 'GINETEX Symbol License',  status: 'PENDING' },
      { id: 'c9', type: 'REACH',    label: 'REACH Compliance Report', status: 'PENDING' },
    ],
  },
];

const INIT_MARGINS: VendorMarginRecord = {
  vendorId: 'v1', vendorName: 'ThreadWorks Manufacturing Pvt Ltd',
  productName: 'High-Tenacity Bonded Poly Thread Tex-40', sku: 'THR-HTP-120',
  slabs: [
    { slabNo: 1, label: 'Slab 1', qtyRange: '100–499',     vendorPct: 18, trimnovanPct: 22, status: 'AGREED' },
    { slabNo: 2, label: 'Slab 2', qtyRange: '500–999',     vendorPct: 16, trimnovanPct: 20, status: 'AGREED' },
    { slabNo: 3, label: 'Slab 3', qtyRange: '1,000–2,499', vendorPct: 14, trimnovanPct: 18, status: 'DISPUTED', disputeNote: 'Vendor claims 14% is final; TrimNova requires minimum 18% at this slab.' },
    { slabNo: 4, label: 'Slab 4', qtyRange: '2,500–4,999', vendorPct: 12, trimnovanPct: 16, status: 'PENDING' },
    { slabNo: 5, label: 'Slab 5', qtyRange: '5,000+',      vendorPct: 10, trimnovanPct: 14, status: 'PENDING' },
  ],
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function CertStatusBadge({ status }: { status: CertStatus }) {
  const map: Record<CertStatus, { label: string; cls: string; icon: React.ReactNode }> = {
    APPROVED: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    PENDING:  { label: 'Pending',  cls: 'bg-amber-50 text-amber-700 border-amber-200',       icon: <Clock className="w-3.5 h-3.5" /> },
    REJECTED: { label: 'Rejected', cls: 'bg-red-50 text-red-700 border-red-200',             icon: <XCircle className="w-3.5 h-3.5" /> },
    ON_HOLD:  { label: 'On Hold',  cls: 'bg-orange-50 text-orange-700 border-orange-200',    icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  };
  const { label, cls, icon } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      {icon} {label}
    </span>
  );
}

function SlabStatusBadge({ status }: { status: SlabStatus }) {
  if (status === 'AGREED') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
      <CheckCircle2 className="w-3 h-3" /> Agreed by Vendor
    </span>
  );
  if (status === 'DISPUTED') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      <AlertTriangle className="w-3 h-3" /> Disagreement / Unresolved
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
      <Clock className="w-3 h-3" /> Pending
    </span>
  );
}

interface ToastItem { id: number; message: string; type: 'success' | 'error' }

/* ─── Main ───────────────────────────────────────────────────────────────── */
export default function ApproverQueue() {
  const [stage, setStage]               = useState<ApproverStage>('certs');
  const [selectedVendor, setSelectedVendor] = useState<VendorQueueItem>(MOCK_QUEUE[0]);
  const [certStatuses, setCertStatuses] = useState<Record<string, CertStatus>>({});
  const [comments, setComments]         = useState<Record<string, string>>({});
  const [toasts, setToasts]             = useState<ToastItem[]>([]);
  const [marginRecord, setMarginRecord] = useState<VendorMarginRecord>(INIT_MARGINS);
  const [slabNotes, setSlabNotes]       = useState<Record<number, string>>({});
  const [approverRationale, setApproverRationale] = useState('');

  function addToast(message: string, type: 'success' | 'error') {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }

  function handleCertAction(certId: string, action: CertStatus) {
    if ((action === 'REJECTED' || action === 'ON_HOLD') && !comments[certId]?.trim()) {
      addToast('A comment is required for Reject or On Hold actions.', 'error');
      return;
    }
    setCertStatuses(prev => ({ ...prev, [certId]: action }));
    addToast(
      action === 'APPROVED' ? 'Certificate approved successfully.'
        : action === 'ON_HOLD' ? 'Certificate placed on hold.'
        : 'Certificate rejected.',
      action === 'APPROVED' ? 'success' : 'error'
    );
  }

  function handleSlabStatus(slabNo: number, status: SlabStatus) {
    setMarginRecord(prev => ({
      ...prev,
      slabs: prev.slabs.map(s =>
        s.slabNo === slabNo
          ? { ...s, status, disputeNote: status === 'DISPUTED' ? (slabNotes[slabNo] || s.disputeNote) : s.disputeNote }
          : s
      ),
    }));
    addToast(
      status === 'AGREED' ? `Slab ${slabNo} approved.` : `Slab ${slabNo} marked as disputed.`,
      status === 'AGREED' ? 'success' : 'error'
    );
  }

  const agreedCount   = marginRecord.slabs.filter(s => s.status === 'AGREED').length;
  const disputedCount = marginRecord.slabs.filter(s => s.status === 'DISPUTED').length;

  return (
    <div className="min-h-screen bg-[#F4F6FB]">
      {/* Toast stack */}
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

      {/* Header */}
      <div className="bg-[#0F172A] border-b border-white/10 px-6 py-4">
        <div className="max-w-screen-xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-black text-white">Approver Console</h1>
            <p className="text-slate-400 text-sm">Two-Stage Vendor Compliance & Margin Review</p>
          </div>
          <div className="flex gap-1 bg-white/10 rounded-xl p-1">
            {[
              { key: 'certs',   label: 'Stage 1: Cert Audit',        icon: <Shield className="w-4 h-4" /> },
              { key: 'margins', label: 'Stage 2: Margin Negotiation', icon: <BarChart3 className="w-4 h-4" /> },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setStage(tab.key as ApproverStage)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  stage === tab.key ? 'bg-[#4F46E5] text-white shadow' : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ STAGE 1 ══════════════════════════════════════════════════════ */}
      {stage === 'certs' && (
        <div className="max-w-screen-xl mx-auto px-4 py-6 flex gap-4 overflow-hidden" style={{ height: 'calc(100vh - 88px)' }}>

          {/* Left: Queue (20%) */}
          <aside className="w-52 flex-shrink-0 overflow-y-auto space-y-2 pr-1">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-1">Pending Queue</p>
            {MOCK_QUEUE.map(v => (
              <button
                key={v.id}
                onClick={() => setSelectedVendor(v)}
                className={`w-full text-left p-3 rounded-xl border transition-all duration-150 ${
                  selectedVendor.id === v.id
                    ? 'bg-[#4F46E5] text-white border-[#4F46E5] shadow-elevated'
                    : 'bg-white border-slate-200 hover:border-[#4F46E5]/40'
                }`}
              >
                <p className={`font-bold text-sm line-clamp-1 ${selectedVendor.id === v.id ? 'text-white' : 'text-slate-800'}`}>
                  {v.vendorName}
                </p>
                <p className={`text-xs mt-0.5 ${selectedVendor.id === v.id ? 'text-indigo-200' : 'text-slate-400'}`}>
                  {v.submissionDate}
                </p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className={`text-xs font-semibold ${v.isOverdue ? 'text-[#EF4444]' : selectedVendor.id === v.id ? 'text-indigo-200' : 'text-slate-400'}`}>
                    {v.isOverdue ? '⚠ OVERDUE' : `SLA: ${v.slaDeadline}`}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-lg font-medium ${selectedVendor.id === v.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {v.certCount}
                  </span>
                </div>
              </button>
            ))}
          </aside>

          {/* Center: Vendor Detail (50%) */}
          <div className="flex-[5] min-w-0 overflow-y-auto space-y-4 pr-1">
            <div className="card p-5">
              <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
                <div>
                  <h2 className="text-xl font-black text-slate-900">{selectedVendor.vendorName}</h2>
                  <p className="text-slate-500 text-sm mt-0.5">{selectedVendor.companyType}</p>
                </div>
                {selectedVendor.isOverdue && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-xl text-sm font-bold">
                    <AlertTriangle className="w-4 h-4" /> SLA Overdue
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                {[
                  { label: 'GSTIN', value: selectedVendor.gstin, verified: selectedVendor.gstinVerified, apiNote: '(API v2.4)' },
                  { label: 'PAN',   value: selectedVendor.pan,   verified: selectedVendor.panVerified,   apiNote: '' },
                ].map(f => (
                  <div key={f.label} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">{f.label}</p>
                    <p className="font-mono font-bold text-slate-800 mt-1 text-sm tracking-widest">{f.value}</p>
                    <div className="mt-1.5">
                      {f.verified
                        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            {f.label} Validated {f.apiNote}
                          </span>
                        : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            <AlertTriangle className="w-3 h-3" /> Unverified
                          </span>
                      }
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Registered Address</p>
                <p className="text-sm text-slate-700">{selectedVendor.registeredAddress}</p>
              </div>
            </div>

            {selectedVendor.certs.map(cert => (
              <div key={cert.id} className="card p-5">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div>
                    <p className="font-bold text-slate-800">{cert.label}</p>
                    {cert.issueDate && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        Issued: {cert.issueDate} | Expires: {cert.expiryDate}
                      </p>
                    )}
                  </div>
                  <CertStatusBadge status={certStatuses[cert.id] || cert.status} />
                </div>
                <div className="h-44 bg-slate-100 rounded-xl flex flex-col items-center justify-center gap-3 border border-dashed border-slate-300">
                  <FileText className="w-10 h-10 text-slate-300" />
                  <p className="text-slate-400 text-sm font-medium">Certificate PDF Preview</p>
                  <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-700 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    OCR Verification: 100% Confidence Match with GSTIN
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Right: Actions (30%) */}
          <aside className="w-64 flex-shrink-0 overflow-y-auto space-y-3 pl-1">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-1">Certificate Actions</p>
            {selectedVendor.certs.map(cert => {
              const curStatus = certStatuses[cert.id] || cert.status;
              return (
                <div key={cert.id} className="card p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <p className="text-xs font-bold text-slate-700 line-clamp-1 flex-1">{cert.label}</p>
                    <CertStatusBadge status={curStatus} />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 font-medium block mb-1">
                      Comment <span className="text-red-400">*required for Reject/Hold</span>
                    </label>
                    <textarea
                      rows={2}
                      value={comments[cert.id] || ''}
                      onChange={e => setComments(prev => ({ ...prev, [cert.id]: e.target.value }))}
                      placeholder="Enter clarification or rejection rationale…"
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5]/20 resize-none"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleCertAction(cert.id, 'APPROVED')}
                      className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all"
                    >
                      <CheckCircle2 className="w-3 h-3" /> Approve
                    </button>
                    <button
                      onClick={() => handleCertAction(cert.id, 'ON_HOLD')}
                      className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all"
                    >
                      <Clock className="w-3 h-3" /> Hold
                    </button>
                    <button
                      onClick={() => handleCertAction(cert.id, 'REJECTED')}
                      className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-[#EF4444] hover:bg-red-600 text-white text-xs font-bold transition-all"
                    >
                      <XCircle className="w-3 h-3" /> Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </aside>
        </div>
      )}

      {/* ═══ STAGE 2 ══════════════════════════════════════════════════════ */}
      {stage === 'margins' && (
        <div className="max-w-screen-xl mx-auto px-6 py-6 space-y-6">
          {/* Vendor selector */}
          <div className="card p-4 flex items-center gap-4 flex-wrap">
            <label className="text-sm font-bold text-slate-700 whitespace-nowrap">Select Vendor:</label>
            <select className="input-field max-w-sm">
              <option>ThreadWorks Manufacturing Pvt Ltd</option>
              <option>Ribbonex India Pvt Ltd</option>
            </select>
            <div className="ml-auto flex gap-2 flex-wrap">
              <span className="text-xs font-semibold px-2.5 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl">
                {agreedCount}/5 Agreed
              </span>
              {disputedCount > 0 && (
                <span className="text-xs font-semibold px-2.5 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl">
                  {disputedCount} Disputed
                </span>
              )}
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
              <h3 className="font-black text-slate-800 text-lg">{marginRecord.productName}</h3>
              <span className="id-chip">{marginRecord.sku}</span>
            </div>
            <p className="text-slate-500 text-sm">{marginRecord.vendorName}</p>
          </div>

          <div className="card overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">5-Slab Margin Matrix</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Slab', 'Qty Range', 'Vendor Requested %', 'TrimNova Target %', 'Gap', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {marginRecord.slabs.map((slab, i) => {
                    const gap = slab.trimnovanPct - slab.vendorPct;
                    return (
                      <React.Fragment key={slab.slabNo}>
                        <tr className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                          <td className="px-4 py-3 font-bold text-slate-700 text-sm">{slab.label}</td>
                          <td className="px-4 py-3 font-mono text-sm text-slate-600 whitespace-nowrap">{slab.qtyRange}</td>
                          <td className="px-4 py-3"><span className="font-bold text-[#4F46E5] font-mono">{slab.vendorPct}%</span></td>
                          <td className="px-4 py-3"><span className="font-bold text-emerald-600 font-mono">{slab.trimnovanPct}%</span></td>
                          <td className="px-4 py-3">
                            <span className={`font-mono font-bold text-sm ${gap > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {gap > 0 ? `+${gap}%` : `${gap}%`}
                            </span>
                          </td>
                          <td className="px-4 py-3"><SlabStatusBadge status={slab.status} /></td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSlabStatus(slab.slabNo, 'AGREED')}
                                className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all"
                              >Approve</button>
                              <button
                                onClick={() => handleSlabStatus(slab.slabNo, 'DISPUTED')}
                                className="px-3 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-all"
                              >Dispute</button>
                            </div>
                          </td>
                        </tr>
                        {slab.status === 'DISPUTED' && (
                          <tr className="bg-amber-50/60">
                            <td colSpan={7} className="px-4 pb-3 pt-0">
                              <div className="flex gap-3 items-start mt-2">
                                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-1" />
                                <div className="flex-1">
                                  {slab.disputeNote && (
                                    <p className="text-xs text-amber-700 mb-2 italic">"{slab.disputeNote}"</p>
                                  )}
                                  <textarea
                                    rows={2}
                                    value={slabNotes[slab.slabNo] || ''}
                                    onChange={e => setSlabNotes(prev => ({ ...prev, [slab.slabNo]: e.target.value }))}
                                    placeholder="Add dispute note…"
                                    className="w-full text-xs px-3 py-2 rounded-xl border border-amber-200 bg-white focus:outline-none focus:border-amber-400 resize-none"
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <h3 className="font-bold text-slate-800">
              Approver Audit Rationale
              <span className="ml-2 text-xs font-normal text-red-400">(mandatory)</span>
            </h3>
            <textarea
              rows={4}
              value={approverRationale}
              onChange={e => setApproverRationale(e.target.value)}
              placeholder="Provide a detailed rationale for your margin approval/dispute decisions. This will be logged to the audit trail and visible to the Finance team and Vendor…"
              className="w-full input-field resize-none text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-4">
            <button
              disabled={!approverRationale.trim()}
              onClick={() => addToast('Agreed margins updated successfully.', 'success')}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" /> Update Agreed Margins
            </button>
            <button
              disabled={!approverRationale.trim()}
              onClick={() => addToast('Partial agreement submitted. Disputed items escalated to Case #ESC-9482.', 'success')}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <AlertTriangle className="w-4 h-4" />
              Submit Partial Agreement & Escalate Remainder
              <span className="ml-1 text-xs opacity-80">→ Case #ESC-9482</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
