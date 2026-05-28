import { Router } from 'express';
import { z } from 'zod';
import Stripe from 'stripe';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

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
