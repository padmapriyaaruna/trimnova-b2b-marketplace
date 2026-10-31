/**
 * TrimNova KYC Router  —  /api/v1/kyc
 *
 * GSTIN and PAN verification endpoints.
 * Validates formats using Indian government-defined regex patterns and
 * simulates external API lookup (replace with real GST/IT dept API in production).
 *
 * GSTIN format: 2-digit state code + 10-char PAN + entity number + 'Z' + checksum
 * PAN format:   5 uppercase alpha + 4 digits + 1 uppercase alpha
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';

import prisma from '../lib/prisma.js';
import { auth } from '../lib/rbac.js';

const router = Router();

// ─── Constants & Regex ───────────────────────────────────────────────────────

/**
 * GSTIN: 15 characters
 *   [0-9]{2}    — state code (01–37)
 *   [A-Z]{5}    — first 5 chars of PAN
 *   [0-9]{4}    — digits 6-9 of PAN
 *   [A-Z]       — last char of PAN
 *   [1-9A-Z]    — entity registration number
 *   Z           — literal 'Z'
 *   [0-9A-Z]    — checksum character
 */
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * PAN: 10 characters — [A-Z]{5}[0-9]{4}[A-Z]
 * 4th character indicates taxpayer type: P=Person, C=Company, H=HUF, F=Firm etc.
 */
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Valid Indian state codes used in GSTIN prefix */
const VALID_STATE_CODES = new Set([
  '01','02','03','04','05','06','07','08','09','10',
  '11','12','13','14','15','16','17','18','19','20',
  '21','22','23','24','25','26','27','28','29','30',
  '31','32','33','34','35','36','37','38','97','99',
]);

const STATE_CODE_MAP: Record<string, string> = {
  '01': 'Jammu & Kashmir',       '02': 'Himachal Pradesh',
  '03': 'Punjab',                '04': 'Chandigarh',
  '05': 'Uttarakhand',           '06': 'Haryana',
  '07': 'Delhi',                 '08': 'Rajasthan',
  '09': 'Uttar Pradesh',         '10': 'Bihar',
  '11': 'Sikkim',                '12': 'Arunachal Pradesh',
  '13': 'Nagaland',              '14': 'Manipur',
  '15': 'Mizoram',               '16': 'Tripura',
  '17': 'Meghalaya',             '18': 'Assam',
  '19': 'West Bengal',           '20': 'Jharkhand',
  '21': 'Odisha',                '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',        '24': 'Gujarat',
  '25': 'Daman & Diu',           '26': 'Dadra & Nagar Haveli',
  '27': 'Maharashtra',           '28': 'Andhra Pradesh (Old)',
  '29': 'Karnataka',             '30': 'Goa',
  '31': 'Lakshadweep',           '32': 'Kerala',
  '33': 'Tamil Nadu',            '34': 'Puducherry',
  '35': 'Andaman & Nicobar',     '36': 'Telangana',
  '37': 'Andhra Pradesh',        '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};

const ENTITY_TYPE_MAP: Record<string, string> = {
  P: 'Individual / Proprietor',
  C: 'Company',
  H: 'Hindu Undivided Family (HUF)',
  F: 'Firm / LLP',
  A: 'Association of Persons (AOP)',
  T: 'Trust',
  B: 'Body of Individuals (BOI)',
  L: 'Local Authority',
  J: 'Artificial Juridical Person',
  G: 'Government Body',
};

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const GstVerifySchema = z.object({
  gstin: z
    .string()
    .min(15, 'GSTIN must be exactly 15 characters')
    .max(15, 'GSTIN must be exactly 15 characters')
    .transform((v) => v.toUpperCase().trim()),
});

const PanVerifySchema = z.object({
  pan: z
    .string()
    .min(10, 'PAN must be exactly 10 characters')
    .max(10, 'PAN must be exactly 10 characters')
    .transform((v) => v.toUpperCase().trim()),
  gstin: z.string().optional().transform((v) => v?.toUpperCase().trim()),
});

// ─── Simulated External API ───────────────────────────────────────────────────

/**
 * Simulate GST public search API response.
 * In production, integrate with:
 *   - MasterGST API: https://api.mastergst.com/commonapi/v1.0/search
 *   - NIC GST Search: https://www.gst.gov.in (official search)
 */
function simulateGstApiLookup(gstin: string) {
  const stateCode   = gstin.slice(0, 2);
  const entityCode  = gstin[3]; // 4th char of PAN segment
  const mockSuffix  = gstin.slice(-4).toLowerCase();

  return {
    companyName:      `Demo Textiles Pvt. Ltd. [${mockSuffix}]`,
    tradeName:        `Demo Trims & Accessories`,
    address:          `Plot 42, MIDC Industrial Area, Bhiwandi, ${STATE_CODE_MAP[stateCode] ?? ''}`,
    registrationDate: '2019-07-01',
    status:           'Active',
    entityType:       ENTITY_TYPE_MAP[entityCode] ?? 'Company',
    stateCode,
    stateName:        STATE_CODE_MAP[stateCode] ?? 'Unknown',
    panNumber:        gstin.slice(2, 12),
    lastUpdated:      new Date().toISOString(),
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /gst-verify
 * Validate GSTIN format (regex) + simulate API lookup.
 * Returns company name, state, status, and PAN extracted from GSTIN.
 */
router.post('/gst-verify', auth, async (req: Request, res: Response): Promise<void> => {
  const parsed = GstVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, errors: parsed.error.errors });
    return;
  }

  const { gstin } = parsed.data;

  // Format validation
  if (!GSTIN_REGEX.test(gstin)) {
    res.status(400).json({
      success: false,
      error: 'Invalid GSTIN format',
      hint: 'GSTIN must match: 2-digit state + 10-char PAN + entity no. + Z + checksum (15 chars total)',
      gstin,
    });
    return;
  }

  // State code validation
  const stateCode = gstin.slice(0, 2);
  if (!VALID_STATE_CODES.has(stateCode)) {
    res.status(400).json({
      success: false,
      error: `Invalid state code "${stateCode}" in GSTIN`,
      validStateCodes: [...VALID_STATE_CODES].sort(),
    });
    return;
  }

  // Duplicate check (non-blocking — returned as warning)
  const existingVendor = await prisma.vendor.findUnique({
    where: { gstin },
    select: { id: true, vendorCode: true },
  }).catch(() => null);

  // Simulated API lookup
  const apiResult = simulateGstApiLookup(gstin);

  res.status(200).json({
    success: true,
    data: {
      gstin,
      isValid: true,
      stateCode: apiResult.stateCode,
      stateName: apiResult.stateName,
      companyName: apiResult.companyName,
      tradeName: apiResult.tradeName,
      address: apiResult.address,
      registrationDate: apiResult.registrationDate,
      status: apiResult.status,
      entityType: apiResult.entityType,
      extractedPan: apiResult.panNumber,
      lastUpdated: apiResult.lastUpdated,
      warnings: existingVendor
        ? [`GSTIN already registered with vendor ${existingVendor.vendorCode}`]
        : [],
    },
    meta: {
      source: 'GST_SIMULATED_API',
      note: 'Replace with real GST API (MasterGST / NIC) in production',
    },
  });
});

/**
 * POST /pan-verify
 * Validate PAN format and optionally cross-check against GSTIN.
 * If GSTIN is provided, characters 3–12 of GSTIN must equal the PAN.
 */
router.post('/pan-verify', auth, async (req: Request, res: Response): Promise<void> => {
  const parsed = PanVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, errors: parsed.error.errors });
    return;
  }

  const { pan, gstin } = parsed.data;

  // PAN format validation
  if (!PAN_REGEX.test(pan)) {
    res.status(400).json({
      success: false,
      error: 'Invalid PAN format',
      hint: 'PAN must be exactly 10 chars: 5 uppercase letters + 4 digits + 1 uppercase letter (e.g. ABCDE1234F)',
      pan,
    });
    return;
  }

  const entityType = ENTITY_TYPE_MAP[pan[3]] ?? 'Unknown';

  // Cross-check with GSTIN if provided
  let gstinCrosscheck: object | null = null;

  if (gstin) {
    if (!GSTIN_REGEX.test(gstin)) {
      res.status(400).json({
        success: false,
        error: 'Provided GSTIN has invalid format; cannot perform cross-check',
        gstin,
      });
      return;
    }

    const panEmbeddedInGstin = gstin.slice(2, 12);

    if (pan !== panEmbeddedInGstin) {
      res.status(400).json({
        success: false,
        error: 'PAN does not match the PAN embedded in the provided GSTIN',
        detail: {
          providedPan: pan,
          gstin,
          panEmbeddedInGstin,
          mismatchAt: 'Characters 3–12 of GSTIN should equal the PAN',
        },
        crossCheckPassed: false,
      });
      return;
    }

    gstinCrosscheck = {
      gstin,
      panEmbeddedInGstin,
      crossCheckPassed: true,
      stateCode: gstin.slice(0, 2),
      stateName: STATE_CODE_MAP[gstin.slice(0, 2)] ?? 'Unknown',
    };
  }

  // Duplicate PAN check across vendors
  const existingVendor = await prisma.vendor.findFirst({
    where: { pan },
    select: { id: true, vendorCode: true },
  }).catch(() => null);

  res.status(200).json({
    success: true,
    data: {
      pan,
      isValid: true,
      entityType,
      entityCode: pan[3],
      gstinCrosscheck,
      warnings: existingVendor
        ? [`PAN already registered with vendor ${existingVendor.vendorCode}`]
        : [],
    },
    meta: {
      source: 'PAN_FORMAT_VALIDATION',
      note: 'Integrate with Income Tax Department API for live PAN database lookup in production',
    },
  });
});

export default router;
