import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { qs } from '../lib/qs';

export const sessionsRouter = Router();
sessionsRouter.use(authenticate);

sessionsRouter.get('/', async (req, res, next) => {
  try {
    const registerId = qs(req.query.registerId);
    const open = qs(req.query.open);

    const sessions = await prisma.registerSession.findMany({
      where: {
        register: { location: { tenantId: req.user!.tenantId } },
        ...(registerId ? { registerId } : {}),
        ...(open === 'true' ? { closedAt: null } : {}),
      },
      include: { register: { select: { id: true, name: true } }, user: { select: { id: true, name: true } } },
      orderBy: { openedAt: 'desc' },
      take: 50,
    });

    res.json({ success: true, data: sessions });
  } catch (err) {
    next(err);
  }
});

sessionsRouter.post('/open', async (req, res, next) => {
  try {
    const { registerId, openingCash } = z.object({
      registerId: z.string(),
      openingCash: z.number().min(0).default(0),
    }).parse(req.body);

    const register = await prisma.register.findFirst({
      where: { id: registerId, location: { tenantId: req.user!.tenantId } },
    });
    if (!register) throw new AppError(404, 'Register not found');

    const existing = await prisma.registerSession.findFirst({
      where: { registerId, closedAt: null },
    });
    if (existing) throw new AppError(400, 'Register already has an open session');

    const session = await prisma.registerSession.create({
      data: { registerId, userId: req.user!.userId, openingCash },
      include: { register: { select: { id: true, name: true } } },
    });

    res.status(201).json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

sessionsRouter.post('/:id/close', async (req, res, next) => {
  try {
    const { closingCash, closingNotes } = z.object({
      closingCash: z.number().min(0),
      closingNotes: z.string().optional(),
    }).parse(req.body);

    const session = await prisma.registerSession.findFirst({
      where: {
        id: req.params.id,
        register: { location: { tenantId: req.user!.tenantId } },
      },
      include: { orders: { include: { payments: true } } },
    });
    if (!session) throw new AppError(404, 'Session not found');
    if (session.closedAt) throw new AppError(400, 'Session is already closed');

    // Calculate expected cash: opening + all cash payments from session orders
    const cashIn = session.orders
      .flatMap((o) => o.payments)
      .filter((p) => p.method === 'cash')
      .reduce((s, p) => s + p.amount, 0);
    const expectedCash = session.openingCash + cashIn;

    const closed = await prisma.registerSession.update({
      where: { id: session.id },
      data: {
        closedAt: new Date(),
        closingCash,
        expectedCash,
        closingNotes,
      },
    });

    res.json({
      success: true,
      data: {
        ...closed,
        expectedCash,
        variance: closingCash - expectedCash,
      },
    });
  } catch (err) {
    next(err);
  }
});

sessionsRouter.get('/:id', async (req, res, next) => {
  try {
    const session = await prisma.registerSession.findFirst({
      where: {
        id: req.params.id,
        register: { location: { tenantId: req.user!.tenantId } },
      },
      include: {
        register: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
        orders: {
          where: { status: 'completed' },
          include: { payments: true },
        },
      },
    });
    if (!session) throw new AppError(404, 'Session not found');

    const cashIn = session.orders
      .flatMap((o) => o.payments)
      .filter((p) => p.method === 'cash')
      .reduce((s, p) => s + p.amount, 0);

    res.json({
      success: true,
      data: {
        ...session,
        expectedCash: session.openingCash + cashIn,
      },
    });
  } catch (err) {
    next(err);
  }
});
