import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { qs } from '../lib/qs';

export const customersRouter = Router();
customersRouter.use(authenticate);

const customerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  taxExempt: z.boolean().optional(),
  taxExemptCertificate: z.string().optional(),
  priceLevelId: z.string().optional(),
});

customersRouter.get('/', async (req, res, next) => {
  try {
    const q = qs(req.query.q);
    const page = Number(qs(req.query.page) ?? '1');
    const pageSize = Number(qs(req.query.pageSize) ?? '50');
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId: req.user!.tenantId,
      ...(q ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { email: { contains: q, mode: 'insensitive' as const } },
          { phone: { contains: q } },
        ],
      } : {}),
    };

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({ where, orderBy: { name: 'asc' }, skip, take: pageSize }),
      prisma.customer.count({ where }),
    ]);

    res.json({ success: true, data: customers, total, page, pageSize, pageCount: Math.ceil(total / pageSize) });
  } catch (err) {
    next(err);
  }
});

customersRouter.post('/', async (req, res, next) => {
  try {
    const data = customerSchema.parse(req.body);
    const customer = await prisma.customer.create({
      data: { ...data, tenantId: req.user!.tenantId },
    });
    res.status(201).json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
});

customersRouter.get('/:id', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: {
        orders: {
          where: { status: 'completed' },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, total: true, createdAt: true, completedAt: true },
        },
      },
    });
    if (!customer) throw new AppError(404, 'Customer not found');
    res.json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
});

customersRouter.patch('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.customer.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!existing) throw new AppError(404, 'Customer not found');
    const data = customerSchema.partial().parse(req.body);
    const customer = await prisma.customer.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
});

customersRouter.delete('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.customer.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!existing) throw new AppError(404, 'Customer not found');
    await prisma.customer.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
