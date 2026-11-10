/**
 * SupportPortal.tsx — TrimNova Support & Operations Portal
 * Invitation-only role (SUPPORT_OPS) for internal helpdesk team.
 * Handles: order cancellations, NDRs, return/replacement disputes.
 *
 * PDF spec (Login 5):
 * - Customer sees ONE support channel even with multi-vendor orders
 * - Vendor A never sees Vendor B's details
 * - Handles NDR, address corrections, lost/damaged courier claims, RTO
 * - Adjudicates return disputes if vendor doesn't respond within 2 business days
 * - Can approve Refund or Replacement, routes to Finance for execution
 */

import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Headphones, Package, AlertTriangle, RotateCcw, Truck,
  Clock, CheckCircle2, XCircle, MessageSquare, Search,
  Filter, Eye, ChevronRight, User, Building2,
} from 'lucide-react';

type SupportTab = 'tickets' | 'disputes' | 'ndrs';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'ESCALATED' | 'RESOLVED' | 'CLOSED';

interface SupportTicket {
  id: string;
  ticketNo: string;
  type: 'CANCELLATION' | 'RETURN' | 'REPLACEMENT' | 'NDR' | 'DISPUTE' | 'GENERAL';
  customerName: string;
  orderNo: string;
  priority: Priority;
  status: TicketStatus;
  createdAt: string;
  slaDeadline: string;
  vendorCount: number;
  summary: string;
}

interface ReturnDispute {
  id: string;
  disputeNo: string;
  orderNo: string;
  customer: string;
  vendor: string;
  issue: string;
  returnRequestedAt: string;
  vendorResponseDeadline: string;
  vendorResponded: boolean;
  status: 'AWAITING_VENDOR' | 'UNDER_REVIEW' | 'RESOLVED_REFUND' | 'RESOLVED_REPLACEMENT';
  amount: number;
}

interface NdrCase {
  id: string;
  ndrNo: string;
  orderNo: string;
  customer: string;
  courier: string;
  reason: string;
  attemptCount: number;
  lastAttempt: string;
  status: 'ACTION_REQUIRED' | 'ADDRESS_CORRECTION' | 'RESCHEDULED' | 'RTO_INITIATED';
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
const MOCK_TICKETS: SupportTicket[] = [
  { id: 't1', ticketNo: 'TKT-2026-4821', type: 'DISPUTE', customerName: 'Raymond Garments Ltd', orderNo: 'ORD-2026-4421', priority: 'HIGH', status: 'IN_PROGRESS', createdAt: '2026-11-10T09:30:00', slaDeadline: '2026-11-12T09:30:00', vendorCount: 2, summary: 'Quality defect claimed on 150 units of woven damask labels. Vendor disputes the claim.' },
  { id: 't2', ticketNo: 'TKT-2026-4819', type: 'NDR', customerName: 'Arvind Fashions Pvt Ltd', orderNo: 'ORD-2026-4388', priority: 'URGENT', status: 'OPEN', createdAt: '2026-11-10T08:00:00', slaDeadline: '2026-11-11T08:00:00', vendorCount: 1, summary: 'Delivery failed 3 times — address incomplete. Customer not reachable on phone.' },
  { id: 't3', ticketNo: 'TKT-2026-4815', type: 'CANCELLATION', customerName: 'Orient Tex Industries', orderNo: 'ORD-2026-4302', priority: 'MEDIUM', status: 'OPEN', createdAt: '2026-11-09T16:00:00', slaDeadline: '2026-11-11T16:00:00', vendorCount: 1, summary: 'Customer wants to cancel 2 items — vendor already accepted but not yet dispatched.' },
  { id: 't4', ticketNo: 'TKT-2026-4801', type: 'RETURN', customerName: 'Mafatlal Textiles', orderNo: 'ORD-2026-4198', priority: 'LOW', status: 'RESOLVED', createdAt: '2026-11-08T14:00:00', slaDeadline: '2026-11-10T14:00:00', vendorCount: 1, summary: 'Return approved. 50 units of incorrect colour zippers returned to vendor.' },
];

const MOCK_DISPUTES: ReturnDispute[] = [
  { id: 'd1', disputeNo: 'DSP-2026-0041', orderNo: 'ORD-2026-4421', customer: 'Raymond Garments Ltd', vendor: 'NovaTex Manufacturing', issue: '150 units of woven damask labels received with incorrect thread pattern — customer uploaded photo evidence', returnRequestedAt: '2026-11-08T10:00:00', vendorResponseDeadline: '2026-11-10T10:00:00', vendorResponded: false, status: 'AWAITING_VENDOR', amount: 18000 },
  { id: 'd2', disputeNo: 'DSP-2026-0039', orderNo: 'ORD-2026-4188', customer: 'Bombay Shirt Co', vendor: 'AuraFastener Industries', issue: '20 of 200 metal buttons missing from consignment — counted and verified against packing slip', returnRequestedAt: '2026-11-07T14:00:00', vendorResponseDeadline: '2026-11-09T14:00:00', vendorResponded: true, status: 'UNDER_REVIEW', amount: 2400 },
];

const MOCK_NDRS: NdrCase[] = [
  { id: 'n1', ndrNo: 'NDR-2026-0188', orderNo: 'ORD-2026-4388', customer: 'Arvind Fashions Pvt Ltd', courier: 'Delhivery', reason: 'Address not found — building name missing', attemptCount: 3, lastAttempt: '2026-11-10T07:30:00', status: 'ACTION_REQUIRED' },
  { id: 'n2', ndrNo: 'NDR-2026-0183', orderNo: 'ORD-2026-4350', customer: 'Birla Textiles', courier: 'BlueDart', reason: 'Customer requested delivery postponement', attemptCount: 1, lastAttempt: '2026-11-09T11:00:00', status: 'RESCHEDULED' },
];

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n);
}

const PRIORITY_CFG: Record<Priority, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-amber-100 text-amber-700',
  URGENT: 'bg-red-100 text-red-700',
};

const STATUS_CFG: Record<TicketStatus, { label: string; color: string }> = {
  OPEN: { label: 'Open', color: 'bg-blue-100 text-blue-700' },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-amber-100 text-amber-700' },
  ESCALATED: { label: 'Escalated', color: 'bg-red-100 text-red-700' },
  RESOLVED: { label: 'Resolved', color: 'bg-emerald-100 text-emerald-700' },
  CLOSED: { label: 'Closed', color: 'bg-slate-100 text-slate-600' },
};

const TYPE_ICONS: Record<SupportTicket['type'], React.ReactNode> = {
  CANCELLATION: <XCircle className="w-4 h-4 text-slate-500" />,
  RETURN: <RotateCcw className="w-4 h-4 text-amber-500" />,
  REPLACEMENT: <Package className="w-4 h-4 text-indigo-500" />,
  NDR: <Truck className="w-4 h-4 text-red-500" />,
  DISPUTE: <AlertTriangle className="w-4 h-4 text-red-500" />,
  GENERAL: <MessageSquare className="w-4 h-4 text-slate-400" />,
};

function TicketsTab() {
  const [search, setSearch] = useState('');
  const filtered = MOCK_TICKETS.filter(t =>
    t.ticketNo.includes(search) || t.customerName.toLowerCase().includes(search.toLowerCase()) || t.orderNo.includes(search)
  );

  return (
    <div className="space-y-4">
      {/* Notice about single channel */}
      <div className="flex items-start gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
        <Headphones className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-indigo-700">
          <strong>Single Customer Channel:</strong> Even when a customer's order involves multiple vendors, they interact with one TrimNova support channel only. Vendor details are siloed — Vendor A cannot see Vendor B's information.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text" placeholder="Search by ticket #, customer, or order #…"
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5]/20"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Ticket</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Priority</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">SLA Deadline</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map(ticket => {
              const sc = STATUS_CFG[ticket.status];
              const isOverdue = new Date(ticket.slaDeadline) < new Date() && ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED';
              return (
                <tr key={ticket.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <p className="font-mono font-semibold text-[#4F46E5]">{ticket.ticketNo}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{ticket.orderNo}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                      <span className="font-medium text-slate-700">{ticket.customerName}</span>
                    </div>
                    {ticket.vendorCount > 1 && (
                      <span className="text-xs text-slate-400">{ticket.vendorCount} vendors involved</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {TYPE_ICONS[ticket.type]}
                      <span className="text-slate-600">{ticket.type}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${PRIORITY_CFG[ticket.priority]}`}>{ticket.priority}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs ${isOverdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                      {isOverdue && '⚠ '}
                      {new Date(ticket.slaDeadline).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${sc.color}`}>{sc.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button className="p-1.5 text-slate-400 hover:text-[#4F46E5] hover:bg-indigo-50 rounded-lg transition-colors">
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DisputesTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-xl">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-700">
          <strong>Auto-Escalation:</strong> If a vendor fails to respond to a customer return request within 2 business days, the case is automatically escalated here for Support to adjudicate using photo evidence. Support's decision is final.
        </p>
      </div>

      <div className="space-y-4">
        {MOCK_DISPUTES.map(d => {
          const isOverdue = !d.vendorResponded && new Date(d.vendorResponseDeadline) < new Date();
          return (
            <div key={d.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-mono font-bold text-[#4F46E5]">{d.disputeNo}</span>
                  <span className="ml-2 text-sm text-slate-500">· {d.orderNo}</span>
                </div>
                {isOverdue && (
                  <span className="px-3 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">
                    Vendor overdue — Support must decide
                  </span>
                )}
                {d.status === 'UNDER_REVIEW' && (
                  <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">Under Review</span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Customer</p>
                  <p className="font-semibold text-slate-700">{d.customer}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Vendor</p>
                  <p className="font-semibold text-slate-700">{d.vendor}</p>
                </div>
              </div>
              <div className="mt-3 p-3 bg-slate-50 rounded-xl">
                <p className="text-sm text-slate-600">{d.issue}</p>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm font-mono font-bold text-slate-700">Disputed Amount: {fmt(d.amount)}</span>
                {(isOverdue || d.status === 'UNDER_REVIEW') && (
                  <div className="flex gap-2">
                    <button className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors">
                      <CheckCircle2 className="w-4 h-4" /> Approve Refund
                    </button>
                    <button className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors">
                      <Package className="w-4 h-4" /> Approve Replacement
                    </button>
                    <button className="flex items-center gap-1.5 px-4 py-2 border border-red-300 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-50 transition-colors">
                      <XCircle className="w-4 h-4" /> Reject Claim
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NdrsTab() {
  const NDR_STATUS: Record<NdrCase['status'], { label: string; color: string }> = {
    ACTION_REQUIRED: { label: 'Action Required', color: 'bg-red-100 text-red-700' },
    ADDRESS_CORRECTION: { label: 'Address Correction', color: 'bg-amber-100 text-amber-700' },
    RESCHEDULED: { label: 'Rescheduled', color: 'bg-blue-100 text-blue-700' },
    RTO_INITIATED: { label: 'RTO Initiated', color: 'bg-slate-100 text-slate-600' },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl">
        <Truck className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-red-700">
          <strong>Non-Delivery Reports (NDR):</strong> Courier failed to deliver. Take action within 24 hours — confirm address with customer or initiate Return-to-Origin (RTO). Vendor is NOT paid until delivery is confirmed.
        </p>
      </div>

      {MOCK_NDRS.map(ndr => {
        const sc = NDR_STATUS[ndr.status];
        return (
          <div key={ndr.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <div className="flex items-start justify-between">
              <div>
                <span className="font-mono font-bold text-slate-700">{ndr.ndrNo}</span>
                <span className="ml-2 text-sm text-slate-500">· {ndr.orderNo}</span>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${sc.color}`}>{sc.label}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-400">Customer</p>
                <p className="font-medium text-slate-700">{ndr.customer}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Courier</p>
                <p className="font-medium text-slate-700">{ndr.courier}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Attempts</p>
                <p className="font-bold text-red-600">{ndr.attemptCount} failed</p>
              </div>
            </div>
            <p className="mt-2 text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-2">{ndr.reason}</p>
            {ndr.status === 'ACTION_REQUIRED' && (
              <div className="mt-3 flex gap-2">
                <button className="px-4 py-2 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600 transition-colors">Confirm Address Correction</button>
                <button className="px-4 py-2 border border-red-300 text-red-600 text-sm font-semibold rounded-xl hover:bg-red-50 transition-colors">Initiate RTO</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function SupportPortal() {
  const location = useLocation();
  const path = location.pathname;
  const activeTab: SupportTab = path.includes('disputes') ? 'disputes' : path.includes('ndrs') ? 'ndrs' : 'tickets';

  const stats = {
    open: MOCK_TICKETS.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length,
    urgent: MOCK_TICKETS.filter(t => t.priority === 'URGENT').length,
    disputes: MOCK_DISPUTES.filter(d => d.status !== 'RESOLVED_REFUND' && d.status !== 'RESOLVED_REPLACEMENT').length,
    ndrs: MOCK_NDRS.filter(n => n.status === 'ACTION_REQUIRED').length,
  };

  const tabs = [
    { key: 'tickets' as SupportTab, label: 'All Tickets', href: '/support/tickets', icon: <Headphones className="w-4 h-4" />, count: stats.open },
    { key: 'disputes' as SupportTab, label: 'Return Disputes', href: '/support/disputes', icon: <AlertTriangle className="w-4 h-4" />, count: stats.disputes },
    { key: 'ndrs' as SupportTab, label: 'NDR Cases', href: '/support/ndrs', icon: <Truck className="w-4 h-4" />, count: stats.ndrs },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Support & Operations</h1>
        <p className="text-sm text-slate-500 mt-0.5">Customer & vendor helpdesk — dispute resolution & delivery exceptions</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Open Tickets', value: stats.open, color: 'text-blue-600' },
          { label: 'Urgent', value: stats.urgent, color: 'text-red-600' },
          { label: 'Active Disputes', value: stats.disputes, color: 'text-amber-600' },
          { label: 'NDR Action Needed', value: stats.ndrs, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{s.label}</p>
            <p className={`text-3xl font-black mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-2xl p-1.5 shadow-sm border border-slate-100 w-fit">
        {tabs.map(tab => (
          <a
            key={tab.key}
            href={tab.href}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab.key ? 'bg-[#4F46E5] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.icon} {tab.label}
            {tab.count > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600'
              }`}>{tab.count}</span>
            )}
          </a>
        ))}
      </div>

      {activeTab === 'tickets'  && <TicketsTab />}
      {activeTab === 'disputes' && <DisputesTab />}
      {activeTab === 'ndrs'     && <NdrsTab />}
    </div>
  );
}
