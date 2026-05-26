import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const returnsRouter = Router();
returnsRouter.use(authenticate);

const createReturnSchema = z.object({
  orderId: z.string(),
  reason: z.string().optional(),
  items: z.array(z.object({
    orderItemId: z.string(),
    quantity: z.number().positive(),
  })).min(1),
  refunds: z.array(z.object({
    method: z.enum(['cash', 'card', 'store_credit', 'gift_card']),
    amount: z.number().positive(),
    reference: z.string().optional(),
  })).min(1),
});

returnsRouter.post('/', async (req, res, next) => {
  try {
    const data = createReturnSchema.parse(req.body);

    const order = await prisma.order.findFirst({
      where: { id: data.orderId, tenantId: req.user!.tenantId },
      include: { items: true },
    });
    if (!order) throw new AppError(404, 'Order not found');
    if (!['completed', 'open'].includes(order.status)) {
      throw new AppError(400, `Cannot return a ${order.status} order`);
    }

    // Validate order items exist (fast pre-check before taking the transaction)
    for (const ri of data.items) {
      if (!order.items.find((i) => i.id === ri.orderItemId)) {
        throw new AppError(400, `Order item ${ri.orderItemId} not found`);
      }
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });
    const defaultTaxRate = Number((tenant?.settings as Record<string, unknown>)?.taxRate ?? 0);

    const totalRefund = data.refunds.reduce((s, r) => s + r.amount, 0);

    const orderReturn = await prisma.$transaction(async (tx) => {
      // Validate quantities inside the transaction to prevent concurrent over-returns
      for (const ri of data.items) {
        const orderItem = order.items.find((i) => i.id === ri.orderItemId)!;
        const previouslyReturned = await tx.orderReturnItem.aggregate({
          where: { orderItemId: ri.orderItemId },
          _sum: { quantity: true },
        });
        const alreadyReturned = previouslyReturned._sum.quantity ?? 0;
        if (alreadyReturned + ri.quantity > orderItem.quantity) {
          throw new AppError(400, `Cannot return more than ordered for item "${orderItem.name}"`);
        }
      }

      let subtotal = 0;
      let taxAmount = 0;

      const returnItems = data.items.map((ri) => {
        const orderItem = order.items.find((i) => i.id === ri.orderItemId)!;
        const lineSubtotal = orderItem.price * ri.quantity;
        const lineTax = lineSubtotal * (orderItem.taxRate || defaultTaxRate);
        subtotal += lineSubtotal;
        taxAmount += lineTax;
        return {
          orderItemId: ri.orderItemId,
          quantity: ri.quantity,
          price: orderItem.price,
          taxRate: orderItem.taxRate,
          total: lineSubtotal + lineTax,
        };
      });

      if (Math.abs(totalRefund - (subtotal + taxAmount)) > 0.01) {
        throw new AppError(400, `Refund total (${totalRefund}) does not match return total (${subtotal + taxAmount})`);
      }

      const ret = await tx.orderReturn.create({
        data: {
          orderId: data.orderId,
          userId: req.user!.userId,
          reason: data.reason,
          subtotal,
          taxAmount,
          total: subtotal + taxAmount,
          items: { create: returnItems },
          refunds: { create: data.refunds },
        },
        include: { items: true, refunds: true },
      });

      // Restore inventory for returned items
      for (const ri of data.items) {
        const orderItem = order.items.find((i) => i.id === ri.orderItemId)!;
        if (!orderItem.productId) continue;

        const inv = await tx.inventoryItem.findFirst({
          where: { locationId: order.locationId, productId: orderItem.productId, variantId: orderItem.variantId ?? null },
        });
        if (inv) {
          const newQty = inv.quantity + ri.quantity;
          await tx.inventoryItem.update({
            where: { id: inv.id },
            data: { quantity: newQty },
          });
          await tx.inventoryAdjustment.create({
            data: {
              inventoryItemId: inv.id,
              userId: req.user!.userId,
              type: 'return',
              delta: ri.quantity,
              quantityAfter: newQty,
              reference: `return:${ret.id}`,
            },
          });
        }
      }

      // Mark order as refunded if fully returned
      const allReturned = await tx.orderReturnItem.groupBy({
        by: ['orderItemId'],
        where: { return: { orderId: data.orderId } },
        _sum: { quantity: true },
      });
      const fullyReturned = order.items.every((oi) => {
        const returnedQty = allReturned.find((r) => r.orderItemId === oi.id)?._sum.quantity ?? 0;
        return returnedQty >= oi.quantity;
      });
      if (fullyReturned) {
        await tx.order.update({ where: { id: data.orderId }, data: { status: 'refunded' } });
      }

      return ret;
    });

    res.status(201).json({ success: true, data: orderReturn });
  } catch (err) {
    next(err);
  }
});

returnsRouter.get('/order/:orderId', async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.orderId, tenantId: req.user!.tenantId },
    });
    if (!order) throw new AppError(404, 'Order not found');

    const returns = await prisma.orderReturn.findMany({
      where: { orderId: req.params.orderId },
      include: { items: true, refunds: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: returns });
  } catch (err) {
    next(err);
  }
});
