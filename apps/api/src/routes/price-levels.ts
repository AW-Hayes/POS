import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const priceLevelsRouter = Router();
priceLevelsRouter.use(authenticate);

priceLevelsRouter.get('/', async (req, res, next) => {
  try {
    const levels = await prisma.priceLevel.findMany({
      where: { tenantId: req.user!.tenantId },
      include: { prices: true },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: levels });
  } catch (err) {
    next(err);
  }
});

const levelSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  discount: z.number().min(0).max(100).default(0),
});

priceLevelsRouter.post('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const data = levelSchema.parse(req.body);
    const level = await prisma.priceLevel.create({
      data: { ...data, tenantId: req.user!.tenantId },
    });
    res.status(201).json({ success: true, data: level });
  } catch (err) {
    next(err);
  }
});

priceLevelsRouter.put('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const level = await prisma.priceLevel.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!level) throw new AppError(404, 'Price level not found');
    const data = levelSchema.partial().parse(req.body);
    const updated = await prisma.priceLevel.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

priceLevelsRouter.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const level = await prisma.priceLevel.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!level) throw new AppError(404, 'Price level not found');
    await prisma.priceLevel.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── Per-product prices within a level ────────────────────────────────────────

const setProductPriceSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  price: z.number().min(0),
});

priceLevelsRouter.put('/:id/prices', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const level = await prisma.priceLevel.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!level) throw new AppError(404, 'Price level not found');

    const { productId, variantId, price } = setProductPriceSchema.parse(req.body);

    let productPrice = await prisma.productPrice.findFirst({
      where: { priceLevelId: req.params.id, productId, variantId: variantId ?? null },
    });
    if (productPrice) {
      productPrice = await prisma.productPrice.update({ where: { id: productPrice.id }, data: { price } });
    } else {
      productPrice = await prisma.productPrice.create({
        data: { priceLevelId: req.params.id, productId, variantId: variantId ?? null, price },
      });
    }

    res.json({ success: true, data: productPrice });
  } catch (err) {
    next(err);
  }
});

priceLevelsRouter.delete('/:id/prices/:priceId', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const pp = await prisma.productPrice.findFirst({
      where: { id: req.params.priceId, priceLevelId: req.params.id },
    });
    if (!pp) throw new AppError(404, 'Product price not found');
    await prisma.productPrice.delete({ where: { id: pp.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
