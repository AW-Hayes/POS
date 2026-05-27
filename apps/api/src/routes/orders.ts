import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { hooks } from '../hooks';
import { qs } from '../lib/qs';

export const ordersRouter = Router();
ordersRouter.use(authenticate);

const orderInclude = {
  customer: { select: { id: true, name: true, email: true } },
  items: true,
  payments: true,
  user: { select: { id: true, name: true } },
};

ordersRouter.get('/', async (req, res, next) => {
  try {
    const locationId = qs(req.query.locationId);
    const status = qs(req.query.status);
    const customerId = qs(req.query.customerId);
    const page = Number(qs(req.query.page) ?? '1');
    const pageSize = Math.min(Number(qs(req.query.pageSize) ?? '50'), 200);
    const skip = (page - 1) * pageSize;

    const where = {
      tenantId: req.user!.tenantId,
      ...(locationId ? { locationId } : {}),
      ...(status ? { status } : {}),
      ...(customerId ? { customerId } : {}),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      prisma.order.count({ where }),
    ]);

    res.json({ success: true, data: orders, total, page, pageSize, pageCount: Math.ceil(total / pageSize) });
  } catch (err) {
    next(err);
  }
});

// ─── Create order ─────────────────────────────────────────────────────────────

const createOrderSchema = z.object({
  locationId: z.string(),
  sessionId: z.string().optional(),
  customerId: z.string().optional(),
  notes: z.string().optional(),
  promotionIds: z.array(z.string()).default([]),
  items: z.array(z.object({
    productId: z.string().optional(),
    variantId: z.string().optional(),
    name: z.string().optional(),   // required when productId is absent (misc item)
    price: z.number().optional(),  // required when productId is absent (misc item)
    quantity: z.number().int().positive(),
    discount: z.number().min(0).default(0),
  })).min(1),
});

ordersRouter.post('/', async (req, res, next) => {
  try {
    const data = createOrderSchema.parse(req.body);

    const location = await prisma.location.findFirst({
      where: { id: data.locationId, tenantId: req.user!.tenantId },
    });
    if (!location) throw new AppError(404, 'Location not found');

    const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });
    const tenantSettings = tenant?.settings as Record<string, unknown>;
    const defaultTaxRate = Number(tenantSettings?.taxRate ?? 0);

    const productIds = [...new Set(data.items.filter((i) => i.productId).map((i) => i.productId as string))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, tenantId: req.user!.tenantId, active: true },
      include: { variants: true, category: { select: { id: true } } },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Load customer for tax exempt + price level
    const customer = data.customerId
      ? await prisma.customer.findFirst({
          where: { id: data.customerId, tenantId: req.user!.tenantId },
          include: {
            priceLevel: { include: { prices: true } },
          },
        })
      : null;
    const isTaxExempt = customer?.taxExempt ?? false;
    const priceLevel = customer?.priceLevel ?? null;

    let subtotal = 0;
    let taxAmount = 0;
    let discountAmount = 0;

    const orderItems: Array<{ productId?: string; variantId?: string; name: string; sku?: string; price: number; quantity: number; discount: number; taxRate: number; total: number }> = data.items.map((item) => {
      // Misc / open-price item (no productId)
      if (!item.productId) {
        if (!item.name || item.price === undefined) throw new AppError(400, 'Misc items require name and price');
        const unitPrice = item.price;
        const taxRate = defaultTaxRate;
        const discountPerUnit = Math.min(item.discount, unitPrice);
        const lineDiscount = discountPerUnit * item.quantity;
        const lineSubtotal = unitPrice * item.quantity - lineDiscount;
        const lineTax = isTaxExempt ? 0 : lineSubtotal * taxRate;
        subtotal += lineSubtotal;
        taxAmount += lineTax;
        discountAmount += lineDiscount;
        return { productId: undefined, variantId: undefined, name: item.name, sku: undefined, price: unitPrice, quantity: item.quantity, discount: discountPerUnit, taxRate: isTaxExempt ? 0 : taxRate, total: lineSubtotal + lineTax };
      }

      const product = productMap.get(item.productId);
      if (!product) throw new AppError(400, `Product ${item.productId} not found`);

      const variant = item.variantId ? product.variants.find((v) => v.id === item.variantId) : undefined;
      if (item.variantId && !variant) throw new AppError(400, `Variant ${item.variantId} not found`);

      let unitPrice = variant?.price ?? product.price;

      // Apply price level override
      if (priceLevel) {
        const specificPrice = priceLevel.prices.find(
          (p) => p.productId === item.productId && p.variantId === (item.variantId ?? null),
        );
        if (specificPrice) {
          unitPrice = specificPrice.price;
        } else if (priceLevel.discount > 0) {
          unitPrice = unitPrice * (1 - priceLevel.discount / 100);
        }
      }

      const taxRate = product.taxable && !isTaxExempt ? defaultTaxRate : 0;
      const discountPerUnit = Math.min(item.discount, unitPrice);
      const lineDiscount = discountPerUnit * item.quantity;
      const lineSubtotal = unitPrice * item.quantity - lineDiscount;
      const lineTax = lineSubtotal * taxRate;

      subtotal += lineSubtotal;
      taxAmount += lineTax;
      discountAmount += lineDiscount;

      return {
        productId: item.productId,
        variantId: item.variantId,
        name: product.name,
        sku: variant?.sku ?? product.sku ?? undefined,
        price: unitPrice,
        quantity: item.quantity,
        discount: discountPerUnit,
        taxRate,
        total: lineSubtotal + lineTax,
      };
    });

    // Apply promotions
    let promotionDiscount = 0;
    if (data.promotionIds.length > 0) {
      const now = new Date();
      const promotions = await prisma.promotion.findMany({
        where: {
          id: { in: data.promotionIds },
          tenantId: req.user!.tenantId,
          active: true,
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
        },
      });

      for (const promo of promotions) {
        for (const item of orderItems) {
          if (!item.productId) continue; // misc items don't match catalog promotions
          const product = productMap.get(item.productId)!;
          const matches =
            promo.productIds.length === 0 && promo.categoryIds.length === 0
              ? true
              : promo.productIds.includes(item.productId) ||
                (product.categoryId != null && promo.categoryIds.includes(product.categoryId));

          if (!matches) continue;
          if (promo.minQty != null && item.quantity < promo.minQty) continue;

          const lineTotal = item.price * item.quantity;
          if (promo.minAmount != null && lineTotal < promo.minAmount) continue;

          if (promo.type === 'percent_off') {
            promotionDiscount += lineTotal * (promo.value / 100);
          } else if (promo.type === 'fixed_off') {
            promotionDiscount += promo.value * item.quantity;
          } else if (promo.type === 'bogo') {
            const freeQty = Math.floor(item.quantity / 2);
            promotionDiscount += item.price * freeQty;
          } else if (promo.type === 'price_override') {
            promotionDiscount += Math.max(0, item.price - promo.value) * item.quantity;
          }
        }
      }
    }

    // Cap promotion discount so total never goes below zero
    const cappedPromotionDiscount = Math.min(promotionDiscount, subtotal + taxAmount);

    // ── hook: order:before-create ──────────────────────────────────────────────
    const beforeCtx = await hooks.run('order:before-create', {
      payload: {
        tenantId: req.user!.tenantId,
        locationId: data.locationId,
        userId: req.user!.userId,
        items: orderItems as Parameters<typeof hooks.run<'order:before-create'>>[1]['payload']['items'],
        subtotal,
        taxAmount,
        discountAmount,
        total: subtotal + taxAmount - cappedPromotionDiscount,
        customerId: data.customerId,
        sessionId: data.sessionId,
        notes: data.notes,
      },
      meta: {},
    });

    const order = await prisma.order.create({
      data: {
        tenantId: req.user!.tenantId,
        locationId: beforeCtx.payload.locationId,
        sessionId: beforeCtx.payload.sessionId,
        userId: req.user!.userId,
        customerId: beforeCtx.payload.customerId,
        notes: beforeCtx.payload.notes,
        status: 'open',
        subtotal: beforeCtx.payload.subtotal,
        taxAmount: beforeCtx.payload.taxAmount,
        discountAmount: beforeCtx.payload.discountAmount,
        promotionDiscount: cappedPromotionDiscount,
        total: beforeCtx.payload.total,
        items: { create: beforeCtx.payload.items },
      },
      include: orderInclude,
    });

    // ── hook: order:after-create ───────────────────────────────────────────────
    await hooks.run('order:after-create', {
      payload: { order: order as Parameters<typeof hooks.run<'order:after-create'>>[1]['payload']['order'] },
      meta: {},
    });

    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});

ordersRouter.get('/:id', async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: orderInclude,
    });
    if (!order) throw new AppError(404, 'Order not found');
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});

// ─── Complete order ────────────────────────────────────────────────────────────

const completeOrderSchema = z.object({
  payments: z.array(z.object({
    method: z.enum(['cash', 'card', 'store_credit', 'gift_card', 'house_account', 'other']),
    amount: z.number().positive(),
    reference: z.string().optional(),
    giftCardId: z.string().optional(),
  })).min(1),
});

ordersRouter.post('/:id/complete', async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { items: true },
    });
    if (!order) throw new AppError(404, 'Order not found');
    if (order.status !== 'open') throw new AppError(400, `Order is ${order.status}`);

    const { payments } = completeOrderSchema.parse(req.body);
    const amountPaid = payments.reduce((s, p) => s + p.amount, 0);
    if (amountPaid < order.total - 0.01) {
      throw new AppError(400, `Insufficient payment: ${amountPaid} < ${order.total}`);
    }

    // Validate and deduct gift card balances
    for (const p of payments) {
      if (p.method === 'gift_card') {
        if (!p.giftCardId) throw new AppError(400, 'giftCardId required for gift_card payment');
        const card = await prisma.giftCard.findFirst({
          where: { id: p.giftCardId, tenantId: req.user!.tenantId, active: true },
        });
        if (!card) throw new AppError(400, 'Gift card not found or inactive');
        if (card.expiresAt && card.expiresAt < new Date()) throw new AppError(400, 'Gift card is expired');
        if (card.balance < p.amount - 0.01) throw new AppError(400, `Insufficient gift card balance: ${card.balance}`);
      }
    }

    // ── hook: order:before-complete (inventory deduction runs here) ────────────
    await hooks.run('order:before-complete', {
      payload: { order, payments, userId: req.user!.userId },
      meta: {},
    });

    const completed = await prisma.$transaction(async (tx) => {
      // Deduct gift card balances atomically (prevents overdraft under concurrent load)
      for (const p of payments) {
        if (p.method === 'gift_card' && p.giftCardId) {
          const result = await tx.giftCard.updateMany({
            where: { id: p.giftCardId, tenantId: req.user!.tenantId, active: true, balance: { gte: p.amount } },
            data: { balance: { decrement: p.amount } },
          });
          if (result.count === 0) {
            throw new AppError(400, 'Gift card has insufficient balance or is no longer active');
          }
          const updated = await tx.giftCard.findUnique({ where: { id: p.giftCardId } });
          await tx.giftCardTransaction.create({
            data: {
              giftCardId: p.giftCardId,
              orderId: order.id,
              type: 'redeem',
              amount: p.amount,
              balanceAfter: updated!.balance,
            },
          });
        }
      }

      // Update house account AR balance for any house_account payments
      const houseAccountTotal = payments
        .filter((p) => p.method === 'house_account')
        .reduce((s, p) => s + p.amount, 0);

      if (houseAccountTotal > 0 && order.customerId) {
        const customer = await tx.customer.findFirst({
          where: { id: order.customerId },
        });
        if (customer) {
          const newBalance = customer.arBalance + houseAccountTotal;
          if (customer.creditLimit != null && newBalance > customer.creditLimit) {
            throw new AppError(400, `Charge would exceed credit limit of ${customer.creditLimit}`);
          }
          await tx.customer.update({
            where: { id: customer.id },
            data: { arBalance: { increment: houseAccountTotal } },
          });
        }
      }

      return tx.order.update({
        where: { id: order.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          payments: {
            create: payments.map((p) => ({
              method: p.method,
              amount: p.amount,
              reference: p.reference,
              giftCardId: p.giftCardId,
            })),
          },
        },
        include: orderInclude,
      });
    });

    // ── hook: order:after-complete ─────────────────────────────────────────────
    await hooks.run('order:after-complete', {
      payload: { order: completed as Parameters<typeof hooks.run<'order:after-complete'>>[1]['payload']['order'] },
      meta: {},
    });

    res.json({ success: true, data: completed });
  } catch (err) {
    next(err);
  }
});

// ─── Void order ────────────────────────────────────────────────────────────────

ordersRouter.post('/:id/void', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { items: true },
    });
    if (!order) throw new AppError(404, 'Order not found');
    if (!['open', 'completed'].includes(order.status)) {
      throw new AppError(400, `Cannot void a ${order.status} order`);
    }

    const { note } = z.object({ note: z.string().optional() }).parse(req.body);

    // ── hook: order:before-void (inventory restore runs here) ─────────────────
    await hooks.run('order:before-void', {
      payload: { order, note, userId: req.user!.userId },
      meta: {},
    });

    const voided = await prisma.order.update({
      where: { id: order.id },
      data: { status: 'voided' },
      include: orderInclude,
    });

    // ── hook: order:after-void ─────────────────────────────────────────────────
    await hooks.run('order:after-void', {
      payload: { order: voided as Parameters<typeof hooks.run<'order:after-void'>>[1]['payload']['order'] },
      meta: {},
    });

    res.json({ success: true, data: voided });
  } catch (err) {
    next(err);
  }
});

// ─── Return order items ────────────────────────────────────────────────────────

const returnSchema = z.object({
  items: z.array(z.object({
    orderItemId: z.string(),
    quantity: z.number().positive(),
  })).min(1),
  reason: z.string().optional(),
  refundMethod: z.enum(['cash', 'card', 'store_credit']),
  restockItems: z.boolean().default(true),
});

ordersRouter.post('/:id/return', async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { items: true, returns: { include: { items: true } } },
    });
    if (!order) throw new AppError(404, 'Order not found');
    if (order.status !== 'completed') throw new AppError(400, 'Only completed orders can be returned');

    const { items, reason, refundMethod, restockItems } = returnSchema.parse(req.body);

    // Build map of already-returned quantities per order item
    const alreadyReturned = new Map<string, number>();
    for (const r of order.returns) {
      for (const ri of r.items) {
        alreadyReturned.set(ri.orderItemId, (alreadyReturned.get(ri.orderItemId) ?? 0) + ri.quantity);
      }
    }

    // Validate each line
    const returnLines: Array<{ orderItem: typeof order.items[0]; quantity: number }> = [];
    for (const line of items) {
      const orderItem = order.items.find((i) => i.id === line.orderItemId);
      if (!orderItem) throw new AppError(400, `Order item ${line.orderItemId} not found`);
      const maxReturnable = orderItem.quantity - (alreadyReturned.get(orderItem.id) ?? 0);
      if (line.quantity > maxReturnable) {
        throw new AppError(400, `Cannot return ${line.quantity} of "${orderItem.name}" — only ${maxReturnable} available`);
      }
      returnLines.push({ orderItem, quantity: line.quantity });
    }

    // Calculate totals
    let returnSubtotal = 0;
    let returnTax = 0;
    for (const { orderItem, quantity } of returnLines) {
      const linePrice = (orderItem.price - orderItem.discount) * quantity;
      returnSubtotal += linePrice;
      returnTax += linePrice * orderItem.taxRate;
    }
    const returnTotal = returnSubtotal + returnTax;

    const result = await prisma.$transaction(async (tx) => {
      // Create the return record
      const orderReturn = await tx.orderReturn.create({
        data: {
          orderId: order.id,
          userId: req.user!.userId,
          reason,
          subtotal: returnSubtotal,
          taxAmount: returnTax,
          total: returnTotal,
          items: {
            create: returnLines.map(({ orderItem, quantity }) => ({
              orderItemId: orderItem.id,
              quantity,
              price: orderItem.price - orderItem.discount,
              taxRate: orderItem.taxRate,
              total: (orderItem.price - orderItem.discount) * quantity * (1 + orderItem.taxRate),
            })),
          },
          refunds: {
            create: [{ method: refundMethod, amount: returnTotal }],
          },
        },
        include: { items: true, refunds: true },
      });

      // Restock inventory
      if (restockItems) {
        for (const { orderItem, quantity } of returnLines) {
          if (!orderItem.productId) continue;
          let inv = await tx.inventoryItem.findFirst({
            where: { locationId: order.locationId, productId: orderItem.productId, variantId: orderItem.variantId ?? null },
          });
          if (!inv) {
            inv = await tx.inventoryItem.create({
              data: { locationId: order.locationId, productId: orderItem.productId, variantId: orderItem.variantId ?? null, quantity: 0 },
            });
          }
          const updated = await tx.inventoryItem.update({
            where: { id: inv.id },
            data: { quantity: { increment: quantity } },
          });
          await tx.inventoryAdjustment.create({
            data: {
              inventoryItemId: inv.id,
              userId: req.user!.userId,
              type: 'return',
              delta: quantity,
              quantityAfter: updated.quantity,
              reference: `return:${orderReturn.id}`,
              note: reason ? `Return: ${reason}` : 'Customer return',
            },
          });
        }
      }

      // Issue store credit as a gift card
      let storeCreditCode: string | undefined;
      if (refundMethod === 'store_credit' && returnTotal > 0) {
        const code = `SC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        await tx.giftCard.create({
          data: {
            tenantId: req.user!.tenantId,
            code,
            balance: returnTotal,
            initialBalance: returnTotal,
          },
        });
        storeCreditCode = code;
      }

      // Mark order as refunded if every item is now fully returned
      const allReturnItems = await tx.orderReturnItem.findMany({
        where: { return: { orderId: order.id } },
      });
      const returnedQtyByItem = new Map<string, number>();
      for (const ri of allReturnItems) {
        returnedQtyByItem.set(ri.orderItemId, (returnedQtyByItem.get(ri.orderItemId) ?? 0) + ri.quantity);
      }
      const fullyReturned = order.items.every((i) => (returnedQtyByItem.get(i.id) ?? 0) >= i.quantity);
      if (fullyReturned) {
        await tx.order.update({ where: { id: order.id }, data: { status: 'refunded' } });
      }

      return { orderReturn, storeCreditCode };
    });

    res.status(201).json({
      success: true,
      data: result.orderReturn,
      ...(result.storeCreditCode ? { storeCreditCode: result.storeCreditCode } : {}),
    });
  } catch (err) {
    next(err);
  }
});
