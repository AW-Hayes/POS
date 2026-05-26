import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const tenantsRouter = Router();

const createTenantSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  settings: z.object({
    currency: z.string().default('USD'),
    timezone: z.string().default('America/New_York'),
    taxRate: z.number().min(0).max(1).default(0),
  }).optional(),
  adminUser: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(8),
  }),
});

// Bootstrap: create a new tenant (no auth required for first setup)
tenantsRouter.post('/', async (req, res, next) => {
  try {
    const data = createTenantSchema.parse(req.body);

    const existing = await prisma.tenant.findUnique({ where: { slug: data.slug } });
    if (existing) throw new AppError(409, 'Slug already taken');

    const passwordHash = await bcrypt.hash(data.adminUser.password, 12);

    const tenant = await prisma.tenant.create({
      data: {
        name: data.name,
        slug: data.slug,
        settings: data.settings ?? { currency: 'USD', timezone: 'America/New_York', taxRate: 0 },
        users: {
          create: {
            name: data.adminUser.name,
            email: data.adminUser.email,
            passwordHash,
            role: 'admin',
          },
        },
      },
    });

    res.status(201).json({ success: true, data: tenant });
  } catch (err) {
    next(err);
  }
});

tenantsRouter.get('/current', authenticate, async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });
    if (!tenant) throw new AppError(404, 'Tenant not found');
    res.json({ success: true, data: tenant });
  } catch (err) {
    next(err);
  }
});

tenantsRouter.patch('/current', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const schema = z.object({
      name: z.string().min(1).optional(),
      settings: z.record(z.unknown()).optional(),
    });
    const raw = schema.parse(req.body);
    const tenant = await prisma.tenant.update({
      where: { id: req.user!.tenantId },
      data: {
        ...raw,
        ...(raw.settings ? { settings: raw.settings as object } : {}),
      },
    });
    res.json({ success: true, data: tenant });
  } catch (err) {
    next(err);
  }
});
