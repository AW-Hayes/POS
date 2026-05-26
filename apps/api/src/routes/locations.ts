import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { qs } from '../lib/qs';

export const locationsRouter = Router();
locationsRouter.use(authenticate);

const locationSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
});

locationsRouter.get('/', async (req, res, next) => {
  try {
    const locations = await prisma.location.findMany({
      where: { tenantId: req.user!.tenantId, active: true },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: locations });
  } catch (err) {
    next(err);
  }
});

locationsRouter.post('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const data = locationSchema.parse(req.body);
    const location = await prisma.location.create({
      data: {
        name: data.name,
        address: data.address,
        phone: data.phone,
        settings: (data.settings ?? {}) as object,
        tenantId: req.user!.tenantId,
      },
    });
    res.status(201).json({ success: true, data: location });
  } catch (err) {
    next(err);
  }
});

locationsRouter.get('/:id', async (req, res, next) => {
  try {
    const location = await prisma.location.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { registers: { where: { active: true } } },
    });
    if (!location) throw new AppError(404, 'Location not found');
    res.json({ success: true, data: location });
  } catch (err) {
    next(err);
  }
});

locationsRouter.patch('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.location.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!existing) throw new AppError(404, 'Location not found');

    const raw = locationSchema.partial().parse(req.body);
    const location = await prisma.location.update({
      where: { id: req.params.id },
      data: {
        ...raw,
        ...(raw.settings ? { settings: raw.settings as object } : {}),
      },
    });
    res.json({ success: true, data: location });
  } catch (err) {
    next(err);
  }
});

locationsRouter.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const existing = await prisma.location.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!existing) throw new AppError(404, 'Location not found');
    await prisma.location.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// suppress unused import warning
void qs;
