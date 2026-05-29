import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const finelinesRouter = Router();
finelinesRouter.use(authenticate);

const schema = z.object({
  classId: z.string(),
  name: z.string().min(1),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

finelinesRouter.get('/', async (req, res, next) => {
  try {
    const { classId } = req.query as Record<string, string>;
    const finelines = await prisma.fineline.findMany({
      where: {
        tenantId: req.user!.tenantId,
        ...(classId ? { classId } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json({ success: true, data: finelines });
  } catch (err) { next(err); }
});

finelinesRouter.post('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const data = schema.parse(req.body);
    // Verify class belongs to tenant
    const cls = await prisma.productClass.findFirst({ where: { id: data.classId, tenantId: req.user!.tenantId } });
    if (!cls) throw new AppError(404, 'Product class not found');
    const fineline = await prisma.fineline.create({ data: { ...data, tenantId: req.user!.tenantId } });
    res.status(201).json({ success: true, data: fineline });
  } catch (err) { next(err); }
});

finelinesRouter.patch('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.fineline.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!existing) throw new AppError(404, 'Fineline not found');
    const data = schema.omit({ classId: true }).partial().parse(req.body);
    const fineline = await prisma.fineline.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: fineline });
  } catch (err) { next(err); }
});

finelinesRouter.delete('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.fineline.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!existing) throw new AppError(404, 'Fineline not found');
    await prisma.product.updateMany({ where: { finelineId: req.params.id }, data: { finelineId: null } });
    await prisma.fineline.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});
