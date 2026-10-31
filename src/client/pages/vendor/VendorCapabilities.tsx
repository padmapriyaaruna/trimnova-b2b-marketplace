/**
 * VendorCapabilities.tsx
 * TrimNova — 3-level capability selector with certification visibility bar
 */

import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Tag,
  Scissors,
  Wrench,
  Sparkles,
  CheckCircle2,
  Lock,
  X,
  FileText,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Send,
  Shield,
  Award,
  Star,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────
type PlanId = "ELITE" | "GOLD" | "BASIC";
type CertStatus = "APPROVED" | "REJECTED" | "ON_HOLD" | "PENDING";

interface VendorProfile {
  planId: PlanId;
  planExpiry: string;
  managedBy: "VENDOR" | "ADMIN";
}

interface Certification {
  id: string;
  type: string;
  status: CertStatus;
  fileUrl?: string;
}

interface SelectedCapability {
  categoryCode: string;
  subProductId: string;
  subProductName: string;
  moq: number;
  leadTimeDays: number;
}

// ─── Static Data ──────────────────────────────────────────────────────────────
const CLASSIFICATIONS = [
  {
    id: "labels",
    label: "Labels & Tags",
    icon: <Tag className="w-6 h-6" />,
    color: "text-violet-500",
    bg: "bg-violet-50 border-violet-200",
    selectedBg: "bg-violet-100 border-violet-400",
  },
  {
    id: "core",
    label: "Core Garment Trims",
    icon: <Scissors className="w-6 h-6" />,
    color: "text-blue-500",
    bg: "bg-blue-50 border-blue-200",
    selectedBg: "bg-blue-100 border-blue-400",
  },
  {
    id: "finishing",
    label: "Finishing & Hardware",
    icon: <Wrench className="w-6 h-6" />,
    color: "text-emerald-500",
    bg: "bg-emerald-50 border-emerald-200",
    selectedBg: "bg-emerald-100 border-emerald-400",
  },
  {
    id: "embellishments",
    label: "Embellishments & Safety",
    icon: <Sparkles className="w-6 h-6" />,
    color: "text-pink-500",
    bg: "bg-pink-50 border-pink-200",
    selectedBg: "bg-pink-100 border-pink-400",
  },
];

const CATEGORY_PILLS = [
  { code: "01", label: "Labels & Tags" },
  { code: "02", label: "Threads" },
  { code: "03", label: "Buttons" },
  { code: "04", label: "Zippers" },
  { code: "05", label: "Tapes" },
  { code: "06", label: "Interlining" },
  { code: "07", label: "Packaging" },
  { code: "08", label: "Embellishments" },
  { code: "09", label: "Elastics" },
  { code: "10", label: "Buckles" },
  { code: "11", label: "Velcro" },
  { code: "12", label: "Safety" },
];

const SUB_PRODUCTS: Record<
  string,
  Array<{ id: string; name: string }>
> = {
  "01": [
    { id: "woven-label", name: "Woven Labels" },
    { id: "printed-label", name: "Printed Labels" },
    { id: "hang-tag", name: "Hang Tags" },
    { id: "barcode-label", name: "Barcode Labels" },
    { id: "care-label", name: "Care Labels" },
    { id: "size-label", name: "Size Labels" },
  ],
  "02": [
    { id: "polyester-thread", name: "Polyester Thread" },
    { id: "cotton-thread", name: "Cotton Thread" },
    { id: "nylon-thread", name: "Nylon Thread" },
    { id: "embroidery-thread", name: "Embroidery Thread" },
  ],
  "03": [
    { id: "plastic-button", name: "Plastic Buttons" },
    { id: "metal-button", name: "Metal Buttons" },
    { id: "snap-button", name: "Snap Buttons" },
    { id: "wooden-button", name: "Wooden Buttons" },
  ],
  "04": [
    { id: "nylon-zipper", name: "Nylon Zippers" },
    { id: "metal-zipper", name: "Metal Zippers" },
    { id: "waterproof-zipper", name: "Waterproof Zippers" },
    { id: "invisible-zipper", name: "Invisible Zippers" },
  ],
  "05": [
    { id: "seam-tape", name: "Seam Tape" },
    { id: "iron-on-tape", name: "Iron-On Tape" },
    { id: "velcro-tape", name: "Velcro Tape" },
    { id: "bias-tape", name: "Bias Tape" },
  ],
  "06": [
    { id: "woven-interlining", name: "Woven Interlining" },
    { id: "non-woven-interlining", name: "Non-Woven Interlining" },
    { id: "fusible-interlining", name: "Fusible Interlining" },
  ],
  "07": [
    { id: "poly-bag", name: "Poly Bags" },
    { id: "garment-bag", name: "Garment Bags" },
    { id: "tissue-paper", name: "Tissue Paper" },
    { id: "packaging-box", name: "Packaging Box" },
  ],
  "08": [
    { id: "rhinestones", name: "Rhinestones" },
    { id: "sequins", name: "Sequins" },
    { id: "patches", name: "Patches" },
    { id: "studs", name: "Studs" },
  ],
  "09": [
    { id: "flat-elastic", name: "Flat Elastic" },
    { id: "round-elastic", name: "Round Elastic" },
    { id: "waistband-elastic", name: "Waistband Elastic" },
  ],
  "10": [
    { id: "d-ring", name: "D-Rings" },
    { id: "slide-buckle", name: "Slide Buckles" },
    { id: "roller-buckle", name: "Roller Buckles" },
    { id: "tri-glide", name: "Tri-Glide" },
  ],
  "11": [
    { id: "hook-loop", name: "Hook & Loop Strips" },
    { id: "self-adhesive-velcro", name: "Self-Adhesive Velcro" },
    { id: "sew-on-velcro", name: "Sew-On Velcro" },
  ],
  "12": [
    { id: "safety-pin", name: "Safety Pins" },
    { id: "kilt-pin", name: "Kilt Pins" },
    { id: "locking-pin", name: "Locking Pins" },
  ],
};

const CERT_LOGOS: Array<{ id: string; label: string; abbr: string; color: string }> = [
  { id: "oeko-tex", label: "OEKO-TEX Standard 100", abbr: "OEKO", color: "bg-teal-100 text-teal-700 border-teal-300" },
  { id: "fsc", label: "FSC", abbr: "FSC", color: "bg-green-100 text-green-700 border-green-300" },
  { id: "ginetex", label: "GINETEX", abbr: "GIN", color: "bg-sky-100 text-sky-700 border-sky-300" },
  { id: "gots", label: "GOTS", abbr: "GOTS", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  { id: "reach", label: "REACH", abbr: "REACH", color: "bg-indigo-100 text-indigo-700 border-indigo-300" },
  { id: "obp", label: "OBP", abbr: "OBP", color: "bg-violet-100 text-violet-700 border-violet-300" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || "Request failed");
  }
  return res.json();
}

const PLAN_BADGE: Record<PlanId, { label: string; cls: string; icon: React.ReactNode }> = {
  ELITE: {
    label: "ELITE PLAN ACTIVE",
    cls: "bg-indigo-600 text-white",
    icon: <Star className="w-3.5 h-3.5" fill="white" />,
  },
  GOLD: {
    label: "GOLD PLAN ACTIVE",
    cls: "bg-amber-500 text-white",
    icon: <Award className="w-3.5 h-3.5" />,
  },
  BASIC: {
    label: "BASIC PLAN ACTIVE",
    cls: "bg-slate-500 text-white",
    icon: <Shield className="w-3.5 h-3.5" />,
  },
};

// ─── Sub-Products Matrix ───────────────────────────────────────────────────────
function SubProductMatrix({
  categoryCode,
  selected,
  onToggle,
  onMoqChange,
  onLeadTimeChange,
}: {
  categoryCode: string;
  selected: SelectedCapability[];
  onToggle: (cap: SelectedCapability) => void;
  onMoqChange: (id: string, val: number) => void;
  onLeadTimeChange: (id: string, val: number) => void;
}) {
  const products = SUB_PRODUCTS[categoryCode] ?? [];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="py-2.5 px-3 text-left font-semibold text-slate-500 text-xs">
              Sub-Product
            </th>
            <th className="py-2.5 px-3 text-center font-semibold text-slate-500 text-xs w-16">
              Select
            </th>
            <th className="py-2.5 px-3 text-center font-semibold text-slate-500 text-xs w-28">
              MOQ (Units)
            </th>
            <th className="py-2.5 px-3 text-center font-semibold text-slate-500 text-xs w-28">
              Lead Time (Days)
            </th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const isSel = selected.some((s) => s.subProductId === product.id);
            const cap = selected.find((s) => s.subProductId === product.id);

            return (
              <tr
                key={product.id}
                className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${
                  isSel ? "bg-indigo-50/50" : ""
                }`}
              >
                <td className="py-2.5 px-3 font-medium text-slate-700">
                  {product.name}
                </td>
                <td className="py-2.5 px-3 text-center">
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={() =>
                      onToggle({
                        categoryCode,
                        subProductId: product.id,
                        subProductName: product.name,
                        moq: cap?.moq ?? 100,
                        leadTimeDays: cap?.leadTimeDays ?? 7,
                      })
                    }
                    className="w-4 h-4 accent-[#4F46E5] cursor-pointer"
                  />
                </td>
                <td className="py-2.5 px-3">
                  <input
                    type="number"
                    min={1}
                    value={cap?.moq ?? ""}
                    disabled={!isSel}
                    onChange={(e) =>
                      onMoqChange(product.id, parseInt(e.target.value) || 1)
                    }
                    placeholder="—"
                    className="w-full text-center font-mono text-sm px-2 py-1 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4F46E5] disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </td>
                <td className="py-2.5 px-3">
                  <input
                    type="number"
                    min={1}
                    value={cap?.leadTimeDays ?? ""}
                    disabled={!isSel}
                    onChange={(e) =>
                      onLeadTimeChange(product.id, parseInt(e.target.value) || 1)
                    }
                    placeholder="—"
                    className="w-full text-center font-mono text-sm px-2 py-1 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4F46E5] disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Cert Logo Bar ─────────────────────────────────────────────────────────────
function CertLogoBar({
  certs,
  planId,
}: {
  certs: Certification[];
  planId: PlanId;
}) {
  const [previewCert, setPreviewCert] = useState<Certification | null>(null);

  if (planId === "BASIC") return null;

  return (
    <>
      <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">
          Certification Logo Visibility
        </h3>
        <div className="flex flex-wrap gap-3">
          {CERT_LOGOS.map((logo) => {
            const cert = certs.find((c) =>
              c.type.toLowerCase().includes(logo.id.replace("-", " "))
            );
            const isApproved = cert?.status === "APPROVED";
            const certStatus = cert?.status ?? "PENDING";

            return (
              <button
                key={logo.id}
                disabled={!isApproved}
                onClick={() => isApproved && cert && setPreviewCert(cert)}
                title={
                  isApproved
                    ? `View ${logo.label} Certificate`
                    : `${logo.label} — ${certStatus}`
                }
                className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${
                  isApproved
                    ? `${logo.color} hover:shadow-md cursor-pointer`
                    : "bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed"
                }`}
              >
                {!isApproved && (
                  <Lock className="w-3.5 h-3.5 text-slate-300" />
                )}
                {isApproved && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                )}
                {logo.abbr}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Full-color logos = APPROVED certificates. Greyed = Pending review or
          not yet uploaded.
        </p>
      </div>

      {/* PDF Preview Modal */}
      {previewCert && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="font-semibold text-slate-800">
                  {previewCert.type} Certificate
                </h3>
                <p className="text-xs text-emerald-600 flex items-center gap-1 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  APPROVED
                </p>
              </div>
              <button
                onClick={() => setPreviewCert(null)}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-5">
              {previewCert.fileUrl ? (
                <iframe
                  src={previewCert.fileUrl}
                  className="w-full h-96 rounded-xl border border-slate-200"
                  title="Certificate Preview"
                />
              ) : (
                <div className="h-96 rounded-xl bg-slate-100 flex flex-col items-center justify-center text-slate-400">
                  <FileText className="w-12 h-12 mb-2" />
                  <p className="text-sm">Certificate file not available for preview</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function VendorCapabilities() {
  const [managedBy, setManagedBy] = useState<"VENDOR" | "ADMIN">("VENDOR");
  const [selectedClassification, setSelectedClassification] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("01");
  const [selectedCaps, setSelectedCaps] = useState<SelectedCapability[]>([]);

  const { data: profile, isLoading: profileLoading } = useQuery<VendorProfile>({
    queryKey: ["vendor-profile"],
    queryFn: () => apiFetch("/api/v1/vendors/me/profile"),
  });

  const { data: certs = [] } = useQuery<Certification[]>({
    queryKey: ["vendor-certs"],
    queryFn: () => apiFetch("/api/v1/vendors/me/certificates"),
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      apiPost("/api/v1/vendors/me/capabilities", {
        capabilities: selectedCaps,
      }),
    onSuccess: () => {
      toast.success("Capabilities submitted for Approver review!");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleCapabilityToggle = (cap: SelectedCapability) => {
    setSelectedCaps((prev) => {
      const exists = prev.find((s) => s.subProductId === cap.subProductId);
      if (exists) {
        return prev.filter((s) => s.subProductId !== cap.subProductId);
      }
      return [...prev, cap];
    });
  };

  const handleMoqChange = (id: string, val: number) => {
    setSelectedCaps((prev) =>
      prev.map((s) => (s.subProductId === id ? { ...s, moq: val } : s))
    );
  };

  const handleLeadTimeChange = (id: string, val: number) => {
    setSelectedCaps((prev) =>
      prev.map((s) =>
        s.subProductId === id ? { ...s, leadTimeDays: val } : s
      )
    );
  };

  const removeCapability = (id: string) => {
    setSelectedCaps((prev) => prev.filter((s) => s.subProductId !== id));
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-[#F4F6FB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#4F46E5]" />
      </div>
    );
  }

  const planId: PlanId = profile?.planId ?? "BASIC";
  const badge = PLAN_BADGE[planId];

  return (
    <div className="min-h-screen bg-[#F4F6FB] py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Bar */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-[#0F172A]">
              Product Capabilities
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Select what you manufacture and supply
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Plan Badge */}
            <span
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide ${badge.cls}`}
            >
              {badge.icon}
              {badge.label}
            </span>
            {/* Managed By Toggle */}
            <button
              onClick={() =>
                setManagedBy((v) => (v === "VENDOR" ? "ADMIN" : "VENDOR"))
              }
              className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-200 shadow-sm text-xs font-semibold text-slate-600 hover:border-indigo-300 transition-colors"
            >
              {managedBy === "VENDOR" ? (
                <ToggleRight className="w-4 h-4 text-[#4F46E5]" />
              ) : (
                <ToggleLeft className="w-4 h-4 text-slate-400" />
              )}
              Section Managed By:{" "}
              <span
                className={
                  managedBy === "VENDOR" ? "text-[#4F46E5]" : "text-slate-500"
                }
              >
                {managedBy === "VENDOR" ? "Vendor" : "Admin / TrimNova Team"}
              </span>
            </button>
          </div>
        </div>

        {/* Level 1: Classification Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {CLASSIFICATIONS.map((cls) => {
            const isSelected = selectedClassification === cls.id;
            return (
              <button
                key={cls.id}
                onClick={() =>
                  setSelectedClassification(isSelected ? null : cls.id)
                }
                className={`flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all ${
                  isSelected
                    ? `${cls.selectedBg} shadow-md scale-[1.02]`
                    : `${cls.bg} hover:shadow-sm`
                }`}
              >
                <div className={cls.color}>{cls.icon}</div>
                <span className="text-sm font-semibold text-slate-700 text-center leading-snug">
                  {cls.label}
                </span>
                {isSelected && (
                  <CheckCircle2 className="w-4 h-4 text-[#4F46E5]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Level 2: Category Pills */}
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] p-4">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORY_PILLS.map((pill) => {
              const isActive = activeCategory === pill.code;
              return (
                <button
                  key={pill.code}
                  onClick={() => setActiveCategory(pill.code)}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-colors ${
                    isActive
                      ? "bg-[#4F46E5] text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {pill.code} {pill.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Level 3: Sub-Products Matrix */}
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">
            {CATEGORY_PILLS.find((p) => p.code === activeCategory)?.label ??
              "Sub-Products"}{" "}
            — Sub-Product Matrix
          </h3>
          <SubProductMatrix
            categoryCode={activeCategory}
            selected={selectedCaps}
            onToggle={handleCapabilityToggle}
            onMoqChange={handleMoqChange}
            onLeadTimeChange={handleLeadTimeChange}
          />
        </div>

        {/* Certification Logo Bar */}
        <CertLogoBar certs={certs} planId={planId} />

        {/* Selected Capabilities Basket */}
        {selectedCaps.length > 0 && (
          <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-700">
                Selected Capabilities Basket ({selectedCaps.length})
              </h3>
              <button
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending}
                className="px-5 py-2.5 bg-[#4F46E5] text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
              >
                {submitMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Submit for Approver Review
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedCaps.map((cap) => (
                <div
                  key={cap.subProductId}
                  className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold px-3 py-1.5 rounded-full"
                >
                  <span>{cap.subProductName}</span>
                  <span className="text-indigo-400 font-normal">
                    MOQ: {cap.moq.toLocaleString("en-IN")} · {cap.leadTimeDays}d
                  </span>
                  <button
                    onClick={() => removeCapability(cap.subProductId)}
                    className="text-indigo-400 hover:text-indigo-700 ml-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Submit Button (bottom) — visible even without basket */}
        {selectedCaps.length === 0 && (
          <div className="flex justify-end">
            <button
              disabled
              className="px-8 py-3 bg-[#4F46E5] text-white font-semibold rounded-xl opacity-40 cursor-not-allowed flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              Submit Selected Products for Approver Review
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
