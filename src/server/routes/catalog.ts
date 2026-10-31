/**
 * TrimNova — Public Catalog Routes
 * /api/v1/catalog
 *
 * Public endpoints for browsing classifications, categories, subcategories,
 * and products. Authenticated endpoints extend visibility with vendor plan info.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { VendorPlan, ProductStatus } from '@prisma/client';

import prisma from '../lib/prisma.js';

const router = Router();

/** Safe coerce req.query value to string */
function qstr(val: unknown): string | undefined {
  return typeof val === 'string' && val ? val : undefined;
}

function qnum(val: unknown): number | undefined {
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

/** Coerce req.params value to string (Express types as string | string[]) */
const p = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] : v) ?? '';

// ─── GET /classifications ─────────────────────────────────────────────────────
router.get('/classifications', async (_req: Request, res: Response): Promise<void> => {
  try {
    const classifications = await prisma.classification.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        categories: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, code: true, name: true, description: true, iconName: true, colorClass: true, sortOrder: true },
        },
      },
    });

    res.json({ success: true, data: classifications, total: classifications.length });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch classifications' });
  }
});

// ─── GET /categories ──────────────────────────────────────────────────────────
router.get('/categories', async (_req: Request, res: Response): Promise<void> => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        classification: { select: { id: true, name: true, code: true } },
        _count: { select: { subcategories: true } },
      },
    });
    res.json({ success: true, data: categories, total: categories.length });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch categories' });
  }
});

// ─── GET /categories/:id/subcategories ───────────────────────────────────────
router.get('/categories/:id/subcategories', async (req: Request, res: Response): Promise<void> => {
  try {
    const category = await prisma.category.findUnique({
      where: { id: req.params.id as string },
      select: { id: true, name: true, code: true },
    });

    if (!category) { res.status(404).json({ success: false, error: 'Category not found' }); return; }

    const subcategories = await prisma.subcategory.findMany({
      where: { categoryId: req.params.id as string },
      orderBy: { sortOrder: 'asc' },
    });

    res.json({ success: true, data: { category, subcategories }, total: subcategories.length });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch subcategories' });
  }
});

// ─── GET /products/search ─────────────────────────────────────────────────────
// NOTE: must be BEFORE /products/:id
router.get('/products/search', async (req: Request, res: Response): Promise<void> => {
  const keyword = (qstr(req.query.q) ?? '').trim();
  const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));

  if (!keyword || keyword.length < 2) {
    res.status(400).json({ success: false, error: 'Search query must be at least 2 characters (param: q)' });
    return;
  }

  try {
    const results = await prisma.product.findMany({
      where: {
        status: ProductStatus.APPROVED,
        isTemplate: false,
        vendorId: { not: null },
        OR: [
          { name: { contains: keyword, mode: 'insensitive' } },
          { sku: { contains: keyword, mode: 'insensitive' } },
          { hsnCode: { contains: keyword, mode: 'insensitive' } },
          { description: { contains: keyword, mode: 'insensitive' } },
          { materialComp: { contains: keyword, mode: 'insensitive' } },
        ],
      },
      take: limit,
      select: {
        id: true,
        sku: true,
        name: true,
        hsnCode: true,
        baseUnitPrice: true,
        currency: true,
        uom: true,
        status: true,
        imageUrls: true,
        subcategory: { select: { name: true, category: { select: { name: true } } } },
        vendor: { select: { vendorCode: true, companyName: true, plan: true } },
      },
      orderBy: { isFeatured: 'desc' },
    });

    res.json({ success: true, data: results, total: results.length, query: keyword });
  } catch {
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// ─── GET /products ────────────────────────────────────────────────────────────
const ProductListQuerySchema = z.object({
  categoryId: z.string().cuid().optional(),
  subcategoryId: z.string().cuid().optional(),
  certifications: z.union([z.string(), z.array(z.string())]).optional(),
  fulfilment: z.enum(['ONLINE', 'INSTA']).optional(),
  keyword: z.string().max(200).optional(),
  minPrice: z.coerce.number().positive().optional(),
  maxPrice: z.coerce.number().positive().optional(),
  vendorPlan: z.nativeEnum(VendorPlan).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  sortBy: z.enum(['price_asc', 'price_desc', 'newest', 'featured']).default('featured'),
});

router.get('/products', async (req: Request, res: Response): Promise<void> => {
  const parse = ProductListQuerySchema.safeParse(req.query);
  if (!parse.success) {
    res.status(400).json({ success: false, error: 'Invalid query params', details: parse.error.flatten() });
    return;
  }

  const { categoryId, subcategoryId, certifications, fulfilment, keyword, minPrice, maxPrice, vendorPlan, page, limit, sortBy } = parse.data;

  try {
    // Build where clause
    const subcategoryWhere = subcategoryId
      ? { subcategoryId }
      : categoryId
      ? { subcategory: { categoryId } }
      : {};

    const keywordWhere = keyword
      ? {
          OR: [
            { name: { contains: keyword, mode: 'insensitive' as const } },
            { description: { contains: keyword, mode: 'insensitive' as const } },
            { sku: { contains: keyword, mode: 'insensitive' as const } },
            { hsnCode: { contains: keyword, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const priceWhere = (minPrice !== undefined || maxPrice !== undefined)
      ? { baseUnitPrice: { ...(minPrice ? { gte: minPrice } : {}), ...(maxPrice ? { lte: maxPrice } : {}) } }
      : {};

    const certList = certifications
      ? (Array.isArray(certifications) ? certifications : [certifications])
      : [];

    // Vendor filter
    const vendorFilter: Record<string, unknown> = {};
    if (vendorPlan) vendorFilter.plan = vendorPlan;
    if (certList.length > 0) {
      vendorFilter.certificates = { some: { certType: { in: certList }, status: 'APPROVED' } };
    }

    const where = {
      status: ProductStatus.APPROVED,
      isTemplate: false,
      vendorId: { not: null as string | null },
      ...subcategoryWhere,
      ...keywordWhere,
      ...priceWhere,
      ...(fulfilment === 'INSTA' ? { triminstaEnabled: true } : {}),
      ...(Object.keys(vendorFilter).length > 0 ? { vendor: vendorFilter } : {}),
    };

    let orderBy: Record<string, string>;
    switch (sortBy) {
      case 'price_asc':  orderBy = { baseUnitPrice: 'asc' };  break;
      case 'price_desc': orderBy = { baseUnitPrice: 'desc' }; break;
      case 'newest':     orderBy = { createdAt: 'desc' };     break;
      default:           orderBy = { sortOrder: 'asc' };
    }

    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          subcategory: {
            select: {
              id: true,
              name: true,
              code: true,
              category: { select: { id: true, name: true, code: true } },
            },
          },
          vendor: {
            select: {
              id: true,
              vendorCode: true,
              companyName: true,
              plan: true,
              city: true,
              state: true,
              triminstaEnabled: true,
              triminstaHubLocation: true,
              certificates: {
                where: { status: 'APPROVED' },
                select: { id: true, certType: true, issuingBody: true, expiryDate: true },
              },
            },
          },
          pricingTiers: {
            where: { isActive: true },
            orderBy: { minQty: 'asc' },
            select: { minQty: true, maxQty: true, unitPrice: true, savePct: true },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    // Strip logo info for BASIC plan vendors
    const sanitized = products.map((p) => {
      const vendor = p.vendor;
      if (!vendor) return { ...p, marginSlabs: undefined };

      const isBasic = vendor.plan === VendorPlan.BASIC;
      return {
        ...p,
        marginSlabs: undefined, // never expose margins in public listing
        vendor: {
          ...vendor,
          certificates: isBasic ? vendor.certificates.map((c) => ({ certType: c.certType })) : vendor.certificates,
          triminstaHubLocation: isBasic ? null : vendor.triminstaHubLocation,
        },
      };
    });

    res.json({
      success: true,
      data: sanitized,
      pagination: {
        page, limit, total,
        totalPages: Math.ceil(total / limit),
        hasNext: skip + limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (err) {
    console.error('[catalog-products]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch products' });
  }
});

// ─── GET /products/:id ────────────────────────────────────────────────────────
router.get('/products/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const product = await prisma.product.findFirst({
      where: {
        id: req.params.id as string,
        status: ProductStatus.APPROVED,
        isTemplate: false,
        vendorId: { not: null },
      },
      include: {
        subcategory: {
          include: {
            category: {
              include: { classification: { select: { id: true, name: true, code: true } } },
            },
          },
        },
        vendor: {
          select: {
            id: true,
            vendorCode: true,
            companyName: true,
            plan: true,
            city: true,
            state: true,
            website: true,
            triminstaEnabled: true,
            triminstaHubLocation: true,
            planActivatedAt: true,
            certificates: {
              where: { status: 'APPROVED' },
              select: { id: true, certType: true, issuingBody: true, certNumber: true, expiryDate: true },
            },
          },
        },
        pricingTiers: {
          where: { isActive: true },
          orderBy: { minQty: 'asc' },
        },
        marginSlabs: {
          where: { isActive: true },
          orderBy: { slabNumber: 'asc' },
          // Public endpoint: quantity ranges only, NO margin %
          select: { slabNumber: true, label: true, minQty: true, maxQty: true },
        },
      },
    });

    if (!product) {
      res.status(404).json({ success: false, error: 'Product not found' });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vendor = (product as any).vendor as {
      id: string; vendorCode: string; companyName: string; plan: VendorPlan;
      city: string; state: string; website: string | null;
      triminstaEnabled: boolean; triminstaHubLocation: string | null; planActivatedAt: Date | null;
      certificates: Array<{ id: string; certType: string; issuingBody: string; certNumber: string; expiryDate: Date }>;
    } | null;
    const isBasic = vendor?.plan === VendorPlan.BASIC;

    const vendorCard = vendor
      ? {
          ...vendor,
          phone: undefined, // never expose phone publicly
          certificates: isBasic
            ? vendor.certificates.map((c) => ({ certType: c.certType }))
            : vendor.certificates,
          triminstaHubLocation: isBasic ? null : vendor.triminstaHubLocation,
        }
      : null;

    res.json({ success: true, data: { ...product, vendor: vendorCard } });
  } catch (err) {
    console.error('[catalog-product-detail]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch product detail' });
  }
});

// suppress unused
void qnum;

export default router;
