import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const attributesRouter = Router();
attributesRouter.use(authenticate);

const attributeSchema = z.object({
  name: z.string().min(1),
  values: z.array(z.string().min(1)).min(1),
  sortOrder: z.number().int().optional(),
});

attributesRouter.get('/', async (req, res, next) => {
  try {
    const attributes = await prisma.attributeDefinition.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json({ success: true, data: attributes });
  } catch (err) {
    next(err);
  }
});

attributesRouter.post('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const data = attributeSchema.parse(req.body);
    const attribute = await prisma.attributeDefinition.create({
      data: { ...data, tenantId: req.user!.tenantId },
    });
    res.status(201).json({ success: true, data: attribute });
  } catch (err) {
    next(err);
  }
});

attributesRouter.patch('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.attributeDefinition.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!existing) throw new AppError(404, 'Attribute not found');
    const data = attributeSchema.partial().parse(req.body);
    const attribute = await prisma.attributeDefinition.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: attribute });
  } catch (err) {
    next(err);
  }
});

attributesRouter.delete('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.attributeDefinition.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!existing) throw new AppError(404, 'Attribute not found');
    await prisma.attributeDefinition.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
