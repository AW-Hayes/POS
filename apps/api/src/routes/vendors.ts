import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { qs } from '../lib/qs';

export const vendorsRouter = Router();
vendorsRouter.use(authenticate);

vendorsRouter.get('/', async (req, res, next) => {
  try {
    const q = qs(req.query.q);
    const vendors = await prisma.vendor.findMany({
      where: {
        tenantId: req.user!.tenantId,
        ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: vendors });
  } catch (err) {
    next(err);
  }
});

const vendorSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  active: z.boolean().default(true),
});

vendorsRouter.post('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const data = vendorSchema.parse(req.body);
    const vendor = await prisma.vendor.create({ data: { ...data, tenantId: req.user!.tenantId } });
    res.status(201).json({ success: true, data: vendor });
  } catch (err) {
    next(err);
  }
});

vendorsRouter.get('/:id', async (req, res, next) => {
  try {
    const vendor = await prisma.vendor.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!vendor) throw new AppError(404, 'Vendor not found');
    res.json({ success: true, data: vendor });
  } catch (err) {
    next(err);
  }
});

vendorsRouter.put('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const vendor = await prisma.vendor.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!vendor) throw new AppError(404, 'Vendor not found');
    const data = vendorSchema.partial().parse(req.body);
    const updated = await prisma.vendor.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

vendorsRouter.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const vendor = await prisma.vendor.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!vendor) throw new AppError(404, 'Vendor not found');
    await prisma.vendor.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
