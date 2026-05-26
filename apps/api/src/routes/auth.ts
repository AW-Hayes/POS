import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const pinLoginSchema = z.object({
  registerId: z.string(),
  pin: z.string().min(4).max(6),
});

function signToken(payload: object): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign(payload, secret, { expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as any });
}

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findFirst({
      where: { email, active: true },
    });

    if (!user?.passwordHash) throw new AppError(401, 'Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new AppError(401, 'Invalid credentials');

    const token = signToken({ userId: user.id, tenantId: user.tenantId, role: user.role });
    const { passwordHash: _, pin: __, ...safeUser } = user;
    res.json({ success: true, data: { token, user: { ...safeUser, hasPin: !!user.pin } } });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/pin-login', async (req, res, next) => {
  try {
    const { registerId, pin } = pinLoginSchema.parse(req.body);

    const register = await prisma.register.findUnique({
      where: { id: registerId },
      include: { location: true },
    });
    if (!register) throw new AppError(404, 'Register not found');

    const users = await prisma.user.findMany({
      where: { tenantId: register.location.tenantId, active: true, pin: { not: null } },
    });

    let matched = null;
    for (const user of users) {
      if (user.pin && (await bcrypt.compare(pin, user.pin))) {
        matched = user;
        break;
      }
    }

    if (!matched) throw new AppError(401, 'Invalid PIN');

    const token = signToken({ userId: matched.id, tenantId: matched.tenantId, role: matched.role });
    const { passwordHash: _, pin: __, ...safeUser } = matched;
    res.json({ success: true, data: { token, user: { ...safeUser, hasPin: true } } });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) throw new AppError(404, 'User not found');
    const { passwordHash: _, pin: __, ...safeUser } = user;
    res.json({ success: true, data: { ...safeUser, hasPin: !!user.pin } });
  } catch (err) {
    next(err);
  }
});
