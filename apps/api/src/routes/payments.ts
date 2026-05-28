import { Router } from 'express';
import { z } from 'zod';
import Stripe from 'stripe';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { randomUUID } from 'crypto';

export const paymentsRouter = Router();
paymentsRouter.use(authenticate);

function getStripe(): InstanceType<typeof Stripe> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new AppError(503, 'Stripe is not configured (STRIPE_SECRET_KEY missing)');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Stripe(key, { apiVersion: '2026-05-27.dahlia' as any });
}

// ── Stripe Terminal ───────────────────────────────────────────────────────────

paymentsRouter.post('/stripe/connection-token', requireRole('admin', 'manager', 'cashier'), async (req, res, next) => {
  try {
    const stripe = getStripe();
    const token = await stripe.terminal.connectionTokens.create();
    res.json({ success: true, data: { secret: token.secret } });
  } catch (err) {
    next(err);
  }
});

paymentsRouter.post('/stripe/create-intent', requireRole('admin', 'manager', 'cashier'), async (req, res, next) => {
  try {
    const { amount, currency } = z.object({
      amount: z.number().positive(),
      currency: z.string().default('usd'),
    }).parse(req.body);

    const stripe = getStripe();
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: currency.toLowerCase(),
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
    });

    res.json({ success: true, data: { id: intent.id, clientSecret: intent.client_secret } });
  } catch (err) {
    next(err);
  }
});

paymentsRouter.post('/stripe/capture-intent', requireRole('admin', 'manager', 'cashier'), async (req, res, next) => {
  try {
    const { paymentIntentId } = z.object({ paymentIntentId: z.string() }).parse(req.body);
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.capture(paymentIntentId);
    res.json({ success: true, data: { id: intent.id, status: intent.status } });
  } catch (err) {
    next(err);
  }
});

// ── Square Terminal ───────────────────────────────────────────────────────────

function getSquareBaseUrl(sandbox: boolean) {
  return sandbox ? 'https://connect.squareupsandbox.com' : 'https://connect.squareup.com';
}

function squareHeaders() {
  const key = process.env.SQUARE_ACCESS_TOKEN;
  if (!key) throw new AppError(503, 'Square is not configured (SQUARE_ACCESS_TOKEN missing)');
  return {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Square-Version': '2024-02-01',
  };
}

paymentsRouter.post('/square/create-checkout', requireRole('admin', 'manager', 'cashier'), async (req, res, next) => {
  try {
    const { amount, currency = 'USD', deviceId, sandbox = false } = z.object({
      amount: z.number().positive(),
      currency: z.string().default('USD'),
      deviceId: z.string().optional(),
      sandbox: z.boolean().default(false),
    }).parse(req.body);

    const body: Record<string, unknown> = {
      idempotency_key: randomUUID(),
      checkout: {
        amount_money: { amount: Math.round(amount * 100), currency: currency.toUpperCase() },
        payment_type: 'CARD_PRESENT',
        ...(deviceId ? { device_options: { device_id: deviceId } } : {}),
      },
    };

    const resp = await fetch(`${getSquareBaseUrl(sandbox)}/v2/terminals/checkouts`, {
      method: 'POST',
      headers: squareHeaders(),
      body: JSON.stringify(body),
    });
    const json = await resp.json() as Record<string, unknown>;
    if (!resp.ok) throw new AppError(resp.status, (json.errors as Array<{detail: string}>)?.[0]?.detail ?? 'Square error');

    const checkout = json.checkout as Record<string, unknown>;
    res.json({ success: true, data: { checkoutId: checkout.id as string, status: checkout.status as string } });
  } catch (err) {
    next(err);
  }
});

paymentsRouter.get('/square/checkout/:checkoutId', requireRole('admin', 'manager', 'cashier'), async (req, res, next) => {
  try {
    const { sandbox } = z.object({ sandbox: z.string().default('false') }).parse(req.query);
    const isSandbox = sandbox === 'true';

    const resp = await fetch(
      `${getSquareBaseUrl(isSandbox)}/v2/terminals/checkouts/${req.params.checkoutId}`,
      { headers: squareHeaders() },
    );
    const json = await resp.json() as Record<string, unknown>;
    if (!resp.ok) throw new AppError(resp.status, (json.errors as Array<{detail: string}>)?.[0]?.detail ?? 'Square error');

    const checkout = json.checkout as Record<string, unknown>;
    res.json({ success: true, data: { checkoutId: checkout.id as string, status: checkout.status as string, paymentIds: checkout.payment_ids as string[] | undefined } });
  } catch (err) {
    next(err);
  }
});

paymentsRouter.post('/square/cancel-checkout/:checkoutId', requireRole('admin', 'manager', 'cashier'), async (req, res, next) => {
  try {
    const { sandbox = false } = z.object({ sandbox: z.boolean().default(false) }).parse(req.body);

    const resp = await fetch(
      `${getSquareBaseUrl(sandbox)}/v2/terminals/checkouts/${req.params.checkoutId}/cancel`,
      { method: 'POST', headers: squareHeaders() },
    );
    const json = await resp.json() as Record<string, unknown>;
    if (!resp.ok) throw new AppError(resp.status, (json.errors as Array<{detail: string}>)?.[0]?.detail ?? 'Square error');

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
