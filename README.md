# TrimNova — B2B2C Garment Trims & Packaging Marketplace

> **The "Amazon for Garment Trims in India"** — A production-grade B2B2C multi-vendor marketplace for garment trims, labels, and packaging. Built on a unified TypeScript monorepo.

## 🏗️ Architecture

```
Render (Free Web Service) + Neon DB (PostgreSQL) + Razorpay Payments
```

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + Vite + TypeScript + Tailwind CSS + TanStack Query |
| **Backend** | Node.js + Express + TypeScript (single unified server) |
| **Database** | PostgreSQL on Neon DB via Prisma ORM |
| **Payments** | Razorpay (Test + Production) |
| **Email** | Brevo API + in-portal fallback Demo Mail Inspector |
| **File Storage** | Cloudinary + base64 local fallback |
| **PDFs** | pdfkit — Customer Tax Invoices + Settlement Ledgers |

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js 20+
- A Neon DB database (free tier works)
- Razorpay test account (free)

### 1. Clone & Install
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Fill in DATABASE_URL, DIRECT_URL, JWT_SECRET, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
```

### 3. Database Setup & Seeding
```bash
# Push schema to Neon DB
npm run db:push

# Seed with demo data (12 categories, 142 products, 7 demo accounts)
npm run db:seed
```

### 4. Start Development Server
```bash
npm run dev
# Frontend: http://localhost:5173
# API: http://localhost:5000/api/v1
```

## 🎭 Demo Accounts (Pre-Seeded)

| Role | Login ID | Email | Password |
|------|---------|-------|----------|
| **Vendor 1** (Elite + TrimInsta) | `VN-89420` | `procurement@novatex.in` | `NovaTex@2024` |
| **Vendor 2** (Gold) | `VN-77102` | `sales@aurafastener.in` | `AuraFast@2024` |
| **Vendor 3** (Basic, no logo) | `VN-65011` | `info@zeniththreads.in` | `Zenith@2024` |
| **Approver** | `APR-01` | `approver@trimnova.in` | `Approver@2024` |
| **Admin** | `ROOT-01` | `ad.ops.lead@trimnova.in` | `AdminRoot@2024` (TOTP: `849201`) |
| **Finance Preparer** | `FP-001` | `finance.prep@trimnova.in` | `FinPrep@2024` |
| **Finance Approver** | `FA-001` | `finance.approver@trimnova.in` | `FinApprove@2024` |
| **Customer** | `CUS-1001` | `buyer@raymondgarments.in` | `Raymond@2024` |

## 📦 Production Build

```bash
npm run build
# Compiles:
# - Frontend: dist/client/ (Vite)
# - Backend: dist/server/ (tsc)
```

## 🌐 Render Deployment

1. Connect this repo to Render
2. Set **Build Command**: `npm install && npm run build && npm run db:push && npm run db:seed`
3. Set **Start Command**: `npm run start`
4. Add all environment variables from `.env.example`
5. Free tier: 512 MB RAM — fits within limits

## 📋 Catalog: 12 Categories, 142 Products

| # | Category | Products |
|---|---------|---------|
| 01 | Labels & Tags | Woven, Care, RFID, Heat Transfer, Hangtags, Stickers... |
| 02 | Threads & Yarns | Sewing, Embroidery, Overlocking, Specialty |
| 03 | Buttons & Fasteners | Buttons, Snaps, Rivets, Hooks |
| 04 | Zippers | Metal, Plastic/Vislon, Nylon Coil, Invisible |
| 05 | Tapes & Ribbons | Twill, Satin, Elastic, Drawcord |
| 06 | Interlining & Fusing | Woven, Non-Woven, Fusible, Shoulder Pads... |
| 07 | Packaging Materials | Polybags, Cartons, Tissue, Hangers... |
| 08 | Embellishments | Sequins, Beads, Rhinestones, Patches... |
| 09 | Elastics & Cords | Waistband, Drawcord, Bungee, Lingerie... |
| 10 | Buckles & Hardware | D-Rings, Buckles, Toggles, Snap Hooks... |
| 11 | Velcro & Closures | Hook & Loop, Magnetic Snaps, Kam Snaps... |
| 12 | Safety & Compliance | Metal Detector Strips, OEKO-TEX, REACH... |

## 🔐 Portal Access Guide

| Portal | URL | Description |
|--------|-----|-------------|
| **Customer Marketplace** | `/marketplace` | Browse 142 products across 12 categories |
| **Vendor Portal** | `/vendor/dashboard` | Manage KYC, products, orders, settlements |
| **Approver Console** | `/approver/queue` | Certificate verification + margin negotiation |
| **Admin Console** | `/admin/dashboard` | Escalation docket, margins, coupons, settlements |
| **Auth** | `/auth?role=vendor` | Login or 5-step registration wizard |

## 💰 Business Logic

### Commission Calculation (`CALC-01`)
```
G  = Tax-exclusive merchandise value
DV = Vendor-funded discount
DP = Platform-funded coupon (never reduces vendor entitlement!)

Commission Basis B = G − DV
Platform Margin C = round(B × margin_rate)
GST on Commission = C × 18%
TDS (194-O) = (B − C) × 1.0%
Net Vendor Payable = B + shipping − C − GST_on_C − TDS
```

### TrimInsta Rules
- TrimInsta stock `< 50` → auto-trigger low-stock restock email to vendor
- TrimInsta stock `= 0` → disable Insta delivery option on storefront (keep Standard active)

### Return Policy & Settlement Gate
- Return window: `deadline = delivered_at + 10 days` (configurable)
- Before deadline: `RETURN_WINDOW_HOLD` (Admin cannot override)
- After deadline + no open RMAs: `ELIGIBLE`
- Finance Preparer → creates batch → Finance Approver approves (Two-Person Control)

## 🧪 Demo Escalation Case

Pre-seeded escalation `Case #ESC-9482` showing:
- **3 Agreed SKUs**: Woven Damask Labels, RFID Smart Labels, Fusible Microdot Interlining
- **2 Disputed SKUs**: High-Tenacity Bonded Poly Threads (vendor 5% vs target 9%), Antique Brass Zippers (vendor 6% vs target 9%)

## 📄 License
Private — TrimNova Platform. All rights reserved.

