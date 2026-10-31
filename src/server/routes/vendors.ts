/**
 * TrimNova — Vendor Routes
 * /api/v1/vendors
 *
 * Handles vendor self-service: KYC, onboarding payments, capabilities,
 * product management, and plan configuration.
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { v2 as cloudinary } from 'cloudinary';
import { VendorPlan, VendorStatus, ProductStatus, PaymentStatus, Role } from '@prisma/client';

import prisma from '../lib/prisma.js';
import { authenticateToken, requireRole } from '../lib/rbac.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const router = Router();
const auth = authenticateToken;
const onlyVendor = requireRole(Role.VENDOR);
const onlyAdmin = requireRole(Role.ADMIN);

// ─── Multer (memory) ──────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter(_req, file, cb) {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPEG, PNG, and WebP files are allowed'));
    }
  },
});

// ─── Razorpay ─────────────────────────────────────────────────────────────────
function getRazorpay() {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });
}

// ─── Constants ────────────────────────────────────────────────────────────────
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const IGST_RATE = new Decimal('0.18');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fetch config value from PlatformConfig by key. Falls back to provided default. */
async function getConfig(key: string, fallback: string): Promise<string> {
  const row = await prisma.platformConfig.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

async function getPlanFeeAmount(plan: VendorPlan): Promise<Decimal> {
  let key: string;
  let fallback: string;
  switch (plan) {
    case VendorPlan.ELITE: key = 'elitePlanFee';  fallback = '24999'; break;
    case VendorPlan.GOLD:  key = 'goldPlanFee';   fallback = '14999'; break;
    default:               key = 'basicPlanFee';  fallback = '4999';  break;
  }
  const val = await getConfig(key, fallback);
  return new Decimal(val);
}

/** Create in-portal notification for a user. */
async function createNotification(
  userId: string,
  subject: string,
  body: string,
  type: 'SYSTEM' | 'APPROVAL' | 'ESCALATION' | 'ORDER_PLACED' = 'SYSTEM'
) {
  await prisma.notification.create({
    data: { userId, subject, body, type, channel: 'IN_PORTAL' },
  });
}

/** Notify all approvers via in-portal. */
async function notifyAllApprovers(subject: string, body: string) {
  const approvers = await prisma.user.findMany({
    where: { role: Role.APPROVER, isActive: true },
    select: { id: true },
  });
  for (const a of approvers) {
    await createNotification(a.id, subject, body);
  }
}

/** Notify all admins via in-portal. */
async function notifyAllAdmins(subject: string, body: string) {
  const admins = await prisma.user.findMany({
    where: { role: Role.ADMIN, isActive: true },
    select: { id: true },
  });
  for (const a of admins) {
    await createNotification(a.id, subject, body, 'SYSTEM');
  }
}

// ─── GET /plan-config ─────────────────────────────────────────────────────────
router.get('/plan-config', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [regFee, eliteFee, goldFee, basicFee, triminstaRate] = await Promise.all([
      getConfig('registrationFeeAmount', '2999'),
      getConfig('elitePlanFee', '24999'),
      getConfig('goldPlanFee', '14999'),
      getConfig('basicPlanFee', '4999'),
      getConfig('triminstaRatePerSqft', '15'),
    ]);

    res.json({
      success: true,
      data: {
        registrationFee: Number(regFee),
        plans: {
          ELITE: { fee: Number(eliteFee), label: 'Elite Plan', yearlyFee: Number(eliteFee) },
          GOLD:  { fee: Number(goldFee),  label: 'Gold Plan',  yearlyFee: Number(goldFee) },
          BASIC: { fee: Number(basicFee), label: 'Basic Plan', yearlyFee: Number(basicFee) },
        },
        triminstaRatePerSqft: Number(triminstaRate),
        igstRate: 18,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch plan config' });
  }
});

// ─── GET / (Admin only) ───────────────────────────────────────────────────────
router.get('/', auth, onlyAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const vendors = await prisma.vendor.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { email: true, isActive: true, lastLoginAt: true } },
        certificates: { select: { id: true, certType: true, status: true } },
        onboardingInvoice: { select: { totalAmount: true, paymentStatus: true } },
      },
    });

    res.json({ success: true, data: vendors, total: vendors.length });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to list vendors' });
  }
});

// ─── GET /my-profile ─────────────────────────────────────────────────────────
router.get('/my-profile', auth, onlyVendor, async (req: Request, res: Response): Promise<void> => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.user!.id },
      include: {
        user: { select: { email: true, isActive: true } },
        certificates: true,
        onboardingInvoice: true,
      },
    });

    if (!vendor) {
      res.status(404).json({ success: false, error: 'Vendor profile not found' });
      return;
    }

    res.json({ success: true, data: vendor });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
});

// ─── PUT /my-profile ─────────────────────────────────────────────────────────
const UpdateProfileSchema = z.object({
  companyName: z.string().min(2).max(200).optional(),
  phone: z.string().regex(/^\d{10}$/).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().regex(/^\d{6}$/).optional(),
  website: z.string().url().optional().nullable(),
  triminstaHubLocation: z.string().max(100).optional().nullable(),
  triminstaAreaSqft: z.number().positive().optional().nullable(),
});

router.put('/my-profile', auth, onlyVendor, async (req: Request, res: Response): Promise<void> => {
  const parse = UpdateProfileSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, error: 'Validation error', details: parse.error.flatten() });
    return;
  }

  try {
    const updated = await prisma.vendor.update({
      where: { userId: req.user!.id },
      data: parse.data,
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
});

// ─── POST /kyc/gst-verify ─────────────────────────────────────────────────────
const GstVerifySchema = z.object({
  gstin: z.string().regex(GSTIN_REGEX, 'Invalid GSTIN format'),
});

router.post('/kyc/gst-verify', auth, onlyVendor, async (req: Request, res: Response): Promise<void> => {
  const parse = GstVerifySchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, error: 'Invalid GSTIN', details: parse.error.flatten() });
    return;
  }

  const { gstin } = parse.data;

  // Simulate GST API verification — return seeded company name if found
  const existingVendor = await prisma.vendor.findFirst({
    where: { gstin, NOT: { userId: req.user!.id } },
  });

  if (existingVendor) {
    res.status(409).json({ success: false, error: 'GSTIN already registered with another vendor' });
    return;
  }

  // Derive company name from seeded data or simulate API response
  const gstApiResponse = {
    companyName: `Company Name per GST API (${gstin.slice(2, 12)})`,
    status: 'ACTIVE',
    registrationDate: '2020-01-01',
    businessType: 'Private Limited',
    state: gstin.slice(0, 2),
  };

  try {
    const vendor = await prisma.vendor.update({
      where: { userId: req.user!.id },
      data: {
        gstin,
        gstVerifiedAt: new Date(),
        gstVerifiedBy: `GST_API_SIMULATED:${new Date().toISOString()}`,
        companyName: gstApiResponse.companyName,
      },
    });

    res.json({
      success: true,
      message: 'GSTIN verified successfully',
      data: {
        gstin,
        companyName: vendor.companyName,
        gstVerifiedAt: vendor.gstVerifiedAt,
        apiResponse: gstApiResponse,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to save GST verification' });
  }
});

// ─── POST /kyc/pan-verify ─────────────────────────────────────────────────────
const PanVerifySchema = z.object({
  pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format'),
});

router.post('/kyc/pan-verify', auth, onlyVendor, async (req: Request, res: Response): Promise<void> => {
  const parse = PanVerifySchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, error: 'Invalid PAN', details: parse.error.flatten() });
    return;
  }

  const { pan } = parse.data;

  try {
    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.user!.id },
      select: { gstin: true, gstVerifiedAt: true },
    });

    if (!vendor) {
      res.status(404).json({ success: false, error: 'Vendor not found' });
      return;
    }

    if (!vendor.gstVerifiedAt || !vendor.gstin) {
      res.status(400).json({ success: false, error: 'GSTIN must be verified before PAN verification' });
      return;
    }

    // PAN embedded in GSTIN chars 3–12 (0-indexed: chars 2–11)
    const panFromGstin = vendor.gstin.slice(2, 12);
    const panValid = panFromGstin === pan;

    if (!panValid) {
      res.status(422).json({
        success: false,
        error: 'PAN does not match the GSTIN on record',
        hint: 'PAN should match characters 3-12 of the registered GSTIN',
      });
      return;
    }

    const updated = await prisma.vendor.update({
      where: { userId: req.user!.id },
      data: {
        pan,
        panVerifiedAt: new Date(),
        panVerifiedBy: `PAN_CROSS_VERIFY:GSTIN:${new Date().toISOString()}`,
      },
    });

    res.json({
      success: true,
      message: 'PAN verified successfully against GSTIN',
      data: {
        pan: updated.pan,
        panVerifiedAt: updated.panVerifiedAt,
        verificationMethod: 'GSTIN_CROSS_MATCH',
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to verify PAN' });
  }
});

// ─── POST /kyc/certificates/upload ───────────────────────────────────────────
const CertUploadBodySchema = z.object({
  certType: z.enum(['GOTS', 'ISO9001', 'OEKO-TEX', 'FSC', 'GINETEX', 'REACH', 'AZO-FREE', 'OBP']),
  certNumber: z.string().max(100).optional(),
  issuingBody: z.string().max(200).optional(),
  issueDate: z.string().datetime().optional(),
  expiryDate: z.string().datetime().optional(),
});

router.post(
  '/kyc/certificates/upload',
  auth,
  onlyVendor,
  upload.single('certificate'),
  async (req: Request, res: Response): Promise<void> => {
    const parse = CertUploadBodySchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ success: false, error: 'Validation error', details: parse.error.flatten() });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, error: 'Certificate file is required' });
      return;
    }

    try {
      const vendor = await prisma.vendor.findUnique({
        where: { userId: req.user!.id },
        select: { id: true },
      });

      if (!vendor) {
        res.status(404).json({ success: false, error: 'Vendor not found' });
        return;
      }

      let fileUrl: string;
      let fileName = req.file.originalname;

      // Try Cloudinary upload; fall back to base64 data URI
      if (process.env.CLOUDINARY_CLOUD_NAME) {
        const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              folder: `trimnova/vendors/${vendor.id}/certificates`,
              resource_type: 'auto',
              public_id: `${parse.data.certType}_${Date.now()}`,
            },
            (error, result) => {
              if (error || !result) reject(error ?? new Error('Cloudinary upload failed'));
              else resolve(result as { secure_url: string });
            }
          );
          stream.end(req.file!.buffer);
        });
        fileUrl = uploadResult.secure_url;
      } else {
        // Base64 fallback (dev/staging)
        const b64 = req.file.buffer.toString('base64');
        fileUrl = `data:${req.file.mimetype};base64,${b64}`;
        fileName = req.file.originalname;
      }

      const cert = await prisma.vendorCertificate.create({
        data: {
          vendorId: vendor.id,
          certType: parse.data.certType,
          certNumber: parse.data.certNumber,
          issuingBody: parse.data.issuingBody,
          issueDate: parse.data.issueDate ? new Date(parse.data.issueDate) : undefined,
          expiryDate: parse.data.expiryDate ? new Date(parse.data.expiryDate) : undefined,
          fileUrl,
          fileName,
          status: 'PENDING',
        },
      });

      res.status(201).json({
        success: true,
        message: 'Certificate uploaded and pending review',
        data: cert,
      });
    } catch (err) {
      console.error('[cert-upload]', err);
      res.status(500).json({ success: false, error: 'Failed to upload certificate' });
    }
  }
);

// ─── GET /kyc/certificates ────────────────────────────────────────────────────
router.get('/kyc/certificates', auth, onlyVendor, async (req: Request, res: Response): Promise<void> => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.user!.id },
      select: { id: true },
    });
    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

    const certs = await prisma.vendorCertificate.findMany({
      where: { vendorId: vendor.id },
      orderBy: { uploadedAt: 'desc' },
    });

    res.json({ success: true, data: certs, total: certs.length });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to list certificates' });
  }
});

// ─── DELETE /kyc/certificates/:id ────────────────────────────────────────────
router.delete('/kyc/certificates/:id', auth, onlyVendor, async (req: Request, res: Response): Promise<void> => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.user!.id },
      select: { id: true },
    });
    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

    const cert = await prisma.vendorCertificate.findFirst({
      where: { id: req.params.id as string, vendorId: vendor.id },
    });

    if (!cert) {
      res.status(404).json({ success: false, error: 'Certificate not found' });
      return;
    }

    if (cert.status !== 'PENDING') {
      res.status(409).json({
        success: false,
        error: 'Only PENDING certificates can be deleted',
        currentStatus: cert.status,
      });
      return;
    }

    await prisma.vendorCertificate.delete({ where: { id: cert.id } });
    res.json({ success: true, message: 'Certificate deleted' });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to delete certificate' });
  }
});

// ─── POST /onboarding/select-plan ────────────────────────────────────────────
const SelectPlanSchema = z.object({
  plan: z.nativeEnum(VendorPlan),
  triminstaEnabled: z.boolean().optional().default(false),
  triminstaAreaSqft: z.number().positive().optional(),
});

router.post('/onboarding/select-plan', auth, onlyVendor, async (req: Request, res: Response): Promise<void> => {
  const parse = SelectPlanSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, error: 'Validation error', details: parse.error.flatten() });
    return;
  }

  const { plan, triminstaEnabled, triminstaAreaSqft } = parse.data;

  try {
    const [regFeeStr, planFee, triminstaRateStr] = await Promise.all([
      getConfig('registrationFeeAmount', '2999'),
      getPlanFeeAmount(plan),
      getConfig('triminstaRatePerSqft', '15'),
    ]);

    const regFee = new Decimal(regFeeStr);
    const triminstaRate = new Decimal(triminstaRateStr);

    // TrimInsta monthly fee = areaSqft × ratePerSqft
    let triminstaFee = new Decimal(0);
    if (triminstaEnabled && triminstaAreaSqft) {
      triminstaFee = triminstaRate.mul(triminstaAreaSqft).toDecimalPlaces(2);
    }

    const subtotal = regFee.plus(planFee).plus(triminstaFee);
    const igst = subtotal.mul(IGST_RATE).toDecimalPlaces(2);
    const totalAmount = subtotal.plus(igst).toDecimalPlaces(2);

    res.json({
      success: true,
      data: {
        plan,
        breakdown: {
          registrationFee: regFee.toFixed(2),
          planFee: planFee.toFixed(2),
          triminstaFee: triminstaFee.toFixed(2),
          subtotal: subtotal.toFixed(2),
          igst: igst.toFixed(2),
          igstRate: '18%',
          totalAmount: totalAmount.toFixed(2),
          currency: 'INR',
        },
        triminstaEnabled,
        triminstaAreaSqft: triminstaAreaSqft ?? null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to calculate plan pricing' });
  }
});

// ─── POST /onboarding/apply-coupon ───────────────────────────────────────────
const ApplyCouponSchema = z.object({
  plan: z.nativeEnum(VendorPlan),
  couponCode: z.string().min(1).max(50).toUpperCase(),
  triminstaEnabled: z.boolean().optional().default(false),
  triminstaAreaSqft: z.number().positive().optional(),
});

router.post('/onboarding/apply-coupon', auth, onlyVendor, async (req: Request, res: Response): Promise<void> => {
  const parse = ApplyCouponSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, error: 'Validation error', details: parse.error.flatten() });
    return;
  }

  const { plan, couponCode, triminstaEnabled, triminstaAreaSqft } = parse.data;

  try {
    const coupon = await prisma.coupon.findUnique({ where: { code: couponCode } });

    if (!coupon) {
      res.status(404).json({ success: false, error: 'Coupon not found' });
      return;
    }

    if (coupon.isUsed) {
      res.status(409).json({ success: false, error: 'Coupon has already been used' });
      return;
    }

    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      res.status(410).json({ success: false, error: 'Coupon has expired' });
      return;
    }

    // Validate applicableTo plan
    const planMap: Record<VendorPlan, string> = {
      ELITE: 'VENDOR_PLAN_ELITE',
      GOLD: 'VENDOR_PLAN_GOLD',
      BASIC: 'VENDOR_PLAN_BASIC',
    };

    if (coupon.applicableTo !== 'CUSTOMER_ORDER' && coupon.applicableTo !== planMap[plan]) {
      res.status(422).json({
        success: false,
        error: `Coupon is not applicable to ${plan} plan`,
        applicableTo: coupon.applicableTo,
      });
      return;
    }

    // Recalculate totals
    const [regFeeStr, planFee, triminstaRateStr] = await Promise.all([
      getConfig('registrationFeeAmount', '2999'),
      getPlanFeeAmount(plan),
      getConfig('triminstaRatePerSqft', '15'),
    ]);

    const regFee = new Decimal(regFeeStr);
    const triminstaRate = new Decimal(triminstaRateStr);
    let triminstaFee = new Decimal(0);
    if (triminstaEnabled && triminstaAreaSqft) {
      triminstaFee = triminstaRate.mul(triminstaAreaSqft).toDecimalPlaces(2);
    }

    const subtotal = regFee.plus(planFee).plus(triminstaFee);

    // Calculate discount
    const couponValue = new Decimal(coupon.value.toString());
    let discountAmount: Decimal;
    if (coupon.type === 'PERCENT_OFF') {
      discountAmount = subtotal.mul(couponValue).div(100).toDecimalPlaces(2);
      if (coupon.maxDiscountAmt) {
        const maxDiscount = new Decimal(coupon.maxDiscountAmt.toString());
        if (discountAmount.gt(maxDiscount)) discountAmount = maxDiscount;
      }
    } else {
      discountAmount = couponValue;
    }

    const discountedSubtotal = Decimal.max(subtotal.minus(discountAmount), 0).toDecimalPlaces(2);
    const igst = discountedSubtotal.mul(IGST_RATE).toDecimalPlaces(2);
    const totalAmount = discountedSubtotal.plus(igst).toDecimalPlaces(2);

    res.json({
      success: true,
      data: {
        couponCode,
        couponType: coupon.type,
        couponValue: couponValue.toFixed(2),
        funder: coupon.funder,
        breakdown: {
          registrationFee: regFee.toFixed(2),
          planFee: planFee.toFixed(2),
          triminstaFee: triminstaFee.toFixed(2),
          subtotalBeforeDiscount: subtotal.toFixed(2),
          discountAmount: discountAmount.toFixed(2),
          subtotalAfterDiscount: discountedSubtotal.toFixed(2),
          igst: igst.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          currency: 'INR',
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to apply coupon' });
  }
});

// ─── POST /onboarding/create-razorpay-order ───────────────────────────────────
const CreateRzpOrderSchema = z.object({
  plan: z.nativeEnum(VendorPlan),
  couponCode: z.string().max(50).optional(),
  triminstaEnabled: z.boolean().optional().default(false),
  triminstaAreaSqft: z.number().positive().optional(),
});

router.post('/onboarding/create-razorpay-order', auth, onlyVendor, async (req: Request, res: Response): Promise<void> => {
  const parse = CreateRzpOrderSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, error: 'Validation error', details: parse.error.flatten() });
    return;
  }

  const { plan, couponCode, triminstaEnabled, triminstaAreaSqft } = parse.data;

  try {
    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.user!.id },
      select: { id: true, gstVerifiedAt: true, panVerifiedAt: true, onboardingInvoice: true },
    });

    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

    if (!vendor.gstVerifiedAt || !vendor.panVerifiedAt) {
      res.status(400).json({ success: false, error: 'GST and PAN must be verified before payment' });
      return;
    }

    if (vendor.onboardingInvoice?.paymentStatus === 'CAPTURED') {
      res.status(409).json({ success: false, error: 'Onboarding payment already completed' });
      return;
    }

    // Compute amounts
    const [regFeeStr, planFee, triminstaRateStr] = await Promise.all([
      getConfig('registrationFeeAmount', '2999'),
      getPlanFeeAmount(plan),
      getConfig('triminstaRatePerSqft', '15'),
    ]);

    const regFee = new Decimal(regFeeStr);
    const triminstaRate = new Decimal(triminstaRateStr);
    let triminstaFee = new Decimal(0);
    if (triminstaEnabled && triminstaAreaSqft) {
      triminstaFee = triminstaRate.mul(triminstaAreaSqft).toDecimalPlaces(2);
    }

    const subtotal = regFee.plus(planFee).plus(triminstaFee);
    let discountAmount = new Decimal(0);
    let couponRecord = null;

    if (couponCode) {
      couponRecord = await prisma.coupon.findUnique({ where: { code: couponCode.toUpperCase() } });
      if (couponRecord && !couponRecord.isUsed) {
        const cv = new Decimal(couponRecord.value.toString());
        if (couponRecord.type === 'PERCENT_OFF') {
          discountAmount = subtotal.mul(cv).div(100).toDecimalPlaces(2);
          if (couponRecord.maxDiscountAmt) {
            const max = new Decimal(couponRecord.maxDiscountAmt.toString());
            if (discountAmount.gt(max)) discountAmount = max;
          }
        } else {
          discountAmount = cv;
        }
      }
    }

    const discountedSubtotal = Decimal.max(subtotal.minus(discountAmount), 0).toDecimalPlaces(2);
    const igst = discountedSubtotal.mul(IGST_RATE).toDecimalPlaces(2);
    const totalAmount = discountedSubtotal.plus(igst).toDecimalPlaces(2);

    // Amount in paise
    const amountPaise = totalAmount.mul(100).toFixed(0);

    const razorpay = getRazorpay();
    const rzpOrder = await razorpay.orders.create({
      amount: Number(amountPaise),
      currency: 'INR',
      receipt: `TN-ONB-${vendor.id.slice(0, 8)}-${Date.now()}`,
      notes: {
        vendorId: vendor.id,
        plan,
        userId: req.user!.id,
      },
    });

    // Upsert onboarding invoice draft
    const invoiceNumber = `TN-ONB-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000 + 10000))}`;
    await prisma.onboardingInvoice.upsert({
      where: { vendorId: vendor.id },
      update: {
        registrationFee: regFee.toFixed(2),
        planFee: planFee.toFixed(2),
        triminstaFee: triminstaFee.toFixed(2),
        subtotal: discountedSubtotal.toFixed(2),
        igst: igst.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        couponCode: couponCode ?? null,
        discountAmount: discountAmount.toFixed(2),
        razorpayOrderId: rzpOrder.id,
        paymentStatus: 'PENDING',
      },
      create: {
        invoiceNumber,
        vendorId: vendor.id,
        registrationFee: regFee.toFixed(2),
        planFee: planFee.toFixed(2),
        triminstaFee: triminstaFee.toFixed(2),
        subtotal: discountedSubtotal.toFixed(2),
        igst: igst.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        couponCode: couponCode ?? null,
        discountAmount: discountAmount.toFixed(2),
        razorpayOrderId: rzpOrder.id,
        paymentStatus: 'PENDING',
      },
    });

    // Also update vendor plan choice
    await prisma.vendor.update({
      where: { id: vendor.id },
      data: {
        plan,
        triminstaEnabled: triminstaEnabled ?? false,
        triminstaAreaSqft: triminstaAreaSqft ? String(triminstaAreaSqft) : null,
      },
    });

    res.json({
      success: true,
      data: {
        razorpayOrderId: rzpOrder.id,
        amount: Number(amountPaise),
        currency: 'INR',
        breakdown: {
          registrationFee: regFee.toFixed(2),
          planFee: planFee.toFixed(2),
          triminstaFee: triminstaFee.toFixed(2),
          discountAmount: discountAmount.toFixed(2),
          igst: igst.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
        },
      },
    });
  } catch (err) {
    console.error('[create-razorpay-order]', err);
    res.status(500).json({ success: false, error: 'Failed to create payment order' });
  }
});

// ─── POST /onboarding/confirm-payment ─────────────────────────────────────────
const ConfirmPaymentSchema = z.object({
  razorpayOrderId: z.string(),
  razorpayPaymentId: z.string(),
  razorpaySignature: z.string(),
});

router.post('/onboarding/confirm-payment', auth, onlyVendor, async (req: Request, res: Response): Promise<void> => {
  const parse = ConfirmPaymentSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, error: 'Validation error', details: parse.error.flatten() });
    return;
  }

  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = parse.data;

  // Verify Razorpay signature
  const secret = process.env.RAZORPAY_KEY_SECRET ?? '';
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  if (expectedSignature !== razorpaySignature) {
    res.status(400).json({ success: false, error: 'Invalid payment signature', code: 'SIGNATURE_MISMATCH' });
    return;
  }

  try {
    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.user!.id },
      include: { onboardingInvoice: true },
    });

    if (!vendor || !vendor.onboardingInvoice) {
      res.status(404).json({ success: false, error: 'Onboarding invoice not found' });
      return;
    }

    if (vendor.onboardingInvoice.razorpayOrderId !== razorpayOrderId) {
      res.status(400).json({ success: false, error: 'Order ID mismatch' });
      return;
    }

    const now = new Date();
    const planExpiry = new Date(now);
    planExpiry.setFullYear(planExpiry.getFullYear() + 1);

    // Mark invoice paid + activate plan (atomic)
    const [updatedInvoice, updatedVendor] = await prisma.$transaction([
      prisma.onboardingInvoice.update({
        where: { id: vendor.onboardingInvoice.id },
        data: {
          razorpayPaymentId,
          paymentStatus: PaymentStatus.CAPTURED,
          paidAt: now,
        },
      }),
      prisma.vendor.update({
        where: { id: vendor.id },
        data: {
          status: VendorStatus.KYC_SUBMITTED,
          planActivatedAt: now,
          planExpiresAt: planExpiry,
          registrationFee: vendor.onboardingInvoice.registrationFee,
          planFee: vendor.onboardingInvoice.planFee,
        },
      }),
    ]);

    // Mark coupon as used if applicable
    if (vendor.onboardingInvoice.couponCode) {
      await prisma.coupon.updateMany({
        where: { code: vendor.onboardingInvoice.couponCode, isUsed: false },
        data: { isUsed: true, usedAt: now },
      });
    }

    // Notify admins
    await notifyAllAdmins(
      'New Vendor Onboarding Payment Received',
      `Vendor ${vendor.vendorCode} (${vendor.companyName}) has completed onboarding payment. Status updated to KYC_SUBMITTED.`
    );

    res.json({
      success: true,
      message: 'Payment confirmed. Your plan is now active.',
      data: {
        plan: updatedVendor.plan,
        status: updatedVendor.status,
        planActivatedAt: updatedVendor.planActivatedAt,
        planExpiresAt: updatedVendor.planExpiresAt,
        invoice: updatedInvoice,
      },
    });
  } catch (err) {
    console.error('[confirm-payment]', err);
    res.status(500).json({ success: false, error: 'Failed to confirm payment' });
  }
});

// ─── GET /capabilities ────────────────────────────────────────────────────────
router.get('/capabilities', auth, onlyVendor, async (req: Request, res: Response): Promise<void> => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.user!.id },
      select: { id: true },
    });
    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

    const capabilities = await prisma.vendorCapability.findMany({
      where: { vendorId: vendor.id },
      include: {
        category: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: capabilities, total: capabilities.length });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch capabilities' });
  }
});

// ─── POST /capabilities/submit ────────────────────────────────────────────────
const SubmitCapabilitiesSchema = z.object({
  capabilities: z.array(
    z.object({
      categoryId: z.string().cuid(),
      subcategoryId: z.string().cuid().optional(),
      leadTimeDays: z.number().int().positive().optional(),
      moq: z.number().int().positive().optional(),
    })
  ).min(1).max(50),
});

router.post('/capabilities/submit', auth, onlyVendor, async (req: Request, res: Response): Promise<void> => {
  const parse = SubmitCapabilitiesSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, error: 'Validation error', details: parse.error.flatten() });
    return;
  }

  try {
    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.user!.id },
      select: { id: true, vendorCode: true, companyName: true },
    });
    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

    const now = new Date();
    const created = await prisma.$transaction(async (tx) => {
      const results = [];
      for (const cap of parse.data.capabilities) {
        const upserted = await tx.vendorCapability.upsert({
          where: { vendorId_subcategoryId: { vendorId: vendor.id, subcategoryId: cap.subcategoryId ?? '' } },
          update: {
            categoryId: cap.categoryId,
            leadTimeDays: cap.leadTimeDays,
            moq: cap.moq,
            status: ProductStatus.SUBMITTED_FOR_REVIEW,
            submittedAt: now,
          },
          create: {
            vendorId: vendor.id,
            categoryId: cap.categoryId,
            subcategoryId: cap.subcategoryId,
            leadTimeDays: cap.leadTimeDays,
            moq: cap.moq,
            status: ProductStatus.SUBMITTED_FOR_REVIEW,
            submittedAt: now,
          },
        });
        results.push(upserted);
      }
      return results;
    });

    // Notify approvers and admins
    const msg = `Vendor ${vendor.vendorCode} (${vendor.companyName}) has submitted ${created.length} capabilities for review.`;
    await notifyAllApprovers('New Capability Submission for Review', msg);
    await notifyAllAdmins('New Capability Submission', msg);

    res.status(201).json({
      success: true,
      message: 'Capabilities submitted for review',
      data: { submitted: created.length, items: created },
    });
  } catch (err) {
    console.error('[capabilities-submit]', err);
    res.status(500).json({ success: false, error: 'Failed to submit capabilities' });
  }
});

// ─── GET /products ────────────────────────────────────────────────────────────
router.get('/products', auth, onlyVendor, async (req: Request, res: Response): Promise<void> => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.user!.id },
      select: { id: true },
    });
    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

    const products = await prisma.product.findMany({
      where: { vendorId: vendor.id },
      include: {
        subcategory: { select: { id: true, name: true, code: true } },
        pricingTiers: { where: { isActive: true }, orderBy: { minQty: 'asc' } },
        marginSlabs: { where: { isActive: true }, orderBy: { slabNumber: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: products, total: products.length });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch products' });
  }
});

// ─── PUT /products/:id ────────────────────────────────────────────────────────
const UpdateProductSchema = z.object({
  baseUnitPrice: z.number().positive().optional(),
  onlineStock: z.number().int().min(0).optional(),
  triminstaStock: z.number().int().min(0).optional(),
  pricingTiers: z.array(z.object({
    id: z.string().cuid().optional(),
    minQty: z.number().int().positive(),
    maxQty: z.number().int().positive().nullable().optional(),
    unitPrice: z.number().positive(),
    savePct: z.number().min(0).max(100).optional(),
  })).optional(),
});

router.put('/products/:id', auth, onlyVendor, async (req: Request, res: Response): Promise<void> => {
  const parse = UpdateProductSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ success: false, error: 'Validation error', details: parse.error.flatten() });
    return;
  }

  try {
    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.user!.id },
      select: { id: true },
    });
    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

    const product = await prisma.product.findFirst({
      where: { id: req.params.id as string, vendorId: vendor.id },
    });

    if (!product) {
      res.status(404).json({ success: false, error: 'Product not found or not owned by this vendor' });
      return;
    }

    const { pricingTiers, ...scalarFields } = parse.data;

    const updated = await prisma.$transaction(async (tx) => {
      const updatedProduct = await tx.product.update({
        where: { id: product.id },
        data: scalarFields,
      });

      if (pricingTiers && pricingTiers.length > 0) {
        // Deactivate old tiers
        await tx.productPricingTier.updateMany({
          where: { productId: product.id },
          data: { isActive: false },
        });

        // Create new tiers
        for (const tier of pricingTiers) {
          await tx.productPricingTier.create({
            data: {
              productId: product.id,
              minQty: tier.minQty,
              maxQty: tier.maxQty ?? null,
              unitPrice: new Decimal(tier.unitPrice).toFixed(2),
              savePct: tier.savePct !== undefined ? new Decimal(tier.savePct).toFixed(2) : null,
              isActive: true,
            },
          });
        }
      }

      return updatedProduct;
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[product-update]', err);
    res.status(500).json({ success: false, error: 'Failed to update product' });
  }
});

// ─── POST /products/:id/triminsta-toggle ──────────────────────────────────────
router.post('/products/:id/triminsta-toggle', auth, onlyVendor, async (req: Request, res: Response): Promise<void> => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { userId: req.user!.id },
      select: { id: true, triminstaEnabled: true },
    });
    if (!vendor) { res.status(404).json({ success: false, error: 'Vendor not found' }); return; }

    if (!vendor.triminstaEnabled) {
      res.status(400).json({ success: false, error: 'TrimInsta is not enabled for this vendor account' });
      return;
    }

    const product = await prisma.product.findFirst({
      where: { id: req.params.id as string, vendorId: vendor.id },
      select: { id: true, triminstaEnabled: true },
    });

    if (!product) {
      res.status(404).json({ success: false, error: 'Product not found' });
      return;
    }

    const updated = await prisma.product.update({
      where: { id: product.id },
      data: { triminstaEnabled: !product.triminstaEnabled },
    });

    res.json({
      success: true,
      message: `TrimInsta dispatch ${updated.triminstaEnabled ? 'enabled' : 'disabled'} for product`,
      data: { id: updated.id, triminstaEnabled: updated.triminstaEnabled },
    });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to toggle TrimInsta' });
  }
});

export default router;
