/**
 * VendorOnboardingWizard.tsx
 * TrimNova — Multi-module vendor onboarding wizard
 * Modules: KYC/Compliance → Partnership Plan → TrimInsta & Payment
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Star,
  Award,
  Shield,
  Upload,
  X,
  FileText,
  Clock,
  ChevronRight,
  Loader2,
  Tag,
  Percent,
  Warehouse,
  CreditCard,
  Info,
  TicketPercent,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayPaymentResponse) => void;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void; escape?: boolean };
}

interface RazorpayInstance {
  open(): void;
}

interface RazorpayPaymentResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

type PlanId = "ELITE" | "GOLD" | "BASIC";
type CertStatus = "APPROVED" | "REJECTED" | "ON_HOLD" | "PENDING";

interface Certificate {
  id: string;
  type: string;
  issueDate: string;
  expiryDate: string;
  status: CertStatus;
  comment?: string;
  fileName?: string;
}

interface GstVerifyResponse {
  companyName: string;
  verifiedAt: string;
}

interface PanVerifyResponse {
  name: string;
  verifiedAt: string;
}

interface PlatformConfig {
  registrationFee: string;
  trimInstaRatePerSqFt: string;
  gstRate: string;
}

interface CouponResponse {
  discountAmount: string;
  couponCode: string;
  description: string;
}

interface RazorpayOrderResponse {
  orderId: string;
  amount: number;
  currency: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatINR(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(value);
}

const CERT_TYPES = [
  "GOTS",
  "ISO 9001",
  "OEKO-TEX Standard 100",
  "FSC",
  "GINETEX",
  "REACH",
  "AZO-Free",
  "OBP",
];

const PLANS: Array<{
  id: PlanId;
  name: string;
  price: number;
  icon: React.ReactNode;
  gradient: string;
  borderColor: string;
  badgeColor: string;
  features: string[];
  warning?: string;
}> = [
  {
    id: "ELITE",
    name: "ELITE PLAN",
    price: 24999,
    icon: <Star className="w-7 h-7 text-white" fill="white" />,
    gradient: "from-indigo-600 to-purple-600",
    borderColor: "border-indigo-500",
    badgeColor: "bg-indigo-600",
    features: [
      "Dedicated Marketing Support",
      "Official Verified Supplier Stamp",
      "High-Priority Logo Visibility",
      "Full Analytics & Dashboard",
      "Priority Approver Access",
    ],
  },
  {
    id: "GOLD",
    name: "GOLD PLAN",
    price: 14999,
    icon: <Award className="w-7 h-7 text-amber-900" />,
    gradient: "from-amber-400 to-yellow-500",
    borderColor: "border-amber-400",
    badgeColor: "bg-amber-500",
    features: [
      "Verified Supplier Stamp",
      "Standard Logo Visibility",
      "Full Analytics Dashboard",
      "No Dedicated Marketing",
    ],
  },
  {
    id: "BASIC",
    name: "BASIC PLAN",
    price: 4999,
    icon: <Shield className="w-7 h-7 text-slate-500" />,
    gradient: "from-slate-200 to-slate-300",
    borderColor: "border-slate-400",
    badgeColor: "bg-slate-500",
    features: ["Basic Dashboard Access", "Standard API Access"],
    warning:
      "No Verification & No Logo Visibility (Logo section hidden entirely in procurement catalog)",
  },
];

// ─── API fns ──────────────────────────────────────────────────────────────────
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

async function fetchPlatformConfig(): Promise<PlatformConfig> {
  const res = await fetch("/api/v1/platform-config");
  if (!res.ok) throw new Error("Failed to load platform config");
  return res.json();
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function CertStatusBadge({ status }: { status: CertStatus }) {
  const map: Record<CertStatus, { label: string; cls: string }> = {
    APPROVED: { label: "APPROVED", cls: "bg-emerald-100 text-emerald-700" },
    REJECTED: { label: "REJECTED", cls: "bg-red-100 text-red-600" },
    ON_HOLD: { label: "ON HOLD", cls: "bg-amber-100 text-amber-700" },
    PENDING: { label: "PENDING", cls: "bg-slate-100 text-slate-500" },
  };
  const { label, cls } = map[status];
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  );
}

// ─── Module 1: KYC ────────────────────────────────────────────────────────────
function Module1KYC({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [gstin, setGstin] = useState("");
  const [pan, setPan] = useState("");
  const [gstVerified, setGstVerified] = useState<GstVerifyResponse | null>(null);
  const [panVerified, setPanVerified] = useState<PanVerifyResponse | null>(null);
  const [gstError, setGstError] = useState("");
  const [panError, setPanError] = useState("");
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [certType, setCertType] = useState(CERT_TYPES[0]);
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Registration fee payment state ──────────────────────────────────────────
  const REG_FEE = 5000;
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [regFeePaid, setRegFeePaid] = useState(false);
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeError, setFeeError] = useState("");

  const gstMutation = useMutation({
    mutationFn: () =>
      apiPost<GstVerifyResponse>("/api/v1/vendors/onboarding/verify-gst", {
        gstin,
      }),
    onSuccess: (data) => {
      setGstVerified(data);
      setGstError("");
    },
    onError: (err: Error) => {
      setGstError(err.message);
      setGstVerified(null);
    },
  });

  const panMutation = useMutation({
    mutationFn: () =>
      apiPost<PanVerifyResponse>("/api/v1/vendors/onboarding/verify-pan", {
        pan,
        gstin,
      }),
    onSuccess: (data) => {
      setPanVerified(data);
      setPanError("");
    },
    onError: (err: Error) => {
      setPanError(err.message);
      setPanVerified(null);
    },
  });

  const handleFile = useCallback(
    (file: File) => {
      const newCert: Certificate = {
        id: crypto.randomUUID(),
        type: certType,
        issueDate,
        expiryDate,
        status: "PENDING",
        fileName: file.name,
      };
      setCerts((c) => [...c, newCert]);
    },
    [certType, issueDate, expiryDate]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  // ── Trigger when vendor clicks "Next" (after uploading certs) ───────────────
  const handleNextClick = () => {
    if (!regFeePaid) {
      setShowFeeModal(true);
    } else {
      onComplete();
    }
  };

  // ── Razorpay registration fee payment ───────────────────────────────────────
  const handlePayRegistrationFee = async () => {
    setFeeLoading(true);
    setFeeError("");
    try {
      const orderData = await apiPost<RazorpayOrderResponse>(
        "/api/v1/vendors/onboarding/create-payment",
        { plan: "REG_FEE_ONLY", amount: REG_FEE * 100 }
      );

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => {
        const rzp = new window.Razorpay({
          key: import.meta.env.VITE_RAZORPAY_KEY_ID as string,
          amount: orderData.amount,
          currency: orderData.currency,
          name: "TrimNova",
          description: "One-Time Platform Registration Fee",
          order_id: orderData.orderId,
          handler: (response: RazorpayPaymentResponse) => {
            apiPost("/api/v1/vendors/onboarding/verify-payment", {
              ...response,
              purpose: "REG_FEE",
            }).then(() => {
              setRegFeePaid(true);
              setShowFeeModal(false);
              setFeeLoading(false);
            }).catch(() => {
              setFeeError("Payment verification failed. Please contact support.");
              setFeeLoading(false);
            });
          },
          theme: { color: "#4F46E5" },
        });
        rzp.open();
      };
      script.onerror = () => {
        setFeeError("Could not load payment gateway. Check your internet connection.");
        setFeeLoading(false);
      };
      document.body.appendChild(script);
    } catch (err: any) {
      setFeeError(err?.message ?? "Failed to initiate payment. Please try again.");
      setFeeLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* ── Registration Fee Payment Modal ─────────────────────────────────── */}
      {showFeeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="bg-[#4F46E5] px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-bold text-base">One-Time Registration Fee</p>
                  <p className="text-indigo-200 text-xs mt-0.5">Required to submit KYC for review</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              {/* Fee breakdown */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Platform Registration Fee</span>
                  <span className="font-mono font-semibold text-slate-700">{formatINR(REG_FEE)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">IGST @ 18%</span>
                  <span className="font-mono text-slate-500">{formatINR(REG_FEE * 0.18)}</span>
                </div>
                <div className="flex justify-between font-bold border-t border-slate-200 pt-2.5">
                  <span className="text-slate-800">Total Payable</span>
                  <span className="font-mono text-lg text-[#4F46E5]">{formatINR(REG_FEE * 1.18)}</span>
                </div>
              </div>

              {/* Info */}
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  This is a <strong>non-refundable, one-time fee</strong> charged by TrimNova to process your KYC & compliance documents. Your plan subscription (₹4,999–₹24,999) is a separate annual charge paid in Module 03.
                </p>
              </div>

              {/* Error */}
              {feeError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-xs text-red-600">{feeError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setShowFeeModal(false); setFeeError(""); }}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePayRegistrationFee}
                  disabled={feeLoading}
                  className="flex-1 py-2.5 bg-[#4F46E5] text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
                >
                  {feeLoading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                    : <><CreditCard className="w-4 h-4" /> Pay {formatINR(REG_FEE * 1.18)}</>
                  }
                </button>
              </div>
              <p className="text-center text-xs text-slate-400">🔒 Secured by Razorpay · PCI-DSS Compliant</p>
            </div>
          </div>
        </div>
      )}

      {/* Country Selector */}
      <div className="flex gap-3">
        <button className="px-5 py-2 rounded-lg bg-[#4F46E5] text-white text-sm font-semibold">
          🇮🇳 India [IN]
        </button>
        <button
          disabled
          className="px-5 py-2 rounded-lg bg-slate-100 text-slate-400 text-sm font-medium cursor-not-allowed"
        >
          Other Countries: TBD
        </button>
      </div>

      {/* GST Verification */}
      <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] p-6">
        <h3 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#4F46E5]" />
          GST Verification
        </h3>
        <div className="flex gap-3 items-start">
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              GSTIN (15 characters)
            </label>
            <input
              type="text"
              maxLength={15}
              value={gstin}
              onChange={(e) =>
                setGstin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
              }
              placeholder="22AAAAA0000A1Z5"
              disabled={!!gstVerified}
              className="font-mono w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-[#4F46E5] disabled:bg-slate-50 disabled:text-slate-400"
            />
            {gstError && (
              <p className="mt-1.5 text-xs text-[#EF4444] flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" />
                {gstError}
              </p>
            )}
          </div>
          {!gstVerified && (
            <button
              onClick={() => gstMutation.mutate()}
              disabled={gstin.length !== 15 || gstMutation.isPending}
              className="mt-5 px-5 py-2.5 bg-[#4F46E5] text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {gstMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              Verify GST →
            </button>
          )}
        </div>

        {gstVerified && (
          <div className="mt-4 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-semibold text-emerald-700">
                ✓ Verified via GST API
              </span>
              <span className="text-xs text-slate-400 ml-auto">
                <Clock className="w-3 h-3 inline mr-1" />
                {new Date(gstVerified.verifiedAt).toLocaleString("en-IN")}
              </span>
            </div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Company Name (Locked)
            </label>
            <input
              readOnly
              value={gstVerified.companyName}
              className="w-full px-4 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 cursor-not-allowed"
            />
          </div>
        )}
      </div>

      {/* PAN Verification */}
      <div
        className={`bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] p-6 transition-opacity ${
          !gstVerified ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        <h3 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#4F46E5]" />
          PAN Verification
          {!gstVerified && (
            <span className="ml-2 text-xs text-slate-400 font-normal">
              (Unlocked after GST verification)
            </span>
          )}
        </h3>
        <div className="flex gap-3 items-start">
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              PAN (10 characters)
            </label>
            <input
              type="text"
              maxLength={10}
              value={pan}
              onChange={(e) =>
                setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
              }
              placeholder="AAAAA0000A"
              disabled={!!panVerified}
              className="font-mono w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-[#4F46E5] disabled:bg-slate-50 disabled:text-slate-400"
            />
            {panError && (
              <p className="mt-1.5 text-xs text-[#EF4444] flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" />
                {panError}
              </p>
            )}
          </div>
          {!panVerified && (
            <button
              onClick={() => panMutation.mutate()}
              disabled={pan.length !== 10 || panMutation.isPending}
              className="mt-5 px-5 py-2.5 bg-[#4F46E5] text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {panMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              Verify PAN →
            </button>
          )}
        </div>
        {panVerified && (
          <div className="mt-4 p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-700">
              ✓ Verified via PAN API (Matched with GST)
            </span>
            <span className="text-xs text-slate-400 ml-auto">
              <Clock className="w-3 h-3 inline mr-1" />
              {new Date(panVerified.verifiedAt).toLocaleString("en-IN")}
            </span>
          </div>
        )}
      </div>

      {/* Certificate Upload */}
      <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] p-6">
        <h3 className="text-base font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Upload className="w-4 h-4 text-[#4F46E5]" />
          Compliance Certificates
        </h3>

        {/* Upload Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Certificate Type
            </label>
            <select
              value={certType}
              onChange={(e) => setCertType(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
            >
              {CERT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Issue Date
            </label>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Expiry Date
            </label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
            />
          </div>
        </div>

        {/* Drop Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-[#4F46E5] bg-indigo-50"
              : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50"
          }`}
        >
          <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-600">
            + Upload New Certificate
          </p>
          <p className="text-xs text-slate-400 mt-1">
            PDF, JPG, PNG — drag & drop or click to browse
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>

        {/* Certificate List */}
        {certs.length > 0 && (
          <div className="mt-4 space-y-3">
            {certs.map((cert) => (
              <div
                key={cert.id}
                className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100"
              >
                <FileText className="w-4 h-4 text-slate-400 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-700">
                      {cert.type}
                    </span>
                    <CertStatusBadge status={cert.status} />
                    {cert.fileName && (
                      <span className="text-xs text-slate-400 font-mono">
                        {cert.fileName}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-4 mt-1 text-xs text-slate-400">
                    {cert.issueDate && <span>Issued: {cert.issueDate}</span>}
                    {cert.expiryDate && <span>Expires: {cert.expiryDate}</span>}
                  </div>
                  {cert.comment &&
                    (cert.status === "REJECTED" ||
                      cert.status === "ON_HOLD") && (
                      <p className="mt-1.5 text-xs text-slate-500 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                        {cert.comment}
                      </p>
                    )}
                  {(cert.status === "REJECTED" ||
                    cert.status === "ON_HOLD") && (
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="mt-2 text-xs font-semibold text-[#4F46E5] hover:text-indigo-800"
                    >
                      ↑ Re-upload Certificate
                    </button>
                  )}
                </div>
                <button
                  onClick={() =>
                    setCerts((c) => c.filter((x) => x.id !== cert.id))
                  }
                  className="text-slate-300 hover:text-slate-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Proceed */}
      <div className="space-y-4">
        {/* Registration fee status strip */}
        {!regFeePaid ? (
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <CreditCard className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">Registration Fee Required</p>
              <p className="text-xs text-amber-600 mt-0.5">
                Pay the one-time platform fee of <strong>{formatINR(5000)} + 18% GST</strong> to unlock "Submit for Review"
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">Registration Fee Paid ✓</p>
              <p className="text-xs text-emerald-600 mt-0.5">Your KYC is ready to be submitted for review</p>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={handleNextClick}
            disabled={!gstVerified}
            className={`px-8 py-3 font-semibold rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed
              ${regFeePaid
                ? 'bg-[#10B981] hover:bg-emerald-600 text-white'
                : 'bg-[#4F46E5] hover:bg-indigo-700 text-white'
              }`}
          >
            {regFeePaid ? (
              <><CheckCircle2 className="w-4 h-4" /> Submit for Review →</>
            ) : (
              <><CreditCard className="w-4 h-4" /> Pay & Proceed to Module 02 →</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Module 2: Plan Selection ─────────────────────────────────────────────────
function Module2Plans({
  selectedPlan,
  onSelect,
  onComplete,
  config,
}: {
  selectedPlan: PlanId | null;
  onSelect: (id: PlanId) => void;
  onComplete: () => void;
  config: PlatformConfig;
}) {
  const regFee = parseFloat(config.registrationFee);

  return (
    <div className="space-y-6">
      {/* Registration Fee Banner */}
      <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-800">
            One-Time Registration Fee: {formatINR(regFee)}
          </p>
          <p className="text-xs text-amber-600 mt-0.5">
            Charged once upon completion of onboarding, non-refundable.
          </p>
        </div>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {PLANS.map((plan) => {
          const isSelected = selectedPlan === plan.id;
          const isElite = plan.id === "ELITE";
          return (
            <div
              key={plan.id}
              onClick={() => onSelect(plan.id)}
              className={`relative rounded-2xl cursor-pointer transition-all overflow-hidden ${
                isSelected
                  ? `ring-2 ring-offset-2 ${
                      plan.id === "ELITE"
                        ? "ring-indigo-500"
                        : plan.id === "GOLD"
                        ? "ring-amber-400"
                        : "ring-slate-400"
                    } shadow-lg scale-[1.02]`
                  : "shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] hover:shadow-md"
              }`}
            >
              {/* Card Header Gradient */}
              <div
                className={`bg-gradient-to-br ${plan.gradient} p-5 flex items-center justify-between`}
              >
                <div>
                  <p
                    className={`text-xs font-bold tracking-widest ${
                      isElite ? "text-indigo-100" : "text-slate-600"
                    }`}
                  >
                    {plan.name}
                  </p>
                  <p
                    className={`text-2xl font-extrabold mt-1 ${
                      isElite ? "text-white" : "text-slate-800"
                    }`}
                  >
                    {formatINR(plan.price)}
                    <span
                      className={`text-sm font-normal ml-1 ${
                        isElite ? "text-indigo-200" : "text-slate-500"
                      }`}
                    >
                      /yr
                    </span>
                  </p>
                </div>
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    isElite
                      ? "bg-white/20"
                      : plan.id === "GOLD"
                      ? "bg-amber-100"
                      : "bg-slate-100"
                  }`}
                >
                  {plan.icon}
                </div>
              </div>

              {/* Features */}
              <div className="bg-white p-5">
                <ul className="space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <span className="text-slate-600">{f}</span>
                    </li>
                  ))}
                </ul>

                {plan.warning && (
                  <div className="mt-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">{plan.warning}</p>
                  </div>
                )}

                {isSelected && (
                  <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-emerald-600">
                    <CheckCircle2 className="w-4 h-4" />
                    Selected
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button
          onClick={onComplete}
          disabled={!selectedPlan}
          className="px-8 py-3 bg-[#4F46E5] text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
        >
          Proceed to TrimInsta & Payment →
        </button>
      </div>
    </div>
  );
}

// ─── Module 3: TrimInsta & Payment ────────────────────────────────────────────
function Module3Payment({
  selectedPlan,
  config,
}: {
  selectedPlan: PlanId | null;
  config: PlatformConfig;
}) {
  const [trimInstaEnabled, setTrimInstaEnabled] = useState(false);
  const [warehouseArea, setWarehouseArea] = useState(500);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<CouponResponse | null>(null);
  const [couponError, setCouponError] = useState("");

  const regFee = parseFloat(config.registrationFee);
  const trimInstaRate = parseFloat(config.trimInstaRatePerSqFt);
  const gstRate = parseFloat(config.gstRate) / 100;

  const planInfo = PLANS.find((p) => p.id === selectedPlan);
  const planFee = planInfo?.price ?? 0;
  const trimInstaMonthly = trimInstaEnabled ? trimInstaRate * warehouseArea : 0;

  // Registration fee (₹5,000) was already paid in Module 01 — excluded here
  const subtotal = planFee + trimInstaMonthly;
  const couponDiscount = appliedCoupon ? parseFloat(appliedCoupon.discountAmount) : 0;
  const taxableAmount = subtotal - couponDiscount;
  const igst = taxableAmount * gstRate;
  const total = taxableAmount + igst;

  const couponMutation = useMutation({
    mutationFn: () =>
      apiPost<CouponResponse>("/api/v1/vendors/onboarding/apply-coupon", {
        couponCode,
      }),
    onSuccess: (data) => {
      setAppliedCoupon(data);
      setCouponError("");
    },
    onError: (err: Error) => {
      setCouponError(err.message);
      setAppliedCoupon(null);
    },
  });

  const razorpayMutation = useMutation({
    mutationFn: () =>
      apiPost<RazorpayOrderResponse>("/api/v1/vendors/onboarding/create-payment", {
        plan: selectedPlan,
        trimInstaEnabled,
        warehouseArea: trimInstaEnabled ? warehouseArea : 0,
        couponCode: appliedCoupon?.couponCode,
      }),
    onSuccess: (data) => {
      // Load Razorpay checkout
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => {
        const rzp = new window.Razorpay({
          key: import.meta.env.VITE_RAZORPAY_KEY_ID as string,
          amount: data.amount,
          currency: data.currency,
          name: "TrimNova",
          description: `${planInfo?.name ?? "Vendor Plan"} Registration`,
          order_id: data.orderId,
          handler: (response) => {
            // Verify payment
            apiPost("/api/v1/vendors/onboarding/verify-payment", response).then(
              () => {
                window.location.href = "/vendor/dashboard";
              }
            );
          },
          theme: { color: "#4F46E5" },
        });
        rzp.open();
      };
      document.body.appendChild(script);
    },
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Left — TrimInsta Config */}
      <div className="lg:col-span-3 space-y-6">
        {/* TrimInsta Toggle */}
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Warehouse className="w-5 h-5 text-[#4F46E5]" />
                TrimInsta Micro-Warehousing
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Enable fast 6-hour dispatch capability for your products
              </p>
            </div>
            {/* Toggle */}
            <button
              onClick={() => setTrimInstaEnabled((v) => !v)}
              className={`relative w-16 h-8 rounded-full transition-colors ${
                trimInstaEnabled ? "bg-[#4F46E5]" : "bg-slate-200"
              }`}
            >
              <span
                className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                  trimInstaEnabled ? "translate-x-9" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {trimInstaEnabled && (
            <div className="space-y-4">
              {/* Area Stepper */}
              <div>
                <label className="text-xs font-medium text-slate-500 mb-2 block">
                  Warehouse Area (sq ft)
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setWarehouseArea((v) => Math.max(100, v - 100))}
                    className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center text-lg transition-colors"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={warehouseArea}
                    onChange={(e) =>
                      setWarehouseArea(Math.max(100, parseInt(e.target.value) || 100))
                    }
                    className="w-28 text-center font-mono text-lg font-semibold px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
                  />
                  <button
                    onClick={() => setWarehouseArea((v) => v + 100)}
                    className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center text-lg transition-colors"
                  >
                    +
                  </button>
                  <span className="text-sm text-slate-500">sq ft</span>
                </div>
              </div>

              {/* Live Calculation */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-3">
                <p className="text-sm font-mono text-indigo-700 font-semibold">
                  {formatINR(trimInstaRate)} × {warehouseArea.toLocaleString("en-IN")} sq ft ={" "}
                  <span className="text-[#4F46E5] text-base">
                    {formatINR(trimInstaMonthly)}/month
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Dual Delivery Info Banner */}
          <div
            className={`mt-4 flex items-start gap-3 bg-[#4F46E5]/10 border border-[#4F46E5]/20 rounded-xl px-4 py-3 ${
              !trimInstaEnabled ? "opacity-60" : ""
            }`}
          >
            <Info className="w-4 h-4 text-[#4F46E5] flex-shrink-0 mt-0.5" />
            <p className="text-xs text-indigo-700">
              <strong>Dual Delivery Unlock:</strong> Enables buyers to choose between standard
              "Online Shipment" and instant "Insta 6-Hour Dispatch"
            </p>
          </div>
        </div>
      </div>

      {/* Right — Invoice Summary */}
      <div className="lg:col-span-2">
        <div className="bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] p-6 sticky top-4">
          <h3 className="text-base font-semibold text-slate-800 mb-5 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[#4F46E5]" />
            Tax Invoice & Settlement Summary
          </h3>

          {/* Line Items */}
          <div className="space-y-3 text-sm">
            {/* Registration fee — already paid in Module 01 */}
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Registration Fee</span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5" /> Paid in Module 01
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">
                {planInfo?.name ?? "Plan"} (Annual)
              </span>
              <span className="font-mono font-semibold text-slate-700">
                {formatINR(planFee)}
              </span>
            </div>
            {trimInstaEnabled && (
              <div className="flex justify-between">
                <span className="text-slate-500">
                  TrimInsta ({warehouseArea.toLocaleString("en-IN")} sq ft/mo)
                </span>
                <span className="font-mono font-semibold text-slate-700">
                  {formatINR(trimInstaMonthly)}
                </span>
              </div>
            )}
            {appliedCoupon && (
              <div className="flex justify-between text-emerald-600">
                <span>Coupon ({appliedCoupon.couponCode})</span>
                <span className="font-mono font-semibold">
                  −{formatINR(couponDiscount)}
                </span>
              </div>
            )}
            <div className="flex justify-between font-semibold border-t border-slate-100 pt-3">
              <span className="text-slate-700">Subtotal</span>
              <span className="font-mono text-slate-800">{formatINR(taxableAmount)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>IGST @ {(gstRate * 100).toFixed(0)}%</span>
              <span className="font-mono">{formatINR(igst)}</span>
            </div>
          </div>

          {/* Total */}
          <div className="mt-4 pt-4 border-t-2 border-slate-200 flex justify-between items-center">
            <span className="text-base font-bold text-slate-800">Total Amount</span>
            <span className="font-mono text-xl font-extrabold text-[#4F46E5]">
              {formatINR(total)}
            </span>
          </div>

          {/* Coupon Input */}
          <div className="mt-5">
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">
              Coupon Code
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="ENTER CODE"
                className="flex-1 font-mono px-3 py-2 border border-slate-200 rounded-xl text-sm tracking-wider focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
              />
              <button
                onClick={() => couponMutation.mutate()}
                disabled={!couponCode || couponMutation.isPending}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-200 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
              >
                {couponMutation.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <TicketPercent className="w-3.5 h-3.5" />
                )}
                Apply
              </button>
            </div>
            {couponError && (
              <p className="mt-1.5 text-xs text-[#EF4444]">{couponError}</p>
            )}
            {appliedCoupon && (
              <p className="mt-1.5 text-xs text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {appliedCoupon.description}
              </p>
            )}
          </div>

          {/* Pay Button */}
          <button
            onClick={() => razorpayMutation.mutate()}
            disabled={!selectedPlan || razorpayMutation.isPending}
            className="mt-5 w-full py-3.5 bg-[#4F46E5] text-white font-bold text-sm rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
          >
            {razorpayMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CreditCard className="w-4 h-4" />
            )}
            Complete Registration & Proceed to Payment →
          </button>
          <p className="text-center text-xs text-slate-400 mt-2">
            Secured by Razorpay · PCI-DSS Compliant
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Wizard ───────────────────────────────────────────────────────────────
const MODULES = [
  "Module 01: KYC & Compliance",
  "Module 02: Partnership Plan",
  "Module 03: TrimInsta & Payment",
];

export default function VendorOnboardingWizard() {
  const [activeModule, setActiveModule] = useState(0);
  const [completedModules, setCompletedModules] = useState<Set<number>>(new Set());
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null);

  const { data: config, isLoading: configLoading } = useQuery<PlatformConfig>({
    queryKey: ["platform-config"],
    queryFn: fetchPlatformConfig,
  });

  const handleModuleComplete = (index: number) => {
    setCompletedModules((s) => new Set([...s, index]));
    setActiveModule(index + 1);
  };

  if (configLoading) {
    return (
      <div className="min-h-screen bg-[#F4F6FB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#4F46E5]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6FB] py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-[#0F172A]">
            Vendor Onboarding
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Complete all three modules to activate your vendor account
          </p>
        </div>

        {/* Module Tab Bar */}
        <div className="flex gap-1 bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.07),0_4px_16px_rgba(0,0,0,0.05)] p-1.5 mb-6">
          {MODULES.map((label, idx) => {
            const isActive = activeModule === idx;
            const isCompleted = completedModules.has(idx);
            const isLocked =
              idx > 0 &&
              !completedModules.has(idx - 1) &&
              activeModule !== idx;

            return (
              <button
                key={idx}
                onClick={() => !isLocked && setActiveModule(idx)}
                disabled={isLocked}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-[#4F46E5] text-white shadow-sm"
                    : isCompleted
                    ? "text-emerald-600 hover:bg-emerald-50"
                    : "text-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed"
                }`}
              >
                {isCompleted && !isActive && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                )}
                {label}
              </button>
            );
          })}
        </div>

        {/* Progress Bar */}
        <div className="w-full h-1.5 bg-slate-200 rounded-full mb-8 overflow-hidden">
          <div
            className="h-full bg-[#4F46E5] rounded-full transition-all duration-500"
            style={{ width: `${((activeModule + 1) / MODULES.length) * 100}%` }}
          />
        </div>

        {/* Module Content */}
        {activeModule === 0 && (
          <Module1KYC onComplete={() => handleModuleComplete(0)} />
        )}
        {activeModule === 1 && config && (
          <Module2Plans
            selectedPlan={selectedPlan}
            onSelect={setSelectedPlan}
            onComplete={() => handleModuleComplete(1)}
            config={config}
          />
        )}
        {activeModule === 2 && config && (
          <Module3Payment selectedPlan={selectedPlan} config={config} />
        )}
      </div>
    </div>
  );
}
