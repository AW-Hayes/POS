import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { qs } from '../lib/qs';

export const purchaseOrdersRouter = Router();
purchaseOrdersRouter.use(authenticate, requireRole('admin', 'manager'));

const poInclude = {
  vendor: true,
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true, barcode: true } },
      variant: { select: { id: true, sku: true, barcode: true } },
    },
  },
};

purchaseOrdersRouter.get('/', async (req, res, next) => {
  try {
    const locationId = qs(req.query.locationId);
    const status = qs(req.query.status);
    const page = Number(qs(req.query.page) ?? '1');
    const pageSize = Math.min(Number(qs(req.query.pageSize) ?? '50'), 200);

    const where = {
      tenantId: req.user!.tenantId,
      ...(locationId ? { locationId } : {}),
      ...(status ? { status } : {}),
    };

    const [pos, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: poInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    res.json({ success: true, data: pos, total, page, pageSize, pageCount: Math.ceil(total / pageSize) });
  } catch (err) {
    next(err);
  }
});

const createPoSchema = z.object({
  locationId: z.string(),
  vendorId: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    productId: z.string(),
    variantId: z.string().optional(),
    orderedQty: z.number().int().positive(),
    unitCost: z.number().min(0),
  })).min(1),
});

purchaseOrdersRouter.post('/', async (req, res, next) => {
  try {
    const data = createPoSchema.parse(req.body);

    const location = await prisma.location.findFirst({
      where: { id: data.locationId, tenantId: req.user!.tenantId },
    });
    if (!location) throw new AppError(404, 'Location not found');

    const productIds = [...new Set(data.items.map((i) => i.productId))];
    const validProducts = await prisma.product.findMany({
      where: { id: { in: productIds }, tenantId: req.user!.tenantId },
      select: { id: true },
    });
    if (validProducts.length !== productIds.length) {
      throw new AppError(400, 'One or more products not found');
    }

    const total = data.items.reduce((s, i) => s + i.orderedQty * i.unitCost, 0);

    const po = await prisma.purchaseOrder.create({
      data: {
        tenantId: req.user!.tenantId,
        locationId: data.locationId,
        vendorId: data.vendorId,
        userId: req.user!.userId,
        notes: data.notes,
        total,
        items: {
          create: data.items.map((i) => ({
            ...i,
            total: i.orderedQty * i.unitCost,
          })),
        },
      },
      include: poInclude,
    });

    res.status(201).json({ success: true, data: po });
  } catch (err) {
    next(err);
  }
});

purchaseOrdersRouter.get('/:id', async (req, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: poInclude,
    });
    if (!po) throw new AppError(404, 'Purchase order not found');
    res.json({ success: true, data: po });
  } catch (err) {
    next(err);
  }
});

purchaseOrdersRouter.post('/:id/submit', async (req, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!po) throw new AppError(404, 'Purchase order not found');
    if (po.status !== 'draft') throw new AppError(400, 'Only draft orders can be submitted');

    const updated = await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status: 'ordered', orderedAt: new Date() },
      include: poInclude,
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

const receiveSchema = z.object({
  items: z.array(z.object({
    purchaseOrderItemId: z.string(),
    receivedQty: z.number().int().min(0),
  })),
});

purchaseOrdersRouter.post('/:id/receive', async (req, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { items: true },
    });
    if (!po) throw new AppError(404, 'Purchase order not found');
    if (!['ordered', 'partial'].includes(po.status)) {
      throw new AppError(400, 'Purchase order is not in a receivable status');
    }

    const { items } = receiveSchema.parse(req.body);

    await prisma.$transaction(async (tx) => {
      for (const recv of items) {
        const poItem = po.items.find((i) => i.id === recv.purchaseOrderItemId);
        if (!poItem) throw new AppError(400, `PO item ${recv.purchaseOrderItemId} not found`);

        const newReceived = poItem.receivedQty + recv.receivedQty;
        if (newReceived > poItem.orderedQty) {
          throw new AppError(400, `Cannot receive more than ordered for item ${poItem.id}`);
        }

        await tx.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: { receivedQty: newReceived },
        });

        if (recv.receivedQty > 0) {
          let inv = await tx.inventoryItem.findFirst({
            where: { locationId: po.locationId, productId: poItem.productId, variantId: poItem.variantId ?? null },
          });
          if (!inv) {
            inv = await tx.inventoryItem.create({
              data: { locationId: po.locationId, productId: poItem.productId, variantId: poItem.variantId ?? null, quantity: 0 },
            });
          }
          inv = await tx.inventoryItem.update({
            where: { id: inv.id },
            data: { quantity: { increment: recv.receivedQty } },
          });

          await tx.inventoryAdjustment.create({
            data: {
              inventoryItemId: inv.id,
              userId: req.user!.userId,
              type: 'purchase',
              delta: recv.receivedQty,
              quantityAfter: inv.quantity,
              reference: `po:${po.id}`,
              note: `Received from PO ${po.id}`,
            },
          });

          // Update product cost with weighted average
          if (poItem.unitCost > 0) {
            await tx.product.update({
              where: { id: poItem.productId },
              data: { cost: poItem.unitCost },
            });
          }
        }
      }

      // Determine new PO status
      const updatedItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: po.id },
      });
      const allReceived = updatedItems.every((i) => i.receivedQty >= i.orderedQty);
      const anyReceived = updatedItems.some((i) => i.receivedQty > 0);

      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: {
          status: allReceived ? 'received' : anyReceived ? 'partial' : 'ordered',
          ...(allReceived ? { receivedAt: new Date() } : {}),
        },
      });
    });

    const updated = await prisma.purchaseOrder.findUnique({
      where: { id: po.id },
      include: poInclude,
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

purchaseOrdersRouter.post('/:id/cancel', async (req, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!po) throw new AppError(404, 'Purchase order not found');
    if (['received', 'cancelled'].includes(po.status)) {
      throw new AppError(400, `Cannot cancel a ${po.status} purchase order`);
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { status: 'cancelled' },
      include: poInclude,
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// ─── Print / PDF ───────────────────────────────────────────────────────────────

purchaseOrdersRouter.get('/:id/print', async (req, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: poInclude,
    });
    if (!po) throw new AppError(404, 'Purchase order not found');

    const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });

    const statusColors: Record<string, string> = {
      draft: '#6b7280', ordered: '#d97706', partial: '#d97706', received: '#16a34a', cancelled: '#dc2626',
    };

    const rows = po.items.map(item => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${item.product?.name ?? '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#6b7280">${item.product?.sku ?? item.variant?.sku ?? '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${item.orderedQty}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${item.receivedQty}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">$${item.unitCost.toFixed(2)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">$${item.total.toFixed(2)}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>PO #${po.id.slice(-8).toUpperCase()}</title>
<style>
  body { font-family: sans-serif; max-width: 900px; margin: 0 auto; padding: 32px; color: #111; }
  @media print { body { padding: 0; } .no-print { display: none; } }
  h1 { margin: 0 0 4px; font-size: 22px; }
  .meta { display: flex; gap: 40px; margin: 24px 0; }
  .meta-group { }
  .meta-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; }
  .meta-value { font-size: 14px; font-weight: 600; margin-top: 2px; }
  .status { display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; color: white; background: ${statusColors[po.status] ?? '#6b7280'}; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  thead th { padding: 8px; background: #f9fafb; text-align: left; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; }
  thead th:nth-child(n+3) { text-align: right; }
  .total-row td { padding: 10px 8px; font-weight: 700; font-size: 16px; border-top: 2px solid #111; }
  .notes { margin-top: 24px; padding: 12px; background: #f9fafb; border-radius: 6px; font-size: 13px; color: #374151; }
</style>
</head>
<body>
<button class="no-print" onclick="window.print()" style="float:right;padding:8px 16px;background:#111;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">Print / Save PDF</button>
<h1>Purchase Order</h1>
<p style="color:#6b7280;font-size:13px">PO #${po.id.slice(-8).toUpperCase()} &nbsp;·&nbsp; ${tenant?.name ?? ''}</p>
<div class="meta">
  <div class="meta-group"><div class="meta-label">Status</div><div class="meta-value"><span class="status">${po.status.toUpperCase()}</span></div></div>
  <div class="meta-group"><div class="meta-label">Vendor</div><div class="meta-value">${po.vendor?.name ?? 'No vendor'}</div></div>
  <div class="meta-group"><div class="meta-label">Created</div><div class="meta-value">${new Date(po.createdAt).toLocaleDateString()}</div></div>
  ${po.orderedAt ? `<div class="meta-group"><div class="meta-label">Ordered</div><div class="meta-value">${new Date(po.orderedAt).toLocaleDateString()}</div></div>` : ''}
  ${po.receivedAt ? `<div class="meta-group"><div class="meta-label">Received</div><div class="meta-value">${new Date(po.receivedAt).toLocaleDateString()}</div></div>` : ''}
</div>
<table>
  <thead>
    <tr>
      <th>Product</th><th>SKU</th><th style="text-align:right">Ordered</th>
      <th style="text-align:right">Received</th><th style="text-align:right">Unit Cost</th><th style="text-align:right">Total</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr class="total-row">
      <td colspan="5" style="text-align:right;padding:10px 8px;border-top:2px solid #111;font-weight:700">Order Total</td>
      <td style="padding:10px 8px;text-align:right;border-top:2px solid #111;font-weight:700;font-size:16px">$${po.total.toFixed(2)}</td>
    </tr>
  </tfoot>
</table>
${po.notes ? `<div class="notes"><strong>Notes:</strong> ${po.notes}</div>` : ''}
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    next(err);
  }
});
