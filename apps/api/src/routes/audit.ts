import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { qs } from '../lib/qs';

export const auditRouter = Router();
auditRouter.use(authenticate, requireRole('admin', 'manager'));

auditRouter.get('/', async (req, res, next) => {
  try {
    const page = Number(qs(req.query.page) ?? '1');
    const pageSize = Math.min(Number(qs(req.query.pageSize) ?? '50'), 200);
    const entity = qs(req.query.entity);
    const userId = qs(req.query.userId);
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId: req.user!.tenantId,
      ...(entity ? { entity } : {}),
      ...(userId ? { userId } : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ success: true, data: logs, total, page, pageSize });
  } catch (err) {
    next(err);
  }
});
