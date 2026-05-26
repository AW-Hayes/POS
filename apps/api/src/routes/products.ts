import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { qs } from '../lib/qs';

export const productsRouter = Router();
productsRouter.use(authenticate);

const productSchema = z.object({
  categoryId: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  price: z.number().min(0),
  cost: z.number().min(0).optional(),
  taxable: z.boolean().default(true),
  trackInventory: z.boolean().default(true),
  imageUrl: z.string().url().optional(),
  sortOrder: z.number().int().optional(),
  requiresAgeVerification: z.boolean().default(false),
  minAge: z.number().int().min(1).optional(),
});

const productInclude = {
  category: { select: { id: true, name: true, color: true } },
  attributes: { include: { attribute: true } },
  variants: {
    where: { active: true },
    include: { attributeValues: { include: { productAttribute: { include: { attribute: true } } } } },
    orderBy: { sortOrder: 'asc' as const },
  },
};

productsRouter.get('/', async (req, res, next) => {
  try {
    const q = qs(req.query.q);
    const categoryId = qs(req.query.categoryId);
    const activeParam = qs(req.query.active) ?? 'true';
    const page = Number(qs(req.query.page) ?? '1');
    const pageSize = Math.min(Number(qs(req.query.pageSize) ?? '50'), 200);
    const skip = (page - 1) * pageSize;

    const sku = qs(req.query.sku);
    const barcode = qs(req.query.barcode);

    const where = {
      tenantId: req.user!.tenantId,
      active: activeParam === 'true',
      ...(categoryId ? { categoryId } : {}),
      ...(sku ? { sku } : {}),
      ...(barcode ? { barcode } : {}),
      ...(q && !sku && !barcode ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip,
        take: pageSize,
      }),
      prisma.product.count({ where }),
    ]);

    res.json({ success: true, data: products, total, page, pageSize, pageCount: Math.ceil(total / pageSize) });
  } catch (err) {
    next(err);
  }
});

productsRouter.post('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const data = productSchema.parse(req.body);
    const product = await prisma.product.create({
      data: { ...data, tenantId: req.user!.tenantId },
      include: productInclude,
    });
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
});

productsRouter.get('/lookup', async (req, res, next) => {
  try {
    const barcode = qs(req.query.barcode);
    const sku = qs(req.query.sku);
    if (!barcode && !sku) throw new AppError(400, 'Provide barcode or sku');

    const product = await prisma.product.findFirst({
      where: {
        tenantId: req.user!.tenantId,
        active: true,
        ...(barcode ? { barcode } : {}),
        ...(sku ? { sku } : {}),
      },
      include: productInclude,
    });

    if (!product) {
      const variant = await prisma.productVariant.findFirst({
        where: {
          active: true,
          product: { tenantId: req.user!.tenantId, active: true },
          ...(barcode ? { barcode } : {}),
          ...(sku ? { sku } : {}),
        },
        include: { product: { include: productInclude } },
      });
      if (!variant) throw new AppError(404, 'Product not found');
      res.json({ success: true, data: variant.product, variantId: variant.id });
      return;
    }

    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
});

productsRouter.get('/:id', async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: productInclude,
    });
    if (!product) throw new AppError(404, 'Product not found');
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
});

productsRouter.patch('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!existing) throw new AppError(404, 'Product not found');
    const data = productSchema.partial().parse(req.body);
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data,
      include: productInclude,
    });
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
});

productsRouter.delete('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!existing) throw new AppError(404, 'Product not found');
    await prisma.product.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── Variants ────────────────────────────────────────────────────────────────

const variantSchema = z.object({
  sku: z.string().optional(),
  barcode: z.string().optional(),
  price: z.number().min(0).optional(),
  cost: z.number().min(0).optional(),
  sortOrder: z.number().int().optional(),
  attributeValues: z.array(z.object({ productAttributeId: z.string(), value: z.string() })).optional(),
});

productsRouter.post('/:id/variants', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!product) throw new AppError(404, 'Product not found');

    const { attributeValues, ...variantData } = variantSchema.parse(req.body);
    const variant = await prisma.productVariant.create({
      data: {
        ...variantData,
        productId: req.params.id,
        ...(attributeValues ? { attributeValues: { create: attributeValues } } : {}),
      },
      include: { attributeValues: { include: { productAttribute: { include: { attribute: true } } } } },
    });
    res.status(201).json({ success: true, data: variant });
  } catch (err) {
    next(err);
  }
});

productsRouter.post('/:id/variants/generate', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { attributes: { include: { attribute: true } } },
    });
    if (!product) throw new AppError(404, 'Product not found');

    const { attributeValues } = z
      .object({ attributeValues: z.record(z.array(z.string())) })
      .parse(req.body);

    const attrDefIds = Object.keys(attributeValues);
    const productAttributes = await Promise.all(
      attrDefIds.map(async (attrId) => {
        const existing = product.attributes.find((pa) => pa.attributeId === attrId);
        if (existing) return existing;
        return prisma.productAttribute.create({
          data: { productId: req.params.id, attributeId: attrId },
        });
      }),
    );

    const combinations = cartesian(
      attrDefIds.map((id, i) =>
        attributeValues[id].map((val) => ({ productAttributeId: productAttributes[i].id, value: val })),
      ),
    );

    if (combinations.length > 500) {
      throw new AppError(400, `Variant generation would produce ${combinations.length} variants (max 500)`);
    }

    const created = await Promise.all(
      combinations.map((combo) =>
        prisma.productVariant.create({
          data: {
            productId: req.params.id,
            attributeValues: { create: combo },
          },
          include: { attributeValues: { include: { productAttribute: { include: { attribute: true } } } } },
        }),
      ),
    );

    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
});

productsRouter.patch('/:id/variants/:variantId', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const variant = await prisma.productVariant.findFirst({
      where: { id: req.params.variantId, productId: req.params.id },
    });
    if (!variant) throw new AppError(404, 'Variant not found');

    const data = variantSchema.omit({ attributeValues: true }).partial().parse(req.body);
    const updated = await prisma.productVariant.update({
      where: { id: req.params.variantId },
      data,
      include: { attributeValues: { include: { productAttribute: { include: { attribute: true } } } } },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

function cartesian<T>(arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>(
    (acc, arr) => acc.flatMap((combo) => arr.map((item) => [...combo, item])),
    [[]],
  );
}
