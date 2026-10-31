/**
 * ProductDetailPage.tsx — TrimNova Enterprise B2B Product Detail
 * Full spec: vendor identity, certification bar, tech specs, pricing slabs,
 * fulfilment selector, quantity calculator, action buttons.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import {
  ChevronLeft, ChevronRight, ShieldCheck, Shield, Lock,
  Zap, Truck, Package, Download, FlaskConical, ShoppingCart,
  Plus, Minus, X, ExternalLink, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, Info, MapPin, BadgeCheck
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────────────── */
type VendorPlan = 'ELITE' | 'GOLD' | 'BASIC';
type CertStatus  = 'APPROVED' | 'PENDING' | 'REJECTED' | 'ON_HOLD';

interface CertEntry {
  key: string;
  label: string;
  status: CertStatus;
  issuedBy?: string;
  validUntil?: string;
  pdfUrl?: string;
}

interface PriceSlab {
  minQty: number;
  maxQty: number | null;
  pricePerUnit: number;
  label: string;
}

interface ShadeVariant {
  id: string;
  name: string;
  hexColor: string;
  shade: string;
}

interface TrimInstaHub {
  hubName: string;
  city: string;
  stock: number;
}

interface ProductDetail {
  id: string;
  name: string;
  sku: string;
  hsnCode: string;
  subcategory: string;
  categoryName: string;
  basePrice: number;
  moq: number;
  packMultiple: number;
  gstRate: number;
  vendorId: string;
  vendorName: string;
  vendorPlan: VendorPlan;
  vendorGstin: string;
  certifications: CertEntry[];
  priceSlabs: PriceSlab[];
  variants: ShadeVariant[];
  triminstaEnabled: boolean;
  triminstaHubs: TrimInstaHub[];
  techSpecs: { label: string; value: string }[];
  images: string[];
}

/* ─── Mock Data ──────────────────────────────────────────────────────────── */
const MOCK_PRODUCT: ProductDetail = {
  id: 'p3',
  name: 'High-Tenacity Bonded Poly Thread — Tex 40',
  sku: 'THR-HTP-120',
  hsnCode: '5402.11',
  subcategory: 'Bonded Polyester Threads',
  categoryName: 'Sewing Threads',
  basePrice: 2.50,
  moq: 100,
  packMultiple: 50,
  gstRate: 12,
  vendorId: 'v1',
  vendorName: 'ThreadWorks Manufacturing Pvt Ltd',
  vendorPlan: 'ELITE',
  vendorGstin: '27AAACT2727Q1ZV',
  certifications: [
    { key: 'OEKO_TEX', label: 'OEKO-TEX® Standard 100', status: 'APPROVED', issuedBy: 'Hohenstein Institute', validUntil: '2025-12-31', pdfUrl: '#' },
    { key: 'GOTS',     label: 'GOTS v6.0',               status: 'APPROVED', issuedBy: 'Control Union', validUntil: '2025-06-30', pdfUrl: '#' },
    { key: 'FSC',      label: 'FSC Chain-of-Custody',    status: 'PENDING',  issuedBy: 'SGS' },
    { key: 'REACH',    label: 'REACH Compliance',         status: 'APPROVED', issuedBy: 'Intertek', validUntil: '2026-03-15', pdfUrl: '#' },
    { key: 'GINETEX',  label: 'GINETEX Symbol License',  status: 'ON_HOLD',  issuedBy: 'GINETEX Intl' },
    { key: 'OBP',      label: 'Ocean Bound Plastic',     status: 'REJECTED' },
  ],
  priceSlabs: [
    { minQty: 100,  maxQty: 499,  pricePerUnit: 2.50, label: '100–499 units' },
    { minQty: 500,  maxQty: 1999, pricePerUnit: 2.10, label: '500–1,999 units' },
    { minQty: 2000, maxQty: null, pricePerUnit: 1.75, label: '2,000+ units' },
  ],
  variants: [
    { id: 'sh1', name: 'Optical White',  hexColor: '#FFFFFF', shade: 'TW-001' },
    { id: 'sh2', name: 'Jet Black',      hexColor: '#1a1a1a', shade: 'TW-002' },
    { id: 'sh3', name: 'Navy Blue',      hexColor: '#1E3A5F', shade: 'TW-045' },
    { id: 'sh4', name: 'Brick Red',      hexColor: '#8B2500', shade: 'TW-112' },
    { id: 'sh5', name: 'Olive Green',    hexColor: '#556B2F', shade: 'TW-078' },
    { id: 'sh6', name: 'Dusty Rose',     hexColor: '#C2848B', shade: 'TW-203' },
  ],
  triminstaEnabled: true,
  triminstaHubs: [
    { hubName: 'Bhiwandi Micro-Hub', city: 'Bhiwandi, MH', stock: 3200 },
    { hubName: 'Tiruppur Hub',       city: 'Tiruppur, TN', stock: 0 },
  ],
  techSpecs: [
    { label: 'Material Composition',   value: '100% Bonded Polyester' },
    { label: 'Count / Ticket Size',    value: 'Tex 40 (Ticket 120)' },
    { label: 'Tensile Strength',       value: '≥ 650 cN (warp), ≥ 580 cN (weft)' },
    { label: 'Elongation at Break',    value: '18–25%' },
    { label: 'Recommended Needles',    value: 'Nm 80/12 – Nm 100/16' },
    { label: 'Cone Length',            value: '5,000 m (net)' },
    { label: 'IS / ASTM Compliance',   value: 'IS 1964:2001 · ASTM D2256-10' },
    { label: 'Colour Fastness (wash)', value: '≥ 4–5 (ISO 105-C06)' },
  ],
  images: ['img1', 'img2', 'img3', 'img4', 'img5'],
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const CERT_COLORS: Record<string, string> = {
  OEKO_TEX: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  GOTS:     'bg-green-50 text-green-700 border-green-200',
  FSC:      'bg-lime-50 text-lime-700 border-lime-200',
  REACH:    'bg-purple-50 text-purple-700 border-purple-200',
  GINETEX:  'bg-blue-50 text-blue-700 border-blue-200',
  OBP:      'bg-cyan-50 text-cyan-700 border-cyan-200',
};

const IMAGE_GRADIENTS = [
  'from-violet-200 to-indigo-300',
  'from-sky-200 to-cyan-300',
  'from-emerald-200 to-teal-300',
  'from-amber-200 to-orange-300',
  'from-pink-200 to-rose-300',
];

function redactGstin(gstin: string) {
  return gstin.slice(0, 5) + '•'.repeat(6) + gstin.slice(-4);
}

function getActiveSlab(qty: number, slabs: PriceSlab[]): PriceSlab {
  for (let i = slabs.length - 1; i >= 0; i--) {
    if (qty >= slabs[i].minQty) return slabs[i];
  }
  return slabs[0];
}

/* ─── Cert Modal ─────────────────────────────────────────────────────────── */
function CertModal({ cert, onClose }: { cert: CertEntry; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative card-elevated w-full max-w-lg p-0 overflow-hidden">
        <div className="bg-[#0F172A] px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-white font-bold">{cert.label}</p>
            <p className="text-slate-400 text-sm">Certificate Details</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {cert.issuedBy && (
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider">Issued By</p>
                <p className="font-semibold text-slate-800 mt-1">{cert.issuedBy}</p>
              </div>
            )}
            {cert.validUntil && (
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider">Valid Until</p>
                <p className="font-semibold text-slate-800 mt-1">{cert.validUntil}</p>
              </div>
            )}
          </div>
          {cert.pdfUrl && (
            <div className="h-64 bg-slate-100 rounded-xl flex flex-col items-center justify-center gap-3">
              <ExternalLink className="w-8 h-8 text-slate-400" />
              <p className="text-slate-500 text-sm">Certificate PDF</p>
              <a href={cert.pdfUrl} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm">
                <Download className="w-4 h-4" /> Open PDF
              </a>
            </div>
          )}
          <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="text-sm text-emerald-700 font-medium">
              OCR Verification: 100% Confidence Match with GSTIN
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main ───────────────────────────────────────────────────────────────── */
export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  /* In a real app, fetch from API */
  const product = MOCK_PRODUCT;

  const [activeImage, setActiveImage]       = useState(0);
  const [selectedVariant, setSelectedVariant] = useState(product.variants[0]);
  const [fulfilment, setFulfilment]         = useState<'ONLINE' | 'INSTA'>('ONLINE');
  const [quantity, setQuantity]             = useState(product.moq);
  const [specsOpen, setSpecsOpen]           = useState(true);
  const [certModalOpen, setCertModalOpen]   = useState<CertEntry | null>(null);

  const activeSlab  = getActiveSlab(quantity, product.priceSlabs);
  const basePrice   = new Decimal(activeSlab.pricePerUnit);
  const subtotal    = basePrice.mul(quantity);
  const gstAmount   = subtotal.mul(product.gstRate).div(100);
  const total       = subtotal.add(gstAmount);

  const isVerified  = product.vendorPlan === 'ELITE' || product.vendorPlan === 'GOLD';
  const instaStock  = product.triminstaHubs.reduce((s, h) => s + h.stock, 0);

  function adjustQty(delta: number) {
    const next = quantity + delta * product.packMultiple;
    if (next < product.moq) return;
    setQuantity(next);
  }

  function handleQtyInput(val: string) {
    const n = parseInt(val, 10);
    if (isNaN(n) || n < product.moq) return;
    const rounded = Math.ceil((n - product.moq) / product.packMultiple) * product.packMultiple + product.moq;
    setQuantity(rounded);
  }

  /* Savings vs base */
  function savingsPct(slab: PriceSlab) {
    const base = product.priceSlabs[0].pricePerUnit;
    return Math.round((1 - slab.pricePerUnit / base) * 100);
  }

  return (
    <div className="min-h-screen bg-[#F4F6FB]">
      {/* Cert modal */}
      {certModalOpen && <CertModal cert={certModalOpen} onClose={() => setCertModalOpen(null)} />}

      {/* Breadcrumb */}
      <div className="bg-white border-b border-slate-100 px-6 py-3">
        <div className="max-w-screen-xl mx-auto flex items-center gap-2 text-sm">
          <button onClick={() => navigate('/marketplace')} className="text-[#4F46E5] hover:underline flex items-center gap-1">
            <ChevronLeft className="w-4 h-4" /> Marketplace
          </button>
          <span className="text-slate-300">/</span>
          <span className="text-slate-500">{product.categoryName}</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700 font-medium truncate max-w-xs">{product.name}</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-screen-xl mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8">

          {/* ═══ LEFT COLUMN (60%) ═══════════════════════════════════════ */}
          <div className="flex-[3] min-w-0 space-y-6">

            {/* Image Gallery */}
            <div className="card p-4">
              {/* Main image */}
              <div className={`h-80 rounded-xl bg-gradient-to-br ${IMAGE_GRADIENTS[activeImage % IMAGE_GRADIENTS.length]}
                flex items-center justify-center mb-4 relative overflow-hidden`}>
                <Package className="w-20 h-20 text-white/50" />
                <div className="absolute top-3 right-3 flex gap-2">
                  {product.triminstaEnabled && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-orange-500 text-white text-xs font-bold rounded-lg shadow">
                      <Zap className="w-3 h-3" /> TrimInsta Available
                    </span>
                  )}
                </div>
              </div>
              {/* Thumbnails */}
              <div className="flex gap-3 overflow-x-auto pb-1">
                {product.images.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    className={`flex-shrink-0 w-16 h-16 rounded-xl bg-gradient-to-br ${IMAGE_GRADIENTS[i % IMAGE_GRADIENTS.length]}
                      flex items-center justify-center transition-all duration-150
                      ${activeImage === i ? 'ring-2 ring-[#4F46E5] ring-offset-2' : 'opacity-60 hover:opacity-100'}`}
                  >
                    <Package className="w-6 h-6 text-white/60" />
                  </button>
                ))}
              </div>
            </div>

            {/* Vendor Identity Card */}
            <div className="card p-5 space-y-4">
              <div className="flex items-start gap-4">
                {/* Logo placeholder */}
                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200
                  flex items-center justify-center text-slate-400 font-black text-xl flex-shrink-0">
                  TW
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-slate-900 text-lg leading-tight">{product.vendorName}</p>
                  {isVerified ? (
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full
                        bg-emerald-50 text-emerald-700 border border-emerald-200 text-sm font-semibold">
                        <ShieldCheck className="w-4 h-4" />
                        ✓ Official Verified Supplier Stamp
                      </span>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold
                        ${product.vendorPlan === 'ELITE' ? 'bg-[#4F46E5] text-white' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
                        {product.vendorPlan}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full
                        bg-slate-100 text-slate-500 border border-slate-200 text-sm font-medium">
                        <Shield className="w-4 h-4" />
                        Standard Listing — Unverified / Basic Plan Supplier
                      </span>
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold
                        bg-slate-200 text-slate-600 font-mono">[BP]</span>
                    </div>
                  )}
                </div>
              </div>

              {/* GSTIN */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">GSTIN</p>
                  <p className="font-mono text-sm font-bold text-slate-700 tracking-widest mt-0.5">
                    {isVerified ? redactGstin(product.vendorGstin) : '••••••••••••••••'}
                  </p>
                </div>
                {isVerified && (
                  <span className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg
                    bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> GST Verified
                  </span>
                )}
              </div>
            </div>

            {/* Certification Bar — ONLY for ELITE/GOLD */}
            {isVerified && (
              <div className="card p-5">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
                  Compliance Certifications
                </p>
                <div className="flex flex-wrap gap-3">
                  {product.certifications.map(cert => {
                    const isActive = cert.status === 'APPROVED';
                    return (
                      <button
                        key={cert.key}
                        onClick={() => isActive ? setCertModalOpen(cert) : undefined}
                        disabled={!isActive}
                        title={isActive ? `View ${cert.label} certificate` : `${cert.label} — ${cert.status}`}
                        className={`relative flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold
                          transition-all duration-150
                          ${isActive
                            ? `${CERT_COLORS[cert.key] || 'bg-slate-50 text-slate-700 border-slate-200'} hover:shadow-md cursor-pointer`
                            : 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed opacity-60'
                          }`}
                      >
                        {!isActive && <Lock className="w-3 h-3 flex-shrink-0" />}
                        {cert.label}
                        {cert.status === 'PENDING'  && <span className="text-xs text-amber-500 ml-1">(Pending)</span>}
                        {cert.status === 'ON_HOLD'  && <span className="text-xs text-orange-500 ml-1">(On Hold)</span>}
                        {cert.status === 'REJECTED' && <span className="text-xs text-red-400 ml-1">(Rejected)</span>}
                        {cert.status === 'APPROVED' && <ExternalLink className="w-3 h-3 ml-1" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Technical Specifications Dossier */}
            <div className="card overflow-hidden">
              <button
                onClick={() => setSpecsOpen(p => !p)}
                className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
              >
                <span className="font-bold text-slate-800">Technical Specifications Dossier</span>
                {specsOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
              </button>
              {specsOpen && (
                <div className="border-t border-slate-100">
                  <table className="w-full">
                    <tbody>
                      {product.techSpecs.map((spec, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                          <td className="px-5 py-3 text-sm font-semibold text-slate-500 w-48">{spec.label}</td>
                          <td className="px-5 py-3 text-sm text-slate-800 font-mono">{spec.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ═══ RIGHT COLUMN (40%, sticky) ══════════════════════════════ */}
          <div className="flex-[2] min-w-0">
            <div className="sticky top-6 space-y-4">

              {/* Identity header */}
              <div className="card p-6 space-y-3">
                {/* Breadcrumb subcategory */}
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <span>{product.categoryName}</span>
                  <ChevronRight className="w-3 h-3" />
                  <span>{product.subcategory}</span>
                </div>
                {/* SKU + HSN */}
                <div className="flex gap-3 flex-wrap">
                  <span className="id-chip">SKU: {product.sku}</span>
                  <span className="id-chip">HSN: {product.hsnCode}</span>
                </div>
                {/* Name */}
                <h1 className="text-2xl font-black text-slate-900 leading-tight">{product.name}</h1>
                {/* Base price */}
                <div>
                  <span className="text-3xl font-black text-[#4F46E5]">₹{activeSlab.pricePerUnit.toFixed(2)}</span>
                  <span className="text-slate-500 text-sm ml-2">/ cone</span>
                </div>
                {/* MOQ badge */}
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold">
                    📦 Min Order: {product.moq} cones
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold">
                    Pack in multiples of {product.packMultiple}
                  </span>
                </div>
              </div>

              {/* Price Slabs */}
              <div className="card p-5">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Volume Pricing</p>
                <div className="grid grid-cols-3 gap-2">
                  {product.priceSlabs.map((slab, i) => {
                    const pct = savingsPct(slab);
                    const isActive = quantity >= slab.minQty && (slab.maxQty === null || quantity <= slab.maxQty);
                    return (
                      <div
                        key={i}
                        className={`p-3 rounded-xl border-2 text-center transition-all duration-150 ${
                          isActive
                            ? 'border-[#4F46E5] bg-[#4F46E5]/5'
                            : 'border-slate-100 bg-slate-50/50'
                        }`}
                      >
                        <p className="text-xs text-slate-500 font-medium leading-tight mb-1">{slab.label}</p>
                        <p className={`text-base font-black ${isActive ? 'text-[#4F46E5]' : 'text-slate-700'}`}>
                          ₹{slab.pricePerUnit.toFixed(2)}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {pct === 0 ? 'Base price' : `Save ${pct}%`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Variant Selector */}
              <div className="card p-5">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Production Shade / Colour
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {product.variants.map(v => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVariant(v)}
                      title={`${v.name} — ${v.shade}`}
                      className={`w-8 h-8 rounded-full border-2 transition-all duration-150 ${
                        selectedVariant.id === v.id
                          ? 'border-[#4F46E5] ring-2 ring-[#4F46E5]/30 scale-110'
                          : 'border-slate-200 hover:border-slate-400'
                      }`}
                      style={{
                        backgroundColor: v.hexColor,
                        boxShadow: v.hexColor === '#FFFFFF' ? 'inset 0 0 0 1px #e2e8f0' : undefined,
                      }}
                    />
                  ))}
                </div>
                <p className="text-sm text-slate-600 font-medium">
                  {selectedVariant.name}
                  <span className="font-mono text-slate-400 ml-2 text-xs">{selectedVariant.shade}</span>
                </p>
              </div>

              {/* Fulfilment Method Selector */}
              <div className="card p-5 space-y-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fulfilment Method</p>

                {/* Online */}
                <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all duration-150 ${
                  fulfilment === 'ONLINE' ? 'border-[#4F46E5] bg-[#4F46E5]/5' : 'border-slate-200 hover:border-slate-300'
                }`}>
                  <input
                    type="radio" name="fulfilment" value="ONLINE"
                    checked={fulfilment === 'ONLINE'}
                    onChange={() => setFulfilment('ONLINE')}
                    className="mt-0.5 accent-[#4F46E5]"
                  />
                  <div>
                    <p className="font-bold text-slate-800 flex items-center gap-2">
                      <Truck className="w-4 h-4 text-blue-500" />
                      Standard Online Delivery
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">Direct from Vendor Factory • Dispatches in 48–72 hours</p>
                  </div>
                </label>

                {/* Insta */}
                <div>
                  <label className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all duration-150 ${
                    !product.triminstaEnabled || instaStock === 0
                      ? 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed'
                      : fulfilment === 'INSTA'
                        ? 'border-orange-400 bg-orange-50 cursor-pointer'
                        : 'border-slate-200 hover:border-orange-200 cursor-pointer'
                  }`}>
                    <input
                      type="radio" name="fulfilment" value="INSTA"
                      checked={fulfilment === 'INSTA'}
                      onChange={() => setFulfilment('INSTA')}
                      disabled={!product.triminstaEnabled || instaStock === 0}
                      className="mt-0.5 accent-orange-500"
                    />
                    <div className="flex-1">
                      <p className="font-bold text-slate-800 flex items-center gap-2">
                        <Zap className="w-4 h-4 text-orange-500" />
                        TrimInsta 6-Hour Express
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Rapid Metro Fulfilment from Nearest Micro-Hub
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {product.triminstaHubs.map(hub => (
                          <span key={hub.hubName} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg font-medium ${
                            hub.stock > 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-400'
                          }`}>
                            <MapPin className="w-3 h-3" />
                            {hub.city}: {hub.stock > 0 ? `${hub.stock.toLocaleString()} units` : 'Out of stock'}
                          </span>
                        ))}
                      </div>
                    </div>
                  </label>
                  {/* Out of stock warning */}
                  {product.triminstaEnabled && instaStock === 0 && (
                    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl flex gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700 font-medium">
                        Out of Stock in TrimInsta Warehouse (0 Units in Bhiwandi & Tiruppur Micro-Hubs) —
                        Insta 6-Hour dispatch is currently disabled for this SKU.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Quantity Calculator */}
              <div className="card p-5 space-y-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Quantity & Pricing</p>

                {/* Stepper */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => adjustQty(-1)}
                    disabled={quantity <= product.moq}
                    className="w-10 h-10 rounded-xl border-2 border-slate-200 flex items-center justify-center
                      hover:border-[#4F46E5] hover:text-[#4F46E5] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    value={quantity}
                    onChange={e => handleQtyInput(e.target.value)}
                    className="flex-1 text-center text-xl font-black text-slate-900 border-2 border-slate-200
                      rounded-xl py-2 focus:outline-none focus:border-[#4F46E5] font-mono"
                    min={product.moq}
                    step={product.packMultiple}
                  />
                  <button
                    onClick={() => adjustQty(1)}
                    className="w-10 h-10 rounded-xl border-2 border-slate-200 flex items-center justify-center
                      hover:border-[#4F46E5] hover:text-[#4F46E5] transition-all"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Calculation breakdown */}
                <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">
                      {quantity.toLocaleString()} cones × ₹{activeSlab.pricePerUnit.toFixed(2)}
                    </span>
                    <span className="font-bold text-slate-800">₹{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">+ GST ({product.gstRate}%)</span>
                    <span className="font-medium text-slate-600">₹{gstAmount.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-slate-200 pt-2 flex justify-between">
                    <span className="font-bold text-slate-800">Total Payable</span>
                    <span className="text-lg font-black text-[#4F46E5]">₹{total.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-400">
                      Applied: {activeSlab.label} pricing
                      {savingsPct(activeSlab) > 0 && ` — Saving ${savingsPct(activeSlab)}%`}
                    </span>
                  </div>
                </div>

                {/* CTA Buttons */}
                <button className="btn-primary w-full justify-center py-4 text-base">
                  <ShoppingCart className="w-5 h-5" /> Add to Procurement Order
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <button className="btn-secondary py-3 text-sm justify-center">
                    <FlaskConical className="w-4 h-4" /> Request Lab Dip / Sample
                  </button>
                  <button className="btn-ghost py-3 text-sm justify-center border border-slate-200 rounded-xl">
                    <Download className="w-4 h-4" /> Download TDS PDF
                  </button>
                </div>
              </div>

            </div>
          </div>
          {/* ═══ END RIGHT COLUMN ════════════════════════════════════════ */}
        </div>
      </div>
    </div>
  );
}
