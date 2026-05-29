import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const categoriesRouter = Router();
categoriesRouter.use(authenticate);

const categorySchema = z.object({
  name: z.string().min(1),
  productTypeId: z.string().optional(),
  parentId: z.string().optional(),
  sortOrder: z.number().int().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

categoriesRouter.get('/', async (req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        productType: { select: { id: true, name: true } },
        children: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
      },
    });
    const roots = categories.filter((c) => !c.parentId);
    res.json({ success: true, data: roots });
  } catch (err) {
    next(err);
  }
});

categoriesRouter.post('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const data = categorySchema.parse(req.body);
    const category = await prisma.category.create({
      data: { ...data, tenantId: req.user!.tenantId },
    });
    res.status(201).json({ success: true, data: category });
  } catch (err) {
    next(err);
  }
});

categoriesRouter.patch('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.category.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!existing) throw new AppError(404, 'Category not found');
    const data = categorySchema.partial().parse(req.body);
    const category = await prisma.category.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: category });
  } catch (err) {
    next(err);
  }
});

categoriesRouter.delete('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.category.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!existing) throw new AppError(404, 'Category not found');
    await prisma.product.updateMany({
      where: { categoryId: req.params.id },
      data: { categoryId: null },
    });
    await prisma.category.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
