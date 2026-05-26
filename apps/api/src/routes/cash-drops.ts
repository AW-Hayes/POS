import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const cashDropsRouter = Router();
cashDropsRouter.use(authenticate);

const dropSchema = z.object({
  amount: z.number().positive(),
  note: z.string().optional(),
});

// List cash drops for a session
cashDropsRouter.get('/sessions/:sessionId', async (req, res, next) => {
  try {
    const session = await prisma.registerSession.findFirst({
      where: { id: req.params.sessionId },
      include: { register: { select: { locationId: true } } },
    });
    if (!session) throw new AppError(404, 'Session not found');

    const drops = await prisma.cashDrop.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ success: true, data: drops });
  } catch (err) {
    next(err);
  }
});

// Record a cash drop for a session
cashDropsRouter.post('/sessions/:sessionId', async (req, res, next) => {
  try {
    const { amount, note } = dropSchema.parse(req.body);

    // Verify session belongs to a location this tenant owns
    const session = await prisma.registerSession.findFirst({
      where: { id: req.params.sessionId, closedAt: null },
      include: { register: { include: { location: true } } },
    });
    if (!session) throw new AppError(404, 'Open session not found');
    if (session.register.location.tenantId !== req.user!.tenantId) {
      throw new AppError(403, 'Forbidden');
    }

    const drop = await prisma.cashDrop.create({
      data: { sessionId: session.id, userId: req.user!.userId, amount, note },
    });
    res.status(201).json({ success: true, data: drop });
  } catch (err) {
    next(err);
  }
});
