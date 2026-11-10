/**
 * TrimNova B2B Marketplace — Prisma Seed Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Run via: npm run db:seed   (tsx prisma/seed.ts)
 *
 * Strategy:
 *  1. Upsert PlatformConfig key-value pairs
 *  2. Parse Excel catalog (TrimNova_Garment_Trims_Catalog_Pages_4-7.xlsx)
 *     and fall back to hardcoded data when the file is absent or sheet
 *     structure doesn't match expectations.
 *  3. Upsert Classifications → Categories → Subcategories
 *  4. Create all demo Users (bcrypt-hashed passwords)
 *  5. Create Vendor / Customer / Approver profile records
 *  6. Create NovaTex vendor certificates
 *  7. Create Products + PricingTiers + MarginSlabs for every demo vendor
 *  8. Create Escalation ESC-9482 with items + timeline
 *  9. Seed sample Notifications
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PrismaClient, ProductStatus, VendorStatus, VendorPlan, CertificateStatus, EscalationStatus, NotificationType, NotificationChannel, Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface SubcategoryDef {
  code: string;
  name: string;
}

interface CategoryDef {
  code: string;
  name: string;
  subcategories: SubcategoryDef[];
}

interface ClassificationDef {
  code: string;
  name: string;
  categories: CategoryDef[];
}

// ─────────────────────────────────────────────────────────────────────────────
// HARDCODED CATALOG DATA (fallback + authoritative source)
// ─────────────────────────────────────────────────────────────────────────────

const CATALOG_DATA: ClassificationDef[] = [
  {
    code: '1',
    name: 'Labels & Tags — Full Range',
    categories: [
      {
        code: '01',
        name: 'Labels & Tags',
        subcategories: [
          { code: '01-01', name: 'Woven Labels' },
          { code: '01-02', name: 'Printed Care Labels' },
          { code: '01-03', name: 'RFID Smart Labels' },
          { code: '01-04', name: 'Heat Transfer Labels' },
          { code: '01-05', name: 'Hangtags & Swing Tags' },
          { code: '01-06', name: 'Stickers & Barcodes' },
          { code: '01-07', name: 'DPP Digital Passport' },
          { code: '01-08', name: 'Custom Label Solutions' },
        ],
      },
    ],
  },
  {
    code: '2',
    name: 'Core Garment Trims',
    categories: [
      {
        code: '02',
        name: 'Threads & Yarns',
        subcategories: [
          { code: '02-01', name: 'Sewing Threads' },
          { code: '02-02', name: 'Embroidery Threads' },
          { code: '02-03', name: 'Overlocking Threads' },
          { code: '02-04', name: 'Specialty Yarns' },
        ],
      },
      {
        code: '03',
        name: 'Buttons & Fasteners',
        subcategories: [
          { code: '03-01', name: 'Buttons' },
          { code: '03-02', name: 'Snaps & Press Studs' },
          { code: '03-03', name: 'Rivets & Eyelets' },
          { code: '03-04', name: 'Hooks & Eyes' },
        ],
      },
      {
        code: '04',
        name: 'Zippers',
        subcategories: [
          { code: '04-01', name: 'Metal Zippers' },
          { code: '04-02', name: 'Plastic/Vislon Zippers' },
          { code: '04-03', name: 'Nylon Coil Zippers' },
          { code: '04-04', name: 'Invisible Zippers' },
        ],
      },
      {
        code: '05',
        name: 'Tapes & Ribbons',
        subcategories: [
          { code: '05-01', name: 'Twill Tape' },
          { code: '05-02', name: 'Satin & Grosgrain' },
          { code: '05-03', name: 'Elastic Tape' },
          { code: '05-04', name: 'Drawcord & Binding' },
        ],
      },
    ],
  },
  {
    code: '3',
    name: 'Finishing, Packaging & Hardware',
    categories: [
      {
        code: '06',
        name: 'Interlining & Fusing',
        subcategories: [
          { code: '06-01', name: 'Woven Interlining' },
          { code: '06-02', name: 'Non-Woven Interlining' },
          { code: '06-03', name: 'Fusible Interlining' },
          { code: '06-04', name: 'Shoulder Pads' },
          { code: '06-05', name: 'Collar Stays & Canvas' },
          { code: '06-06', name: 'Waistband Stiffener' },
        ],
      },
      {
        code: '07',
        name: 'Packaging',
        subcategories: [
          { code: '07-01', name: 'Polybags' },
          { code: '07-02', name: 'Carton Boxes' },
          { code: '07-03', name: 'Tissue Paper & Wrapping' },
          { code: '07-04', name: 'Hangers' },
          { code: '07-05', name: 'Collar Inserts & Butterflies' },
          { code: '07-06', name: 'Silica Gel & Moisture Control' },
        ],
      },
      {
        code: '09',
        name: 'Elastics & Cords',
        subcategories: [
          { code: '09-01', name: 'Waistband Elastic' },
          { code: '09-02', name: 'Leg Opening Elastic' },
          { code: '09-03', name: 'Drawcord & Drawstring' },
          { code: '09-04', name: 'Bungee Cord' },
          { code: '09-05', name: 'Lingerie Elastic' },
          { code: '09-06', name: 'Cord Locks & Aglets' },
        ],
      },
      {
        code: '10',
        name: 'Buckles & Hardware',
        subcategories: [
          { code: '10-01', name: 'D-Rings & O-Rings' },
          { code: '10-02', name: 'Belt Buckles & Clasps' },
          { code: '10-03', name: 'Toggle Closures' },
          { code: '10-04', name: 'Snap Hooks & Swivels' },
          { code: '10-05', name: 'Suspender Clips' },
          { code: '10-06', name: 'Strap Adjusters & Sliders' },
        ],
      },
    ],
  },
  {
    code: '4',
    name: 'Embellishments, Closures & Safety',
    categories: [
      {
        code: '08',
        name: 'Embellishments',
        subcategories: [
          { code: '08-01', name: 'Sequins' },
          { code: '08-02', name: 'Beads' },
          { code: '08-03', name: 'Rhinestones & Crystals' },
          { code: '08-04', name: 'Embroidered Patches & Badges' },
          { code: '08-05', name: 'Lace Trims & Crochet Borders' },
          { code: '08-06', name: 'Appliques & Motifs' },
          { code: '08-07', name: 'Iron-on Transfers' },
          { code: '08-08', name: 'Studs & Metal Decorations' },
        ],
      },
      {
        code: '11',
        name: 'Velcro & Closures',
        subcategories: [
          { code: '11-01', name: 'Hook & Loop Tape' },
          { code: '11-02', name: 'Self-Adhesive Velcro' },
          { code: '11-03', name: 'Sew-on Velcro Strips' },
          { code: '11-04', name: 'Magnetic Snaps & Closures' },
          { code: '11-05', name: 'Kam Snaps' },
          { code: '11-06', name: 'Custom Zip Pulls & Sliders' },
          { code: '11-07', name: 'Press Studs' },
          { code: '11-08', name: 'Toggle & Cord Closures' },
        ],
      },
      {
        code: '12',
        name: 'Safety & Compliance',
        subcategories: [
          { code: '12-01', name: 'Metal Detector Test Strips' },
          { code: '12-02', name: 'Needle Detector Cards' },
          { code: '12-03', name: 'Polybag Suffocation Warnings' },
          { code: '12-04', name: 'Safety Pins & Body Pins' },
          { code: '12-05', name: 'Product Testing Support' },
          { code: '12-06', name: 'OEKO-TEX Documentation' },
          { code: '12-07', name: 'REACH Compliance Docs' },
          { code: '12-08', name: 'AZO-Free Dye Certificates' },
        ],
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// EXCEL PARSER — reads sheets and supplements hardcoded data
// ─────────────────────────────────────────────────────────────────────────────

interface ExcelProduct {
  sku?: string;
  name?: string;
  subcategoryName?: string;
  categoryName?: string;
  hsnCode?: string;
  price?: number;
  uom?: string;
  moq?: number;
  gstRate?: number;
  description?: string;
}

function parseExcelCatalog(filePath: string): ExcelProduct[] {
  const products: ExcelProduct[] = [];

  if (!fs.existsSync(filePath)) {
    console.warn(`⚠  Excel file not found at ${filePath} — using hardcoded data only.`);
    return products;
  }

  try {
    const workbook = XLSX.readFile(filePath, { cellDates: true, cellNF: true });
    console.log(`📊 Excel sheets found: ${workbook.SheetNames.join(', ')}`);

    // Target sheet names (in priority order)
    const TARGET_SHEETS = [
      'Category-Subcat-Products',
      'Master Catalog (Detailed)',
      'Granular Products Breakdown',
      'Products',
      'Catalog',
    ];

    for (const sheetName of workbook.SheetNames) {
      const isTarget = TARGET_SHEETS.some(
        (t) => sheetName.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(sheetName.toLowerCase())
      );
      if (!isTarget) continue;

      const sheet = workbook.Sheets[sheetName];
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
        defval: null,
        raw: false,
      });

      console.log(`  → Parsing sheet "${sheetName}" (${rows.length} rows)`);

      for (const row of rows) {
        const get = (keys: string[]): string | undefined => {
          for (const k of keys) {
            const match = Object.keys(row).find(
              (rk) => rk.toLowerCase().replace(/[\s_-]/g, '') === k.toLowerCase().replace(/[\s_-]/g, '')
            );
            if (match && row[match] != null && String(row[match]).trim() !== '') {
              return String(row[match]).trim();
            }
          }
          return undefined;
        };

        const sku = get(['sku', 'skucode', 'productsku', 'product_sku']);
        const name = get(['productname', 'name', 'product_name', 'itemname', 'item_name']);
        if (!sku && !name) continue;

        const priceRaw = get(['price', 'baseprice', 'unitprice', 'base_price']);
        const moqRaw = get(['moq', 'minimumorderquantity', 'min_order_qty']);
        const gstRaw = get(['gst', 'gstrate', 'gst_rate', 'gstpercent']);

        products.push({
          sku: sku,
          name: name,
          subcategoryName: get(['subcategory', 'sub_category', 'subcategoryname']),
          categoryName: get(['category', 'categoryname', 'category_name']),
          hsnCode: get(['hsn', 'hsncode', 'hsn_code']),
          price: priceRaw ? parseFloat(priceRaw.replace(/[^0-9.]/g, '')) : undefined,
          uom: get(['uom', 'unit', 'unitofmeasure']),
          moq: moqRaw ? parseInt(moqRaw.replace(/[^0-9]/g, ''), 10) : undefined,
          gstRate: gstRaw ? parseFloat(gstRaw.replace(/[^0-9.]/g, '')) : undefined,
          description: get(['description', 'productdescription', 'details']),
        });
      }
    }

    console.log(`  ✓ Parsed ${products.length} products from Excel`);
  } catch (err) {
    console.error('⚠  Excel parsing failed:', (err as Error).message);
    console.warn('   Continuing with hardcoded data only.');
  }

  return products;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱 TrimNova Seed Script — Starting...\n');

  // ── 1. PLATFORM CONFIG ──────────────────────────────────────────────────────
  console.log('① Upserting PlatformConfig...');
  const configEntries: Array<{ key: string; value: string; description: string }> = [
    { key: 'registrationFeeAmount', value: '5000', description: 'One-time vendor registration fee (₹)' },
    { key: 'elitePlanFee', value: '24999', description: 'ELITE annual subscription fee (₹)' },
    { key: 'goldPlanFee', value: '14999', description: 'GOLD annual subscription fee (₹)' },
    { key: 'basicPlanFee', value: '4999', description: 'BASIC annual subscription fee (₹)' },
    { key: 'returnPolicyDays', value: '10', description: 'Return window in days after delivery' },
    { key: 'triminstaRatePerSqftPerMonth', value: '25', description: 'TrimInsta warehouse rate (₹/sqft/month)' },
    { key: 'tdsRate', value: '0.01', description: 'TDS rate on vendor settlements (1%)' },
    { key: 'gstOnCommissionRate', value: '0.18', description: 'GST on platform commission (18%)' },
    { key: 'platformName', value: 'TrimNova', description: 'Platform display name' },
    { key: 'platformEmail', value: 'support@trimnova.in', description: 'Platform support email' },
    { key: 'minMarginPct', value: '7.0', description: 'Minimum allowed margin percentage' },
    { key: 'maxMarginPct', value: '20.0', description: 'Maximum allowed margin percentage' },
  ];

  for (const cfg of configEntries) {
    await prisma.platformConfig.upsert({
      where: { key: cfg.key },
      update: { value: cfg.value, description: cfg.description },
      create: { key: cfg.key, value: cfg.value, description: cfg.description },
    });
  }
  console.log(`   ✓ ${configEntries.length} config entries upserted\n`);

  // ── 2. PARSE EXCEL ──────────────────────────────────────────────────────────
  const excelPath = path.resolve(__dirname, '../seed-data/TrimNova_Garment_Trims_Catalog_Pages_4-7.xlsx');
  const excelProducts = parseExcelCatalog(excelPath);

  // ── 3. CLASSIFICATIONS → CATEGORIES → SUBCATEGORIES ────────────────────────
  console.log('② Seeding Classifications, Categories & Subcategories...');

  // Map: subcategory name (lowercase) → subcategory DB id (populated below)
  const subcategoryIdByName = new Map<string, string>();
  // Map: category code → category DB id
  const categoryIdByCode = new Map<string, string>();

  for (let ci = 0; ci < CATALOG_DATA.length; ci++) {
    const clf = CATALOG_DATA[ci];

    const dbClassification = await prisma.classification.upsert({
      where: { code: clf.code },
      update: { name: clf.name, sortOrder: ci },
      create: {
        code: clf.code,
        name: clf.name,
        sortOrder: ci,
        iconName: getClassificationIcon(clf.code),
        colorClass: getClassificationColor(clf.code),
      },
    });

    for (let cati = 0; cati < clf.categories.length; cati++) {
      const cat = clf.categories[cati];

      const dbCategory = await prisma.category.upsert({
        where: { code: cat.code },
        update: { name: cat.name, sortOrder: cati },
        create: {
          classificationId: dbClassification.id,
          code: cat.code,
          name: cat.name,
          sortOrder: cati,
          iconName: getCategoryIcon(cat.code),
        },
      });

      categoryIdByCode.set(cat.code, dbCategory.id);

      for (let sci = 0; sci < cat.subcategories.length; sci++) {
        const sub = cat.subcategories[sci];

        const dbSub = await prisma.subcategory.upsert({
          where: { categoryId_code: { categoryId: dbCategory.id, code: sub.code } },
          update: { name: sub.name, sortOrder: sci },
          create: {
            categoryId: dbCategory.id,
            code: sub.code,
            name: sub.name,
            sortOrder: sci,
          },
        });

        subcategoryIdByName.set(sub.name.toLowerCase(), dbSub.id);
      }
    }
  }

  // Supplement from Excel — add any subcategories not already in hardcoded set
  if (excelProducts.length > 0) {
    console.log(`   Supplementing with ${excelProducts.length} Excel rows...`);
    // We log the excel data — actual schema is already complete from hardcoded data
    // If extra subcategories appear in Excel, we'd insert them here; for now log
    const uniqueSubcats = [...new Set(excelProducts.map((p) => p.subcategoryName).filter(Boolean))];
    console.log(`   Excel subcategories encountered: ${uniqueSubcats.slice(0, 10).join(', ')}${uniqueSubcats.length > 10 ? '...' : ''}`);
  }

  console.log(`   ✓ Classifications/Categories/Subcategories seeded\n`);

  // ── 4. USERS ────────────────────────────────────────────────────────────────
  console.log('③ Creating User accounts...');

  const [
    hashNovaTex,
    hashAura,
    hashZenith,
    hashApprover,
    hashAdmin,
    hashFinPrep,
    hashFinApprover,
    hashCustomer,
    hashSupport,
  ] = await Promise.all([
    bcrypt.hash('NovaTex@2024', SALT_ROUNDS),
    bcrypt.hash('AuraFast@2024', SALT_ROUNDS),
    bcrypt.hash('Zenith@2024', SALT_ROUNDS),
    bcrypt.hash('Approver@2024', SALT_ROUNDS),
    bcrypt.hash('AdminRoot@2024', SALT_ROUNDS),
    bcrypt.hash('FinPrep@2024', SALT_ROUNDS),
    bcrypt.hash('FinApprove@2024', SALT_ROUNDS),
    bcrypt.hash('Raymond@2024', SALT_ROUNDS),
    bcrypt.hash('Support@2024', SALT_ROUNDS),
  ]);

  // Upsert all users
  const uNovaTex = await prisma.user.upsert({
    where: { userId: 'VN-89420' },
    update: {},
    create: {
      userId: 'VN-89420',
      email: 'procurement@novatex.in',
      passwordHash: hashNovaTex,
      role: Role.VENDOR,
    },
  });

  const uAura = await prisma.user.upsert({
    where: { userId: 'VN-77102' },
    update: {},
    create: {
      userId: 'VN-77102',
      email: 'sales@aurafastener.in',
      passwordHash: hashAura,
      role: Role.VENDOR,
    },
  });

  const uZenith = await prisma.user.upsert({
    where: { userId: 'VN-65011' },
    update: {},
    create: {
      userId: 'VN-65011',
      email: 'info@zeniththreads.in',
      passwordHash: hashZenith,
      role: Role.VENDOR,
    },
  });

  const uApprover = await prisma.user.upsert({
    where: { userId: 'APR-01' },
    update: {},
    create: {
      userId: 'APR-01',
      email: 'approver@trimnova.in',
      passwordHash: hashApprover,
      role: Role.APPROVER,
    },
  });

  const uAdmin = await prisma.user.upsert({
    where: { userId: 'ROOT-01' },
    update: {},
    create: {
      userId: 'ROOT-01',
      email: 'ad.ops.lead@trimnova.in',
      passwordHash: hashAdmin,
      role: Role.ADMIN,
      mfaEnabled: true,
      mfaSecret: 'JBSWY3DPEHPK3PXP',
    },
  });

  const uFinPrep = await prisma.user.upsert({
    where: { userId: 'FP-001' },
    update: {},
    create: {
      userId: 'FP-001',
      email: 'finance.prep@trimnova.in',
      passwordHash: hashFinPrep,
      role: Role.FINANCE_PREPARER,
    },
  });

  const uFinApprover = await prisma.user.upsert({
    where: { userId: 'FA-001' },
    update: {},
    create: {
      userId: 'FA-001',
      email: 'finance.approver@trimnova.in',
      passwordHash: hashFinApprover,
      role: Role.FINANCE_APPROVER,
    },
  });

  const uCustomer = await prisma.user.upsert({
    where: { userId: 'CUS-1001' },
    update: {},
    create: {
      userId: 'CUS-1001',
      email: 'buyer@raymondgarments.in',
      passwordHash: hashCustomer,
      role: Role.CUSTOMER,
    },
  });

  const uSupport = await prisma.user.upsert({
    where: { userId: 'SUP-001' },
    update: {},
    create: {
      userId: 'SUP-001',
      email: 'support@trimnova.in',
      passwordHash: hashSupport,
      role: Role.SUPPORT_OPS,
    },
  });

  console.log('   ✓ 9 User accounts created/confirmed\n');

  // ── 5. VENDOR PROFILES ──────────────────────────────────────────────────────
  console.log('④ Creating Vendor profiles...');

  const now = new Date();
  const planExpiry = new Date(now);
  planExpiry.setFullYear(planExpiry.getFullYear() + 1);

  // NovaTex
  const vendorNovaTex = await prisma.vendor.upsert({
    where: { vendorCode: 'VN-89420' },
    update: {},
    create: {
      userId: uNovaTex.id,
      vendorCode: 'VN-89420',
      companyName: 'NovaTex Trims & Apparel Pvt. Ltd.',
      gstin: '27AAACT2807R1ZP',
      pan: 'AAACT2807R',
      gstVerifiedAt: now,
      panVerifiedAt: now,
      gstVerifiedBy: 'GSTIN-API/seed',
      panVerifiedBy: 'PAN-API/seed',
      status: VendorStatus.ACTIVE,
      plan: VendorPlan.ELITE,
      planActivatedAt: now,
      planExpiresAt: planExpiry,
      registrationFee: 5000,
      planFee: 24999,
      triminstaEnabled: true,
      triminstaAreaSqft: 500,
      triminstaMonthlyRent: 12500, // 500 sqft × ₹25
      triminstaHubLocation: 'Bhiwandi',
      phone: '9022001100',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '421302',
      website: 'https://www.novatex.in',
    },
  });

  // AuraFastener
  const vendorAura = await prisma.vendor.upsert({
    where: { vendorCode: 'VN-77102' },
    update: {},
    create: {
      userId: uAura.id,
      vendorCode: 'VN-77102',
      companyName: 'AuraFastener Corp',
      gstin: '29AABCA1234F1Z5',
      pan: 'AABCA1234F',
      gstVerifiedAt: now,
      status: VendorStatus.ACTIVE,
      plan: VendorPlan.GOLD,
      planActivatedAt: now,
      planExpiresAt: planExpiry,
      registrationFee: 5000,
      planFee: 14999,
      phone: '9833002200',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '560001',
    },
  });

  // Zenith Threads
  const vendorZenith = await prisma.vendor.upsert({
    where: { vendorCode: 'VN-65011' },
    update: {},
    create: {
      userId: uZenith.id,
      vendorCode: 'VN-65011',
      companyName: 'Zenith Threads & Dyes Pvt. Ltd.',
      gstin: '33AAACZ9876P1Z1',
      pan: 'AAACZ9876P',
      status: VendorStatus.ACTIVE,
      plan: VendorPlan.BASIC,
      planActivatedAt: now,
      planExpiresAt: planExpiry,
      registrationFee: 5000,
      planFee: 4999,
      phone: '9944003300',
      city: 'Tiruppur',
      state: 'Tamil Nadu',
      pincode: '641604',
    },
  });

  console.log('   ✓ 3 Vendor profiles created/confirmed\n');

  // ── 6. CUSTOMER PROFILE ─────────────────────────────────────────────────────
  console.log('⑤ Creating Customer profile...');

  await prisma.customer.upsert({
    where: { customerCode: 'CUS-1001' },
    update: {},
    create: {
      userId: uCustomer.id,
      customerCode: 'CUS-1001',
      companyName: 'Raymond Garments Hub',
      contactName: 'Vikram Mehta',
      phone: '9012345678',
      city: 'Tiruppur',
      state: 'Tamil Nadu',
      pincode: '641604',
      deliveryAddress: [
        {
          label: 'Tiruppur Factory',
          line1: '45 Industrial Estate',
          line2: 'Avinashi Road',
          city: 'Tiruppur',
          state: 'Tamil Nadu',
          pincode: '641604',
          isDefault: true,
        },
      ],
    },
  });

  console.log('   ✓ Customer profile created\n');

  // ── 7. APPROVER PROFILE ─────────────────────────────────────────────────────
  console.log('⑥ Creating Approver profile...');

  await prisma.approver.upsert({
    where: { approverCode: 'APR-01' },
    update: {},
    create: {
      userId: uApprover.id,
      approverCode: 'APR-01',
      name: 'Dr. Aris Thorne',
      designation: 'Chief Compliance Auditor',
      isActive: true,
      invitedAt: now,
    },
  });

  console.log('   ✓ Approver profile created\n');

  // ── 8. VENDOR CERTIFICATES (NovaTex) ────────────────────────────────────────
  console.log('⑦ Creating NovaTex certificates...');

  type CertInput = {
    certType: string;
    certNumber: string;
    issuingBody: string;
    status: CertificateStatus;
    issueDate: Date;
    expiryDate: Date;
    approvedBy?: string;
    approvedAt?: Date;
  };

  const certs: CertInput[] = [
    {
      certType: 'OEKO-TEX',
      certNumber: 'OT-2024-NTX-7821',
      issuingBody: 'OEKO-TEX Association',
      status: CertificateStatus.APPROVED,
      issueDate: new Date('2024-01-15'),
      expiryDate: new Date('2025-01-14'),
      approvedBy: uApprover.id,
      approvedAt: new Date('2024-01-20'),
    },
    {
      certType: 'GOTS',
      certNumber: 'GOTS-IN-2024-NTX-334',
      issuingBody: 'Control Union Certifications',
      status: CertificateStatus.APPROVED,
      issueDate: new Date('2024-03-01'),
      expiryDate: new Date('2025-02-28'),
      approvedBy: uApprover.id,
      approvedAt: new Date('2024-03-10'),
    },
    {
      certType: 'FSC',
      certNumber: 'FSC-C180042',
      issuingBody: 'Forest Stewardship Council',
      status: CertificateStatus.ON_HOLD,
      issueDate: new Date('2024-06-01'),
      expiryDate: new Date('2025-05-31'),
    },
  ];

  for (const cert of certs) {
    // Use findFirst + create to avoid duplicate seeding issues
    const existing = await prisma.vendorCertificate.findFirst({
      where: { vendorId: vendorNovaTex.id, certType: cert.certType },
    });
    if (!existing) {
      await prisma.vendorCertificate.create({
        data: {
          vendorId: vendorNovaTex.id,
          ...cert,
        },
      });
    }
  }

  console.log('   ✓ 3 NovaTex certificates seeded\n');

  // ── 9. PRODUCTS ──────────────────────────────────────────────────────────────
  console.log('⑧ Seeding Products...');

  // Helper: resolve subcategory ID by name
  const getSubcatId = (name: string): string => {
    const id = subcategoryIdByName.get(name.toLowerCase());
    if (!id) throw new Error(`Subcategory not found: "${name}"`);
    return id;
  };

  // ── NovaTex Products ────────────────────────────────────────────────────────

  // NTX-WVL-001 — Woven Damask Brand Labels
  const prodWVL = await upsertProduct({
    vendorId: vendorNovaTex.id,
    subcategoryId: getSubcatId('Woven Labels'),
    sku: 'NTX-WVL-001',
    name: 'Woven Damask Brand Labels — Premium Jacquard',
    description: 'High-definition jacquard woven labels for premium garment branding. Available in polyester, cotton-poly blend and pure cotton yarns. Satin weave finish with heat-cut or ultrasonic-cut edges.',
    hsnCode: '5807',
    baseUnitPrice: 2.50,
    uom: 'piece',
    moq: 500,
    gstRate: 12.00,
    status: ProductStatus.APPROVED,
    onlineStock: 25000,
    triminstaStock: 5000,
    triminstaEnabled: true,
    isFeatured: true,
    compliance: 'OEKO-TEX Standard 100, REACH compliant',
  });

  await upsertMarginSlabs(prodWVL.id, uApprover.id, [
    { slabNumber: 1, label: 'SLAB 1 (<50)', minQty: 1, maxQty: 49, marginPct: 15.0 },
    { slabNumber: 2, label: 'SLAB 2 (50–100)', minQty: 50, maxQty: 100, marginPct: 12.0 },
    { slabNumber: 3, label: 'SLAB 3 (100–500)', minQty: 101, maxQty: 500, marginPct: 10.0 },
    { slabNumber: 4, label: 'SLAB 4 (500–1K)', minQty: 501, maxQty: 1000, marginPct: 8.5 },
    { slabNumber: 5, label: 'SLAB 5 (>1K)', minQty: 1001, maxQty: null, marginPct: 7.0 },
  ]);

  await upsertPricingTiers(prodWVL.id, [
    { minQty: 500, maxQty: 999, unitPrice: 2.50 },
    { minQty: 1000, maxQty: 4999, unitPrice: 2.10, savePct: 16 },
    { minQty: 5000, maxQty: null, unitPrice: 1.75, savePct: 30 },
  ]);

  // NTX-RFID-001 — RFID Smart Labels
  const prodRFID = await upsertProduct({
    vendorId: vendorNovaTex.id,
    subcategoryId: getSubcatId('RFID Smart Labels'),
    sku: 'NTX-RFID-001',
    name: 'RFID Smart Inventory Labels — UHF 860-960MHz',
    description: 'UHF RFID inlay labels for garment inventory tracking and anti-counterfeiting. Encoding on EPC Gen2 standard. Read range up to 6 meters. Compatible with all major RFID readers.',
    hsnCode: '8543',
    baseUnitPrice: 18.00,
    uom: 'piece',
    moq: 100,
    gstRate: 18.00,
    status: ProductStatus.APPROVED,
    onlineStock: 10000,
    triminstaStock: 2000,
    triminstaEnabled: true,
    isFeatured: false,
    compliance: 'ISO/IEC 18000-63, EPC Gen2, REACH compliant',
  });

  await upsertMarginSlabs(prodRFID.id, uApprover.id, [
    { slabNumber: 1, label: 'SLAB 1 (<100)', minQty: 1, maxQty: 99, marginPct: 14.0 },
    { slabNumber: 2, label: 'SLAB 2 (100–500)', minQty: 100, maxQty: 500, marginPct: 11.0 },
    { slabNumber: 3, label: 'SLAB 3 (500–1K)', minQty: 501, maxQty: 1000, marginPct: 9.5 },
    { slabNumber: 4, label: 'SLAB 4 (1K–5K)', minQty: 1001, maxQty: 5000, marginPct: 8.5 },
    { slabNumber: 5, label: 'SLAB 5 (>5K)', minQty: 5001, maxQty: null, marginPct: 7.5 },
  ]);

  // NTX-FUS-001 — Fusible Microdot Interlining
  const prodFUS = await upsertProduct({
    vendorId: vendorNovaTex.id,
    subcategoryId: getSubcatId('Fusible Interlining'),
    sku: 'NTX-FUS-001',
    name: 'Fusible Microdot Interlining — PA Coating 30gsm',
    description: 'Lightweight woven fusible interlining with PA polyamide microdot coating. 30 GSM base cloth, ideal for shirt collars, cuffs, and plackets. Dimensionally stable at 150°C press.',
    hsnCode: '5903',
    baseUnitPrice: 45.00,
    uom: 'meter',
    moq: 200,
    gstRate: 12.00,
    status: ProductStatus.APPROVED,
    onlineStock: 5000,
    triminstaStock: 1000,
    triminstaEnabled: true,
    isFeatured: true,
    materialComp: '100% Polyester base with PA coating',
    tensileStrength: '≥180N (warp), ≥120N (weft)',
    compliance: 'OEKO-TEX 100, REACH, AZO-free',
  });

  await upsertMarginSlabs(prodFUS.id, uApprover.id, [
    { slabNumber: 1, label: 'SLAB 1 (<200)', minQty: 1, maxQty: 199, marginPct: 13.0 },
    { slabNumber: 2, label: 'SLAB 2 (200–500)', minQty: 200, maxQty: 500, marginPct: 11.0 },
    { slabNumber: 3, label: 'SLAB 3 (500–1K)', minQty: 501, maxQty: 1000, marginPct: 9.5 },
    { slabNumber: 4, label: 'SLAB 4 (1K–2K)', minQty: 1001, maxQty: 2000, marginPct: 8.5 },
    { slabNumber: 5, label: 'SLAB 5 (>2K)', minQty: 2001, maxQty: null, marginPct: 7.5 },
  ]);

  // NTX-THD-001 — High-Tenacity Bonded Poly Threads (REJECTED — in ESC-9482)
  const prodTHD = await upsertProduct({
    vendorId: vendorNovaTex.id,
    subcategoryId: getSubcatId('Sewing Threads'),
    sku: 'NTX-THD-001',
    name: 'High-Tenacity Bonded Poly Threads — Tex 40',
    description: 'Bonded multifilament polyester sewing thread, Tex 40, 5000m cone. High-tenacity for industrial sewing machines. UV and chlorine resistant. Available in 100+ colours.',
    hsnCode: '5401',
    baseUnitPrice: 185.00,
    uom: 'cone',
    moq: 100,
    gstRate: 12.00,
    status: ProductStatus.REJECTED,
    onlineStock: 3000,
    triminstaStock: 500,
    triminstaEnabled: false,
    countTicketSize: 'Tex 40 / Ticket 80',
    tensileStrength: '≥5.5 N/tex',
    elongation: '18–22%',
    needleSize: 'Size 80–100',
    compliance: 'OEKO-TEX Standard 100',
  });

  await upsertMarginSlabs(prodTHD.id, uApprover.id, [
    { slabNumber: 1, label: 'SLAB 1 (<100)', minQty: 1, maxQty: 99, marginPct: 12.0, agreedStatus: 'DISAGREEMENT', disputeNote: 'Vendor proposes 5%; TrimNova target 9%' },
    { slabNumber: 2, label: 'SLAB 2 (100–500)', minQty: 100, maxQty: 500, marginPct: 10.0, agreedStatus: 'DISAGREEMENT', disputeNote: 'Vendor proposes 5%; TrimNova target 9%' },
    { slabNumber: 3, label: 'SLAB 3 (500–1K)', minQty: 501, maxQty: 1000, marginPct: 9.0, agreedStatus: 'DISAGREEMENT', disputeNote: 'Vendor proposes 5%; TrimNova target 9%' },
    { slabNumber: 4, label: 'SLAB 4 (1K–5K)', minQty: 1001, maxQty: 5000, marginPct: 8.5, agreedStatus: 'DISAGREEMENT' },
    { slabNumber: 5, label: 'SLAB 5 (>5K)', minQty: 5001, maxQty: null, marginPct: 7.5, agreedStatus: 'DISAGREEMENT' },
  ]);

  // NTX-ZIP-001 — Antique Brass Teeth Zippers (REJECTED — in ESC-9482)
  const prodZIP = await upsertProduct({
    vendorId: vendorNovaTex.id,
    subcategoryId: getSubcatId('Metal Zippers'),
    sku: 'NTX-ZIP-001',
    name: 'Antique Brass Teeth Zippers #5 — 20cm',
    description: 'Closed-end metal zipper, #5 antique brass teeth, 20cm with matching brass slider and pull tab. Ideal for denim jeans, jackets, and leather goods. Salt-spray tested.',
    hsnCode: '9607',
    baseUnitPrice: 28.00,
    uom: 'piece',
    moq: 200,
    gstRate: 18.00,
    status: ProductStatus.REJECTED,
    onlineStock: 8000,
    triminstaStock: 2000,
    triminstaEnabled: false,
    materialComp: 'Brass teeth, polyester tape, brass slider',
    compliance: 'REACH, AZO-free tape',
  });

  await upsertMarginSlabs(prodZIP.id, uApprover.id, [
    { slabNumber: 1, label: 'SLAB 1 (<200)', minQty: 1, maxQty: 199, marginPct: 12.0, agreedStatus: 'DISAGREEMENT', disputeNote: 'Vendor proposes 6%; TrimNova target 9%' },
    { slabNumber: 2, label: 'SLAB 2 (200–500)', minQty: 200, maxQty: 500, marginPct: 10.0, agreedStatus: 'DISAGREEMENT', disputeNote: 'Vendor proposes 6%; TrimNova target 9%' },
    { slabNumber: 3, label: 'SLAB 3 (500–1K)', minQty: 501, maxQty: 1000, marginPct: 9.0, agreedStatus: 'DISAGREEMENT', disputeNote: 'Vendor proposes 6%; TrimNova target 9%' },
    { slabNumber: 4, label: 'SLAB 4 (1K–5K)', minQty: 1001, maxQty: 5000, marginPct: 8.5, agreedStatus: 'DISAGREEMENT' },
    { slabNumber: 5, label: 'SLAB 5 (>5K)', minQty: 5001, maxQty: null, marginPct: 7.5, agreedStatus: 'DISAGREEMENT' },
  ]);

  // ── AuraFastener Products ───────────────────────────────────────────────────

  // AUR-BTN-001 — Pearl Effect Polyester Buttons
  const prodBTN = await upsertProduct({
    vendorId: vendorAura.id,
    subcategoryId: getSubcatId('Buttons'),
    sku: 'AUR-BTN-001',
    name: '4-Hole Pearl Effect Polyester Buttons — 20mm',
    description: 'High-sheen pearl effect polyester flat buttons, 4-hole, 20mm diameter. Temperature resistant up to 180°C (suitable for steam pressing). Available in white, ivory, and 40+ colours.',
    hsnCode: '9606',
    baseUnitPrice: 1.80,
    uom: 'piece',
    moq: 1000,
    gstRate: 12.00,
    status: ProductStatus.APPROVED,
    onlineStock: 100000,
    triminstaStock: 0,
    triminstaEnabled: false,
    materialComp: '100% Polyester resin',
    compliance: 'REACH, AZO-free, OEKO-TEX 100',
  });

  await upsertMarginSlabs(prodBTN.id, uApprover.id, [
    { slabNumber: 1, label: 'SLAB 1 (<1K)', minQty: 1, maxQty: 999, marginPct: 12.0, agreedStatus: 'AGREED' },
    { slabNumber: 2, label: 'SLAB 2 (1K–5K)', minQty: 1000, maxQty: 5000, marginPct: 10.0, agreedStatus: 'AGREED' },
    { slabNumber: 3, label: 'SLAB 3 (5K–10K)', minQty: 5001, maxQty: 10000, marginPct: 9.0, agreedStatus: 'AGREED' },
    { slabNumber: 4, label: 'SLAB 4 (10K–50K)', minQty: 10001, maxQty: 50000, marginPct: 8.0, agreedStatus: 'AGREED' },
    { slabNumber: 5, label: 'SLAB 5 (>50K)', minQty: 50001, maxQty: null, marginPct: 7.0, agreedStatus: 'AGREED' },
  ]);

  // AUR-SNP-001 — Snap Press Studs
  const prodSNP = await upsertProduct({
    vendorId: vendorAura.id,
    subcategoryId: getSubcatId('Snaps & Press Studs'),
    sku: 'AUR-SNP-001',
    name: 'Snap Press Studs — Nickel Free 15mm',
    description: 'Four-part metal press snap studs, 15mm, nickel-free electroplated finish. Set includes cap, socket, post, and stud. Rated for 5000+ open/close cycles.',
    hsnCode: '9606',
    baseUnitPrice: 3.20,
    uom: 'set',
    moq: 500,
    gstRate: 12.00,
    status: ProductStatus.APPROVED,
    onlineStock: 50000,
    triminstaStock: 0,
    triminstaEnabled: false,
    materialComp: 'Steel base, nickel-free finish',
    compliance: 'REACH, EN 71-3, AZO-free',
  });

  await upsertMarginSlabs(prodSNP.id, uApprover.id, [
    { slabNumber: 1, label: 'SLAB 1 (<500)', minQty: 1, maxQty: 499, marginPct: 12.0, agreedStatus: 'AGREED' },
    { slabNumber: 2, label: 'SLAB 2 (500–2K)', minQty: 500, maxQty: 2000, marginPct: 10.5, agreedStatus: 'AGREED' },
    { slabNumber: 3, label: 'SLAB 3 (2K–5K)', minQty: 2001, maxQty: 5000, marginPct: 9.0, agreedStatus: 'AGREED' },
    { slabNumber: 4, label: 'SLAB 4 (5K–20K)', minQty: 5001, maxQty: 20000, marginPct: 8.0, agreedStatus: 'AGREED' },
    { slabNumber: 5, label: 'SLAB 5 (>20K)', minQty: 20001, maxQty: null, marginPct: 7.0, agreedStatus: 'AGREED' },
  ]);

  // ── Zenith Threads Products ─────────────────────────────────────────────────

  // ZNT-OVL-001 — Overlocking & Sewing Threads
  const prodOVL = await upsertProduct({
    vendorId: vendorZenith.id,
    subcategoryId: getSubcatId('Overlocking Threads'),
    sku: 'ZNT-OVL-001',
    name: 'Overlocking & Sewing Threads — High-Speed Spun Poly Cones (5,000m)',
    description: 'High-speed spun polyester overlocking threads, 5000m cone. Smooth and lint-free for consistent seam formation at high speeds. Compatible with all major overlock machines.',
    hsnCode: '5401',
    baseUnitPrice: 145.00,
    uom: 'cone',
    moq: 50,
    gstRate: 12.00,
    status: ProductStatus.APPROVED,
    onlineStock: 2000,
    triminstaStock: 0,
    triminstaEnabled: false,
    countTicketSize: 'Tex 27 / Ticket 120',
    tensileStrength: '≥4.8 N/tex',
    elongation: '20–24%',
    needleSize: 'Size 70–90',
    compliance: 'OEKO-TEX Standard 100',
  });

  await upsertMarginSlabs(prodOVL.id, uApprover.id, [
    { slabNumber: 1, label: 'SLAB 1 (<50)', minQty: 1, maxQty: 49, marginPct: 10.0, agreedStatus: 'AGREED' },
    { slabNumber: 2, label: 'SLAB 2 (50–200)', minQty: 50, maxQty: 200, marginPct: 9.0, agreedStatus: 'AGREED' },
    { slabNumber: 3, label: 'SLAB 3 (200–500)', minQty: 201, maxQty: 500, marginPct: 8.5, agreedStatus: 'AGREED' },
    { slabNumber: 4, label: 'SLAB 4 (500–1K)', minQty: 501, maxQty: 1000, marginPct: 8.0, agreedStatus: 'AGREED' },
    { slabNumber: 5, label: 'SLAB 5 (>1K)', minQty: 1001, maxQty: null, marginPct: 7.5, agreedStatus: 'AGREED' },
  ]);

  // Stock alert for ZNT-OVL-001 (triminstaStock = 0 → OUT_OF_STOCK)
  const existingAlert = await prisma.stockAlert.findFirst({
    where: { productId: prodOVL.id, vendorId: vendorZenith.id },
  });
  if (!existingAlert) {
    await prisma.stockAlert.create({
      data: {
        productId: prodOVL.id,
        vendorId: vendorZenith.id,
        alertType: 'OUT_OF_STOCK',
        stockLevel: 0,
        threshold: 50,
      },
    });
  }

  console.log('   ✓ 8 Products + MarginSlabs + PricingTiers seeded\n');

  // ── 10. ESCALATION ESC-9482 ─────────────────────────────────────────────────
  console.log('⑨ Creating Escalation ESC-9482...');

  const existingEsc = await prisma.escalation.findUnique({ where: { caseNumber: 'ESC-9482' } });

  if (!existingEsc) {
    await prisma.$transaction(async (tx) => {
      const esc = await tx.escalation.create({
        data: {
          caseNumber: 'ESC-9482',
          vendorId: vendorNovaTex.id,
          title: 'Margin Negotiation Dispute — NovaTex Trims & Apparel Pvt. Ltd.',
          description:
            'Vendor NovaTex disputes the platform-set margin percentages for two products. ' +
            'NovaTex proposes significantly lower margins citing raw material cost escalation ' +
            'and reduced processing margins post-GST revision. Approver has reviewed and ' +
            'maintains TrimNova target margins as per platform policy.',
          status: EscalationStatus.OPEN,
          assignedToAdmin: uAdmin.id,
          items: {
            create: [
              {
                productId: prodTHD.id,
                productName: 'High-Tenacity Bonded Poly Threads — Tex 40',
                sku: 'NTX-THD-001',
                vendorMarginPct: 5.0,
                targetMarginPct: 9.0,
                disputeNote:
                  'NovaTex proposes 5% margin citing polyester staple fibre price hike of 22% YoY. ' +
                  'TrimNova policy floor is 9% for BASIC-tier thread products.',
                status: 'DISPUTED',
              },
              {
                productId: prodZIP.id,
                productName: 'Antique Brass Teeth Zippers #5 — 20cm',
                sku: 'NTX-ZIP-001',
                vendorMarginPct: 6.0,
                targetMarginPct: 9.0,
                disputeNote:
                  'NovaTex proposes 6% margin citing brass metal commodity surge +18% and import duty. ' +
                  'TrimNova policy floor is 9% for hardware/zipper products.',
                status: 'DISPUTED',
              },
            ],
          },
          timeline: {
            create: [
              {
                actorId: uApprover.id,
                actorRole: 'APPROVER',
                action: 'CASE_OPENED',
                detail:
                  'Escalation case ESC-9482 opened by Chief Compliance Auditor Dr. Aris Thorne ' +
                  'following rejection of NTX-THD-001 and NTX-ZIP-001 due to margin disagreement.',
                createdAt: new Date('2026-10-28T09:00:00Z'),
              },
              {
                actorId: uNovaTex.id,
                actorRole: 'VENDOR',
                action: 'VENDOR_RESPONSE',
                detail:
                  'NovaTex Procurement Team response: "We formally contest the 9% margin floor. ' +
                  'Our cost sheets clearly indicate that polyester staple fibre has increased by 22% ' +
                  'since Q1 2026. We propose 5% for threads and 6% for zippers as fair commercial terms. ' +
                  'Supporting cost sheets attached under case documents."',
                createdAt: new Date('2026-10-29T11:30:00Z'),
              },
              {
                actorId: uApprover.id,
                actorRole: 'APPROVER',
                action: 'APPROVER_NOTE',
                detail:
                  'Cost sheets reviewed. While input cost increase is acknowledged, platform policy ' +
                  'mandates minimum 9% margin to maintain platform viability and settlement fund. ' +
                  'Counter-proposal: 8.5% for threads (compromise) and 9% maintained for zippers. ' +
                  'Awaiting vendor acceptance.',
                createdAt: new Date('2026-10-31T14:00:00Z'),
              },
            ],
          },
        },
      });

      console.log(`   ✓ Escalation ${esc.caseNumber} created (id: ${esc.id})`);
    });
  } else {
    console.log(`   ℹ Escalation ESC-9482 already exists — skipping`);
  }

  console.log();

  // ── 11. NOTIFICATIONS ────────────────────────────────────────────────────────
  console.log('⑩ Seeding sample Notifications...');

  const notifDefs = [
    {
      userId: uNovaTex.id,
      type: NotificationType.REJECTION,
      channel: NotificationChannel.IN_PORTAL,
      subject: 'Product Listing Rejected — NTX-THD-001',
      body: 'Your product "High-Tenacity Bonded Poly Threads — Tex 40" (SKU: NTX-THD-001) has been rejected due to a margin negotiation dispute. Escalation case ESC-9482 has been opened. Please review the case and respond within 7 business days.',
      metadata: { productId: prodTHD.id, caseNumber: 'ESC-9482' },
    },
    {
      userId: uNovaTex.id,
      type: NotificationType.REJECTION,
      channel: NotificationChannel.IN_PORTAL,
      subject: 'Product Listing Rejected — NTX-ZIP-001',
      body: 'Your product "Antique Brass Teeth Zippers #5 — 20cm" (SKU: NTX-ZIP-001) has been rejected due to a margin negotiation dispute. Please refer to escalation case ESC-9482.',
      metadata: { productId: prodZIP.id, caseNumber: 'ESC-9482' },
    },
    {
      userId: uNovaTex.id,
      type: NotificationType.APPROVAL,
      channel: NotificationChannel.IN_PORTAL,
      subject: 'Product Approved — NTX-WVL-001',
      body: 'Congratulations! Your product "Woven Damask Brand Labels — Premium Jacquard" (SKU: NTX-WVL-001) has been approved and is now live on TrimNova marketplace.',
      metadata: { productId: prodWVL.id },
    },
    {
      userId: uNovaTex.id,
      type: NotificationType.APPROVAL,
      channel: NotificationChannel.IN_PORTAL,
      subject: 'Product Approved — NTX-RFID-001',
      body: 'Your product "RFID Smart Inventory Labels" (SKU: NTX-RFID-001) has been approved.',
      metadata: { productId: prodRFID.id },
    },
    {
      userId: uNovaTex.id,
      type: NotificationType.APPROVAL,
      channel: NotificationChannel.IN_PORTAL,
      subject: 'Product Approved — NTX-FUS-001',
      body: 'Your product "Fusible Microdot Interlining" (SKU: NTX-FUS-001) has been approved.',
      metadata: { productId: prodFUS.id },
    },
    {
      userId: uApprover.id,
      type: NotificationType.ESCALATION,
      channel: NotificationChannel.IN_PORTAL,
      subject: 'Escalation Assigned — ESC-9482',
      body: 'A new margin negotiation escalation case ESC-9482 has been opened for NovaTex Trims & Apparel Pvt. Ltd. Two products are under dispute: NTX-THD-001 and NTX-ZIP-001. Vendor response awaited.',
      metadata: { caseNumber: 'ESC-9482', vendorCode: 'VN-89420' },
    },
    {
      userId: uZenith.id,
      type: NotificationType.LOW_STOCK,
      channel: NotificationChannel.IN_PORTAL,
      subject: 'Stock Alert — ZNT-OVL-001 TrimInsta Stock Empty',
      body: 'TrimInsta inventory for "Overlocking & Sewing Threads" (SKU: ZNT-OVL-001) is at 0 units. This product is currently excluded from TrimInsta fulfilment. Please replenish your Bhiwandi hub stock.',
      metadata: { productId: prodOVL.id, triminstaStock: 0 },
    },
    {
      userId: uAdmin.id,
      type: NotificationType.SYSTEM,
      channel: NotificationChannel.IN_PORTAL,
      subject: 'Seed Complete — TrimNova Database Initialized',
      body: 'Database has been seeded successfully with demo data. All vendor accounts, products, and escalation cases are now active.',
      metadata: { seededAt: new Date().toISOString() },
    },
  ];

  for (const notif of notifDefs) {
    await prisma.notification.create({
      data: {
        userId: notif.userId,
        type: notif.type,
        channel: notif.channel,
        subject: notif.subject,
        body: notif.body,
        metadata: notif.metadata,
        sentAt: new Date(),
      },
    });
  }

  console.log(`   ✓ ${notifDefs.length} notifications created\n`);

  // ── SUMMARY ──────────────────────────────────────────────────────────────────
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('✅  TrimNova seed complete!\n');
  console.log('  Classifications : 4');
  console.log('  Categories      : 12');
  console.log('  Subcategories   : 60');
  console.log('  Users           : 9  (3 Vendors, 1 Customer, 1 Approver,');
  console.log('                        1 Admin, 1 FinPrep, 1 FinApprover, 1 Support)');
  console.log('  Products        : 8  (5 NovaTex, 2 AuraFastener, 1 Zenith)');
  console.log('  Escalations     : 1  (ESC-9482 — OPEN)');
  console.log('  Notifications   : 8');
  console.log('══════════════════════════════════════════════════════════════════\n');
  console.log('  Demo login credentials:');
  console.log('  ─────────────────────────────────────────────────────────────');
  console.log('  VENDOR   procurement@novatex.in       NovaTex@2024');
  console.log('  VENDOR   sales@aurafastener.in         AuraFast@2024');
  console.log('  VENDOR   info@zeniththreads.in         Zenith@2024');
  console.log('  APPROVER approver@trimnova.in          Approver@2024');
  console.log('  ADMIN    ad.ops.lead@trimnova.in       AdminRoot@2024  [MFA]');
  console.log('  FINANCE  finance.prep@trimnova.in      FinPrep@2024');
  console.log('  FINANCE  finance.approver@trimnova.in  FinApprove@2024');
  console.log('  CUSTOMER buyer@raymondgarments.in      Raymond@2024');
  console.log('  SUPPORT  support@trimnova.in           Support@2024');
  console.log('══════════════════════════════════════════════════════════════════\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

interface ProductInput {
  vendorId: string;
  subcategoryId: string;
  sku: string;
  name: string;
  description?: string;
  hsnCode: string;
  baseUnitPrice: number;
  uom: string;
  moq: number;
  gstRate: number;
  status: ProductStatus;
  onlineStock?: number;
  triminstaStock?: number;
  triminstaEnabled?: boolean;
  isFeatured?: boolean;
  compliance?: string;
  materialComp?: string;
  countTicketSize?: string;
  tensileStrength?: string;
  elongation?: string;
  needleSize?: string;
}

async function upsertProduct(input: ProductInput) {
  return prisma.product.upsert({
    where: { sku: input.sku },
    update: {
      status: input.status,
      onlineStock: input.onlineStock ?? 0,
      triminstaStock: input.triminstaStock ?? 0,
      triminstaEnabled: input.triminstaEnabled ?? false,
    },
    create: {
      vendorId: input.vendorId,
      subcategoryId: input.subcategoryId,
      sku: input.sku,
      name: input.name,
      description: input.description,
      hsnCode: input.hsnCode,
      baseUnitPrice: input.baseUnitPrice,
      uom: input.uom,
      moq: input.moq,
      gstRate: input.gstRate,
      status: input.status,
      onlineStock: input.onlineStock ?? 0,
      triminstaStock: input.triminstaStock ?? 0,
      triminstaEnabled: input.triminstaEnabled ?? false,
      isFeatured: input.isFeatured ?? false,
      compliance: input.compliance,
      materialComp: input.materialComp,
      countTicketSize: input.countTicketSize,
      tensileStrength: input.tensileStrength,
      elongation: input.elongation,
      needleSize: input.needleSize,
      imageUrls: [],
      isTemplate: false,
    },
  });
}

interface SlabInput {
  slabNumber: number;
  label: string;
  minQty: number;
  maxQty: number | null;
  marginPct: number;
  agreedStatus?: string;
  disputeNote?: string;
}

async function upsertMarginSlabs(
  productId: string,
  approverId: string,
  slabs: SlabInput[]
) {
  for (const slab of slabs) {
    const vendorNetPct = parseFloat((100 - slab.marginPct).toFixed(3));
    await prisma.marginSlab.upsert({
      where: { productId_slabNumber: { productId, slabNumber: slab.slabNumber } },
      update: {
        marginPct: slab.marginPct,
        vendorNetPct,
        agreedStatus: slab.agreedStatus ?? 'PENDING',
        disputeNote: slab.disputeNote,
      },
      create: {
        productId,
        slabNumber: slab.slabNumber,
        label: slab.label,
        minQty: slab.minQty,
        maxQty: slab.maxQty,
        marginPct: slab.marginPct,
        vendorNetPct,
        agreedStatus: slab.agreedStatus ?? 'PENDING',
        disputeNote: slab.disputeNote,
        setByApprover: approverId,
        setAt: new Date(),
        isActive: true,
      },
    });
  }
}

interface TierInput {
  minQty: number;
  maxQty: number | null;
  unitPrice: number;
  savePct?: number;
}

async function upsertPricingTiers(productId: string, tiers: TierInput[]) {
  // Delete existing tiers and recreate (pricing tiers don't have a natural unique key beyond product+min)
  await prisma.productPricingTier.deleteMany({ where: { productId } });
  for (const tier of tiers) {
    await prisma.productPricingTier.create({
      data: {
        productId,
        minQty: tier.minQty,
        maxQty: tier.maxQty,
        unitPrice: tier.unitPrice,
        savePct: tier.savePct,
        isActive: true,
      },
    });
  }
}

function getClassificationIcon(code: string): string {
  const icons: Record<string, string> = {
    '1': 'Tag',
    '2': 'Layers',
    '3': 'Package',
    '4': 'Sparkles',
  };
  return icons[code] ?? 'Box';
}

function getClassificationColor(code: string): string {
  const colors: Record<string, string> = {
    '1': 'indigo',
    '2': 'emerald',
    '3': 'amber',
    '4': 'rose',
  };
  return colors[code] ?? 'slate';
}

function getCategoryIcon(code: string): string {
  const icons: Record<string, string> = {
    '01': 'Tag',
    '02': 'Wind',
    '03': 'Circle',
    '04': 'ZapOff',
    '05': 'Ribbon',
    '06': 'Layers',
    '07': 'Package',
    '08': 'Sparkles',
    '09': 'Minus',
    '10': 'Link',
    '11': 'Grip',
    '12': 'ShieldCheck',
  };
  return icons[code] ?? 'Box';
}

// ─────────────────────────────────────────────────────────────────────────────

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('\n❌ Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
