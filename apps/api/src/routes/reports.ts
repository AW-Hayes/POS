import { Router } from 'express';
import { z } from 'zod';
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
      select: { id: true, name: true, cost: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let totalCost = 0;
    const topProducts = itemAgg.map((i) => {
      const product = i.productId ? productMap.get(i.productId) : undefined;
      const qty = i._sum.quantity ?? 0;
      const revenue = i._sum.total ?? 0;
      const unitCost = product?.cost ?? null;
      const costBasis = unitCost != null ? unitCost * qty : null;
      if (costBasis != null) totalCost += costBasis;
      const gp = costBasis != null ? revenue - costBasis : null;
      const gpPercent = gp != null && revenue > 0 ? (gp / revenue) * 100 : null;
      return {
        productId: i.productId,
        name: product?.name ?? (i.productId ? 'Unknown' : 'Custom'),
        quantitySold: qty,
        revenue,
        costBasis,
        gp,
        gpPercent,
      };
    });

    const totalGP = totalRevenue - totalCost;
    const gpPercent = totalRevenue > 0 ? (totalGP / totalRevenue) * 100 : null;

    res.json({
      success: true,
      data: {
        orderCount: orders.length,
        totalRevenue,
        totalTax,
        totalDiscount,
        totalCost,
        totalGP,
        gpPercent,
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

// ─── Salesperson report ───────────────────────────────────────────────────────

reportsRouter.get('/salesperson', async (req, res, next) => {
  try {
    const from = qs(req.query.from);
    const to = qs(req.query.to);
    const salespersonId = qs(req.query.salespersonId);

    if (!from || !to) throw new AppError(400, 'from and to dates are required');

    const where = {
      tenantId: req.user!.tenantId,
      status: 'completed' as const,
      completedAt: { gte: new Date(from), lte: new Date(to) },
      ...(salespersonId ? { salespersonId } : { salespersonId: { not: null } }),
    };

    const orders = await prisma.order.findMany({
      where,
      select: {
        id: true,
        total: true,
        salespersonId: true,
        salesperson: { select: { id: true, name: true } },
        completedAt: true,
      },
    });

    const byRep: Record<string, { salesperson: { id: string; name: string }; orderCount: number; totalRevenue: number }> = {};
    for (const o of orders) {
      if (!o.salespersonId || !o.salesperson) continue;
      if (!byRep[o.salespersonId]) {
        byRep[o.salespersonId] = { salesperson: o.salesperson, orderCount: 0, totalRevenue: 0 };
      }
      byRep[o.salespersonId].orderCount++;
      byRep[o.salespersonId].totalRevenue += o.total;
    }

    res.json({ success: true, data: Object.values(byRep) });
  } catch (err) {
    next(err);
  }
});

// ─── X-Report (read without closing) ─────────────────────────────────────────

reportsRouter.get('/x-tape', async (req, res, next) => {
  try {
    const sessionId = qs(req.query.sessionId);
    const locationId = qs(req.query.locationId);
    const date = qs(req.query.date) ?? new Date().toISOString().slice(0, 10);

    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);

    const where = {
      tenantId: req.user!.tenantId,
      status: 'completed' as const,
      completedAt: { gte: dayStart, lte: dayEnd },
      ...(locationId ? { locationId } : {}),
      ...(sessionId ? { sessionId } : {}),
    };

    const orders = await prisma.order.findMany({
      where,
      include: { payments: true, user: { select: { id: true, name: true } } },
    });

    const cashDrops = sessionId
      ? await prisma.cashDrop.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' } })
      : [];

    const paymentBreakdown: Record<string, number> = {};
    for (const o of orders) {
      for (const p of o.payments) {
        paymentBreakdown[p.method] = (paymentBreakdown[p.method] ?? 0) + p.amount;
      }
    }

    const totalCash = paymentBreakdown['cash'] ?? 0;
    const totalDrops = cashDrops.reduce((s, d) => s + d.amount, 0);

    res.json({
      success: true,
      data: {
        type: 'X',
        date,
        sessionId,
        orderCount: orders.length,
        totalRevenue: orders.reduce((s, o) => s + o.total, 0),
        paymentBreakdown,
        cashInDrawer: totalCash - totalDrops,
        cashDrops: totalDrops,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Z-Report (close session read) ────────────────────────────────────────────

reportsRouter.post('/z-tape', async (req, res, next) => {
  try {
    const { sessionId } = z.object({ sessionId: z.string() }).parse(req.body);

    const session = await prisma.registerSession.findFirst({
      where: {
        id: sessionId,
        register: { location: { tenantId: req.user!.tenantId } },
        closedAt: null,
      },
      include: { register: { include: { location: true } } },
    });
    if (!session) throw new AppError(404, 'Open session not found');

    const orders = await prisma.order.findMany({
      where: { sessionId, status: 'completed' },
      include: { payments: true },
    });

    const cashDrops = await prisma.cashDrop.findMany({ where: { sessionId } });

    const paymentBreakdown: Record<string, number> = {};
    for (const o of orders) {
      for (const p of o.payments) {
        paymentBreakdown[p.method] = (paymentBreakdown[p.method] ?? 0) + p.amount;
      }
    }

    const totalCash = paymentBreakdown['cash'] ?? 0;
    const totalDrops = cashDrops.reduce((s, d) => s + d.amount, 0);
    const expectedCash = session.openingCash + totalCash - totalDrops;

    // Close the session
    const closed = await prisma.registerSession.update({
      where: { id: session.id },
      data: { closedAt: new Date(), expectedCash },
    });

    res.json({
      success: true,
      data: {
        type: 'Z',
        session: closed,
        orderCount: orders.length,
        totalRevenue: orders.reduce((s, o) => s + o.total, 0),
        paymentBreakdown,
        openingCash: session.openingCash,
        cashDrops: totalDrops,
        expectedCash,
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

// ─── Sales by employee ────────────────────────────────────────────────────────

reportsRouter.get('/sales-by-employee', async (req, res, next) => {
  try {
    const locationId = qs(req.query.locationId);
    const from = qs(req.query.from);
    const to = qs(req.query.to);

    if (!from || !to) throw new AppError(400, 'from and to dates are required');

    const where = {
      tenantId: req.user!.tenantId,
      status: 'completed' as const,
      completedAt: { gte: new Date(from), lte: new Date(to) },
      ...(locationId ? { locationId } : {}),
    };

    const orders = await prisma.order.findMany({
      where,
      select: {
        id: true,
        total: true,
        subtotal: true,
        userId: true,
        salespersonId: true,
        items: { select: { quantity: true } },
        user: { select: { id: true, name: true } },
        salesperson: { select: { id: true, name: true } },
      },
    });

    const byEmployee: Record<string, {
      userId: string; name: string;
      orders: number; revenue: number; items: number; avgTicket: number;
    }> = {};

    for (const order of orders) {
      const uid = order.salespersonId ?? order.userId;
      const name = (order.salesperson ?? order.user)?.name ?? 'Unknown';
      if (!byEmployee[uid]) byEmployee[uid] = { userId: uid, name, orders: 0, revenue: 0, items: 0, avgTicket: 0 };
      byEmployee[uid].orders += 1;
      byEmployee[uid].revenue += order.total;
      byEmployee[uid].items += order.items.reduce((s, i) => s + i.quantity, 0);
    }

    const rows = Object.values(byEmployee).map((e) => ({
      ...e,
      avgTicket: e.orders > 0 ? e.revenue / e.orders : 0,
    })).sort((a, b) => b.revenue - a.revenue);

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// ─── Daily summary (last 7 days) ─────────────────────────────────────────────

reportsRouter.get('/daily-summary', async (req, res, next) => {
  try {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - 6);
    daysAgo.setHours(0, 0, 0, 0);
    const orders = await prisma.order.findMany({
      where: { tenantId: req.user!.tenantId, status: 'completed', completedAt: { gte: daysAgo } },
      select: { total: true, completedAt: true },
    });
    const buckets: Record<string, { revenue: number; orders: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = { revenue: 0, orders: 0 };
    }
    for (const o of orders) {
      if (!o.completedAt) continue;
      const key = o.completedAt.toISOString().slice(0, 10);
      if (buckets[key]) { buckets[key].revenue += o.total; buckets[key].orders += 1; }
    }
    res.json({ success: true, data: Object.entries(buckets).map(([date, v]) => ({ date, ...v })) });
  } catch (err) { next(err); }
});

// ─── Tax liability ────────────────────────────────────────────────────────────

reportsRouter.get('/tax-liability', async (req, res, next) => {
  try {
    const locationId = qs(req.query.locationId);
    const from = qs(req.query.from);
    const to = qs(req.query.to);

    if (!from || !to) throw new AppError(400, 'from and to dates are required');

    const where = {
      tenantId: req.user!.tenantId,
      status: 'completed' as const,
      completedAt: { gte: new Date(from), lte: new Date(to) },
      ...(locationId ? { locationId } : {}),
    };

    const orders = await prisma.order.findMany({
      where,
      select: {
        id: true,
        subtotal: true,
        taxAmount: true,
        total: true,
        completedAt: true,
        items: { select: { taxRate: true, total: true, quantity: true } },
      },
    });

    // Group by tax rate
    const byRate: Record<number, { taxRate: number; taxableAmount: number; taxCollected: number; orderCount: number }> = {};

    for (const order of orders) {
      for (const item of order.items) {
        const rate = item.taxRate;
        if (!byRate[rate]) byRate[rate] = { taxRate: rate, taxableAmount: 0, taxCollected: 0, orderCount: 0 };
        byRate[rate].taxableAmount += item.total;
        byRate[rate].taxCollected += item.total * (rate / (1 + rate));
      }
    }

    // Count distinct orders per rate (approximate — an order may span multiple rates)
    for (const order of orders) {
      const rates = new Set(order.items.map((i) => i.taxRate));
      for (const rate of rates) {
        if (byRate[rate]) byRate[rate].orderCount += 1;
      }
    }

    const rows = Object.values(byRate).sort((a, b) => b.taxRate - a.taxRate);
    const totals = {
      taxableAmount: rows.reduce((s, r) => s + r.taxableAmount, 0),
      taxCollected: orders.reduce((s, o) => s + o.taxAmount, 0),
      orderCount: orders.length,
    };

    res.json({ success: true, data: { rows, totals } });
  } catch (err) {
    next(err);
  }
});
