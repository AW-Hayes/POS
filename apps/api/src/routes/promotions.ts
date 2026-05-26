import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { qs } from '../lib/qs';

export const promotionsRouter = Router();
promotionsRouter.use(authenticate);

promotionsRouter.get('/', async (req, res, next) => {
  try {
    const activeOnly = qs(req.query.active) === 'true';
    const promotions = await prisma.promotion.findMany({
      where: {
        tenantId: req.user!.tenantId,
        ...(activeOnly ? { active: true } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: promotions });
  } catch (err) {
    next(err);
  }
});

const promotionSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['percent_off', 'fixed_off', 'bogo', 'price_override']),
  value: z.number().min(0),
  minQty: z.number().int().positive().optional(),
  minAmount: z.number().positive().optional(),
  productIds: z.array(z.string()).default([]),
  categoryIds: z.array(z.string()).default([]),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  active: z.boolean().default(true),
});

promotionsRouter.post('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const data = promotionSchema.parse(req.body);
    const promotion = await prisma.promotion.create({
      data: { ...data, tenantId: req.user!.tenantId },
    });
    res.status(201).json({ success: true, data: promotion });
  } catch (err) {
    next(err);
  }
});

promotionsRouter.put('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.promotion.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!existing) throw new AppError(404, 'Promotion not found');

    const data = promotionSchema.partial().parse(req.body);
    const updated = await prisma.promotion.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

promotionsRouter.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const existing = await prisma.promotion.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!existing) throw new AppError(404, 'Promotion not found');
    await prisma.promotion.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── Apply promotions to a cart (preview endpoint) ────────────────────────────

const applySchema = z.object({
  items: z.array(z.object({
    productId: z.string(),
    categoryId: z.string().optional(),
    quantity: z.number().positive(),
    price: z.number(),
  })),
});

promotionsRouter.post('/apply', async (req, res, next) => {
  try {
    const { items } = applySchema.parse(req.body);
    const now = new Date();

    const promotions = await prisma.promotion.findMany({
      where: {
        tenantId: req.user!.tenantId,
        active: true,
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
      },
    });

    let totalDiscount = 0;
    const applied: Array<{ promotionId: string; name: string; discount: number }> = [];

    for (const promo of promotions) {
      let discount = 0;

      for (const item of items) {
        const matches =
          promo.productIds.length === 0 && promo.categoryIds.length === 0
            ? true
            : promo.productIds.includes(item.productId) ||
              (item.categoryId != null && promo.categoryIds.includes(item.categoryId));

        if (!matches) continue;
        if (promo.minQty != null && item.quantity < promo.minQty) continue;

        const lineTotal = item.price * item.quantity;
        if (promo.minAmount != null && lineTotal < promo.minAmount) continue;

        if (promo.type === 'percent_off') {
          discount += lineTotal * (promo.value / 100);
        } else if (promo.type === 'fixed_off') {
          discount += promo.value * item.quantity;
        } else if (promo.type === 'bogo') {
          const freeQty = Math.floor(item.quantity / 2);
          discount += item.price * freeQty;
        } else if (promo.type === 'price_override') {
          discount += Math.max(0, item.price - promo.value) * item.quantity;
        }
      }

      if (discount > 0) {
        totalDiscount += discount;
        applied.push({ promotionId: promo.id, name: promo.name, discount });
      }
    }

    res.json({ success: true, data: { totalDiscount, applied } });
  } catch (err) {
    next(err);
  }
});
