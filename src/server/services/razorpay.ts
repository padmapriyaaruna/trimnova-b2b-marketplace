/**
 * TrimNova — Razorpay Payment Gateway Service
 * Handles order creation, payment signature verification, and webhook validation.
 */

import crypto from 'crypto';
import Razorpay from 'razorpay';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RazorpayOrder {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: string;
  attempts: number;
  notes: object;
  created_at: number;
}

// ─── Client Singleton ─────────────────────────────────────────────────────────

function getRazorpayClient(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error(
      'Razorpay credentials not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'
    );
  }

  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

// ─── createRazorpayOrder ──────────────────────────────────────────────────────

/**
 * Create a Razorpay order for payment collection.
 *
 * @param amount    Amount in the smallest currency unit (paise for INR)
 * @param currency  ISO 4217 currency code (default: INR)
 * @param receipt   Unique receipt identifier (e.g. TrimNova order number)
 * @param notes     Optional key-value metadata attached to the order
 */
export async function createRazorpayOrder(
  amount: number,
  currency: string = 'INR',
  receipt: string,
  notes?: object
): Promise<RazorpayOrder> {
  if (amount <= 0) {
    throw new Error(`Invalid amount: ${amount}. Amount must be a positive integer in paise.`);
  }

  if (receipt.length > 40) {
    throw new Error(`Receipt ID too long: max 40 characters allowed by Razorpay.`);
  }

  const client = getRazorpayClient();

  const order = await client.orders.create({
    amount,
    currency,
    receipt,
    notes: (notes ?? {}) as Record<string, string | number>,
    payment_capture: true, // auto-capture on successful payment
  });

  return order as unknown as RazorpayOrder;
}

// ─── verifyPaymentSignature ───────────────────────────────────────────────────

/**
 * Verify Razorpay payment signature after checkout completion.
 * Signature = HMAC-SHA256(orderId + "|" + paymentId, RAZORPAY_KEY_SECRET)
 *
 * @param orderId    razorpay_order_id from checkout response
 * @param paymentId  razorpay_payment_id from checkout response
 * @param signature  razorpay_signature from checkout response
 * @returns true if signature is valid
 */
export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    throw new Error('RAZORPAY_KEY_SECRET is not configured.');
  }

  const message = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(message)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'hex'),
    Buffer.from(signature, 'hex')
  );
}

// ─── verifyWebhookSignature ───────────────────────────────────────────────────

/**
 * Verify the Razorpay webhook request signature.
 * Signature = HMAC-SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET)
 *
 * IMPORTANT: `body` must be the raw request body string (not parsed JSON).
 * Use `express.raw()` or capture raw body before JSON parsing for webhook routes.
 *
 * @param body       Raw request body as a string
 * @param signature  Value of the `x-razorpay-signature` header
 * @returns true if the webhook is authentic
 */
export function verifyWebhookSignature(body: string, signature: string): boolean {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('RAZORPAY_WEBHOOK_SECRET is not configured.');
  }

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(body)
    .digest('hex');

  // Prevent timing attacks with constant-time comparison
  const sigBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (sigBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, sigBuffer);
}
