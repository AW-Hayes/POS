import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { qs } from '../lib/qs';

export const commissionsRouter = Router();
commissionsRouter.use(authenticate, requireRole('admin', 'manager'));

// GET /commissions/report?from=&to=
commissionsRouter.get('/report', async (req, res, next) => {
  try {
    const from = qs(req.query.from);
    const to = qs(req.query.to);

    const salespeople = await prisma.user.findMany({
      where: { tenantId: req.user!.tenantId, commissionRate: { not: null }, active: true },
      select: { id: true, name: true, commissionRate: true },
    });

    const results = await Promise.all(
      salespeople.map(async (sp) => {
        const orders = await prisma.order.findMany({
          where: {
            tenantId: req.user!.tenantId,
            salespersonId: sp.id,
            status: 'completed',
            ...(from || to
              ? {
                  completedAt: {
                    ...(from ? { gte: new Date(from) } : {}),
                    ...(to ? { lte: new Date(to) } : {}),
                  },
                }
              : {}),
          },
          select: { id: true, subtotal: true, total: true },
        });

        const totalRevenue = orders.reduce((s, o) => s + o.subtotal, 0);
        const commission = totalRevenue * ((sp.commissionRate ?? 0) / 100);
        return {
          salesperson: { id: sp.id, name: sp.name },
          commissionRate: sp.commissionRate,
          orderCount: orders.length,
          totalRevenue,
          commission,
        };
      }),
    );

    res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
});

// PUT /commissions/users/:id/rate
commissionsRouter.put('/users/:id/rate', async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!user) throw new AppError(404, 'User not found');

    const { commissionRate } = z
      .object({ commissionRate: z.number().min(0).max(100).nullable() })
      .parse(req.body);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { commissionRate },
      select: { id: true, name: true, commissionRate: true },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});
