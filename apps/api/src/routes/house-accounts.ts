import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const houseAccountsRouter = Router();
houseAccountsRouter.use(authenticate);

// Get AR balance and statement for a customer
houseAccountsRouter.get('/customers/:customerId', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.customerId, tenantId: req.user!.tenantId },
      select: { id: true, name: true, arBalance: true, creditLimit: true },
    });
    if (!customer) throw new AppError(404, 'Customer not found');

    // Orders charged to house account (payments with method = 'house_account')
    const charges = await prisma.payment.findMany({
      where: {
        method: 'house_account',
        order: { customerId: customer.id, tenantId: req.user!.tenantId },
      },
      include: { order: { select: { id: true, createdAt: true, total: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({ success: true, data: { ...customer, charges } });
  } catch (err) {
    next(err);
  }
});

// Charge an order to house account
houseAccountsRouter.post('/customers/:customerId/charge', async (req, res, next) => {
  try {
    const { orderId, amount } = z
      .object({ orderId: z.string(), amount: z.number().positive() })
      .parse(req.body);

    const customer = await prisma.customer.findFirst({
      where: { id: req.params.customerId, tenantId: req.user!.tenantId },
    });
    if (!customer) throw new AppError(404, 'Customer not found');

    const newBalance = customer.arBalance + amount;
    if (customer.creditLimit != null && newBalance > customer.creditLimit) {
      throw new AppError(400, `Charge would exceed credit limit of ${customer.creditLimit}`);
    }

    const [payment] = await prisma.$transaction([
      prisma.payment.create({
        data: { orderId, method: 'house_account', amount },
      }),
      prisma.customer.update({
        where: { id: customer.id },
        data: { arBalance: { increment: amount } },
      }),
    ]);

    res.status(201).json({ success: true, data: payment });
  } catch (err) {
    next(err);
  }
});

// Record a payment toward the AR balance (e.g., monthly settlement)
houseAccountsRouter.post('/customers/:customerId/pay', async (req, res, next) => {
  try {
    const { amount, method, reference } = z
      .object({
        amount: z.number().positive(),
        method: z.string().default('cash'),
        reference: z.string().optional(),
      })
      .parse(req.body);

    const customer = await prisma.customer.findFirst({
      where: { id: req.params.customerId, tenantId: req.user!.tenantId },
    });
    if (!customer) throw new AppError(404, 'Customer not found');
    if (amount > customer.arBalance) throw new AppError(400, 'Payment exceeds outstanding balance');

    await prisma.customer.update({
      where: { id: customer.id },
      data: { arBalance: { decrement: amount } },
    });

    res.json({ success: true, data: { paid: amount, newBalance: customer.arBalance - amount, method, reference } });
  } catch (err) {
    next(err);
  }
});

// Update credit limit
houseAccountsRouter.put('/customers/:customerId/credit-limit', async (req, res, next) => {
  try {
    const { creditLimit } = z
      .object({ creditLimit: z.number().min(0).nullable() })
      .parse(req.body);

    const customer = await prisma.customer.findFirst({
      where: { id: req.params.customerId, tenantId: req.user!.tenantId },
    });
    if (!customer) throw new AppError(404, 'Customer not found');

    const updated = await prisma.customer.update({
      where: { id: customer.id },
      data: { creditLimit },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});
