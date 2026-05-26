import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const priceBreaksRouter = Router();
priceBreaksRouter.use(authenticate);

const breakSchema = z.object({
  variantId: z.string().optional(),
  minQty: z.number().positive(),
  price: z.number().min(0),
});

// List price breaks for a product
priceBreaksRouter.get('/products/:productId', async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.productId, tenantId: req.user!.tenantId },
    });
    if (!product) throw new AppError(404, 'Product not found');

    const breaks = await prisma.priceBreak.findMany({
      where: { productId: product.id },
      orderBy: [{ variantId: 'asc' }, { minQty: 'asc' }],
    });
    res.json({ success: true, data: breaks });
  } catch (err) {
    next(err);
  }
});

// Create a price break
priceBreaksRouter.post('/products/:productId', async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.productId, tenantId: req.user!.tenantId },
    });
    if (!product) throw new AppError(404, 'Product not found');

    const data = breakSchema.parse(req.body);
    const pb = await prisma.priceBreak.create({
      data: { productId: product.id, ...data },
    });
    res.status(201).json({ success: true, data: pb });
  } catch (err) {
    next(err);
  }
});

// Update a price break
priceBreaksRouter.put('/:id', async (req, res, next) => {
  try {
    const pb = await prisma.priceBreak.findFirst({
      where: { id: req.params.id },
      include: { product: { select: { tenantId: true } } },
    });
    if (!pb || pb.product.tenantId !== req.user!.tenantId) throw new AppError(404, 'Price break not found');

    const data = breakSchema.partial().parse(req.body);
    const updated = await prisma.priceBreak.update({ where: { id: pb.id }, data });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// Delete a price break
priceBreaksRouter.delete('/:id', async (req, res, next) => {
  try {
    const pb = await prisma.priceBreak.findFirst({
      where: { id: req.params.id },
      include: { product: { select: { tenantId: true } } },
    });
    if (!pb || pb.product.tenantId !== req.user!.tenantId) throw new AppError(404, 'Price break not found');

    await prisma.priceBreak.delete({ where: { id: pb.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
