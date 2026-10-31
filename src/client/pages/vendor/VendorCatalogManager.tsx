/**
 * VendorCatalogManager.tsx
 * TrimNova — Product catalog manager with margin matrix, TrimInsta, and volume pricing
 */

import React, { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Package,
  Zap,
  Save,
  Loader2,
  RefreshCw,
  BarChart3,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────
interface MarginSlab {
  slabNumber: number;
  qtyMin: number;
  qtyMax: number;
  commissionPct: number;
  commissionAmount: string;
  netVendorPerUnit: string;
  status: "AGREED" | "DISPUTED";
  disputeNote?: string;
}

interface VolumeTier {
  id?: string;
  tierNumber: number;
  minQty: number;
  maxQty: number | null;
  unitPrice: string;
}

interface CatalogProduct {
  id: string;
  name: string;
  sku: string;
  hsn: string;
  baseUnitPrice: string;
  onlineStock: number;
  packMultiple: number;
  hasTrimInsta: boolean;
  trimInstaEnabled: boolean;
  hubShelfAllocation: number;
  trimInstaStock: number;
  marginSlabs: MarginSlab[];
  volumeTiers: VolumeTier[];
}

interface VendorCatalogData {
  products: CatalogProduct[];
  hasTrimInsta: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatINR(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(value);
}

function parseDecimal(val: string): number {
  return parseFloat(val) || 0;
}

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function apiPatch<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || "Request failed");
  }
  return res.json();
}

// ─── Margin Slab Table (Read-Only) ────────────────────────────────────────────
function MarginSlabTable({ slabs }: { slabs: MarginSlab[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-100 rounded-lg">
            <th className="py-2 px-3 text-left font-semibold text-slate-500">Slab</th>
            <th className="py-2 px-3 text-center font-semibold text-slate-500">Qty Range</th>
            <th className="py-2 px-3 text-center font-semibold text-slate-500">Commission %</th>
            <th className="py-2 px-3 text-center font-semibold text-slate-500">Commission ₹</th>
            <th className="py-2 px-3 text-center font-semibold text-slate-500">Net Vendor ₹/Unit</th>
            <th className="py-2 px-3 text-center font-semibold text-slate-500">Status</th>
          </tr>
        </thead>
        <tbody>
          {slabs.map((slab) => (
            <tr key={slab.slabNumber} className="border-b border-slate-100">
              <td className="py-2 px-3 font-semibold text-slate-600 bg-slate-50">
                Slab {slab.slabNumber}
              </td>
              <td className="py-2 px-3 text-center font-mono bg-slate-50 text-slate-600">
                {slab.qtyMin.toLocaleString("en-IN")} –{" "}
                {slab.qtyMax.toLocaleString("en-IN")}
              </td>
              <td className="py-2 px-3 text-center font-mono bg-slate-50 text-slate-600">
                {slab.commissionPct.toFixed(2)}%
              </td>
              <td className="py-2 px-3 text-center font-mono bg-slate-50 text-slate-600">
                {formatINR(parseDecimal(slab.commissionAmount))}
              </td>
              <td className="py-2 px-3 text-center font-mono bg-slate-50 text-slate-700 font-semibold">
                {formatINR(parseDecimal(slab.netVendorPerUnit))}
              </td>
              <td className="py-2 px-3 text-center bg-slate-50">
                {slab.status === "AGREED" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" />
                    AGREED
                  </span>
                ) : (
                  <div>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full">
                      <AlertTriangle className="w-3 h-3" />
                      DISPUTED
                    </span>
                    {slab.disputeNote && (
                      <p className="text-[10px] text-amber-600 mt-1 max-w-[200px]">
                        {slab.disputeNote}
                      </p>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Volume Pricing Tiers ─────────────────────────────────────────────────────
function VolumePricingTiers({
  tiers,
  onChange,
}: {
  tiers: VolumeTier[];
  onChange: (tiers: VolumeTier[]) => void;
}) {
  const handleTierChange = (
    idx: number,
    field: keyof VolumeTier,
    val: string | number | null
  ) => {
    const updated = tiers.map((t, i) =>
      i === idx ? { ...t, [field]: val } : t
    );
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      {tiers.map((tier, idx) => (
        <div
          key={tier.id ?? idx}
          className="grid grid-cols-3 gap-3 items-center"
        >
          <div>
            <label className="text-[10px] font-medium text-slate-400 mb-0.5 block">
              Min Qty
            </label>
            <input
              type="number"
              min={0}
              value={tier.minQty}
              onChange={(e) =>
                handleTierChange(idx, "minQty", parseInt(e.target.value) || 0)
              }
              className="w-full font-mono text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium text-slate-400 mb-0.5 block">
              Max Qty
            </label>
            <input
              type="number"
              min={0}
              value={tier.maxQty ?? ""}
              placeholder="No limit"
              onChange={(e) =>
                handleTierChange(
                  idx,
                  "maxQty",
                  e.target.value ? parseInt(e.target.value) : null
                )
              }
              className="w-full font-mono text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium text-slate-400 mb-0.5 block">
              Unit Price (₹)
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={tier.unitPrice}
              onChange={(e) =>
                handleTierChange(idx, "unitPrice", e.target.value)
              }
              className="w-full font-mono text-sm px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Product Card ─────────────────────────────────────────────────────────────
function ProductCard({
  product,
  hasTrimInsta: vendorHasTrimInsta,
}: {
  product: CatalogProduct;
  hasTrimInsta: boolean;
}) {
  const queryClient = useQueryClient();
  const [marginOpen, setMarginOpen] = useState(false);
  const [basePrice, setBasePrice] = useState(product.baseUnitPrice);
  const [onlineStock, setOnlineStock] = useState(product.onlineStock);
  const [packMultiple, setPackMultiple] = useState(product.packMultiple);
  const [trimInstaEnabled, setTrimInstaEnabled] = useState(product.trimInstaEnabled);
  const [hubShelf, setHubShelf] = useState(product.hubShelfAllocation);
  const [volumeTiers, setVolumeTiers] = useState<VolumeTier[]>(
    product.volumeTiers.length > 0
      ? product.volumeTiers
      : [
          { tierNumber: 1, minQty: 1, maxQty: 99, unitPrice: product.baseUnitPrice },
          { tierNumber: 2, minQty: 100, maxQty: 499, unitPrice: product.baseUnitPrice },
          { tierNumber: 3, minQty: 500, maxQty: null, unitPrice: product.baseUnitPrice },
        ]
  );

  const trimInstaLowStock = product.trimInstaStock < 50 && product.trimInstaStock > 0;
  const trimInstaOutOfStock = product.trimInstaStock === 0;

  const saveMutation = useMutation({
    mutationFn: () =>
      apiPatch(`/api/v1/vendors/me/products/${product.id}`, {
        baseUnitPrice: basePrice,
        onlineStock,
        packMultiple,
        trimInstaEnabled: vendorHasTrimInsta ? trimInstaEnabled : undefined,
        hubShelfAllocation: vendorHasTrimInsta ? hubShelf : undefined,
        volumeTiers,
      }),
    onSuccess: () => {
      toast.success(`${product.name} saved successfully`);
      queryClient.invalidateQueries({ queryKey: ["vendor-catalog"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return (
    <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] overflow-hidden">
      {/* Card Header */}
      <div className="px-6 py-4 border-b border-slate-100 flex items-start gap-3">
        <Package className="w-5 h-5 text-[#4F46E5] mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="font-semibold text-slate-800 text-base leading-tight">
            {product.name}
          </h3>
          <div className="flex gap-4 mt-1">
            <span className="text-xs text-slate-400">
              SKU:{" "}
              <code className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                {product.sku}
              </code>
            </span>
            <span className="text-xs text-slate-400">
              HSN:{" "}
              <code className="font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                {product.hsn}
              </code>
            </span>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Core Editable Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">
              Base Unit Price (₹)
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              className="w-full font-mono px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">
              Online Stock (Units)
            </label>
            <input
              type="number"
              min={0}
              value={onlineStock}
              onChange={(e) => setOnlineStock(parseInt(e.target.value) || 0)}
              className="w-full font-mono px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">
              Pack Multiple
            </label>
            <input
              type="number"
              min={1}
              value={packMultiple}
              onChange={(e) => setPackMultiple(parseInt(e.target.value) || 1)}
              className="w-full font-mono px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
            />
          </div>
        </div>

        {/* TrimInsta Section */}
        {vendorHasTrimInsta && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#4F46E5]" />
                <span className="text-sm font-semibold text-slate-700">
                  TrimInsta Fast Dispatch
                </span>
              </div>
              <button
                onClick={() => setTrimInstaEnabled((v) => !v)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  trimInstaEnabled ? "bg-[#4F46E5]" : "bg-slate-200"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    trimInstaEnabled ? "translate-x-6" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            {trimInstaEnabled && (
              <>
                {/* Hub Shelf Stepper */}
                <div>
                  <label className="text-xs font-medium text-slate-500 mb-1.5 block">
                    Hub Shelf Allocation (Units)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setHubShelf((v) => Math.max(0, v - 10))}
                      className="w-9 h-9 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 font-bold text-slate-700 flex items-center justify-center text-lg transition-colors"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={hubShelf}
                      onChange={(e) =>
                        setHubShelf(Math.max(0, parseInt(e.target.value) || 0))
                      }
                      className="w-24 text-center font-mono text-sm px-2 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4F46E5] bg-white"
                    />
                    <button
                      onClick={() => setHubShelf((v) => v + 10)}
                      className="w-9 h-9 rounded-xl bg-white border border-slate-200 hover:border-indigo-300 font-bold text-slate-700 flex items-center justify-center text-lg transition-colors"
                    >
                      +
                    </button>
                    <span className="text-xs text-slate-400">units</span>
                  </div>
                </div>

                {/* Stock Alerts */}
                {trimInstaOutOfStock && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                    <XCircle className="w-4 h-4 text-[#EF4444] flex-shrink-0" />
                    <p className="text-xs font-semibold text-red-600">
                      ❌ TrimInsta Out of Stock — Insta dispatch disabled on storefront
                    </p>
                  </div>
                )}
                {trimInstaLowStock && (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    <p className="text-xs font-semibold text-amber-700">
                      ⚠️ Low Stock (&lt; 50 units): Auto Restock Email Triggered
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Volume Pricing */}
        <div>
          <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-[#4F46E5]" />
            Volume Pricing Tiers
          </h4>
          <VolumePricingTiers tiers={volumeTiers} onChange={setVolumeTiers} />
        </div>

        {/* Margin Matrix Collapsible */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setMarginOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
          >
            <span className="text-xs font-semibold text-slate-600 flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5 text-slate-400" />
              5-Slab Commission Matrix (Read-Only)
            </span>
            {marginOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>
          {marginOpen && (
            <div className="p-4">
              {product.marginSlabs.length > 0 ? (
                <MarginSlabTable slabs={product.marginSlabs} />
              ) : (
                <div className="text-center py-6 text-sm text-slate-400">
                  No margin slabs configured. Contact TrimNova team.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="px-6 py-2.5 bg-[#4F46E5] text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Product
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function VendorCatalogManager() {
  const { data, isLoading, isError, refetch } = useQuery<VendorCatalogData>({
    queryKey: ["vendor-catalog"],
    queryFn: () => apiFetch("/api/v1/vendors/me/catalog"),
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
          <p className="text-slate-600 font-medium mb-3">Failed to load catalog</p>
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
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-[#0F172A]">
              Catalog Manager
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Manage pricing, stock, and TrimInsta settings for your approved products
            </p>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:border-indigo-300 transition-colors shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {data.products.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] p-12 text-center">
            <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No approved products yet</p>
            <p className="text-sm text-slate-400 mt-1">
              Submit capabilities for review to get products listed here.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {data.products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                hasTrimInsta={data.hasTrimInsta}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
