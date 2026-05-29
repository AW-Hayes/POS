import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const productTypesRouter = Router();
productTypesRouter.use(authenticate);

const schema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

productTypesRouter.get('/', async (req, res, next) => {
  try {
    const types = await prisma.productType.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json({ success: true, data: types });
  } catch (err) { next(err); }
});

productTypesRouter.post('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const data = schema.parse(req.body);
    const type = await prisma.productType.create({
      data: { ...data, tenantId: req.user!.tenantId },
    });
    res.status(201).json({ success: true, data: type });
  } catch (err) { next(err); }
});

productTypesRouter.patch('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.productType.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!existing) throw new AppError(404, 'Product type not found');
    const data = schema.partial().parse(req.body);
    const type = await prisma.productType.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: type });
  } catch (err) { next(err); }
});

productTypesRouter.delete('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.productType.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!existing) throw new AppError(404, 'Product type not found');
    // Detach products and categories before deletion
    await prisma.product.updateMany({ where: { productTypeId: req.params.id }, data: { productTypeId: null } });
    await prisma.category.updateMany({ where: { productTypeId: req.params.id }, data: { productTypeId: null } });
    await prisma.productType.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});
