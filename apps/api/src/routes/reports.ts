import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { qs } from '../lib/qs';

export const reportsRouter = Router();
reportsRouter.use(authenticate, requireRole('admin', 'manager'));

// ─── Sales summary ────────────────────────────────────────────────────────────

reportsRouter.get('/sales', async (req, res, next) => {
  try {
    const locationId = qs(req.query.locationId);
    const from = qs(req.query.from);
    const to = qs(req.query.to);

    if (!from || !to) throw new AppError(400, 'from and to dates are required');

    const where = {
      tenantId: req.user!.tenantId,
      status: 'completed' as const,
      completedAt: {
        gte: new Date(from),
        lte: new Date(to),
      },
      ...(locationId ? { locationId } : {}),
    };

    const [orders, itemAgg] = await Promise.all([
      prisma.order.findMany({
        where,
        select: {
          id: true,
          total: true,
          subtotal: true,
          taxAmount: true,
          discountAmount: true,
          promotionDiscount: true,
          completedAt: true,
          locationId: true,
          payments: { select: { method: true, amount: true } },
        },
        orderBy: { completedAt: 'asc' },
      }),
      prisma.orderItem.groupBy({
        by: ['productId'],
        where: { order: where },
        _sum: { quantity: true, total: true },
        _count: { id: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 20,
      }),
    ]);

    const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
    const totalTax = orders.reduce((s, o) => s + o.taxAmount, 0);
    const totalDiscount = orders.reduce((s, o) => s + o.discountAmount + o.promotionDiscount, 0);

    // Payment method breakdown
    const paymentBreakdown: Record<string, number> = {};
    for (const order of orders) {
      for (const p of order.payments) {
        paymentBreakdown[p.method] = (paymentBreakdown[p.method] ?? 0) + p.amount;
      }
    }

    // Top products
    const productIds = itemAgg.map((i) => i.productId).filter(Boolean) as string[];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p.name]));

    const topProducts = itemAgg.map((i) => ({
      productId: i.productId,
      name: i.productId ? (productMap.get(i.productId) ?? 'Unknown') : 'Custom',
      quantitySold: i._sum.quantity ?? 0,
      revenue: i._sum.total ?? 0,
    }));

    res.json({
      success: true,
      data: {
        orderCount: orders.length,
        totalRevenue,
        totalTax,
        totalDiscount,
        averageOrderValue: orders.length ? totalRevenue / orders.length : 0,
        paymentBreakdown,
        topProducts,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── End-of-day summary ───────────────────────────────────────────────────────

reportsRouter.get('/end-of-day', async (req, res, next) => {
  try {
    const locationId = qs(req.query.locationId);
    const date = qs(req.query.date) ?? new Date().toISOString().slice(0, 10);

    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    const where = {
      tenantId: req.user!.tenantId,
      completedAt: { gte: dayStart, lte: dayEnd },
      status: 'completed' as const,
      ...(locationId ? { locationId } : {}),
    };

    const orders = await prisma.order.findMany({
      where,
      include: { payments: true },
    });

    const sessions = await prisma.registerSession.findMany({
      where: {
        register: {
          location: { tenantId: req.user!.tenantId },
          ...(locationId ? { locationId } : {}),
        },
        openedAt: { gte: dayStart, lte: dayEnd },
        closedAt: { not: null },
      },
      include: { register: { select: { id: true, name: true } } },
    });

    const cashPayments = orders.flatMap((o) => o.payments.filter((p) => p.method === 'cash'));
    const totalCash = cashPayments.reduce((s, p) => s + p.amount, 0);

    res.json({
      success: true,
      data: {
        date,
        orderCount: orders.length,
        totalRevenue: orders.reduce((s, o) => s + o.total, 0),
        totalCash,
        sessions: sessions.map((s) => ({
          registerId: s.registerId,
          registerName: s.register.name,
          openedAt: s.openedAt,
          closedAt: s.closedAt,
          openingCash: s.openingCash,
          closingCash: s.closingCash,
          expectedCash: s.expectedCash,
          variance: s.closingCash != null && s.expectedCash != null
            ? s.closingCash - s.expectedCash
            : null,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Inventory value ──────────────────────────────────────────────────────────

reportsRouter.get('/inventory-value', async (req, res, next) => {
  try {
    const locationId = qs(req.query.locationId);

    const items = await prisma.inventoryItem.findMany({
      where: {
        location: { tenantId: req.user!.tenantId },
        ...(locationId ? { locationId } : {}),
      },
      include: {
        product: { select: { id: true, name: true, cost: true, price: true } },
        variant: { select: { id: true, sku: true, cost: true, price: true } },
      },
    });

    let totalCostValue = 0;
    let totalRetailValue = 0;

    const rows = items.map((item) => {
      const cost = item.variant?.cost ?? item.product.cost ?? 0;
      const price = item.variant?.price ?? item.product.price;
      const costValue = cost * item.quantity;
      const retailValue = price * item.quantity;
      totalCostValue += costValue;
      totalRetailValue += retailValue;
      return {
        productId: item.productId,
        productName: item.product.name,
        variantId: item.variantId,
        variantSku: item.variant?.sku,
        quantity: item.quantity,
        cost,
        price,
        costValue,
        retailValue,
      };
    });

    res.json({
      success: true,
      data: { totalCostValue, totalRetailValue, items: rows },
    });
  } catch (err) {
    next(err);
  }
});
