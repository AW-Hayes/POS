import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const loyaltyRouter = Router();
loyaltyRouter.use(authenticate);

// Get customer loyalty balance and recent transactions
loyaltyRouter.get('/customers/:customerId', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.customerId, tenantId: req.user!.tenantId },
      select: { id: true, name: true, loyaltyPoints: true },
    });
    if (!customer) throw new AppError(404, 'Customer not found');

    const transactions = await prisma.loyaltyTransaction.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ success: true, data: { ...customer, transactions } });
  } catch (err) {
    next(err);
  }
});

// Manually adjust loyalty points (admin/manager)
loyaltyRouter.post('/customers/:customerId/adjust', async (req, res, next) => {
  try {
    const { points, note } = z
      .object({ points: z.number(), note: z.string().optional() })
      .parse(req.body);

    const customer = await prisma.customer.findFirst({
      where: { id: req.params.customerId, tenantId: req.user!.tenantId },
    });
    if (!customer) throw new AppError(404, 'Customer not found');

    const [, transaction] = await prisma.$transaction([
      prisma.customer.update({
        where: { id: customer.id },
        data: { loyaltyPoints: { increment: points } },
      }),
      prisma.loyaltyTransaction.create({
        data: {
          customerId: customer.id,
          userId: req.user!.userId,
          type: 'adjust',
          points,
          note,
        },
      }),
    ]);

    res.json({ success: true, data: transaction });
  } catch (err) {
    next(err);
  }
});

// Earn points for a completed order
loyaltyRouter.post('/orders/:orderId/earn', async (req, res, next) => {
  try {
    const { pointsPerDollar = 1 } = z
      .object({ pointsPerDollar: z.number().positive().optional() })
      .parse(req.body);

    const order = await prisma.order.findFirst({
      where: { id: req.params.orderId, tenantId: req.user!.tenantId, status: 'completed' },
    });
    if (!order) throw new AppError(404, 'Completed order not found');
    if (!order.customerId) throw new AppError(400, 'Order has no customer');

    const earned = Math.floor(order.total * pointsPerDollar);
    if (earned <= 0) return res.json({ success: true, data: { earned: 0 } });

    const [, transaction] = await prisma.$transaction([
      prisma.customer.update({
        where: { id: order.customerId },
        data: { loyaltyPoints: { increment: earned } },
      }),
      prisma.loyaltyTransaction.create({
        data: {
          customerId: order.customerId,
          userId: req.user!.userId,
          orderId: order.id,
          type: 'earn',
          points: earned,
          note: `Earned on order ${order.id.slice(-8).toUpperCase()}`,
        },
      }),
    ]);

    res.json({ success: true, data: { earned, transaction } });
  } catch (err) {
    next(err);
  }
});

// Redeem points for a discount
loyaltyRouter.post('/customers/:customerId/redeem', async (req, res, next) => {
  try {
    const { points, orderId } = z
      .object({ points: z.number().positive(), orderId: z.string().optional() })
      .parse(req.body);

    const customer = await prisma.customer.findFirst({
      where: { id: req.params.customerId, tenantId: req.user!.tenantId },
    });
    if (!customer) throw new AppError(404, 'Customer not found');
    if (customer.loyaltyPoints < points) throw new AppError(400, 'Insufficient loyalty points');

    const [, transaction] = await prisma.$transaction([
      prisma.customer.update({
        where: { id: customer.id },
        data: { loyaltyPoints: { decrement: points } },
      }),
      prisma.loyaltyTransaction.create({
        data: {
          customerId: customer.id,
          userId: req.user!.userId,
          orderId,
          type: 'redeem',
          points: -points,
          note: 'Points redeemed',
        },
      }),
    ]);

    res.json({ success: true, data: transaction });
  } catch (err) {
    next(err);
  }
});
