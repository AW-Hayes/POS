import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const timeClockRouter = Router();
timeClockRouter.use(authenticate);

// Get current open time entry for the calling user
timeClockRouter.get('/me/current', async (req, res, next) => {
  try {
    const entry = await prisma.timeEntry.findFirst({
      where: { userId: req.user!.userId, clockOut: null },
      orderBy: { clockIn: 'desc' },
    });
    res.json({ success: true, data: entry });
  } catch (err) {
    next(err);
  }
});

// Clock in
timeClockRouter.post('/clock-in', async (req, res, next) => {
  try {
    const { type = 'work', note } = z
      .object({ type: z.enum(['work', 'break']).default('work'), note: z.string().optional() })
      .parse(req.body);

    // Ensure no open entry exists
    const open = await prisma.timeEntry.findFirst({
      where: { userId: req.user!.userId, clockOut: null },
    });
    if (open) throw new AppError(400, 'Already clocked in — clock out first');

    const entry = await prisma.timeEntry.create({
      data: {
        userId: req.user!.userId,
        tenantId: req.user!.tenantId,
        type,
        clockIn: new Date(),
        note,
      },
    });
    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    next(err);
  }
});

// Clock out
timeClockRouter.post('/clock-out', async (req, res, next) => {
  try {
    const { note } = z.object({ note: z.string().optional() }).parse(req.body);

    const open = await prisma.timeEntry.findFirst({
      where: { userId: req.user!.userId, clockOut: null },
    });
    if (!open) throw new AppError(400, 'Not clocked in');

    const updated = await prisma.timeEntry.update({
      where: { id: open.id },
      data: { clockOut: new Date(), ...(note ? { note } : {}) },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// List entries for a user (manager/admin only, or self)
timeClockRouter.get('/users/:userId', async (req, res, next) => {
  try {
    const isSelf = req.params.userId === req.user!.userId;
    const isManager = ['manager', 'admin'].includes(req.user!.role);
    if (!isSelf && !isManager) throw new AppError(403, 'Forbidden');

    const { from, to } = z
      .object({ from: z.string().optional(), to: z.string().optional() })
      .parse(req.query);

    const entries = await prisma.timeEntry.findMany({
      where: {
        userId: req.params.userId,
        tenantId: req.user!.tenantId,
        ...(from || to ? {
          clockIn: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        } : {}),
      },
      orderBy: { clockIn: 'desc' },
    });

    const totalMinutes = entries.reduce((sum, e) => {
      if (!e.clockOut) return sum;
      return sum + Math.round((e.clockOut.getTime() - e.clockIn.getTime()) / 60000);
    }, 0);

    res.json({ success: true, data: { entries, totalMinutes } });
  } catch (err) {
    next(err);
  }
});

// Time report for all employees (manager/admin)
timeClockRouter.get('/report', async (req, res, next) => {
  try {
    if (!['manager', 'admin'].includes(req.user!.role)) throw new AppError(403, 'Forbidden');

    const { from, to } = z
      .object({ from: z.string().optional(), to: z.string().optional() })
      .parse(req.query);

    const entries = await prisma.timeEntry.findMany({
      where: {
        tenantId: req.user!.tenantId,
        ...(from || to ? {
          clockIn: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        } : {}),
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: [{ userId: 'asc' }, { clockIn: 'asc' }],
    });

    // Group by user
    const byUser: Record<string, { user: { id: string; name: string }; totalMinutes: number; entries: typeof entries }> = {};
    for (const entry of entries) {
      if (!byUser[entry.userId]) {
        byUser[entry.userId] = { user: entry.user, totalMinutes: 0, entries: [] };
      }
      byUser[entry.userId].entries.push(entry);
      if (entry.clockOut) {
        byUser[entry.userId].totalMinutes += Math.round(
          (entry.clockOut.getTime() - entry.clockIn.getTime()) / 60000
        );
      }
    }

    res.json({ success: true, data: Object.values(byUser) });
  } catch (err) {
    next(err);
  }
});
