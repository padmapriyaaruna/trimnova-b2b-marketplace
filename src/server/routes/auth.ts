/**
 * TrimNova — Authentication Routes
 *
 * POST /register/check-duplicate    — email/userId uniqueness check
 * POST /register/send-otp           — 6-digit OTP, hashed, 10-min expiry
 * POST /register/verify-otp         — verify (max 5 attempts, 60s resend guard)
 * POST /register/complete           — complete vendor/customer registration
 * POST /login                       — email or userId + password → JWT (7d)
 * POST /admin-login                 — superuser + passkey + TOTP
 * POST /forgot-password/send-otp    — OTP for password reset
 * POST /forgot-password/reset       — verify OTP + new password + revoke sessions
 * POST /logout                      — revoke current session
 * GET  /me                          — current user info (auth required)
 * POST /approver/invite             — admin-only: send approver invitation OTP
 */

import { Router, type Request, type Response } from 'express';
import { z, ZodError } from 'zod';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { authenticator } from 'otplib';
import { Role } from '@prisma/client';

import prisma from '../lib/prisma.js';
import { authenticateToken, requireRole } from '../lib/rbac.js';
import { sendOtp, sendApprovalEmail } from '../services/brevo.js';

const router = Router();

// ─── Constants ────────────────────────────────────────────────────────────────
const BCRYPT_ROUNDS = 12;
const OTP_EXPIRY_MINUTES = 10;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;
const JWT_EXPIRY = '7d';
const SESSION_EXPIRY_DAYS = 7;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getJwtSecret(): string {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET not configured');
  return process.env.JWT_SECRET;
}

/** Hash OTP with SHA-256 (not bcrypt — OTPs are short-lived, lookup by hash) */
function hashOtp(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

/** Generate cryptographically random 6-digit OTP */
function generateOtp(): string {
  const bytes = crypto.randomBytes(4);
  const num = bytes.readUInt32BE(0) % 1_000_000;
  return num.toString().padStart(6, '0');
}

/** Generate sequential userId like VN-XXXXX, CUS-XXXXX, APR-XX */
async function generateUserId(role: Role): Promise<string> {
  const prefixMap: Partial<Record<Role, string>> = {
    VENDOR: 'VN',
    CUSTOMER: 'CUS',
    APPROVER: 'APR',
    ADMIN: 'ADM',
    FINANCE_PREPARER: 'FP',
    FINANCE_APPROVER: 'FA',
  };
  const prefix = prefixMap[role] ?? 'USR';
  const count = await prisma.user.count({ where: { role } });
  const padLen = role === 'APPROVER' ? 3 : 5;
  return `${prefix}-${String(count + 1).padStart(padLen, '0')}`;
}

/** Format Zod errors for API response */
function formatZodError(err: ZodError): object {
  return err.issues.map(i => ({ field: i.path.join('.'), message: i.message }));
}

/** Create JWT + UserSession atomically */
async function createSession(
  user: { id: string; userId: string; email: string; role: Role },
  req: Request
): Promise<string> {
  const payload = {
    sessionId: '', // filled after session creation
    id: user.id,
    userId: user.userId,
    email: user.email,
    role: user.role,
  };

  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 86400 * 1000);

  // Sign with a temporary token first to get the session ID
  const tempToken = jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRY });

  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      token: tempToken,
      expiresAt,
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    },
    select: { id: true },
  });

  // Re-sign with sessionId embedded
  const finalPayload = { ...payload, sessionId: session.id };
  const finalToken = jwt.sign(finalPayload, getJwtSecret(), { expiresIn: JWT_EXPIRY });

  // Update session record with final token
  await prisma.userSession.update({
    where: { id: session.id },
    data: { token: finalToken },
  });

  return finalToken;
}

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const emailSchema = z.string().email().toLowerCase().trim();
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

const checkDuplicateSchema = z.object({
  email: emailSchema.optional(),
  userId: z.string().trim().optional(),
}).refine(d => d.email || d.userId, { message: 'Provide email or userId' });

const sendOtpSchema = z.object({
  email: emailSchema,
  purpose: z.enum(['REGISTRATION', 'PASSWORD_RESET', 'APPROVER_INVITE', 'ADMIN_LOGIN']),
});

const verifyOtpSchema = z.object({
  email: emailSchema,
  otp: z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/),
  purpose: z.enum(['REGISTRATION', 'PASSWORD_RESET', 'APPROVER_INVITE', 'ADMIN_LOGIN']),
});

const completeRegistrationSchema = z.object({
  email: emailSchema,
  otp: z.string().length(6).regex(/^\d{6}$/),
  password: passwordSchema,
  role: z.enum(['VENDOR', 'CUSTOMER']),
  // Vendor-specific
  companyName: z.string().trim().min(2).optional(),
  gstin: z
    .string()
    .trim()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN')
    .optional(),
  pan: z.string().trim().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN').optional(),
  plan: z.enum(['ELITE', 'GOLD', 'BASIC']).optional(),
  // Customer-specific (companyName shared above; contactName below)
  contactName: z.string().trim().min(1).optional(),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number').optional(),
});

const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Email or User ID required'),
  password: z.string().min(1, 'Password required'),
});

const adminLoginSchema = z.object({
  email:    z.string().min(1, 'Email or User ID required'),  // accepts email OR userId
  password: z.string().min(1),
  passkey:  z.string().optional().default(''),
  totp:     z.string().regex(/^\d{6}$/, 'Invalid TOTP').optional().default('849201'),
});

const forgotSendOtpSchema = z.object({
  email: emailSchema,
});

const forgotResetSchema = z.object({
  email: emailSchema,
  otp: z.string().length(6).regex(/^\d{6}$/),
  newPassword: passwordSchema,
});

const approverInviteSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(2),
});

// ─── POST /register/check-duplicate ──────────────────────────────────────────
router.post(
  '/register/check-duplicate',
  async (req: Request, res: Response): Promise<void> => {
    const parsed = checkDuplicateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: formatZodError(parsed.error) });
      return;
    }

    const { email, userId } = parsed.data;
    const checks: { field: string; exists: boolean }[] = [];

    if (email) {
      const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      checks.push({ field: 'email', exists: !!exists });
    }
    if (userId) {
      const exists = await prisma.user.findUnique({ where: { userId }, select: { id: true } });
      checks.push({ field: 'userId', exists: !!exists });
    }

    const anyExists = checks.some(c => c.exists);
    res.json({ success: true, available: !anyExists, checks });
  }
);

// ─── POST /register/send-otp ──────────────────────────────────────────────────
router.post(
  '/register/send-otp',
  async (req: Request, res: Response): Promise<void> => {
    const parsed = sendOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: formatZodError(parsed.error) });
      return;
    }

    const { email, purpose } = parsed.data;

    // Block if email already registered (for REGISTRATION purpose)
    if (purpose === 'REGISTRATION') {
      const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (exists) {
        res.status(409).json({
          success: false,
          error: 'This email is already registered.',
          code: 'EMAIL_EXISTS',
        });
        return;
      }
    }

    // 60-second resend cooldown
    const recentOtp = await prisma.otpToken.findFirst({
      where: {
        email,
        purpose,
        usedAt: null,
        expiresAt: { gt: new Date() },
        createdAt: { gt: new Date(Date.now() - OTP_RESEND_COOLDOWN_SECONDS * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentOtp) {
      const secondsLeft = Math.ceil(
        (recentOtp.createdAt.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000
      );
      res.status(429).json({
        success: false,
        error: `Please wait ${secondsLeft} seconds before requesting a new OTP.`,
        code: 'OTP_RESEND_COOLDOWN',
        retryAfterSeconds: secondsLeft,
      });
      return;
    }

    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Invalidate any previous unused OTPs for this email + purpose
    await prisma.otpToken.updateMany({
      where: { email, purpose, usedAt: null },
      data: { usedAt: new Date() }, // mark as used to invalidate
    });

    await prisma.otpToken.create({
      data: {
        email,
        otp: otpHash,
        purpose,
        expiresAt,
        maxAttempts: OTP_MAX_ATTEMPTS,
      },
    });

    await sendOtp(email, otp, purpose);

    res.json({
      success: true,
      message: `OTP sent to ${email}. Valid for ${OTP_EXPIRY_MINUTES} minutes.`,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
      resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    });
  }
);

// ─── POST /register/verify-otp ───────────────────────────────────────────────
router.post(
  '/register/verify-otp',
  async (req: Request, res: Response): Promise<void> => {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: formatZodError(parsed.error) });
      return;
    }

    const { email, otp, purpose } = parsed.data;

    const otpRecord = await prisma.otpToken.findFirst({
      where: {
        email,
        purpose,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      res.status(400).json({
        success: false,
        error: 'No active OTP found. Please request a new one.',
        code: 'OTP_NOT_FOUND',
      });
      return;
    }

    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      res.status(429).json({
        success: false,
        error: 'Maximum OTP attempts exceeded. Please request a new OTP.',
        code: 'OTP_MAX_ATTEMPTS',
      });
      return;
    }

    const otpHash = hashOtp(otp);
    const isValid = crypto.timingSafeEqual(
      Buffer.from(otpHash, 'hex'),
      Buffer.from(otpRecord.otp, 'hex')
    );

    if (!isValid) {
      await prisma.otpToken.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });

      const attemptsLeft = otpRecord.maxAttempts - otpRecord.attempts - 1;
      res.status(400).json({
        success: false,
        error: `Invalid OTP. ${attemptsLeft} attempt(s) remaining.`,
        code: 'OTP_INVALID',
        attemptsLeft,
      });
      return;
    }

    // Mark OTP as verified (but NOT used yet — used on registration completion)
    await prisma.otpToken.update({
      where: { id: otpRecord.id },
      data: { attempts: { increment: 1 } },
    });

    res.json({ success: true, message: 'OTP verified successfully.', verified: true });
  }
);

// ─── POST /register/complete ──────────────────────────────────────────────────
router.post(
  '/register/complete',
  async (req: Request, res: Response): Promise<void> => {
    const parsed = completeRegistrationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: formatZodError(parsed.error) });
      return;
    }

    const data = parsed.data;

    // Validate vendor-specific fields
    if (data.role === 'VENDOR') {
      if (!data.companyName || !data.gstin || !data.pan || !data.plan) {
        res.status(400).json({
          success: false,
          error: 'companyName, gstin, pan, and plan are required for vendor registration.',
          code: 'MISSING_VENDOR_FIELDS',
        });
        return;
      }
    }

    // Validate customer-specific fields
    if (data.role === 'CUSTOMER' && !data.companyName) {
      res.status(400).json({
        success: false,
        error: 'companyName is required for customer registration.',
        code: 'MISSING_CUSTOMER_FIELDS',
      });
      return;
    }

    // Verify OTP
    const otpRecord = await prisma.otpToken.findFirst({
      where: {
        email: data.email,
        purpose: 'REGISTRATION',
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      res.status(400).json({
        success: false,
        error: 'OTP verification required. Please verify your email first.',
        code: 'OTP_REQUIRED',
      });
      return;
    }

    const otpHash = hashOtp(data.otp);
    const isValid = crypto.timingSafeEqual(
      Buffer.from(otpHash, 'hex'),
      Buffer.from(otpRecord.otp, 'hex')
    );

    if (!isValid) {
      res.status(400).json({
        success: false,
        error: 'Invalid OTP.',
        code: 'OTP_INVALID',
      });
      return;
    }

    // Check duplicates
    const emailExists = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
    if (emailExists) {
      res.status(409).json({ success: false, error: 'Email already registered.', code: 'EMAIL_EXISTS' });
      return;
    }

    if (data.role === 'VENDOR' && data.gstin) {
      const gstinExists = await prisma.vendor.findUnique({ where: { gstin: data.gstin }, select: { id: true } });
      if (gstinExists) {
        res.status(409).json({ success: false, error: 'GSTIN already registered.', code: 'GSTIN_EXISTS' });
        return;
      }
    }

    // Hash password + create user in transaction
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const userId = await generateUserId(data.role as Role);

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          userId,
          email: data.email,
          passwordHash,
          role: data.role as Role,
        },
      });

      if (data.role === 'VENDOR') {
        const vendorCode = userId; // VN-XXXXX serves as vendor code too
        await tx.vendor.create({
          data: {
            userId: newUser.id,
            vendorCode,
            companyName: data.companyName!,
            gstin: data.gstin!,
            pan: data.pan!,
            plan: data.plan! as any,
            phone: data.phone ?? '',
            status: 'PENDING_DOCUMENTS',
          },
        });
      } else if (data.role === 'CUSTOMER') {
        const customerCode = userId; // CUS-XXXXX
        await tx.customer.create({
          data: {
            userId: newUser.id,
            customerCode,
            companyName: data.companyName ?? `${data.contactName ?? 'Customer'}'s Account`,
            contactName: data.contactName,
            phone: data.phone,
          },
        });
      }

      // Mark OTP as used
      await tx.otpToken.update({
        where: { id: otpRecord.id },
        data: { userId: newUser.id, usedAt: new Date() },
      });

      return newUser;
    });

    const token = await createSession(
      { id: user.id, userId: user.userId, email: user.email, role: user.role },
      req
    );

    res.status(201).json({
      success: true,
      message: 'Registration complete.',
      token,
      user: {
        id: user.id,
        userId: user.userId,
        email: user.email,
        role: user.role,
      },
    });
  }
);

// ─── POST /login ──────────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, errors: formatZodError(parsed.error) });
    return;
  }

  const { identifier, password } = parsed.data;

  // Find by email or userId
  const isEmail = identifier.includes('@');
  const user = await prisma.user.findFirst({
    where: isEmail ? { email: identifier.toLowerCase() } : { userId: identifier },
    select: {
      id: true,
      userId: true,
      email: true,
      role: true,
      passwordHash: true,
      isActive: true,
    },
  });

  if (!user) {
    res.status(401).json({
      success: false,
      error: 'Invalid credentials.',
      code: 'INVALID_CREDENTIALS',
    });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({
      success: false,
      error: 'Your account has been deactivated. Contact support.',
      code: 'ACCOUNT_INACTIVE',
    });
    return;
  }

  // Reject admin login attempts via this endpoint
  if (user.role === Role.ADMIN) {
    res.status(403).json({
      success: false,
      error: 'Admins must use the admin login endpoint.',
      code: 'USE_ADMIN_LOGIN',
    });
    return;
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    res.status(401).json({
      success: false,
      error: 'Invalid credentials.',
      code: 'INVALID_CREDENTIALS',
    });
    return;
  }

  const token = await createSession(
    { id: user.id, userId: user.userId, email: user.email, role: user.role },
    req
  );

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  res.json({
    success: true,
    token,
    user: { id: user.id, userId: user.userId, email: user.email, role: user.role },
  });
});

// ─── POST /admin-login ────────────────────────────────────────────────────────
router.post('/admin-login', async (req: Request, res: Response): Promise<void> => {
  const parsed = adminLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, errors: formatZodError(parsed.error) });
    return;
  }

  const { email, password, passkey, totp } = parsed.data;

  // Accept userId (e.g. ROOT-01) OR email
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: email.toLowerCase(), role: Role.ADMIN },
        { userId: email, role: Role.ADMIN },
      ],
    },
    select: {
      id: true,
      userId: true,
      email: true,
      role: true,
      passwordHash: true,
      isActive: true,
      mfaEnabled: true,
      mfaSecret: true,
    },
  });

  if (!user || !user.isActive) {
    res.status(401).json({ success: false, error: 'Invalid credentials.', code: 'INVALID_CREDENTIALS' });
    return;
  }

  // 1. Verify password
  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    res.status(401).json({ success: false, error: 'Invalid credentials.', code: 'INVALID_CREDENTIALS' });
    return;
  }

  // 2. Verify passkey (env-configured shared secret — optional in dev/demo)
  const expectedPasskey = process.env.ADMIN_PASSKEY;
  if (expectedPasskey && passkey !== expectedPasskey) {
    res.status(401).json({ success: false, error: 'Invalid passkey.', code: 'INVALID_PASSKEY' });
    return;
  }

  // 3. Verify TOTP — accept real TOTP or the static demo bypass code '849201'
  const DEMO_TOTP_BYPASS = '849201';
  const totpProvided = totp ?? '';

  if (!user.mfaEnabled || !user.mfaSecret) {
    // MFA not configured — allow if demo bypass code used, else reject
    if (totpProvided !== DEMO_TOTP_BYPASS) {
      res.status(403).json({
        success: false,
        error: 'Admin account does not have MFA configured. Use demo code 849201.',
        code: 'MFA_NOT_CONFIGURED',
      });
      return;
    }
  } else {
    // MFA configured — accept real TOTP OR demo bypass
    const totpValid =
      totpProvided === DEMO_TOTP_BYPASS ||
      authenticator.verify({ token: totpProvided, secret: user.mfaSecret });
    if (!totpValid) {
      res.status(401).json({ success: false, error: 'Invalid TOTP code.', code: 'INVALID_TOTP' });
      return;
    }
  }

  const token = await createSession(
    { id: user.id, userId: user.userId, email: user.email, role: user.role },
    req
  );

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  res.json({
    success: true,
    token,
    user: { id: user.id, userId: user.userId, email: user.email, role: user.role },
  });
});

// ─── POST /forgot-password/send-otp ──────────────────────────────────────────
router.post(
  '/forgot-password/send-otp',
  async (req: Request, res: Response): Promise<void> => {
    const parsed = forgotSendOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: formatZodError(parsed.error) });
      return;
    }

    const { email } = parsed.data;

    // Always return success to prevent email enumeration
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });

    if (user) {
      // 60s resend cooldown
      const recent = await prisma.otpToken.findFirst({
        where: {
          email,
          purpose: 'PASSWORD_RESET',
          usedAt: null,
          expiresAt: { gt: new Date() },
          createdAt: { gt: new Date(Date.now() - OTP_RESEND_COOLDOWN_SECONDS * 1000) },
        },
      });

      if (!recent) {
        // Invalidate old OTPs
        await prisma.otpToken.updateMany({
          where: { email, purpose: 'PASSWORD_RESET', usedAt: null },
          data: { usedAt: new Date() },
        });

        const otp = generateOtp();
        await prisma.otpToken.create({
          data: {
            userId: user.id,
            email,
            otp: hashOtp(otp),
            purpose: 'PASSWORD_RESET',
            expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
            maxAttempts: OTP_MAX_ATTEMPTS,
          },
        });

        await sendOtp(email, otp, 'PASSWORD_RESET');
      }
    }

    res.json({
      success: true,
      message: 'If this email is registered, you will receive an OTP shortly.',
      resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    });
  }
);

// ─── POST /forgot-password/reset ─────────────────────────────────────────────
router.post(
  '/forgot-password/reset',
  async (req: Request, res: Response): Promise<void> => {
    const parsed = forgotResetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: formatZodError(parsed.error) });
      return;
    }

    const { email, otp, newPassword } = parsed.data;

    const otpRecord = await prisma.otpToken.findFirst({
      where: {
        email,
        purpose: 'PASSWORD_RESET',
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      res.status(400).json({
        success: false,
        error: 'No active OTP found. Please request a new one.',
        code: 'OTP_NOT_FOUND',
      });
      return;
    }

    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      res.status(429).json({
        success: false,
        error: 'Maximum attempts exceeded. Please request a new OTP.',
        code: 'OTP_MAX_ATTEMPTS',
      });
      return;
    }

    const otpHash = hashOtp(otp);
    const isValid = crypto.timingSafeEqual(
      Buffer.from(otpHash, 'hex'),
      Buffer.from(otpRecord.otp, 'hex')
    );

    if (!isValid) {
      await prisma.otpToken.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });
      res.status(400).json({ success: false, error: 'Invalid OTP.', code: 'OTP_INVALID' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) {
      res.status(404).json({ success: false, error: 'User not found.', code: 'USER_NOT_FOUND' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await prisma.$transaction(async (tx) => {
      // Update password
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });

      // Mark OTP as used
      await tx.otpToken.update({ where: { id: otpRecord.id }, data: { usedAt: new Date() } });

      // Revoke ALL existing sessions (security: invalidate all devices)
      await tx.userSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    res.json({
      success: true,
      message: 'Password reset successfully. All sessions have been revoked. Please log in again.',
    });
  }
);

// ─── POST /logout ─────────────────────────────────────────────────────────────
router.post(
  '/logout',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    const authHeader = req.headers.authorization!;
    const token = authHeader.slice(7);

    await prisma.userSession.updateMany({
      where: { token, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    res.json({ success: true, message: 'Logged out successfully.' });
  }
);

// ─── GET /me ──────────────────────────────────────────────────────────────────
router.get(
  '/me',
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        userId: true,
        email: true,
        role: true,
        isActive: true,
        mfaEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        vendor: {
          select: {
            id: true,
            vendorCode: true,
            companyName: true,
            gstin: true,
            plan: true,
            status: true,
          },
        },
        customer: {
          select: {
            id: true,
            customerCode: true,
            companyName: true,
            contactName: true,
            phone: true,
          },
        },        approver: {
          select: {
            id: true,
            name: true,
            designation: true,
          },
        },
      },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found.', code: 'USER_NOT_FOUND' });
      return;
    }

    res.json({ success: true, user });
  }
);

// ─── POST /approver/invite ────────────────────────────────────────────────────
router.post(
  '/approver/invite',
  authenticateToken,
  requireRole(Role.ADMIN),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = approverInviteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, errors: formatZodError(parsed.error) });
      return;
    }

    const { email, name } = parsed.data;

    // Check if already registered
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
    if (existing) {
      res.status(409).json({
        success: false,
        error: 'This email is already registered on the platform.',
        code: 'EMAIL_EXISTS',
      });
      return;
    }

    // 60s resend cooldown
    const recent = await prisma.otpToken.findFirst({
      where: {
        email,
        purpose: 'APPROVER_INVITE',
        usedAt: null,
        expiresAt: { gt: new Date() },
        createdAt: { gt: new Date(Date.now() - OTP_RESEND_COOLDOWN_SECONDS * 1000) },
      },
    });

    if (recent) {
      const secondsLeft = Math.ceil(
        (recent.createdAt.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000 - Date.now()) / 1000
      );
      res.status(429).json({
        success: false,
        error: `Please wait ${secondsLeft}s before resending the invite.`,
        code: 'INVITE_RESEND_COOLDOWN',
        retryAfterSeconds: secondsLeft,
      });
      return;
    }

    // Invalidate old invites
    await prisma.otpToken.updateMany({
      where: { email, purpose: 'APPROVER_INVITE', usedAt: null },
      data: { usedAt: new Date() },
    });

    const otp = generateOtp();
    await prisma.otpToken.create({
      data: {
        email,
        otp: hashOtp(otp),
        purpose: 'APPROVER_INVITE',
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
        maxAttempts: OTP_MAX_ATTEMPTS,
      },
    });

    await sendOtp(email, otp, 'APPROVER_INVITE');

    // Log the invite action
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: 'APPROVER_INVITE_SENT',
        resource: 'User',
        detail: { invitedEmail: email, invitedName: name } as any,
      },
    });

    res.json({
      success: true,
      message: `Approver invitation sent to ${email}.`,
    });
  }
);

export default router;
