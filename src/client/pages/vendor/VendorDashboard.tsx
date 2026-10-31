/**
 * VendorDashboard.tsx
 * TrimNova — Vendor portal home dashboard
 */

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Package,
  Clock,
  ShoppingBag,
  TrendingUp,
  Warehouse,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Star,
  Award,
  Shield,
  ChevronRight,
  Loader2,
  RefreshCw,
  FileText,
  Zap,
  LayoutGrid,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type PlanId = "ELITE" | "GOLD" | "BASIC";
type SubOrderStatus =
  | "PENDING_VENDOR_ACCEPTANCE"
  | "ACCEPTED"
  | "PARTIALLY_ACCEPTED"
  | "REJECTED"
  | "SHIPPED"
  | "DELIVERED"
  | "INVOICE_GENERATED";
type FulfilmentMethod = "ONLINE" | "INSTA";

interface DashboardStats {
  totalActiveSKUs: number;
  pendingApprovals: number;
  totalOrdersMTD: number;
  revenueMTD: string;
  trimInstaStockHealth: "HEALTHY" | "WARNING" | "CRITICAL";
  trimInstaLowStockCount: number;
  trimInstaOutOfStockCount: number;
}

interface VendorPlanInfo {
  planId: PlanId;
  planExpiry: string;
  companyName: string;
  gstin: string;
}

interface RecentSubOrder {
  id: string;
  subOrderNumber: string;
  customerName: string;
  orderDate: string;
  totalAmount: string;
  status: SubOrderStatus;
  fulfilmentMethod: FulfilmentMethod;
}

interface TrimInstaAlert {
  productId: string;
  productName: string;
  sku: string;
  trimInstaStock: number;
  status: "LOW" | "OUT_OF_STOCK";
}

interface DashboardData {
  stats: DashboardStats;
  planInfo: VendorPlanInfo;
  recentOrders: RecentSubOrder[];
  trimInstaAlerts: TrimInstaAlert[];
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

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

// ─── Plan Config ───────────────────────────────────────────────────────────────
interface PlanDisplayCfg {
  label: string;
  gradient: string;
  textColor: string;
  icon: React.ReactNode;
}

const PLAN_CONFIG: Record<PlanId, PlanDisplayCfg> = {
  ELITE: {
    label: "ELITE PLAN",
    gradient: "from-indigo-600 to-purple-600",
    textColor: "text-white",
    icon: <Star className="w-5 h-5 text-yellow-300" fill="currentColor" />,
  },
  GOLD: {
    label: "GOLD PLAN",
    gradient: "from-amber-400 to-yellow-500",
    textColor: "text-amber-900",
    icon: <Award className="w-5 h-5 text-amber-800" />,
  },
  BASIC: {
    label: "BASIC PLAN",
    gradient: "from-slate-400 to-slate-500",
    textColor: "text-white",
    icon: <Shield className="w-5 h-5 text-slate-200" />,
  },
};

// ─── Status Badges ────────────────────────────────────────────────────────────
const STATUS_BADGE: Record<SubOrderStatus, { label: string; cls: string }> = {
  PENDING_VENDOR_ACCEPTANCE: { label: "Pending", cls: "bg-amber-100 text-amber-700" },
  ACCEPTED: { label: "Accepted", cls: "bg-emerald-100 text-emerald-700" },
  PARTIALLY_ACCEPTED: { label: "Partial", cls: "bg-blue-100 text-blue-700" },
  REJECTED: { label: "Rejected", cls: "bg-red-100 text-red-600" },
  SHIPPED: { label: "Shipped", cls: "bg-indigo-100 text-indigo-700" },
  DELIVERED: { label: "Delivered", cls: "bg-teal-100 text-teal-700" },
  INVOICE_GENERATED: { label: "Invoiced", cls: "bg-slate-100 text-slate-600" },
};

// ─── Stat Card ─────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg: string;
  subText?: string;
  alert?: "warning" | "danger";
  to?: string;
}

function StatCard({ label, value, icon, iconBg, subText, alert, to }: StatCardProps) {
  const inner = (
    <div
      className={`bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] p-5 flex items-start gap-4 ${
        to ? "hover:shadow-md transition-shadow cursor-pointer" : ""
      } ${alert === "danger" ? "ring-1 ring-red-200" : alert === "warning" ? "ring-1 ring-amber-200" : ""}`}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-400 font-medium mb-0.5">{label}</p>
        <p className="text-2xl font-extrabold text-[#0F172A] leading-tight truncate">{value}</p>
        {subText && (
          <p className={`text-xs mt-1 ${
            alert === "danger" ? "text-red-500" : alert === "warning" ? "text-amber-600" : "text-slate-400"
          }`}>
            {subText}
          </p>
        )}
      </div>
      {to && <ChevronRight className="w-4 h-4 text-slate-300 mt-1 flex-shrink-0" />}
    </div>
  );

  return to ? <Link to={to}>{inner}</Link> : <>{inner}</>;
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
export default function VendorDashboard() {
  const { data, isLoading, isError, refetch } = useQuery<DashboardData>({
    queryKey: ["vendor-dashboard"],
    queryFn: () => apiFetch("/api/v1/vendors/me/dashboard"),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F4F6FB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#4F46E5]" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-[#F4F6FB] flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-10 h-10 text-[#EF4444] mx-auto mb-3" />
          <p className="text-slate-600 font-medium mb-3">Failed to load dashboard</p>
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

  const { stats, planInfo, recentOrders, trimInstaAlerts } = data;
  const planCfg = PLAN_CONFIG[planInfo.planId];
  const daysToExpiry = Math.ceil(
    (new Date(planInfo.planExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className="min-h-screen bg-[#F4F6FB] py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-[#0F172A]">
              Welcome back,{" "}
              <span className="text-[#4F46E5]">{planInfo.companyName.split(" ")[0]}</span> 👋
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {planInfo.companyName} · GSTIN:{" "}
              <code className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-xs">
                {planInfo.gstin}
              </code>
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:border-indigo-300 transition-colors shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <StatCard
            label="Total Active SKUs"
            value={stats.totalActiveSKUs.toLocaleString("en-IN")}
            icon={<Package className="w-5 h-5 text-[#4F46E5]" />}
            iconBg="bg-indigo-50"
            to="/vendor/catalog"
          />
          <StatCard
            label="Pending Approvals"
            value={stats.pendingApprovals.toLocaleString("en-IN")}
            icon={<Clock className="w-5 h-5 text-amber-500" />}
            iconBg="bg-amber-50"
            subText={stats.pendingApprovals > 0 ? "Awaiting TrimNova review" : undefined}
            alert={stats.pendingApprovals > 0 ? "warning" : undefined}
            to="/vendor/capabilities"
          />
          <StatCard
            label="Orders This Month"
            value={stats.totalOrdersMTD.toLocaleString("en-IN")}
            icon={<ShoppingBag className="w-5 h-5 text-blue-500" />}
            iconBg="bg-blue-50"
            to="/vendor/orders"
          />
          <StatCard
            label="Revenue MTD"
            value={formatINR(parseFloat(stats.revenueMTD))}
            icon={<TrendingUp className="w-5 h-5 text-emerald-500" />}
            iconBg="bg-emerald-50"
          />
          <StatCard
            label="TrimInsta Health"
            value={stats.trimInstaStockHealth}
            icon={<Warehouse className="w-5 h-5 text-violet-500" />}
            iconBg="bg-violet-50"
            subText={
              stats.trimInstaOutOfStockCount > 0
                ? `${stats.trimInstaOutOfStockCount} out of stock`
                : stats.trimInstaLowStockCount > 0
                ? `${stats.trimInstaLowStockCount} low stock`
                : "All good"
            }
            alert={
              stats.trimInstaOutOfStockCount > 0
                ? "danger"
                : stats.trimInstaLowStockCount > 0
                ? "warning"
                : undefined
            }
            to="/vendor/catalog"
          />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="space-y-4">
            {/* Plan Card */}
            <div className={`bg-gradient-to-br ${planCfg.gradient} rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] p-6`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {planCfg.icon}
                  <span className={`text-sm font-bold tracking-wide ${planCfg.textColor}`}>
                    {planCfg.label}
                  </span>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                  daysToExpiry <= 30 ? "bg-red-400/30 text-red-100" : "bg-white/20 text-white"
                }`}>
                  {daysToExpiry > 0 ? `${daysToExpiry} days left` : "Expired"}
                </span>
              </div>
              <p className={`text-xs ${planCfg.textColor} opacity-70 mb-0.5`}>Expiry Date</p>
              <p className={`text-lg font-bold ${planCfg.textColor}`}>{formatDate(planInfo.planExpiry)}</p>
              {daysToExpiry <= 30 && (
                <div className="mt-4 bg-white/20 rounded-xl px-3 py-2.5">
                  <p className={`text-xs font-semibold ${planCfg.textColor}`}>
                    ⚠️ Plan expiring soon — renew to maintain all benefits
                  </p>
                </div>
              )}
              <Link
                to="/vendor/onboarding"
                className={`mt-4 block text-center py-2.5 rounded-xl text-sm font-semibold bg-white/20 hover:bg-white/30 transition-colors ${planCfg.textColor}`}
              >
                Manage Subscription →
              </Link>
            </div>

            {/* Quick Links */}
            <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Quick Links</h3>
              <div className="space-y-1.5">
                {[
                  { icon: <FileText className="w-4 h-4 text-[#4F46E5]" />, label: "KYC & Compliance", to: "/vendor/onboarding", bg: "bg-indigo-50" },
                  { icon: <LayoutGrid className="w-4 h-4 text-blue-500" />, label: "Manage Capabilities", to: "/vendor/capabilities", bg: "bg-blue-50" },
                  { icon: <Package className="w-4 h-4 text-emerald-500" />, label: "Catalog Manager", to: "/vendor/catalog", bg: "bg-emerald-50" },
                  { icon: <ShoppingBag className="w-4 h-4 text-amber-500" />, label: "Order Inbox", to: "/vendor/orders", bg: "bg-amber-50" },
                ].map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors group"
                  >
                    <div className={`w-8 h-8 rounded-lg ${link.bg} flex items-center justify-center`}>
                      {link.icon}
                    </div>
                    <span className="text-sm font-medium text-slate-700">{link.label}</span>
                    <ChevronRight className="w-4 h-4 text-slate-300 ml-auto group-hover:text-slate-400" />
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Recent Orders Table */}
            <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-[#4F46E5]" />
                  Recent Sub-Orders
                </h3>
                <Link
                  to="/vendor/orders"
                  className="text-xs font-semibold text-[#4F46E5] hover:text-indigo-700 flex items-center gap-1"
                >
                  View All <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {recentOrders.length === 0 ? (
                <div className="p-12 text-center">
                  <ShoppingBag className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">No orders yet</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {recentOrders.map((order) => {
                    const badge = STATUS_BADGE[order.status];
                    return (
                      <Link
                        key={order.id}
                        to="/vendor/orders"
                        className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50/60 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-slate-700">
                              {order.subOrderNumber}
                            </span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                              order.fulfilmentMethod === "INSTA"
                                ? "bg-orange-100 text-orange-700"
                                : "bg-blue-100 text-blue-700"
                            }`}>
                              {order.fulfilmentMethod === "INSTA" && <Zap className="w-2.5 h-2.5" />}
                              {order.fulfilmentMethod}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            {order.customerName} · {formatDate(order.orderDate)}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-mono text-sm font-bold text-slate-800">
                            {formatINR(parseFloat(order.totalAmount))}
                          </p>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* TrimInsta Alerts */}
            {trimInstaAlerts.length > 0 && (
              <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Warehouse className="w-4 h-4 text-violet-500" />
                    TrimInsta Stock Alerts
                    <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">
                      {trimInstaAlerts.length}
                    </span>
                  </h3>
                  <Link
                    to="/vendor/catalog"
                    className="text-xs font-semibold text-[#4F46E5] hover:text-indigo-700 flex items-center gap-1"
                  >
                    Manage Stock <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                <div className="divide-y divide-slate-50">
                  {trimInstaAlerts.map((alert) => (
                    <div key={alert.productId} className="flex items-center gap-4 px-6 py-3.5">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        alert.status === "OUT_OF_STOCK" ? "bg-red-50" : "bg-amber-50"
                      }`}>
                        {alert.status === "OUT_OF_STOCK" ? (
                          <XCircle className="w-4 h-4 text-[#EF4444]" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-700 truncate">{alert.productName}</p>
                        <p className="text-xs text-slate-400 font-mono">{alert.sku}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-sm font-bold ${
                          alert.status === "OUT_OF_STOCK" ? "text-[#EF4444]" : "text-amber-600"
                        }`}>
                          {alert.trimInstaStock.toLocaleString("en-IN")} units
                        </p>
                        <p className="text-xs text-slate-400">
                          {alert.status === "OUT_OF_STOCK" ? "Out of stock" : "Low stock"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="px-6 py-3 bg-slate-50 border-t border-slate-100">
                  <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Zap className="w-3 h-3 text-amber-400" />
                    Auto-restock notification emails have been triggered for low-stock items
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
