import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { qs } from '../lib/qs';

export const registersRouter = Router();
registersRouter.use(authenticate);

const registerSchema = z.object({
  locationId: z.string(),
  name: z.string().min(1),
  mode: z.enum(['touch', 'desktop']).default('desktop'),
  settings: z.record(z.unknown()).optional(),
});

registersRouter.get('/', async (req, res, next) => {
  try {
    const locationId = qs(req.query.locationId);
    const registers = await prisma.register.findMany({
      where: {
        active: true,
        location: { tenantId: req.user!.tenantId },
        ...(locationId ? { locationId } : {}),
      },
      include: { location: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: registers });
  } catch (err) {
    next(err);
  }
});

registersRouter.post('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const location = await prisma.location.findFirst({
      where: { id: data.locationId, tenantId: req.user!.tenantId },
    });
    if (!location) throw new AppError(404, 'Location not found');
    const register = await prisma.register.create({
      data: {
        locationId: data.locationId,
        name: data.name,
        mode: data.mode,
        settings: (data.settings ?? {}) as object,
      },
    });
    res.status(201).json({ success: true, data: register });
  } catch (err) {
    next(err);
  }
});

registersRouter.get('/:id', async (req, res, next) => {
  try {
    const register = await prisma.register.findFirst({
      where: { id: req.params.id, location: { tenantId: req.user!.tenantId } },
      include: {
        location: true,
        sessions: {
          where: { closedAt: null },
          orderBy: { openedAt: 'desc' },
          take: 1,
          include: { user: { select: { id: true, name: true, role: true } } },
        },
      },
    });
    if (!register) throw new AppError(404, 'Register not found');
    res.json({ success: true, data: register });
  } catch (err) {
    next(err);
  }
});

registersRouter.patch('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.register.findFirst({
      where: { id: req.params.id, location: { tenantId: req.user!.tenantId } },
    });
    if (!existing) throw new AppError(404, 'Register not found');
    const raw = registerSchema.partial().omit({ locationId: true }).parse(req.body);
    const register = await prisma.register.update({
      where: { id: req.params.id },
      data: {
        ...raw,
        ...(raw.settings ? { settings: raw.settings as object } : {}),
      },
    });
    res.json({ success: true, data: register });
  } catch (err) {
    next(err);
  }
});

registersRouter.post('/:id/open', async (req, res, next) => {
  try {
    const register = await prisma.register.findFirst({
      where: { id: req.params.id, location: { tenantId: req.user!.tenantId } },
    });
    if (!register) throw new AppError(404, 'Register not found');

    const openSession = await prisma.registerSession.findFirst({
      where: { registerId: req.params.id, closedAt: null },
    });
    if (openSession) throw new AppError(409, 'Register already has an open session');

    const { openingCash = 0 } = z.object({ openingCash: z.number().optional() }).parse(req.body);
    const session = await prisma.registerSession.create({
      data: { registerId: req.params.id, userId: req.user!.userId, openingCash },
    });
    res.status(201).json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

// ─── Session summary (for EOD cash-out) ──────────────────────────────────────

registersRouter.get('/:id/session-summary', async (req, res, next) => {
  try {
    const register = await prisma.register.findFirst({
      where: { id: req.params.id, location: { tenantId: req.user!.tenantId } },
    });
    if (!register) throw new AppError(404, 'Register not found');

    const session = await prisma.registerSession.findFirst({
      where: { registerId: req.params.id, closedAt: null },
      include: {
        cashDrops: true,
        orders: {
          where: { status: 'completed' },
          include: { payments: true },
        },
      },
    });
    if (!session) throw new AppError(404, 'No open session found');

    // Aggregate payments by method
    const paymentTotals: Record<string, number> = {};
    let orderCount = 0;
    let salesTotal = 0;
    for (const order of session.orders) {
      orderCount++;
      salesTotal += order.total;
      for (const payment of order.payments) {
        paymentTotals[payment.method] = (paymentTotals[payment.method] ?? 0) + payment.amount;
      }
    }

    const cashSales = paymentTotals['cash'] ?? 0;
    const cashDropsTotal = session.cashDrops.reduce((s, d) => s + d.amount, 0);
    const expectedCash = session.openingCash + cashSales - cashDropsTotal;

    res.json({
      success: true,
      data: {
        session: {
          id: session.id,
          openedAt: session.openedAt,
          openingCash: session.openingCash,
        },
        orderCount,
        salesTotal,
        paymentTotals,
        cashDropsTotal,
        cashDrops: session.cashDrops,
        expectedCash,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Close register session ───────────────────────────────────────────────────

registersRouter.post('/:id/close', async (req, res, next) => {
  try {
    const register = await prisma.register.findFirst({
      where: { id: req.params.id, location: { tenantId: req.user!.tenantId } },
      include: {
        sessions: {
          where: { closedAt: null },
          include: {
            cashDrops: true,
            orders: { where: { status: 'completed' }, include: { payments: true } },
          },
          take: 1,
        },
      },
    });
    if (!register) throw new AppError(404, 'Register not found');
    const session = register.sessions[0];
    if (!session) throw new AppError(404, 'No open session found');

    const { closingCash, notes } = z
      .object({ closingCash: z.number().optional(), notes: z.string().optional() })
      .parse(req.body);

    // Calculate expected cash
    const cashSales = session.orders
      .flatMap((o) => o.payments)
      .filter((p) => p.method === 'cash')
      .reduce((s, p) => s + p.amount, 0);
    const cashDropsTotal = session.cashDrops.reduce((s, d) => s + d.amount, 0);
    const expectedCash = session.openingCash + cashSales - cashDropsTotal;

    const updated = await prisma.registerSession.update({
      where: { id: session.id },
      data: { closedAt: new Date(), closingCash, expectedCash, notes },
    });
    res.json({ success: true, data: { ...updated, expectedCash } });
  } catch (err) {
    next(err);
  }
});
