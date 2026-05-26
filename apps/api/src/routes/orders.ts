import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { adjustInventory } from './inventory';
import { qs } from '../lib/qs';

export const ordersRouter = Router();
ordersRouter.use(authenticate);

const orderInclude = {
  customer: { select: { id: true, name: true, email: true } },
  items: true,
  payments: true,
  user: { select: { id: true, name: true } },
};

ordersRouter.get('/', async (req, res, next) => {
  try {
    const locationId = qs(req.query.locationId);
    const status = qs(req.query.status);
    const customerId = qs(req.query.customerId);
    const page = Number(qs(req.query.page) ?? '1');
    const pageSize = Number(qs(req.query.pageSize) ?? '50');
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId: req.user!.tenantId,
      ...(locationId ? { locationId } : {}),
      ...(status ? { status } : {}),
      ...(customerId ? { customerId } : {}),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.order.count({ where }),
    ]);

    res.json({ success: true, data: orders, total, page, pageSize, pageCount: Math.ceil(total / pageSize) });
  } catch (err) {
    next(err);
  }
});

const createOrderSchema = z.object({
  locationId: z.string(),
  sessionId: z.string().optional(),
  customerId: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    productId: z.string(),
    variantId: z.string().optional(),
    quantity: z.number().positive(),
    price: z.number().min(0).optional(),
    discount: z.number().min(0).default(0),
  })).min(1),
});

ordersRouter.post('/', async (req, res, next) => {
  try {
    const data = createOrderSchema.parse(req.body);

    const location = await prisma.location.findFirst({
      where: { id: data.locationId, tenantId: req.user!.tenantId },
    });
    if (!location) throw new AppError(404, 'Location not found');

    const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });
    const tenantSettings = tenant?.settings as Record<string, unknown>;
    const defaultTaxRate = Number(tenantSettings?.taxRate ?? 0);

    const productIds = [...new Set(data.items.map((i) => i.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, tenantId: req.user!.tenantId, active: true },
      include: { variants: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    let taxAmount = 0;
    let discountAmount = 0;

    const orderItems = data.items.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) throw new AppError(400, `Product ${item.productId} not found`);

      const variant = item.variantId ? product.variants.find((v) => v.id === item.variantId) : undefined;
      if (item.variantId && !variant) throw new AppError(400, `Variant ${item.variantId} not found`);

      const unitPrice = item.price ?? variant?.price ?? product.price;
      const taxRate = product.taxable ? defaultTaxRate : 0;
      const lineDiscount = item.discount * item.quantity;
      const lineSubtotal = unitPrice * item.quantity - lineDiscount;
      const lineTax = lineSubtotal * taxRate;
      const lineTotal = lineSubtotal + lineTax;

      subtotal += lineSubtotal;
      taxAmount += lineTax;
      discountAmount += lineDiscount;

      return {
        productId: item.productId,
        variantId: item.variantId,
        name: product.name,
        sku: variant?.sku ?? product.sku ?? undefined,
        price: unitPrice,
        quantity: item.quantity,
        discount: item.discount,
        taxRate,
        total: lineTotal,
      };
    });

    const order = await prisma.order.create({
      data: {
        tenantId: req.user!.tenantId,
        locationId: data.locationId,
        sessionId: data.sessionId,
        userId: req.user!.userId,
        customerId: data.customerId,
        notes: data.notes,
        status: 'open',
        subtotal,
        taxAmount,
        discountAmount,
        total: subtotal + taxAmount,
        items: { create: orderItems },
      },
      include: orderInclude,
    });

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});

ordersRouter.get('/:id', async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: orderInclude,
    });
    if (!order) throw new AppError(404, 'Order not found');
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});

const completeOrderSchema = z.object({
  payments: z.array(z.object({
    method: z.enum(['cash', 'card', 'store_credit', 'other']),
    amount: z.number().positive(),
    reference: z.string().optional(),
  })).min(1),
});

ordersRouter.post('/:id/complete', async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { items: true },
    });
    if (!order) throw new AppError(404, 'Order not found');
    if (order.status !== 'open') throw new AppError(400, `Order is ${order.status}`);

    const { payments } = completeOrderSchema.parse(req.body);
    const amountPaid = payments.reduce((s, p) => s + p.amount, 0);
    if (amountPaid < order.total) {
      throw new AppError(400, `Insufficient payment: ${amountPaid} < ${order.total}`);
    }

    const completed = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          payments: { create: payments },
        },
        include: orderInclude,
      });

      const trackedProducts = await tx.product.findMany({
        where: {
          id: { in: order.items.map((i) => i.productId).filter((id): id is string => id != null) },
          trackInventory: true,
        },
        select: { id: true },
      });
      const trackedIds = new Set(trackedProducts.map((p) => p.id));

      await Promise.all(
        order.items
          .filter((item) => item.productId && trackedIds.has(item.productId))
          .map((item) =>
            adjustInventory({
              locationId: order.locationId,
              productId: item.productId!,
              variantId: item.variantId ?? undefined,
              type: 'sale',
              delta: -item.quantity,
              reference: order.id,
              userId: req.user!.userId,
            }),
          ),
      );

      return updated;
    });

    res.json({ success: true, data: completed });
  } catch (err) {
    next(err);
  }
});

ordersRouter.post('/:id/void', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { items: true },
    });
    if (!order) throw new AppError(404, 'Order not found');
    if (!['open', 'completed'].includes(order.status)) {
      throw new AppError(400, `Cannot void a ${order.status} order`);
    }

    const { note } = z.object({ note: z.string().optional() }).parse(req.body);

    const voided = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: order.id },
        data: { status: 'voided' },
        include: orderInclude,
      });

      if (order.status === 'completed') {
        const trackedProducts = await tx.product.findMany({
          where: {
            id: { in: order.items.map((i) => i.productId).filter((id): id is string => id != null) },
            trackInventory: true,
          },
          select: { id: true },
        });
        const trackedIds = new Set(trackedProducts.map((p) => p.id));

        await Promise.all(
          order.items
            .filter((item) => item.productId && trackedIds.has(item.productId))
            .map((item) =>
              adjustInventory({
                locationId: order.locationId,
                productId: item.productId!,
                variantId: item.variantId ?? undefined,
                type: 'return',
                delta: item.quantity,
                reference: order.id,
                note,
                userId: req.user!.userId,
              }),
            ),
        );
      }

      return updated;
    });

    res.json({ success: true, data: voided });
  } catch (err) {
    next(err);
  }
});
