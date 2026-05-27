import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { qs } from '../lib/qs';

export const cycleCountsRouter = Router();
cycleCountsRouter.use(authenticate);

cycleCountsRouter.get('/', async (req, res, next) => {
  try {
    const locationId = qs(req.query.locationId);
    const status = qs(req.query.status);

    const counts = await prisma.cycleCount.findMany({
      where: {
        tenantId: req.user!.tenantId,
        ...(locationId ? { locationId } : {}),
        ...(status ? { status } : {}),
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: counts });
  } catch (err) {
    next(err);
  }
});

cycleCountsRouter.get('/:id', async (req, res, next) => {
  try {
    const cc = await prisma.cycleCount.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: {
        items: {
          include: {
            // We'll join product data manually below
          },
        },
      },
    });
    if (!cc) throw new AppError(404, 'Cycle count not found');

    const productIds = [...new Set(cc.items.map((i) => i.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true },
    });
    const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

    const itemsWithProduct = cc.items.map((item) => ({
      ...item,
      product: productMap[item.productId] ?? null,
    }));

    res.json({ success: true, data: { ...cc, items: itemsWithProduct } });
  } catch (err) {
    next(err);
  }
});

cycleCountsRouter.post('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { locationId, name, notes, productIds } = z
      .object({
        locationId: z.string(),
        name: z.string().min(1),
        notes: z.string().optional(),
        productIds: z.array(z.string()).optional(),
      })
      .parse(req.body);

    const location = await prisma.location.findFirst({
      where: { id: locationId, tenantId: req.user!.tenantId },
    });
    if (!location) throw new AppError(404, 'Location not found');

    let items: Array<{ productId: string; variantId: string | null; expectedQty: number }> = [];

    if (productIds?.length) {
      const invItems = await prisma.inventoryItem.findMany({
        where: { locationId, productId: { in: productIds } },
      });
      items = invItems.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        expectedQty: i.quantity,
      }));
    } else {
      const invItems = await prisma.inventoryItem.findMany({
        where: { locationId },
      });
      items = invItems.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        expectedQty: i.quantity,
      }));
    }

    const cc = await prisma.cycleCount.create({
      data: {
        tenantId: req.user!.tenantId,
        locationId,
        name,
        notes,
        items: { create: items },
      },
      include: { items: true },
    });
    res.status(201).json({ success: true, data: cc });
  } catch (err) {
    next(err);
  }
});

cycleCountsRouter.patch('/:id/items/:itemId', async (req, res, next) => {
  try {
    const cc = await prisma.cycleCount.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId, status: 'open' },
    });
    if (!cc) throw new AppError(404, 'Cycle count not found or already closed');

    const { countedQty, note } = z
      .object({ countedQty: z.number().min(0), note: z.string().optional() })
      .parse(req.body);

    const item = await prisma.cycleCountItem.update({
      where: { id: req.params.itemId },
      data: { countedQty, note, countedAt: new Date() },
    });
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});

cycleCountsRouter.post('/:id/close', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const cc = await prisma.cycleCount.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId, status: 'open' },
      include: { items: true },
    });
    if (!cc) throw new AppError(404, 'Cycle count not found or already closed');

    const { applyAdjustments } = z
      .object({ applyAdjustments: z.boolean().default(true) })
      .parse(req.body);

    if (applyAdjustments) {
      for (const item of cc.items) {
        if (item.countedQty == null) continue;
        const delta = item.countedQty - item.expectedQty;
        if (delta === 0) continue;

        const invItem = await prisma.inventoryItem.findFirst({
          where: { locationId: cc.locationId, productId: item.productId, variantId: item.variantId ?? null },
        });
        if (!invItem) continue;

        const newQty = invItem.quantity + delta;
        await prisma.inventoryItem.update({
          where: { id: invItem.id },
          data: { quantity: newQty },
        });
        await prisma.inventoryAdjustment.create({
          data: {
            inventoryItemId: invItem.id,
            userId: req.user!.userId,
            type: 'cycle_count',
            delta,
            quantityAfter: newQty,
            note: `Cycle count: ${cc.name}`,
            reference: cc.id,
          },
        });
      }
    }

    const closed = await prisma.cycleCount.update({
      where: { id: cc.id },
      data: { status: 'closed', closedAt: new Date() },
      include: { items: true },
    });
    res.json({ success: true, data: closed });
  } catch (err) {
    next(err);
  }
});

cycleCountsRouter.delete('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const cc = await prisma.cycleCount.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId, status: 'open' },
    });
    if (!cc) throw new AppError(404, 'Cycle count not found or already closed');

    await prisma.cycleCount.delete({ where: { id: cc.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
