/**
 * TrimNova Notifications Router  —  /api/v1/notifications
 *
 * In-portal notification inbox + Demo Event Feed for the Demo Notification Drawer.
 * The Demo Event Feed surfaces all recent platform events to evaluators
 * (OTPs sent, emails triggered, order events, stock alerts) without needing a real inbox.
 */

import { Router, Request, Response } from 'express';
import { NotificationType, NotificationChannel } from '@prisma/client';

import prisma from '../lib/prisma.js';
import { auth } from '../lib/rbac.js';

const router = Router();

/** Safely coerce a query param to string (ignores array values) */
function qs(v: string | string[] | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /
 * Authenticated: get own in-portal notifications.
 */
router.get('/', auth, async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;
    const unreadOnly = req.query.unread === 'true';

    const where: any = {
      userId: req.user!.id,
      channel: NotificationChannel.IN_PORTAL,
    };
    if (unreadOnly) where.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          type: true,
          channel: true,
          subject: true,
          body: true,
          metadata: true,
          isRead: true,
          sentAt: true,
          readAt: true,
          createdAt: true,
        },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: {
          userId: req.user!.id,
          channel: NotificationChannel.IN_PORTAL,
          isRead: false,
        },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[GET /notifications]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /:id/read
 * Mark a single notification as read.
 */
router.post('/:id/read', auth, async (req: Request, res: Response): Promise<void> => {
  try {
    const notification = await prisma.notification.findUnique({
      where: { id: req.params.id as string },
      select: { id: true, userId: true, isRead: true },
    });

    if (!notification) {
      res.status(404).json({ success: false, error: 'Notification not found' });
      return;
    }

    // Users can only mark their own notifications
    if (!notification.userId || notification.userId !== req.user!.id) {
      res.status(403).json({ success: false, error: 'Access denied' });
      return;
    }

    if (notification.isRead) {
      res.status(200).json({ success: true, message: 'Already marked as read' });
      return;
    }

    await prisma.notification.update({
      where: { id: req.params.id as string },
      data: { isRead: true, readAt: new Date() },
    });

    res.status(200).json({ success: true, message: 'Notification marked as read' });
  } catch (err) {
    console.error('[POST /notifications/:id/read]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /read-all
 * Mark all unread in-portal notifications as read.
 */
router.post('/read-all', auth, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await prisma.notification.updateMany({
      where: {
        userId: req.user!.id,
        channel: NotificationChannel.IN_PORTAL,
        isRead: false,
      },
      data: { isRead: true, readAt: new Date() },
    });

    res.status(200).json({
      success: true,
      message: `${result.count} notification(s) marked as read`,
      markedCount: result.count,
    });
  } catch (err) {
    console.error('[POST /notifications/read-all]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /demo-events
 * Public (demo mode): unified event feed for the Demo Notification Drawer.
 * Surfaces OTPs, notifications, stock alerts from the last 24 hours.
 *
 * Disabled in production unless DEMO_MODE_ENABLED=true.
 */
router.get('/demo-events', async (req: Request, res: Response): Promise<void> => {
  if (process.env.NODE_ENV === 'production' && process.env.DEMO_MODE_ENABLED !== 'true') {
    res.status(404).json({ success: false, error: 'Not found' });
    return;
  }

  try {
    const limit = Math.min(200, Number(req.query.limit) || 100);
    const sinceMs = req.query.since ? parseInt(req.query.since as string, 10) : undefined;
    const since = sinceMs ? new Date(sinceMs) : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [notifications, stockAlerts, otpTokens] = await Promise.all([
      prisma.notification.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          user: { select: { userId: true, email: true, role: true } },
        },
      }),
      prisma.stockAlert.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          product: { select: { sku: true, name: true } },
          vendor: { select: { companyName: true, vendorCode: true } },
        },
      }),
      prisma.otpToken.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          email: true,
          purpose: true,
          expiresAt: true,
          usedAt: true,
          attempts: true,
          createdAt: true,
          // otp (hash) intentionally excluded for security
        },
      }),
    ]);

    type Severity = 'info' | 'warning' | 'success' | 'error';

    type DemoEvent = {
      id: string;
      eventType: string;
      timestamp: Date;
      summary: string;
      actor?: string;
      detail: object;
      severity: Severity;
    };

    const severityMap: Partial<Record<NotificationType, Severity>> = {
      ORDER_PLACED:    'success',
      ORDER_ACCEPTED:  'success',
      ORDER_SHIPPED:   'info',
      ORDER_DELIVERED: 'success',
      REJECTION:       'error',
      LOW_STOCK:       'warning',
      RETURN_INITIATED:'warning',
      SETTLEMENT_READY:'success',
      ESCALATION:      'error',
      OTP:             'info',
      SYSTEM:          'info',
    };

    const events: DemoEvent[] = [
      ...notifications.map((n): DemoEvent => ({
        id: n.id,
        eventType: `NOTIFICATION:${n.type}`,
        timestamp: n.createdAt,
        summary: n.subject,
        actor: n.user ? `${n.user.userId} (${n.user.role})` : 'System',
        detail: {
          body: n.body,
          channel: n.channel,
          metadata: n.metadata,
          isRead: n.isRead,
          sentAt: n.sentAt,
        },
        severity: severityMap[n.type] ?? 'info',
      })),
      ...stockAlerts.map((a): DemoEvent => ({
        id: a.id,
        eventType: 'STOCK_ALERT',
        timestamp: a.createdAt,
        summary: `${a.alertType}: ${a.product.name} — ${a.stockLevel} units remaining`,
        actor: `${a.vendor.companyName} (${a.vendor.vendorCode})`,
        detail: {
          sku: a.product.sku,
          alertType: a.alertType,
          stockLevel: a.stockLevel,
          threshold: a.threshold,
          emailSentAt: a.emailSentAt,
        },
        severity: a.alertType === 'OUT_OF_STOCK' ? 'error' : 'warning',
      })),
      ...otpTokens.map((o): DemoEvent => ({
        id: o.id,
        eventType: 'OTP_SENT',
        timestamp: o.createdAt,
        summary: `OTP sent to ${o.email} for ${o.purpose}`,
        actor: o.email,
        detail: {
          purpose: o.purpose,
          expiresAt: o.expiresAt,
          usedAt: o.usedAt,
          attempts: o.attempts,
          status: o.usedAt ? 'USED' : new Date() > o.expiresAt ? 'EXPIRED' : 'ACTIVE',
        },
        severity: 'info',
      })),
    ];

    // Sort newest-first
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    res.status(200).json({
      success: true,
      data: events.slice(0, limit),
      meta: {
        since: since.toISOString(),
        totalEvents: events.length,
        demoMode: true,
      },
    });
  } catch (err) {
    console.error('[GET /notifications/demo-events]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
