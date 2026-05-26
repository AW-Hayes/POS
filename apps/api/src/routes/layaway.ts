import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const layawayRouter = Router();
layawayRouter.use(authenticate);

// List layaway orders for this tenant
layawayRouter.get('/', async (req, res, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: { tenantId: req.user!.tenantId, status: 'layaway' },
      include: {
        items: true,
        customer: { select: { id: true, name: true, phone: true, email: true } },
        layawayDeposits: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: orders });
  } catch (err) {
    next(err);
  }
});

// Convert an open order to layaway (inventory is already deducted at order create time for completed orders;
// for layaway we deduct now since we're holding the item).
layawayRouter.post('/:id/convert', async (req, res, next) => {
  try {
    const { depositAmount, depositMethod, reference } = z
      .object({
        depositAmount: z.number().min(0),
        depositMethod: z.string().default('cash'),
        reference: z.string().optional(),
      })
      .parse(req.body);

    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { items: true },
    });
    if (!order) throw new AppError(404, 'Order not found');
    if (!['open', 'estimate'].includes(order.status)) throw new AppError(400, 'Order must be open or estimate to convert to layaway');

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: order.id },
        data: { status: 'layaway' },
      });

      let deposit = null;
      if (depositAmount > 0) {
        deposit = await tx.layawayDeposit.create({
          data: {
            orderId: order.id,
            userId: req.user!.userId,
            amount: depositAmount,
            method: depositMethod,
            reference,
          },
        });
      }
      return { order: updated, deposit };
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// Add a deposit payment to a layaway order
layawayRouter.post('/:id/deposits', async (req, res, next) => {
  try {
    const { amount, method, reference, note } = z
      .object({
        amount: z.number().positive(),
        method: z.string().default('cash'),
        reference: z.string().optional(),
        note: z.string().optional(),
      })
      .parse(req.body);

    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId, status: 'layaway' },
    });
    if (!order) throw new AppError(404, 'Layaway order not found');

    const deposit = await prisma.layawayDeposit.create({
      data: { orderId: order.id, userId: req.user!.userId, amount, method, reference, note },
    });
    res.status(201).json({ success: true, data: deposit });
  } catch (err) {
    next(err);
  }
});

// Get deposits for a layaway order
layawayRouter.get('/:id/deposits', async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId, status: 'layaway' },
    });
    if (!order) throw new AppError(404, 'Layaway order not found');

    const deposits = await prisma.layawayDeposit.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ success: true, data: deposits });
  } catch (err) {
    next(err);
  }
});

// Complete layaway (pay off remainder and close order)
layawayRouter.post('/:id/complete', async (req, res, next) => {
  try {
    const { finalPaymentMethod, reference } = z
      .object({
        finalPaymentMethod: z.string().default('cash'),
        reference: z.string().optional(),
      })
      .parse(req.body);

    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId, status: 'layaway' },
      include: { layawayDeposits: true },
    });
    if (!order) throw new AppError(404, 'Layaway order not found');

    const paidSoFar = order.layawayDeposits.reduce((s, d) => s + d.amount, 0);
    const remaining = Math.max(0, order.total - paidSoFar);

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: 'completed', completedAt: new Date() },
      });
      // Record all deposits as payments
      for (const d of order.layawayDeposits) {
        await tx.payment.create({ data: { orderId: order.id, method: d.method, amount: d.amount, reference: d.reference ?? undefined } });
      }
      // Record final payment if any balance remains
      if (remaining > 0.01) {
        await tx.payment.create({ data: { orderId: order.id, method: finalPaymentMethod, amount: remaining, reference } });
      }
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Cancel layaway (restore inventory if applicable)
layawayRouter.post('/:id/cancel', async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId, status: 'layaway' },
      include: { layawayDeposits: true },
    });
    if (!order) throw new AppError(404, 'Layaway order not found');

    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'voided' },
    });

    res.json({ success: true, refundDue: order.layawayDeposits.reduce((s, d) => s + d.amount, 0) });
  } catch (err) {
    next(err);
  }
});
