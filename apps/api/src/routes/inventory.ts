import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { qs } from '../lib/qs';

export const inventoryRouter = Router();
inventoryRouter.use(authenticate);

const adjustmentTypeValues = [
  'sale', 'return', 'purchase', 'adjustment',
  'transfer_in', 'transfer_out', 'damage', 'shrinkage',
] as const;

inventoryRouter.get('/', async (req, res, next) => {
  try {
    const locationId = qs(req.query.locationId);
    const productId = qs(req.query.productId);
    const lowStock = qs(req.query.lowStock) === 'true';
    const page = Number(qs(req.query.page) ?? '1');
    const pageSize = Number(qs(req.query.pageSize) ?? '50');
    const skip = (page - 1) * pageSize;

    const where = {
      location: { tenantId: req.user!.tenantId },
      ...(locationId ? { locationId } : {}),
      ...(productId ? { productId } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true, barcode: true, imageUrl: true } },
          variant: {
            include: {
              attributeValues: { include: { productAttribute: { include: { attribute: true } } } },
            },
          },
        },
        orderBy: { product: { name: 'asc' } },
        skip,
        take: pageSize,
      }),
      prisma.inventoryItem.count({ where }),
    ]);

    const filtered = lowStock
      ? items.filter((i) => i.lowStockAt != null && i.quantity <= i.lowStockAt)
      : items;

    res.json({ success: true, data: filtered, total, page, pageSize, pageCount: Math.ceil(total / pageSize) });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/:locationId/:productId', async (req, res, next) => {
  try {
    const variantId = qs(req.query.variantId) ?? null;
    const item = await prisma.inventoryItem.findFirst({
      where: {
        locationId: req.params.locationId,
        productId: req.params.productId,
        variantId,
        location: { tenantId: req.user!.tenantId },
      },
      include: { adjustments: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    if (!item) throw new AppError(404, 'Inventory item not found');
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/adjust', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const schema = z.object({
      locationId: z.string(),
      productId: z.string(),
      variantId: z.string().optional(),
      type: z.enum(adjustmentTypeValues),
      delta: z.number(),
      note: z.string().optional(),
    });
    const data = schema.parse(req.body);

    const location = await prisma.location.findFirst({
      where: { id: data.locationId, tenantId: req.user!.tenantId },
    });
    if (!location) throw new AppError(404, 'Location not found');

    const result = await adjustInventory({ ...data, userId: req.user!.userId });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/transfer', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const schema = z.object({
      fromLocationId: z.string(),
      toLocationId: z.string(),
      items: z.array(z.object({
        productId: z.string(),
        variantId: z.string().optional(),
        quantity: z.number().positive(),
      })),
      note: z.string().optional(),
    });
    const data = schema.parse(req.body);

    const [from, to] = await Promise.all([
      prisma.location.findFirst({ where: { id: data.fromLocationId, tenantId: req.user!.tenantId } }),
      prisma.location.findFirst({ where: { id: data.toLocationId, tenantId: req.user!.tenantId } }),
    ]);
    if (!from) throw new AppError(404, 'Source location not found');
    if (!to) throw new AppError(404, 'Destination location not found');

    const results = await Promise.all(
      data.items.map(async (item) => {
        const [out, into] = await Promise.all([
          adjustInventory({
            locationId: data.fromLocationId,
            productId: item.productId,
            variantId: item.variantId,
            type: 'transfer_out',
            delta: -item.quantity,
            note: data.note,
            userId: req.user!.userId,
          }),
          adjustInventory({
            locationId: data.toLocationId,
            productId: item.productId,
            variantId: item.variantId,
            type: 'transfer_in',
            delta: item.quantity,
            note: data.note,
            userId: req.user!.userId,
          }),
        ]);
        return { from: out, to: into };
      }),
    );

    res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/adjustments', async (req, res, next) => {
  try {
    const locationId = qs(req.query.locationId);
    const productId = qs(req.query.productId);
    const type = qs(req.query.type);
    const page = Number(qs(req.query.page) ?? '1');
    const pageSize = Number(qs(req.query.pageSize) ?? '50');
    const skip = (page - 1) * pageSize;

    const adjustments = await prisma.inventoryAdjustment.findMany({
      where: {
        inventoryItem: {
          location: { tenantId: req.user!.tenantId },
          ...(locationId ? { locationId } : {}),
          ...(productId ? { productId } : {}),
        },
        ...(type ? { type } : {}),
      },
      include: {
        inventoryItem: {
          include: { product: { select: { id: true, name: true, sku: true } } },
        },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    });

    res.json({ success: true, data: adjustments });
  } catch (err) {
    next(err);
  }
});

// ─── Shared helper ────────────────────────────────────────────────────────────

export async function adjustInventory(params: {
  locationId: string;
  productId: string;
  variantId?: string;
  type: typeof adjustmentTypeValues[number];
  delta: number;
  note?: string;
  reference?: string;
  userId?: string;
}) {
  const { locationId, productId, variantId, type, delta, note, reference, userId } = params;

  return prisma.$transaction(async (tx) => {
    // Use findFirst + create to handle nullable variantId in compound unique
    let item = await tx.inventoryItem.findFirst({
      where: { locationId, productId, variantId: variantId ?? null },
    });

    if (!item) {
      item = await tx.inventoryItem.create({
        data: { locationId, productId, variantId: variantId ?? null, quantity: 0 },
      });
    }

    const quantityAfter = item.quantity + delta;

    const [updated] = await Promise.all([
      tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: quantityAfter },
      }),
      tx.inventoryAdjustment.create({
        data: { inventoryItemId: item.id, type, delta, quantityAfter, note, reference, userId },
      }),
    ]);

    return updated;
  });
}
