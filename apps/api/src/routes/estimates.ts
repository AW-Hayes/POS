import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const estimatesRouter = Router();
estimatesRouter.use(authenticate);

const itemSchema = z.object({
  productId: z.string(),
  variantId: z.string().optional(),
  quantity: z.number().int().min(1),
  price: z.number().min(0).optional(),
  discount: z.number().min(0).default(0),
});

const createSchema = z.object({
  locationId: z.string(),
  customerId: z.string().optional(),
  items: z.array(itemSchema).min(1),
  notes: z.string().optional(),
  estimateExpiresAt: z.string().datetime().optional(),
});

async function buildOrderItems(tenantId: string, items: z.infer<typeof itemSchema>[], defaultTaxRate: number) {
  const result = [];
  for (const item of items) {
    const product = await prisma.product.findFirst({ where: { id: item.productId, tenantId, active: true } });
    if (!product) throw new AppError(400, `Product ${item.productId} not found`);
    const price = item.price ?? product.price;
    const taxRate = product.taxable ? defaultTaxRate : 0;
    const total = (price - item.discount) * item.quantity * (1 + taxRate / 100);
    result.push({ productId: item.productId, variantId: item.variantId, name: product.name, sku: product.sku, price, quantity: item.quantity, discount: item.discount, taxRate, total });
  }
  return result;
}

// List estimates
estimatesRouter.get('/', async (req, res, next) => {
  try {
    const estimates = await prisma.order.findMany({
      where: { tenantId: req.user!.tenantId, status: 'estimate' },
      include: {
        items: true,
        customer: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: estimates });
  } catch (err) {
    next(err);
  }
});

// Get single estimate
estimatesRouter.get('/:id', async (req, res, next) => {
  try {
    const estimate = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId, status: 'estimate' },
      include: { items: true, customer: true },
    });
    if (!estimate) throw new AppError(404, 'Estimate not found');
    res.json({ success: true, data: estimate });
  } catch (err) {
    next(err);
  }
});

// Create estimate
estimatesRouter.post('/', async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);

    const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const defaultTaxRate = Number(settings.taxRate ?? 0);

    const location = await prisma.location.findFirst({
      where: { id: data.locationId, tenantId: req.user!.tenantId, active: true },
    });
    if (!location) throw new AppError(400, 'Location not found');

    const orderItems = await buildOrderItems(req.user!.tenantId, data.items, defaultTaxRate);
    const subtotal = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
    const discountAmount = orderItems.reduce((s, i) => s + i.discount * i.quantity, 0);
    const taxAmount = orderItems.reduce((s, i) => s + (i.price - i.discount) * i.quantity * (i.taxRate / 100), 0);
    const total = subtotal - discountAmount + taxAmount;

    const estimate = await prisma.order.create({
      data: {
        tenantId: req.user!.tenantId,
        locationId: data.locationId,
        userId: req.user!.userId,
        customerId: data.customerId,
        status: 'estimate',
        subtotal,
        discountAmount,
        taxAmount,
        promotionDiscount: 0,
        total,
        notes: data.notes,
        estimateExpiresAt: data.estimateExpiresAt ? new Date(data.estimateExpiresAt) : null,
        items: { create: orderItems },
      },
      include: { items: true, customer: { select: { id: true, name: true } } },
    });

    res.status(201).json({ success: true, data: estimate });
  } catch (err) {
    next(err);
  }
});

// Update estimate items/notes/expiry
estimatesRouter.put('/:id', async (req, res, next) => {
  try {
    const estimate = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId, status: 'estimate' },
    });
    if (!estimate) throw new AppError(404, 'Estimate not found');

    const data = createSchema.partial().parse(req.body);

    const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const defaultTaxRate = Number(settings.taxRate ?? 0);

    let updateData: Record<string, unknown> = {
      customerId: data.customerId,
      notes: data.notes,
      estimateExpiresAt: data.estimateExpiresAt ? new Date(data.estimateExpiresAt) : undefined,
    };

    if (data.items) {
      const orderItems = await buildOrderItems(req.user!.tenantId, data.items, defaultTaxRate);
      const subtotal = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
      const discountAmount = orderItems.reduce((s, i) => s + i.discount * i.quantity, 0);
      const taxAmount = orderItems.reduce((s, i) => s + (i.price - i.discount) * i.quantity * (i.taxRate / 100), 0);
      updateData = { ...updateData, subtotal, discountAmount, taxAmount, total: subtotal - discountAmount + taxAmount };

      await prisma.orderItem.deleteMany({ where: { orderId: estimate.id } });
      await prisma.orderItem.createMany({ data: orderItems.map((i) => ({ ...i, orderId: estimate.id })) });
    }

    const updated = await prisma.order.update({
      where: { id: estimate.id },
      data: updateData,
      include: { items: true, customer: { select: { id: true, name: true } } },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// Convert estimate to completed order
estimatesRouter.post('/:id/convert', async (req, res, next) => {
  try {
    const paymentsSchema = z.object({
      payments: z.array(z.object({
        method: z.string(),
        amount: z.number().positive(),
        reference: z.string().optional(),
      })),
    });
    const { payments } = paymentsSchema.parse(req.body);

    const estimate = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId, status: 'estimate' },
      include: { items: true },
    });
    if (!estimate) throw new AppError(404, 'Estimate not found');

    const paidTotal = payments.reduce((s, p) => s + p.amount, 0);
    if (Math.abs(paidTotal - estimate.total) > 0.01) {
      throw new AppError(400, `Payment total ${paidTotal} does not match estimate total ${estimate.total}`);
    }

    const order = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: estimate.id },
        data: { status: 'completed', completedAt: new Date(), estimateExpiresAt: null },
      });
      await tx.payment.createMany({
        data: payments.map((p) => ({ orderId: estimate.id, method: p.method, amount: p.amount, reference: p.reference })),
      });
      return updated;
    });

    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});

// Delete (void) estimate
estimatesRouter.delete('/:id', async (req, res, next) => {
  try {
    const estimate = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId, status: 'estimate' },
    });
    if (!estimate) throw new AppError(404, 'Estimate not found');
    await prisma.order.update({ where: { id: estimate.id }, data: { status: 'voided' } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
