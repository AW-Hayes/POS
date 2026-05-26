import { Router } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { qs } from '../lib/qs';

export const giftCardsRouter = Router();
giftCardsRouter.use(authenticate);

giftCardsRouter.get('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const q = qs(req.query.q);
    const page = Number(qs(req.query.page) ?? '1');
    const pageSize = Math.min(Number(qs(req.query.pageSize) ?? '50'), 200);

    const where = {
      tenantId: req.user!.tenantId,
      ...(q ? { code: { contains: q, mode: 'insensitive' as const } } : {}),
    };

    const [cards, total] = await Promise.all([
      prisma.giftCard.findMany({
        where,
        orderBy: { issuedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.giftCard.count({ where }),
    ]);

    res.json({ success: true, data: cards, total, page, pageSize, pageCount: Math.ceil(total / pageSize) });
  } catch (err) {
    next(err);
  }
});

giftCardsRouter.get('/lookup', async (req, res, next) => {
  try {
    const code = qs(req.query.code);
    if (!code) throw new AppError(400, 'code is required');

    const card = await prisma.giftCard.findFirst({
      where: { code, tenantId: req.user!.tenantId },
    });
    if (!card) throw new AppError(404, 'Gift card not found');
    if (!card.active) throw new AppError(400, 'Gift card is inactive');
    if (card.expiresAt && card.expiresAt < new Date()) throw new AppError(400, 'Gift card is expired');

    res.json({ success: true, data: card });
  } catch (err) {
    next(err);
  }
});

function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = randomBytes(16);
  let code = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

giftCardsRouter.post('/issue', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { code, initialBalance, expiresAt } = z.object({
      code: z.string().optional(),
      initialBalance: z.number().positive(),
      expiresAt: z.string().datetime().optional(),
    }).parse(req.body);

    const cardCode = code ?? generateCode();

    const existing = await prisma.giftCard.findUnique({ where: { code: cardCode } });
    if (existing) throw new AppError(400, 'Gift card code already exists');

    const card = await prisma.giftCard.create({
      data: {
        tenantId: req.user!.tenantId,
        code: cardCode,
        balance: initialBalance,
        initialBalance,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        transactions: {
          create: {
            type: 'issue',
            amount: initialBalance,
            balanceAfter: initialBalance,
            note: 'Gift card issued',
          },
        },
      },
    });

    res.status(201).json({ success: true, data: card });
  } catch (err) {
    next(err);
  }
});

giftCardsRouter.post('/:id/reload', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const card = await prisma.giftCard.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!card) throw new AppError(404, 'Gift card not found');
    if (!card.active) throw new AppError(400, 'Gift card is inactive');

    const { amount, note } = z.object({
      amount: z.number().positive(),
      note: z.string().optional(),
    }).parse(req.body);

    const updated = await prisma.$transaction(async (tx) => {
      const reloaded = await tx.giftCard.update({
        where: { id: card.id },
        data: { balance: { increment: amount } },
      });
      await tx.giftCardTransaction.create({
        data: { giftCardId: card.id, type: 'reload', amount, balanceAfter: reloaded.balance, note },
      });
      return reloaded;
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

giftCardsRouter.post('/:id/void', requireRole('admin'), async (req, res, next) => {
  try {
    const card = await prisma.giftCard.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!card) throw new AppError(404, 'Gift card not found');

    await prisma.$transaction([
      prisma.giftCard.update({ where: { id: card.id }, data: { active: false, balance: 0 } }),
      prisma.giftCardTransaction.create({
        data: { giftCardId: card.id, type: 'void', amount: card.balance, balanceAfter: 0, note: 'Gift card voided' },
      }),
    ]);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

giftCardsRouter.get('/:id/transactions', async (req, res, next) => {
  try {
    const card = await prisma.giftCard.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!card) throw new AppError(404, 'Gift card not found');

    const transactions = await prisma.giftCardTransaction.findMany({
      where: { giftCardId: card.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: transactions });
  } catch (err) {
    next(err);
  }
});
