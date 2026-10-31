/**
 * CustomerStorefront.tsx — TrimNova Marketplace Homepage
 * Full B2B garment trims storefront with hero search, classification cards,
 * category grid, product listing, and left filter sidebar.
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, Tag, Layers, Package, Star, ChevronDown, ChevronRight,
  SlidersHorizontal, Zap, Truck, ShieldCheck, X, Filter,
  CheckSquare, Square, Circle
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────────────── */
type VendorPlan = 'ELITE' | 'GOLD' | 'BASIC';
type Certification = 'OEKO_TEX' | 'GOTS' | 'FSC' | 'GINETEX' | 'REACH';
type FulfilmentMethod = 'ONLINE' | 'INSTA';

interface Product {
  id: string;
  name: string;
  sku: string;
  hsnCode: string;
  basePrice: number;
  moq: number;
  categoryId: string;
  categoryName: string;
  classificationId: string;
  vendorName: string;
  vendorPlan: VendorPlan;
  certifications: Certification[];
  triminstaEnabled: boolean;
  imageUrl?: string;
}

interface Category {
  id: string;
  name: string;
  classificationId: string;
  subcategoryCount: number;
  productCount: number;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
}

/* ─── Mock Data ──────────────────────────────────────────────────────────── */
const CERTIFICATIONS: { key: Certification; label: string; color: string }[] = [
  { key: 'OEKO_TEX', label: 'OEKO-TEX', color: 'bg-emerald-100 text-emerald-700' },
  { key: 'GOTS',     label: 'GOTS',     color: 'bg-green-100 text-green-700' },
  { key: 'FSC',      label: 'FSC',      color: 'bg-lime-100 text-lime-700' },
  { key: 'GINETEX',  label: 'GINETEX',  color: 'bg-blue-100 text-blue-700' },
  { key: 'REACH',    label: 'REACH',    color: 'bg-purple-100 text-purple-700' },
];

const CLASSIFICATIONS = [
  { id: 'cls1', label: 'Labels & Tags',                   icon: <Tag className="w-8 h-8" />,     subtitle: 'Full Range',                  bg: 'from-violet-500 to-indigo-600' },
  { id: 'cls2', label: 'Core Garment Trims',              icon: <Layers className="w-8 h-8" />,  subtitle: 'Threads, Interlinings & More', bg: 'from-sky-500 to-cyan-600' },
  { id: 'cls3', label: 'Finishing, Packaging & Hardware', icon: <Package className="w-8 h-8" />, subtitle: 'Bags, Hangers & Fixtures',      bg: 'from-emerald-500 to-teal-600' },
  { id: 'cls4', label: 'Embellishments, Closures & Safety', icon: <Star className="w-8 h-8" />, subtitle: 'Buttons, Zippers & Sequins',   bg: 'from-amber-500 to-orange-600' },
];

const MOCK_CATEGORIES: Category[] = [
  { id: 'cat1',  name: 'Woven & Printed Labels',    classificationId: 'cls1', subcategoryCount: 6,  productCount: 312, color: 'text-violet-600', bgColor: 'bg-violet-50',  icon: <Tag className="w-6 h-6 text-violet-600" /> },
  { id: 'cat2',  name: 'RFID / NFC Smart Tags',     classificationId: 'cls1', subcategoryCount: 3,  productCount: 87,  color: 'text-indigo-600', bgColor: 'bg-indigo-50',  icon: <ShieldCheck className="w-6 h-6 text-indigo-600" /> },
  { id: 'cat3',  name: 'Barcode & Hang Tags',       classificationId: 'cls1', subcategoryCount: 4,  productCount: 156, color: 'text-blue-600',   bgColor: 'bg-blue-50',    icon: <Tag className="w-6 h-6 text-blue-600" /> },
  { id: 'cat4',  name: 'Sewing Threads',            classificationId: 'cls2', subcategoryCount: 8,  productCount: 421, color: 'text-sky-600',    bgColor: 'bg-sky-50',     icon: <Circle className="w-6 h-6 text-sky-600" /> },
  { id: 'cat5',  name: 'Interlinings & Fusibles',   classificationId: 'cls2', subcategoryCount: 5,  productCount: 198, color: 'text-cyan-600',   bgColor: 'bg-cyan-50',    icon: <Layers className="w-6 h-6 text-cyan-600" /> },
  { id: 'cat6',  name: 'Elastic & Webbing',         classificationId: 'cls2', subcategoryCount: 4,  productCount: 267, color: 'text-teal-600',   bgColor: 'bg-teal-50',    icon: <Layers className="w-6 h-6 text-teal-600" /> },
  { id: 'cat7',  name: 'Poly Bags & Garment Covers',classificationId: 'cls3', subcategoryCount: 5,  productCount: 143, color: 'text-emerald-600',bgColor: 'bg-emerald-50', icon: <Package className="w-6 h-6 text-emerald-600" /> },
  { id: 'cat8',  name: 'Hangers & Display',         classificationId: 'cls3', subcategoryCount: 3,  productCount: 76,  color: 'text-green-600',  bgColor: 'bg-green-50',   icon: <Package className="w-6 h-6 text-green-600" /> },
  { id: 'cat9',  name: 'Hook & Loop / Velcro',      classificationId: 'cls3', subcategoryCount: 2,  productCount: 54,  color: 'text-lime-600',   bgColor: 'bg-lime-50',    icon: <Package className="w-6 h-6 text-lime-600" /> },
  { id: 'cat10', name: 'Buttons & Studs',           classificationId: 'cls4', subcategoryCount: 7,  productCount: 389, color: 'text-amber-600',  bgColor: 'bg-amber-50',   icon: <Star className="w-6 h-6 text-amber-600" /> },
  { id: 'cat11', name: 'Zippers & Sliders',         classificationId: 'cls4', subcategoryCount: 6,  productCount: 274, color: 'text-orange-600', bgColor: 'bg-orange-50',  icon: <Star className="w-6 h-6 text-orange-600" /> },
  { id: 'cat12', name: 'Sequins & Embellishments',  classificationId: 'cls4', subcategoryCount: 4,  productCount: 92,  color: 'text-pink-600',   bgColor: 'bg-pink-50',    icon: <Star className="w-6 h-6 text-pink-600" /> },
];

const MOCK_PRODUCTS: Product[] = [
  { id: 'p1',  name: 'Woven Damask Brand Labels',         sku: 'LBL-WDM-001', hsnCode: '5807',   basePrice: 2.50,  moq: 500,   categoryId: 'cat1',  categoryName: 'Woven & Printed Labels',  classificationId: 'cls1', vendorName: 'Ribbonex India Pvt Ltd',   vendorPlan: 'ELITE', certifications: ['OEKO_TEX','GOTS'],   triminstaEnabled: true },
  { id: 'p2',  name: 'RFID Smart Inventory Labels',       sku: 'LBL-RFID-007',hsnCode: '8543',   basePrice: 18.75, moq: 250,   categoryId: 'cat2',  categoryName: 'RFID / NFC Smart Tags',   classificationId: 'cls1', vendorName: 'TagTech Solutions',        vendorPlan: 'GOLD',  certifications: ['REACH'],             triminstaEnabled: false },
  { id: 'p3',  name: 'High-Tenacity Bonded Poly Thread',  sku: 'THR-HTP-120', hsnCode: '5402',   basePrice: 1.85,  moq: 100,   categoryId: 'cat4',  categoryName: 'Sewing Threads',          classificationId: 'cls2', vendorName: 'ThreadWorks Manufacturing', vendorPlan: 'ELITE', certifications: ['OEKO_TEX','FSC'],    triminstaEnabled: true },
  { id: 'p4',  name: 'Fusible Microdot Interlining',      sku: 'INT-FMD-220', hsnCode: '5903',   basePrice: 12.40, moq: 50,    categoryId: 'cat5',  categoryName: 'Interlinings & Fusibles', classificationId: 'cls2', vendorName: 'FuseRight Textiles',       vendorPlan: 'GOLD',  certifications: ['OEKO_TEX'],          triminstaEnabled: true },
  { id: 'p5',  name: 'Antique Brass Teeth Zipper #5',     sku: 'ZIP-ABR-5M',  hsnCode: '9607',   basePrice: 8.90,  moq: 200,   categoryId: 'cat11', categoryName: 'Zippers & Sliders',       classificationId: 'cls4', vendorName: 'ZipKing International',    vendorPlan: 'BASIC', certifications: [],                    triminstaEnabled: false },
  { id: 'p6',  name: 'Matte Silver 4-Hole Buttons',       sku: 'BTN-MS4-18L', hsnCode: '9606',   basePrice: 0.45,  moq: 1000,  categoryId: 'cat10', categoryName: 'Buttons & Studs',         classificationId: 'cls4', vendorName: 'AccessoryPlus Pvt Ltd',    vendorPlan: 'ELITE', certifications: ['REACH','OEKO_TEX'],  triminstaEnabled: true },
  { id: 'p7',  name: 'Garment Poly Bag 12×18"',           sku: 'PKG-GPB-1218',hsnCode: '3923',   basePrice: 0.28,  moq: 2000,  categoryId: 'cat7',  categoryName: 'Poly Bags & Garment Covers',classificationId: 'cls3', vendorName: 'PackPro Solutions',       vendorPlan: 'GOLD',  certifications: ['FSC'],               triminstaEnabled: false },
  { id: 'p8',  name: 'Wide-Leg Knit Elastic 38mm',        sku: 'ELS-WKN-38',  hsnCode: '5604',   basePrice: 3.20,  moq: 500,   categoryId: 'cat6',  categoryName: 'Elastic & Webbing',       classificationId: 'cls2', vendorName: 'ElastiCore Supplies',      vendorPlan: 'BASIC', certifications: [],                    triminstaEnabled: false },
  { id: 'p9',  name: 'Holographic Sequin Sheet 30cm',     sku: 'EMB-HLS-30',  hsnCode: '3926',   basePrice: 145.00,moq: 10,    categoryId: 'cat12', categoryName: 'Sequins & Embellishments',classificationId: 'cls4', vendorName: 'GlitterGlam Fabrics',      vendorPlan: 'GOLD',  certifications: ['REACH'],             triminstaEnabled: true },
  { id: 'p10', name: 'Barcode Hang Tag 90×55mm',          sku: 'TAG-BHT-9055',hsnCode: '4821',   basePrice: 0.65,  moq: 500,   categoryId: 'cat3',  categoryName: 'Barcode & Hang Tags',     classificationId: 'cls1', vendorName: 'TagPrint Industries',      vendorPlan: 'ELITE', certifications: ['FSC','GOTS'],        triminstaEnabled: true },
  { id: 'p11', name: 'Wooden Suit Hanger (Natural)',       sku: 'HNG-WDS-001', hsnCode: '4421',   basePrice: 22.50, moq: 100,   categoryId: 'cat8',  categoryName: 'Hangers & Display',       classificationId: 'cls3', vendorName: 'WoodCraft Accessories',    vendorPlan: 'BASIC', certifications: [],                    triminstaEnabled: false },
  { id: 'p12', name: 'Self-Adhesive Velcro Strip 25mm',   sku: 'HKL-SAV-25',  hsnCode: '5606',   basePrice: 4.75,  moq: 300,   categoryId: 'cat9',  categoryName: 'Hook & Loop / Velcro',    classificationId: 'cls3', vendorName: 'FastenTech Pvt Ltd',       vendorPlan: 'GOLD',  certifications: ['OEKO_TEX'],          triminstaEnabled: false },
];

/* ─── Sub-components ─────────────────────────────────────────────────────── */
function VendorBadge({ plan }: { plan: VendorPlan }) {
  if (plan === 'ELITE' || plan === 'GOLD') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
        <ShieldCheck className="w-3 h-3" />
        Official Verified Supplier
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
      Standard Listing
    </span>
  );
}

function ProductCard({ product, onClick }: { product: Product; onClick: () => void }) {
  const gradients = [
    'from-violet-200 to-indigo-300',
    'from-sky-200 to-cyan-300',
    'from-emerald-200 to-teal-300',
    'from-amber-200 to-orange-300',
    'from-pink-200 to-rose-300',
  ];
  const grad = gradients[product.id.charCodeAt(1) % gradients.length];

  return (
    <div
      onClick={onClick}
      className="card p-0 overflow-hidden cursor-pointer hover:shadow-elevated hover:-translate-y-1 transition-all duration-200 group"
    >
      {/* Image */}
      <div className={`h-44 bg-gradient-to-br ${grad} flex items-center justify-center relative`}>
        <Package className="w-12 h-12 text-white/60" />
        {product.triminstaEnabled && (
          <span className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500 text-white text-xs font-bold shadow">
            <Zap className="w-3 h-3" /> Insta
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-2">
        {/* Category pill */}
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wide truncate">
          {product.categoryName}
        </span>

        {/* Name + Vendor */}
        <div>
          <p className="font-bold text-slate-900 text-sm leading-snug line-clamp-2 group-hover:text-[#4F46E5] transition-colors">
            {product.name}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{product.vendorName}</p>
        </div>

        {/* Badge */}
        <VendorBadge plan={product.vendorPlan} />

        {/* Price + MOQ */}
        <div className="flex items-center justify-between mt-1">
          <div>
            <span className="text-lg font-black text-slate-900">₹{product.basePrice.toFixed(2)}</span>
            <span className="text-xs text-slate-400 ml-1">/ unit</span>
          </div>
          <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg">
            MOQ {product.moq}
          </span>
        </div>

        {/* Delivery badges */}
        <div className="flex gap-2 flex-wrap">
          {product.triminstaEnabled && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-lg">
              <Zap className="w-3 h-3" /> 6-Hr Insta
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg">
            <Truck className="w-3 h-3" /> Standard 72h
          </span>
        </div>

        {/* CTA */}
        <button className="mt-2 w-full text-xs font-semibold text-[#4F46E5] hover:underline flex items-center justify-center gap-1">
          View Details <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function CheckboxFilter({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="flex items-center gap-2 text-sm text-slate-700 hover:text-[#4F46E5] transition-colors w-full text-left py-1"
    >
      {checked
        ? <CheckSquare className="w-4 h-4 text-[#4F46E5] flex-shrink-0" />
        : <Square className="w-4 h-4 text-slate-300 flex-shrink-0" />}
      {label}
    </button>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */
export default function CustomerStorefront() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  /* Filter state */
  const [searchQuery, setSearchQuery]           = useState('');
  const [selectedClassification, setSelectedClassification] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories]   = useState<Set<string>>(new Set());
  const [selectedCerts, setSelectedCerts]             = useState<Set<Certification>>(new Set());
  const [selectedPlans, setSelectedPlans]             = useState<Set<VendorPlan>>(new Set());
  const [instaOnly, setInstaOnly]                     = useState(false);
  const [priceRange, setPriceRange]                   = useState<[number, number]>([0, 500]);
  const [sidebarOpen, setSidebarOpen]                 = useState(false);

  /* Filtered products */
  const filtered = useMemo(() => {
    return MOCK_PRODUCTS.filter(p => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) || p.hsnCode.includes(q);
      const matchesClass = !selectedClassification || p.classificationId === selectedClassification;
      const matchesCat   = selectedCategories.size === 0 || selectedCategories.has(p.categoryId);
      const matchesCerts = selectedCerts.size === 0 ||
        [...selectedCerts].every(c => p.certifications.includes(c));
      const matchesPlan  = selectedPlans.size === 0 || selectedPlans.has(p.vendorPlan);
      const matchesInsta = !instaOnly || p.triminstaEnabled;
      const matchesPrice = p.basePrice >= priceRange[0] && p.basePrice <= priceRange[1];
      return matchesSearch && matchesClass && matchesCat && matchesCerts &&
             matchesPlan && matchesInsta && matchesPrice;
    });
  }, [searchQuery, selectedClassification, selectedCategories, selectedCerts, selectedPlans, instaOnly, priceRange]);

  function toggleCategory(id: string) {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleCert(c: Certification) {
    setSelectedCerts(prev => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });
  }
  function togglePlan(p: VendorPlan) {
    setSelectedPlans(prev => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  }

  const hasActiveFilters =
    selectedClassification !== null || selectedCategories.size > 0 ||
    selectedCerts.size > 0 || selectedPlans.size > 0 || instaOnly;

  function clearAll() {
    setSelectedClassification(null);
    setSelectedCategories(new Set());
    setSelectedCerts(new Set());
    setSelectedPlans(new Set());
    setInstaOnly(false);
    setPriceRange([0, 500]);
  }

  /* ─── Sidebar ─────────────────────────────────────────────────────────── */
  function Sidebar() {
    return (
      <aside className="w-64 flex-shrink-0 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4" /> Filters
          </span>
          {hasActiveFilters && (
            <button onClick={clearAll} className="text-xs text-[#4F46E5] hover:underline flex items-center gap-1">
              <X className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>

        {/* Classification */}
        <div className="card p-4 space-y-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Classification</p>
          {CLASSIFICATIONS.map(cls => (
            <button
              key={cls.id}
              onClick={() => setSelectedClassification(prev => prev === cls.id ? null : cls.id)}
              className={`w-full text-left text-sm px-3 py-2 rounded-xl transition-all ${
                selectedClassification === cls.id
                  ? 'bg-[#4F46E5] text-white font-semibold'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {cls.label}
            </button>
          ))}
        </div>

        {/* Category */}
        <div className="card p-4 space-y-1">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Category</p>
          {MOCK_CATEGORIES
            .filter(c => !selectedClassification || c.classificationId === selectedClassification)
            .map(cat => (
              <CheckboxFilter
                key={cat.id}
                label={`${cat.name} (${cat.productCount})`}
                checked={selectedCategories.has(cat.id)}
                onChange={() => toggleCategory(cat.id)}
              />
            ))}
        </div>

        {/* Certification */}
        <div className="card p-4 space-y-1">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Certification</p>
          {CERTIFICATIONS.map(cert => (
            <CheckboxFilter
              key={cert.key}
              label={cert.label}
              checked={selectedCerts.has(cert.key)}
              onChange={() => toggleCert(cert.key)}
            />
          ))}
        </div>

        {/* Price Range */}
        <div className="card p-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Price Range (₹/unit)</p>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-slate-600">₹{priceRange[0]}</span>
            <span className="text-xs text-slate-400">—</span>
            <span className="text-xs text-slate-600">₹{priceRange[1]}</span>
          </div>
          <input
            type="range" min={0} max={500} step={5}
            value={priceRange[1]}
            onChange={e => setPriceRange([priceRange[0], Number(e.target.value)])}
            className="w-full accent-[#4F46E5]"
          />
        </div>

        {/* Delivery Method */}
        <div className="card p-4 space-y-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Delivery Method</p>
          <CheckboxFilter
            label="⚡ TrimInsta 6-Hour"
            checked={instaOnly}
            onChange={() => setInstaOnly(p => !p)}
          />
          <CheckboxFilter
            label="🚚 Standard Delivery"
            checked={!instaOnly}
            onChange={() => setInstaOnly(false)}
          />
        </div>

        {/* Vendor Plan */}
        <div className="card p-4 space-y-1">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Vendor Plan</p>
          {(['ELITE','GOLD','BASIC'] as VendorPlan[]).map(plan => (
            <CheckboxFilter
              key={plan}
              label={plan.charAt(0) + plan.slice(1).toLowerCase()}
              checked={selectedPlans.has(plan)}
              onChange={() => togglePlan(plan)}
            />
          ))}
        </div>
      </aside>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6FB]">

      {/* ─── Hero Section ──────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A] pt-14 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center mb-10">
          <h1 className="text-4xl font-black text-white mb-3 tracking-tight">
            India's Premier <span className="text-[#4F46E5]">Garment Trims</span> Marketplace
          </h1>
          <p className="text-slate-400 text-lg">
            Sourcing-grade B2B platform for labels, threads, interlinings, zippers & more
          </p>
        </div>

        {/* Search Bar */}
        <div className="max-w-3xl mx-auto">
          <div className="relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by product name, SKU, or HSN code…"
              className="w-full pl-14 pr-6 py-5 rounded-2xl text-slate-900 text-base font-medium placeholder:text-slate-400
                         shadow-modal focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/40 border border-white/10"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            <button
              onClick={() => {}}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-all border border-white/10"
            >
              <Filter className="w-3.5 h-3.5" /> Category <ChevronDown className="w-3.5 h-3.5 text-white/60" />
            </button>
            {CERTIFICATIONS.map(cert => (
              <button
                key={cert.key}
                onClick={() => toggleCert(cert.key)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                  selectedCerts.has(cert.key)
                    ? 'bg-[#4F46E5] text-white border-[#4F46E5]'
                    : 'bg-white/10 text-white border-white/10 hover:bg-white/20'
                }`}
              >
                {cert.label}
              </button>
            ))}
            <button
              onClick={() => setInstaOnly(p => !p)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                instaOnly
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white/10 text-white border-white/10 hover:bg-white/20'
              }`}
            >
              <Zap className="w-3.5 h-3.5" /> TrimInsta 6-Hour
            </button>
            <button
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-white/10 text-white border border-white/10 hover:bg-white/20 transition-all"
            >
              <Truck className="w-3.5 h-3.5" /> Standard Delivery
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-6 py-10 space-y-10">

        {/* ─── Classification Cards ──────────────────────────────────────── */}
        <section>
          <h2 className="text-xl font-bold text-slate-800 mb-5">Shop by Classification</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {CLASSIFICATIONS.map(cls => (
              <button
                key={cls.id}
                onClick={() => setSelectedClassification(prev => prev === cls.id ? null : cls.id)}
                className={`group relative overflow-hidden rounded-2xl p-6 text-left transition-all duration-200
                  bg-gradient-to-br ${cls.bg} text-white shadow-card
                  hover:shadow-elevated hover:-translate-y-1 active:scale-[0.98]
                  ${selectedClassification === cls.id ? 'ring-4 ring-white/40 shadow-elevated -translate-y-1' : ''}`}
              >
                <div className="mb-4 p-3 bg-white/20 rounded-xl w-fit">{cls.icon}</div>
                <p className="font-black text-lg leading-tight">{cls.label}</p>
                <p className="text-sm text-white/75 mt-1">{cls.subtitle}</p>
                <ChevronRight className="absolute bottom-4 right-4 w-5 h-5 text-white/50 group-hover:text-white transition-colors" />
              </button>
            ))}
          </div>
        </section>

        {/* ─── Category Grid ─────────────────────────────────────────────── */}
        <section>
          <h2 className="text-xl font-bold text-slate-800 mb-5">Browse by Category</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {MOCK_CATEGORIES
              .filter(c => !selectedClassification || c.classificationId === selectedClassification)
              .map(cat => (
                <button
                  key={cat.id}
                  onClick={() => toggleCategory(cat.id)}
                  className={`card p-4 flex flex-col items-center text-center gap-2 cursor-pointer
                    hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-200
                    ${selectedCategories.has(cat.id) ? 'ring-2 ring-[#4F46E5]' : ''}`}
                >
                  <div className={`w-12 h-12 rounded-full ${cat.bgColor} flex items-center justify-center`}>
                    {cat.icon}
                  </div>
                  <p className="text-sm font-bold text-slate-800 leading-tight">{cat.name}</p>
                  <p className="text-xs text-slate-400">
                    {cat.subcategoryCount} subcategories · {cat.productCount} products
                  </p>
                </button>
              ))}
          </div>
        </section>

        {/* ─── Product Listing with Sidebar ─────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-slate-800">
              Products
              <span className="ml-2 text-sm font-medium text-slate-400">({filtered.length} results)</span>
            </h2>
            <button
              onClick={() => setSidebarOpen(p => !p)}
              className="lg:hidden btn-secondary text-sm py-2"
            >
              <SlidersHorizontal className="w-4 h-4" /> Filters
            </button>
          </div>

          <div className="flex gap-6 items-start">
            {/* Desktop sidebar */}
            <div className="hidden lg:block sticky top-6">
              <Sidebar />
            </div>

            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
              <div className="fixed inset-0 z-50 lg:hidden">
                <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
                <div className="absolute left-0 top-0 bottom-0 w-72 bg-[#F4F6FB] p-5 overflow-y-auto shadow-modal">
                  <div className="flex items-center justify-between mb-5">
                    <span className="font-bold text-slate-800">Filters</span>
                    <button onClick={() => setSidebarOpen(false)}>
                      <X className="w-5 h-5 text-slate-500" />
                    </button>
                  </div>
                  <Sidebar />
                </div>
              </div>
            )}

            {/* Product grid */}
            <div className="flex-1 min-w-0">
              {filtered.length === 0 ? (
                <div className="card p-12 text-center">
                  <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">No products match your filters.</p>
                  <button onClick={clearAll} className="btn-primary mt-4 text-sm">Clear All Filters</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                  {filtered.map(product => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onClick={() => navigate(`/marketplace/products/${product.id}`)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
