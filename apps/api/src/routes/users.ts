import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { audit } from '../lib/audit';

export const usersRouter = Router();
usersRouter.use(authenticate);

usersRouter.get('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { tenantId: req.user!.tenantId, active: true },
      select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
});

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  pin: z.string().min(4).max(6).optional(),
  role: z.enum(['admin', 'manager', 'cashier']).default('cashier'),
});

usersRouter.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const data = createUserSchema.parse(req.body);
    if (!data.password && !data.pin) throw new AppError(400, 'Must provide password or PIN');

    const exists = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId: req.user!.tenantId, email: data.email } },
    });
    if (exists) throw new AppError(409, 'Email already in use');

    const [passwordHash, hashedPin] = await Promise.all([
      data.password ? bcrypt.hash(data.password, 12) : undefined,
      data.pin ? bcrypt.hash(data.pin, 10) : undefined,
    ]);

    const user = await prisma.user.create({
      data: {
        tenantId: req.user!.tenantId,
        name: data.name,
        email: data.email,
        role: data.role,
        passwordHash,
        pin: hashedPin,
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true },
    });
    void audit(req, { action: 'create', entity: 'User', entityId: user.id, summary: `Created user ${user.email} (${user.role})` });
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  pin: z.string().min(4).max(6).optional(),
  role: z.enum(['admin', 'manager', 'cashier']).optional(),
});

usersRouter.patch('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const existing = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!existing) throw new AppError(404, 'User not found');

    const data = updateUserSchema.parse(req.body);

    const [passwordHash, hashedPin] = await Promise.all([
      data.password ? bcrypt.hash(data.password, 12) : undefined,
      data.pin ? bcrypt.hash(data.pin, 10) : undefined,
    ]);

    const { password: _p, pin: _pin, ...rest } = data;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(passwordHash ? { passwordHash } : {}),
        ...(hashedPin ? { pin: hashedPin } : {}),
      },
      select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true },
    });
    const changes: Record<string, unknown> = {};
    if (rest.name && rest.name !== existing.name) changes.name = { from: existing.name, to: rest.name };
    if (rest.email && rest.email !== existing.email) changes.email = { from: existing.email, to: rest.email };
    if (rest.role && rest.role !== existing.role) changes.role = { from: existing.role, to: rest.role };
    if (passwordHash) changes.password = 'changed';
    if (hashedPin) changes.pin = 'changed';
    void audit(req, { action: 'update', entity: 'User', entityId: user.id, summary: `Updated user ${user.email}`, changes });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

usersRouter.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    if (req.params.id === req.user!.userId) throw new AppError(400, 'Cannot deactivate yourself');
    const existing = await prisma.user.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!existing) throw new AppError(404, 'User not found');
    await prisma.user.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
