import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const heldOrdersRouter = Router();
heldOrdersRouter.use(authenticate);

// List held orders for this tenant
heldOrdersRouter.get('/', async (req, res, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: { tenantId: req.user!.tenantId, status: 'held' },
      include: {
        items: true,
        customer: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ success: true, data: orders });
  } catch (err) {
    next(err);
  }
});

// Hold an open order
heldOrdersRouter.post('/:id/hold', async (req, res, next) => {
  try {
    const { heldName } = z.object({ heldName: z.string().min(1) }).parse(req.body);

    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!order) throw new AppError(404, 'Order not found');
    if (order.status !== 'open') throw new AppError(400, 'Only open orders can be held');

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: 'held', heldName },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// Resume a held order (move back to open)
heldOrdersRouter.post('/:id/resume', async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!order) throw new AppError(404, 'Order not found');
    if (order.status !== 'held') throw new AppError(400, 'Order is not held');

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: 'open', heldName: null },
      include: { items: true },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// Delete a held order
heldOrdersRouter.delete('/:id', async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!order) throw new AppError(404, 'Order not found');
    if (order.status !== 'held') throw new AppError(400, 'Order is not held');

    await prisma.order.update({ where: { id: order.id }, data: { status: 'voided' } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
