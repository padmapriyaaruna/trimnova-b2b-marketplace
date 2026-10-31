/**
 * TrimNova RBAC Middleware
 * JWT authentication + role-based access control for all Express routes.
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import prisma from './prisma.js';

// ─── JWT Payload ──────────────────────────────────────────────────────────────

export interface JwtPayload {
  /** UserSession.id (used for revocation) */
  sessionId: string;
  /** User.id (CUID) */
  id: string;
  /** User.userId (e.g. VN-89420) */
  userId: string;
  email: string;
  role: Role;
}

// ─── Augment Express Request ──────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return secret;
}

// ─── authenticateToken ────────────────────────────────────────────────────────

/**
 * Middleware: verifies the JWT from `Authorization: Bearer <token>` header.
 * Attaches decoded payload to `req.user`.
 * Also validates the session has not been revoked in the database.
 */
export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'Authorization token required',
      code: 'TOKEN_MISSING',
    });
    return;
  }

  const token = authHeader.slice(7); // strip "Bearer "

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, getJwtSecret()) as JwtPayload;
  } catch (err) {
    const message =
      err instanceof jwt.TokenExpiredError
        ? 'Token has expired'
        : 'Invalid token';
    res.status(401).json({
      success: false,
      error: message,
      code: err instanceof jwt.TokenExpiredError ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
    });
    return;
  }

  // Validate session in DB (revocation check)
  try {
    const session = await prisma.userSession.findUnique({
      where: { token },
      select: { id: true, revokedAt: true, expiresAt: true },
    });

    if (!session) {
      res.status(401).json({
        success: false,
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND',
      });
      return;
    }

    if (session.revokedAt) {
      res.status(401).json({
        success: false,
        error: 'Session has been revoked',
        code: 'SESSION_REVOKED',
      });
      return;
    }

    if (session.expiresAt < new Date()) {
      res.status(401).json({
        success: false,
        error: 'Session has expired',
        code: 'SESSION_EXPIRED',
      });
      return;
    }
  } catch (_dbErr) {
    res.status(500).json({
      success: false,
      error: 'Internal server error during authentication',
      code: 'AUTH_DB_ERROR',
    });
    return;
  }

  req.user = payload;
  next();
}

// ─── requireRole ──────────────────────────────────────────────────────────────

/**
 * Middleware factory: checks that `req.user.role` is one of the allowed roles.
 * Must be used AFTER `authenticateToken`.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'NOT_AUTHENTICATED',
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `Access denied. Required role(s): ${roles.join(', ')}`,
        code: 'INSUFFICIENT_ROLE',
        requiredRoles: roles,
        currentRole: req.user.role,
      });
      return;
    }

    next();
  };
}

// ─── Shorthand Role Middlewares ───────────────────────────────────────────────

/**
 * Pre-composed shorthand middlewares for common role checks.
 * Usage: router.get('/path', auth, requireRoles.vendor, handler)
 */
export const requireRoles = {
  vendor: requireRole(Role.VENDOR),
  customer: requireRole(Role.CUSTOMER),
  approver: requireRole(Role.APPROVER),
  admin: requireRole(Role.ADMIN),
  financePrep: requireRole(Role.FINANCE_PREPARER),
  financeApprover: requireRole(Role.FINANCE_APPROVER),

  // Composite role checks
  vendorOrAdmin: requireRole(Role.VENDOR, Role.ADMIN),
  customerOrAdmin: requireRole(Role.CUSTOMER, Role.ADMIN),
  approverOrAdmin: requireRole(Role.APPROVER, Role.ADMIN),
  financeAny: requireRole(Role.FINANCE_PREPARER, Role.FINANCE_APPROVER, Role.ADMIN),
  staffAny: requireRole(Role.APPROVER, Role.ADMIN, Role.FINANCE_PREPARER, Role.FINANCE_APPROVER),
};

// Convenience alias
export const auth = authenticateToken;
