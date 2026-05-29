import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const productClassesRouter = Router();
productClassesRouter.use(authenticate);

const schema = z.object({
  categoryId: z.string(),
  name: z.string().min(1),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

productClassesRouter.get('/', async (req, res, next) => {
  try {
    const { categoryId } = req.query as Record<string, string>;
    const classes = await prisma.productClass.findMany({
      where: {
        tenantId: req.user!.tenantId,
        ...(categoryId ? { categoryId } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { finelines: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] } },
    });
    res.json({ success: true, data: classes });
  } catch (err) { next(err); }
});

productClassesRouter.post('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const data = schema.parse(req.body);
    // Verify category belongs to tenant
    const cat = await prisma.category.findFirst({ where: { id: data.categoryId, tenantId: req.user!.tenantId } });
    if (!cat) throw new AppError(404, 'Category not found');
    const cls = await prisma.productClass.create({
      data: { ...data, tenantId: req.user!.tenantId },
      include: { finelines: true },
    });
    res.status(201).json({ success: true, data: cls });
  } catch (err) { next(err); }
});

productClassesRouter.patch('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.productClass.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!existing) throw new AppError(404, 'Product class not found');
    const data = schema.omit({ categoryId: true }).partial().parse(req.body);
    const cls = await prisma.productClass.update({ where: { id: req.params.id }, data, include: { finelines: true } });
    res.json({ success: true, data: cls });
  } catch (err) { next(err); }
});

productClassesRouter.delete('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.productClass.findFirst({ where: { id: req.params.id, tenantId: req.user!.tenantId } });
    if (!existing) throw new AppError(404, 'Product class not found');
    await prisma.product.updateMany({ where: { classId: req.params.id }, data: { classId: null, finelineId: null } });
    await prisma.productClass.delete({ where: { id: req.params.id } }); // cascades to finelines
    res.json({ success: true });
  } catch (err) { next(err); }
});
