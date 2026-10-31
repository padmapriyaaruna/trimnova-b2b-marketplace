/**
 * TrimNova Express Server Entry Point
 * Production-grade: Helmet, CORS, compression, rate limiting, SPA fallback.
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import path from 'path';

// ─── Route Imports ────────────────────────────────────────────────────────────
import authRouter from './routes/auth.js';
import vendorsRouter from './routes/vendors.js';
import kycRouter from './routes/kyc.js';
import catalogRouter from './routes/catalog.js';
import approverRouter from './routes/approver.js';
import adminRouter from './routes/admin.js';
import ordersRouter from './routes/orders.js';
import paymentsRouter from './routes/payments.js';
import returnsRouter from './routes/returns.js';
import settlementsRouter from './routes/settlements.js';
import invoicesRouter from './routes/invoices.js';
import notificationsRouter from './routes/notifications.js';

// ─── App ──────────────────────────────────────────────────────────────────────
const app = express();
const PORT = parseInt(process.env.PORT ?? '5000', 10);
const isProduction = process.env.NODE_ENV === 'production';

// ─── Security Headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: isProduction
      ? undefined
      : false, // relax CSP in dev for Vite HMR
    crossOriginEmbedderPolicy: false,
  })
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
// In production the frontend is served from the same Express process (same origin),
// so we allow all origins in production. In development we whitelist localhost ports.
const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5000')
  .split(',')
  .map(o => o.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow:
      // 1. No-origin requests (server-to-server, curl, Render health checks)
      // 2. Production — same-origin requests from Render's own domain
      // 3. Whitelisted dev origins
      if (!origin || isProduction || allowedOrigins.includes(origin)) {
        cb(null, true);
      } else {
        cb(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
  })
);

// ─── Compression ──────────────────────────────────────────────────────────────
app.use(compression());

// ─── Body Parsers ─────────────────────────────────────────────────────────────
// 10 MB limit to accommodate base64-encoded PDF/image uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Rate Limiting ────────────────────────────────────────────────────────────

/** General API: 100 requests per 15 minutes */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
    code: 'RATE_LIMITED',
  },
  skip: (req) => req.path.startsWith('/api/v1/payments/webhook'), // Razorpay webhooks bypass
});

/** Auth endpoints: 5 requests per 15 minutes (brute-force protection) */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again in 15 minutes.',
    code: 'AUTH_RATE_LIMITED',
  },
});

// Apply general limiter to all API routes
app.use('/api/', generalLimiter);

// ─── Request ID Middleware ────────────────────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] as string ?? crypto.randomUUID();
  res.setHeader('X-Request-ID', requestId);
  next();
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '4.0.0',
    environment: process.env.NODE_ENV ?? 'development',
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────

// Auth routes have tighter rate limiting
app.use('/api/v1/auth', authLimiter, authRouter);

// All other API routes
app.use('/api/v1/vendors', vendorsRouter);
app.use('/api/v1/kyc', kycRouter);
app.use('/api/v1/catalog', catalogRouter);
app.use('/api/v1/approver', approverRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/orders', ordersRouter);
app.use('/api/v1/payments', paymentsRouter);
app.use('/api/v1/returns', returnsRouter);
app.use('/api/v1/settlements', settlementsRouter);
app.use('/api/v1/invoices', invoicesRouter);
app.use('/api/v1/notifications', notificationsRouter);

// ─── SPA Static File Serving (Production) ────────────────────────────────────
if (isProduction) {
  const clientDistPath = path.resolve(process.cwd(), 'dist/client');

  app.use(
    express.static(clientDistPath, {
      maxAge: '1y',
      etag: true,
      index: false, // we handle index.html manually below
    })
  );

  // SPA fallback — serve index.html for all non-API routes
  app.get('*', (req: Request, res: Response) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ success: false, error: 'API endpoint not found' });
      return;
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Endpoint not found', code: 'NOT_FOUND' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Server Error]', err);

  if (err.message.startsWith('CORS:')) {
    res.status(403).json({ success: false, error: err.message, code: 'CORS_ERROR' });
    return;
  }

  res.status(500).json({
    success: false,
    error: isProduction ? 'Internal server error' : err.message,
    code: 'INTERNAL_ERROR',
    ...(isProduction ? {} : { stack: err.stack }),
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ TrimNova API server running on http://0.0.0.0:${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV ?? 'development'}`);
  console.log(`   API base    : /api/v1`);
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
const shutdown = (signal: string) => {
  console.log(`\n⚠️  Received ${signal}. Shutting down gracefully…`);

  server.close(async () => {
    console.log('   HTTP server closed.');
    try {
      const { prisma } = await import('./lib/prisma.js');
      await prisma.$disconnect();
      console.log('   Database connection closed.');
    } catch (e) {
      console.error('   Error closing DB connection:', e);
    }
    process.exit(0);
  });

  // Force exit after 10 s if graceful shutdown hangs
  setTimeout(() => {
    console.error('   Forced shutdown after 10s timeout.');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  shutdown('unhandledRejection');
});

export default app;
