/**
 * TrimNova — Brevo (formerly Sendinblue) Email Service
 * Falls back to in-portal DB notifications + console.log when BREVO_API_KEY is absent.
 */

import prisma from '../lib/prisma.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type ApprovalType = 'APPROVED' | 'REJECTED' | 'ON_HOLD';

interface BrevoEmailPayload {
  sender: { name: string; email: string };
  to: { email: string; name?: string }[];
  subject: string;
  htmlContent: string;
  textContent?: string;
}

// ─── Brevo HTTP Client ────────────────────────────────────────────────────────

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const SENDER = {
  name: process.env.EMAIL_SENDER_NAME ?? 'TrimNova',
  email: process.env.EMAIL_SENDER_ADDRESS ?? 'noreply@trimnova.in',
};

async function sendBrevoEmail(payload: BrevoEmailPayload): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    // Fallback: log to console (in-portal notifications are stored by individual methods)
    console.log('[Brevo STUB] Email not sent — BREVO_API_KEY not configured.');
    console.log(`  To      : ${payload.to.map(t => t.email).join(', ')}`);
    console.log(`  Subject : ${payload.subject}`);
    if (payload.textContent) console.log(`  Body    : ${payload.textContent}`);
    return;
  }

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Brevo API error ${response.status}: ${errorBody}`
    );
  }
}

// ─── Store In-Portal Notification ────────────────────────────────────────────

async function storeInPortalNotification(
  email: string,
  type: string,
  title: string,
  body: string,
  metadata?: object
): Promise<void> {
  try {
    // Look up user by email; skip if user not found (e.g. pre-registration OTPs)
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) return;

    await prisma.notification.create({
      data: {
        userId: user.id,
        channel: 'IN_PORTAL',
        type: type as any,
        subject: title,
        body,
        metadata: metadata ? (metadata as any) : undefined,
      },
    });
  } catch (err) {
    // Non-fatal — never let notification failure break business logic
    console.error('[Brevo] Failed to store in-portal notification:', err);
  }
}

// ─── sendOtp ──────────────────────────────────────────────────────────────────

/**
 * Send a 6-digit OTP email for registration / password reset / approver invite.
 */
export async function sendOtp(
  email: string,
  otp: string,
  purpose: string
): Promise<void> {
  const purposeLabel: Record<string, string> = {
    REGISTRATION: 'Complete Your Registration',
    PASSWORD_RESET: 'Reset Your Password',
    APPROVER_INVITE: 'Accept Your Approver Invitation',
    ADMIN_LOGIN: 'Admin Login Verification',
  };

  const subject = purposeLabel[purpose] ?? 'Your TrimNova Verification Code';

  const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="font-family:Inter,sans-serif;background:#F4F6FB;padding:32px;">
  <div style="max-width:480px;margin:auto;background:#fff;border-radius:20px;padding:40px;box-shadow:0 2px 16px rgba(0,0,0,0.08)">
    <h1 style="color:#0F172A;margin:0 0 8px">TrimNova</h1>
    <p style="color:#64748B;margin:0 0 32px;font-size:14px">B2B Garment Trims Marketplace</p>
    <h2 style="color:#1E293B;font-size:22px;margin:0 0 16px">${subject}</h2>
    <p style="color:#475569;font-size:15px;margin:0 0 24px">Your one-time verification code is:</p>
    <div style="background:#F4F6FB;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
      <span style="font-family:'JetBrains Mono',monospace;font-size:36px;font-weight:700;letter-spacing:12px;color:#4F46E5">${otp}</span>
    </div>
    <p style="color:#64748B;font-size:13px;margin:0 0 8px">⏱ This code expires in <strong>10 minutes</strong>.</p>
    <p style="color:#64748B;font-size:13px;margin:0">If you did not request this, please ignore this email.</p>
    <hr style="border:none;border-top:1px solid #E2E8F0;margin:32px 0"/>
    <p style="color:#94A3B8;font-size:12px;margin:0">TrimNova &mdash; Powering India's Garment Supply Chain</p>
  </div>
</body>
</html>`;

  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    console.log(`[Brevo STUB] OTP for ${email} [${purpose}]: ${otp}`);
    await storeInPortalNotification(
      email,
      'OTP',
      `Your TrimNova OTP`,
      `Your verification code is: ${otp}. Valid for 10 minutes.`,
      { purpose, otp }
    );
    return;
  }

  await sendBrevoEmail({
    sender: SENDER,
    to: [{ email }],
    subject,
    htmlContent,
    textContent: `Your TrimNova OTP for ${purpose}: ${otp}\nExpires in 10 minutes.`,
  });
}

// ─── sendApprovalEmail ────────────────────────────────────────────────────────

/**
 * Notify a vendor about KYC / product approval decision.
 */
export async function sendApprovalEmail(
  email: string,
  vendorName: string,
  type: ApprovalType,
  comment?: string
): Promise<void> {
  const configs: Record<ApprovalType, { subject: string; color: string; icon: string; body: string }> = {
    APPROVED: {
      subject: '🎉 Your TrimNova Application is Approved!',
      color: '#10B981',
      icon: '✅',
      body: `Congratulations! Your vendor application has been <strong>approved</strong>. You can now start listing products on TrimNova.`,
    },
    REJECTED: {
      subject: 'TrimNova Application Update — Action Required',
      color: '#EF4444',
      icon: '❌',
      body: `Unfortunately, your vendor application has been <strong>rejected</strong>. Please review the comments below and reapply after addressing the issues.`,
    },
    ON_HOLD: {
      subject: 'TrimNova Application Update — On Hold',
      color: '#F59E0B',
      icon: '⏸️',
      body: `Your vendor application has been placed <strong>on hold</strong>. Our team needs additional information. Please review the comments below.`,
    },
  };

  const cfg = configs[type];

  const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="font-family:Inter,sans-serif;background:#F4F6FB;padding:32px;">
  <div style="max-width:560px;margin:auto;background:#fff;border-radius:20px;padding:40px;box-shadow:0 2px 16px rgba(0,0,0,0.08)">
    <h1 style="color:#0F172A;margin:0 0 8px">TrimNova</h1>
    <p style="color:#64748B;margin:0 0 32px;font-size:14px">Vendor Notification</p>
    <div style="border-left:4px solid ${cfg.color};padding-left:16px;margin-bottom:24px">
      <h2 style="color:#1E293B;margin:0 0 8px;font-size:20px">${cfg.icon} Application ${type.replace('_', ' ')}</h2>
      <p style="color:#475569;margin:0">Dear <strong>${vendorName}</strong>,</p>
    </div>
    <p style="color:#475569;font-size:15px;line-height:1.6">${cfg.body}</p>
    ${comment ? `
    <div style="background:#F8FAFC;border-radius:12px;padding:20px;margin-top:20px">
      <p style="color:#64748B;font-size:13px;font-weight:600;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.05em">Reviewer Comments</p>
      <p style="color:#334155;font-size:14px;margin:0;line-height:1.6">${comment}</p>
    </div>` : ''}
    <div style="margin-top:32px">
      <a href="${process.env.APP_URL ?? 'https://trimnova.in'}/vendor/dashboard"
         style="background:#4F46E5;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:14px;display:inline-block">
        Go to Dashboard
      </a>
    </div>
    <hr style="border:none;border-top:1px solid #E2E8F0;margin:32px 0"/>
    <p style="color:#94A3B8;font-size:12px;margin:0">TrimNova &mdash; Powering India's Garment Supply Chain</p>
  </div>
</body>
</html>`;

  const apiKey = process.env.BREVO_API_KEY;
  const notificationType = type === 'APPROVED' ? 'APPROVAL' : type === 'REJECTED' ? 'REJECTION' : 'ON_HOLD';

  if (!apiKey) {
    console.log(`[Brevo STUB] Approval email to ${email}: ${type}`);
    await storeInPortalNotification(
      email,
      notificationType,
      cfg.subject,
      `Your application status: ${type}. ${comment ? `Comment: ${comment}` : ''}`,
      { type, comment }
    );
    return;
  }

  await sendBrevoEmail({
    sender: SENDER,
    to: [{ email, name: vendorName }],
    subject: cfg.subject,
    htmlContent,
    textContent: `Dear ${vendorName}, your TrimNova application status: ${type}. ${comment ? `Comment: ${comment}` : ''}`,
  });
}

// ─── sendLowStockAlert ────────────────────────────────────────────────────────

/**
 * Alert vendor when a product's stock drops to or below the low-stock threshold.
 */
export async function sendLowStockAlert(
  vendorEmail: string,
  productName: string,
  sku: string,
  currentStock: number
): Promise<void> {
  const subject = `⚠️ Low Stock Alert: ${productName}`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="font-family:Inter,sans-serif;background:#F4F6FB;padding:32px;">
  <div style="max-width:520px;margin:auto;background:#fff;border-radius:20px;padding:40px;box-shadow:0 2px 16px rgba(0,0,0,0.08)">
    <h1 style="color:#0F172A;margin:0 0 8px">TrimNova</h1>
    <p style="color:#64748B;margin:0 0 32px;font-size:14px">Inventory Alert</p>
    <div style="background:#FEF3C7;border-radius:12px;padding:20px;margin-bottom:24px">
      <p style="color:#92400E;font-weight:700;margin:0 0 4px;font-size:16px">⚠️ Low Stock Warning</p>
      <p style="color:#78350F;margin:0;font-size:14px">Immediate attention required</p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr>
        <td style="color:#64748B;padding:8px 0;border-bottom:1px solid #F1F5F9">Product</td>
        <td style="color:#0F172A;font-weight:600;padding:8px 0;border-bottom:1px solid #F1F5F9">${productName}</td>
      </tr>
      <tr>
        <td style="color:#64748B;padding:8px 0;border-bottom:1px solid #F1F5F9">SKU</td>
        <td style="color:#0F172A;font-family:monospace;padding:8px 0;border-bottom:1px solid #F1F5F9">${sku}</td>
      </tr>
      <tr>
        <td style="color:#64748B;padding:8px 0">Current Stock</td>
        <td style="color:#EF4444;font-weight:700;font-size:18px;padding:8px 0">${currentStock} units</td>
      </tr>
    </table>
    <p style="color:#475569;font-size:14px;margin:24px 0">Please replenish your inventory to avoid order fulfilment failures.</p>
    <a href="${process.env.APP_URL ?? 'https://trimnova.in'}/vendor/inventory"
       style="background:#4F46E5;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:14px;display:inline-block">
      Update Inventory
    </a>
    <hr style="border:none;border-top:1px solid #E2E8F0;margin:32px 0"/>
    <p style="color:#94A3B8;font-size:12px;margin:0">TrimNova &mdash; Powering India's Garment Supply Chain</p>
  </div>
</body>
</html>`;

  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    console.log(`[Brevo STUB] Low stock alert to ${vendorEmail}: ${sku} has ${currentStock} units`);
    await storeInPortalNotification(
      vendorEmail,
      'LOW_STOCK',
      subject,
      `${productName} (${sku}) has only ${currentStock} units remaining.`,
      { productName, sku, currentStock }
    );
    return;
  }

  await sendBrevoEmail({
    sender: SENDER,
    to: [{ email: vendorEmail }],
    subject,
    htmlContent,
    textContent: `Low stock alert: ${productName} (SKU: ${sku}) has only ${currentStock} units remaining.`,
  });
}

// ─── sendOrderNotification ────────────────────────────────────────────────────

/**
 * Send order lifecycle notification (placed, accepted, shipped, delivered, etc.)
 */
export async function sendOrderNotification(
  email: string,
  type: string,
  orderNumber: string,
  details: object
): Promise<void> {
  const typeConfig: Record<string, { subject: string; icon: string; color: string; message: string }> = {
    ORDER_PLACED: {
      subject: `Order Confirmed — #${orderNumber}`,
      icon: '🛍️',
      color: '#4F46E5',
      message: 'Your order has been placed successfully and is being processed.',
    },
    ORDER_ACCEPTED: {
      subject: `Order Accepted by Vendor — #${orderNumber}`,
      icon: '✅',
      color: '#10B981',
      message: 'Great news! The vendor has accepted your order and is preparing it.',
    },
    ORDER_SHIPPED: {
      subject: `Order Shipped — #${orderNumber}`,
      icon: '🚚',
      color: '#4F46E5',
      message: 'Your order is on its way! Track your shipment using the details below.',
    },
    ORDER_DELIVERED: {
      subject: `Order Delivered — #${orderNumber}`,
      icon: '📦',
      color: '#10B981',
      message: 'Your order has been delivered. We hope you love it!',
    },
    RETURN_INITIATED: {
      subject: `Return Initiated — #${orderNumber}`,
      icon: '↩️',
      color: '#F59E0B',
      message: 'Your return request has been received and is being processed.',
    },
    SETTLEMENT_READY: {
      subject: `Settlement Ready — #${orderNumber}`,
      icon: '💰',
      color: '#10B981',
      message: 'Your settlement has been processed. Please check your bank account.',
    },
  };

  const cfg = typeConfig[type] ?? {
    subject: `TrimNova Order Update — #${orderNumber}`,
    icon: '📋',
    color: '#4F46E5',
    message: `Your order #${orderNumber} has been updated.`,
  };

  const detailsHtml = Object.entries(details)
    .map(([k, v]) => `
      <tr>
        <td style="color:#64748B;padding:8px 0;border-bottom:1px solid #F1F5F9;text-transform:capitalize">${k.replace(/([A-Z])/g, ' $1')}</td>
        <td style="color:#0F172A;font-weight:500;padding:8px 0;border-bottom:1px solid #F1F5F9">${String(v)}</td>
      </tr>`)
    .join('');

  const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="font-family:Inter,sans-serif;background:#F4F6FB;padding:32px;">
  <div style="max-width:560px;margin:auto;background:#fff;border-radius:20px;padding:40px;box-shadow:0 2px 16px rgba(0,0,0,0.08)">
    <h1 style="color:#0F172A;margin:0 0 8px">TrimNova</h1>
    <p style="color:#64748B;margin:0 0 32px;font-size:14px">Order Notification</p>
    <div style="border-left:4px solid ${cfg.color};padding-left:16px;margin-bottom:24px">
      <h2 style="color:#1E293B;margin:0 0 4px;font-size:20px">${cfg.icon} ${cfg.subject}</h2>
      <p style="color:#64748B;margin:0;font-family:monospace;font-size:13px">Order #${orderNumber}</p>
    </div>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin-bottom:24px">${cfg.message}</p>
    ${detailsHtml ? `<table style="width:100%;border-collapse:collapse;font-size:14px">${detailsHtml}</table>` : ''}
    <div style="margin-top:32px">
      <a href="${process.env.APP_URL ?? 'https://trimnova.in'}/orders/${orderNumber}"
         style="background:#4F46E5;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:14px;display:inline-block">
        View Order
      </a>
    </div>
    <hr style="border:none;border-top:1px solid #E2E8F0;margin:32px 0"/>
    <p style="color:#94A3B8;font-size:12px;margin:0">TrimNova &mdash; Powering India's Garment Supply Chain</p>
  </div>
</body>
</html>`;

  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    console.log(`[Brevo STUB] Order notification to ${email}: ${type} for order ${orderNumber}`);
    await storeInPortalNotification(
      email,
      type,
      cfg.subject,
      cfg.message,
      { orderNumber, type, ...details }
    );
    return;
  }

  await sendBrevoEmail({
    sender: SENDER,
    to: [{ email }],
    subject: cfg.subject,
    htmlContent,
    textContent: `${cfg.message} Order #${orderNumber}. Details: ${JSON.stringify(details)}`,
  });
}
