import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const bundlesRouter = Router();
bundlesRouter.use(authenticate);

// Get all bundle-type products (products with bundleComponents)
bundlesRouter.get('/', async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        tenantId: req.user!.tenantId,
        bundleComponents: { some: {} },
      },
      include: {
        bundleComponents: {
          include: {
            componentProduct: { select: { id: true, name: true, sku: true, price: true } },
          },
        },
        category: { select: { id: true, name: true, color: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: products });
  } catch (err) {
    next(err);
  }
});

bundlesRouter.get('/:productId', async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.productId, tenantId: req.user!.tenantId },
      include: {
        bundleComponents: {
          include: {
            componentProduct: { select: { id: true, name: true, sku: true, price: true } },
          },
        },
      },
    });
    if (!product) throw new AppError(404, 'Product not found');
    res.json({ success: true, data: product.bundleComponents });
  } catch (err) {
    next(err);
  }
});

bundlesRouter.post('/:productId', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.productId, tenantId: req.user!.tenantId },
    });
    if (!product) throw new AppError(404, 'Product not found');
    if (product.id === req.body.componentProductId) throw new AppError(400, 'A product cannot bundle itself');

    const data = z
      .object({
        componentProductId: z.string(),
        componentVariantId: z.string().optional(),
        quantity: z.number().positive().default(1),
      })
      .parse(req.body);

    const component = await prisma.product.findFirst({
      where: { id: data.componentProductId, tenantId: req.user!.tenantId },
    });
    if (!component) throw new AppError(404, 'Component product not found');

    const bc = await prisma.bundleComponent.create({
      data: { bundleProductId: product.id, ...data },
      include: { componentProduct: { select: { id: true, name: true, sku: true, price: true } } },
    });
    res.status(201).json({ success: true, data: bc });
  } catch (err) {
    next(err);
  }
});

bundlesRouter.patch('/components/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const bc = await prisma.bundleComponent.findFirst({
      where: { id: req.params.id },
      include: { bundleProduct: { select: { tenantId: true } } },
    });
    if (!bc || bc.bundleProduct.tenantId !== req.user!.tenantId) throw new AppError(404, 'Bundle component not found');

    const { quantity } = z.object({ quantity: z.number().positive() }).parse(req.body);
    const updated = await prisma.bundleComponent.update({ where: { id: bc.id }, data: { quantity } });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

bundlesRouter.delete('/components/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const bc = await prisma.bundleComponent.findFirst({
      where: { id: req.params.id },
      include: { bundleProduct: { select: { tenantId: true } } },
    });
    if (!bc || bc.bundleProduct.tenantId !== req.user!.tenantId) throw new AppError(404, 'Bundle component not found');

    await prisma.bundleComponent.delete({ where: { id: bc.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
