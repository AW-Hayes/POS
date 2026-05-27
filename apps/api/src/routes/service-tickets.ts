import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { qs } from '../lib/qs';

export const serviceTicketsRouter = Router();
serviceTicketsRouter.use(authenticate);

const STATUSES = ['open', 'in_progress', 'ready', 'completed', 'cancelled'] as const;

const itemSchema = z.object({
  type: z.enum(['labor', 'part']),
  name: z.string().min(1),
  productId: z.string().optional(),
  variantId: z.string().optional(),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().min(0),
});

serviceTicketsRouter.get('/', async (req, res, next) => {
  try {
    const status = qs(req.query.status);
    const locationId = qs(req.query.locationId);
    const page = Number(qs(req.query.page) ?? '1');
    const pageSize = Math.min(Number(qs(req.query.pageSize) ?? '50'), 200);

    const where = {
      tenantId: req.user!.tenantId,
      ...(status ? { status } : {}),
      ...(locationId ? { locationId } : {}),
    };

    const [tickets, total] = await Promise.all([
      prisma.serviceTicket.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.serviceTicket.count({ where }),
    ]);
    res.json({ success: true, data: tickets, total });
  } catch (err) {
    next(err);
  }
});

serviceTicketsRouter.get('/:id', async (req, res, next) => {
  try {
    const ticket = await prisma.serviceTicket.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { items: true },
    });
    if (!ticket) throw new AppError(404, 'Service ticket not found');
    res.json({ success: true, data: ticket });
  } catch (err) {
    next(err);
  }
});

serviceTicketsRouter.post('/', async (req, res, next) => {
  try {
    const data = z
      .object({
        locationId: z.string(),
        customerId: z.string().optional(),
        description: z.string().optional(),
        techNotes: z.string().optional(),
        estimatedCost: z.number().min(0).optional(),
        items: z.array(itemSchema).optional(),
      })
      .parse(req.body);

    const location = await prisma.location.findFirst({
      where: { id: data.locationId, tenantId: req.user!.tenantId },
    });
    if (!location) throw new AppError(404, 'Location not found');

    const count = await prisma.serviceTicket.count({ where: { tenantId: req.user!.tenantId } });
    const ticketNumber = `T${String(count + 1).padStart(5, '0')}`;

    const items = (data.items ?? []).map((i) => ({
      ...i,
      total: i.quantity * i.unitPrice,
    }));

    const ticket = await prisma.serviceTicket.create({
      data: {
        tenantId: req.user!.tenantId,
        locationId: data.locationId,
        customerId: data.customerId,
        ticketNumber,
        description: data.description,
        techNotes: data.techNotes,
        estimatedCost: data.estimatedCost,
        items: { create: items },
      },
      include: { items: true },
    });
    res.status(201).json({ success: true, data: ticket });
  } catch (err) {
    next(err);
  }
});

serviceTicketsRouter.patch('/:id', async (req, res, next) => {
  try {
    const ticket = await prisma.serviceTicket.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!ticket) throw new AppError(404, 'Service ticket not found');

    const data = z
      .object({
        status: z.enum(STATUSES).optional(),
        description: z.string().optional(),
        techNotes: z.string().optional(),
        estimatedCost: z.number().min(0).optional(),
        finalCost: z.number().min(0).optional(),
      })
      .parse(req.body);

    const completedAt =
      data.status === 'completed' && ticket.status !== 'completed' ? new Date() : undefined;

    const updated = await prisma.serviceTicket.update({
      where: { id: ticket.id },
      data: { ...data, ...(completedAt ? { completedAt } : {}) },
      include: { items: true },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

serviceTicketsRouter.post('/:id/items', async (req, res, next) => {
  try {
    const ticket = await prisma.serviceTicket.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!ticket) throw new AppError(404, 'Service ticket not found');

    const data = itemSchema.parse(req.body);
    const item = await prisma.serviceTicketItem.create({
      data: { serviceTicketId: ticket.id, ...data, total: data.quantity * data.unitPrice },
    });
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});

serviceTicketsRouter.delete('/:id/items/:itemId', async (req, res, next) => {
  try {
    const ticket = await prisma.serviceTicket.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!ticket) throw new AppError(404, 'Service ticket not found');

    await prisma.serviceTicketItem.deleteMany({
      where: { id: req.params.itemId, serviceTicketId: ticket.id },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

serviceTicketsRouter.delete('/:id', async (req, res, next) => {
  try {
    const ticket = await prisma.serviceTicket.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId, status: { in: ['open', 'cancelled'] } },
    });
    if (!ticket) throw new AppError(404, 'Service ticket not found or cannot be deleted');

    await prisma.serviceTicket.delete({ where: { id: ticket.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
