import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const labelsRouter = Router();
labelsRouter.use(authenticate);

function labelHtml(items: Array<{ name: string; sku?: string | null; barcode?: string | null; price: number }>) {
  const labels = items.map(item => `
    <div class="label">
      <div class="name">${item.name}</div>
      ${item.sku ? `<div class="sku">SKU: ${item.sku}</div>` : ''}
      ${item.barcode ? `<div class="barcode">${item.barcode}</div>` : ''}
      <div class="price">$${item.price.toFixed(2)}</div>
    </div>`).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Labels</title>
<style>
  body { font-family: sans-serif; margin: 0; padding: 8px; }
  .label {
    display: inline-block;
    width: 2.5in; height: 1.25in;
    border: 1px solid #ccc;
    padding: 4px 8px;
    margin: 4px;
    page-break-inside: avoid;
    box-sizing: border-box;
    vertical-align: top;
  }
  .name { font-weight: bold; font-size: 11px; line-height: 1.2; max-height: 2.4em; overflow: hidden; }
  .sku { font-size: 9px; color: #666; margin-top: 2px; }
  .barcode { font-family: monospace; font-size: 10px; margin-top: 2px; letter-spacing: 1px; }
  .price { font-size: 14px; font-weight: bold; margin-top: 4px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
${labels}
<script>window.onload = () => window.print();</script>
</body>
</html>`;
}

// Generate labels for one or more products
labelsRouter.post('/products', async (req, res, next) => {
  try {
    const { productIds, copies = 1 } = z
      .object({ productIds: z.array(z.string()).min(1), copies: z.number().int().min(1).max(100).default(1) })
      .parse(req.body);

    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, tenantId: req.user!.tenantId },
      select: { id: true, name: true, sku: true, barcode: true, price: true },
    });

    const items = products.flatMap(p => Array(copies).fill({ name: p.name, sku: p.sku, barcode: p.barcode, price: p.price }));

    res.setHeader('Content-Type', 'text/html');
    res.send(labelHtml(items));
  } catch (err) {
    next(err);
  }
});

// Generate labels for items in a purchase order
labelsRouter.get('/purchase-orders/:poId', async (req, res, next) => {
  try {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: req.params.poId, tenantId: req.user!.tenantId },
      include: {
        items: {
          include: { product: { select: { name: true, sku: true, barcode: true, price: true } } },
        },
      },
    });
    if (!po) throw new AppError(404, 'Purchase order not found');

    const items = po.items.flatMap(i =>
      Array(i.receivedQty || i.orderedQty).fill({
        name: i.product.name,
        sku: i.product.sku,
        barcode: i.product.barcode,
        price: i.product.price,
      })
    );

    res.setHeader('Content-Type', 'text/html');
    res.send(labelHtml(items));
  } catch (err) {
    next(err);
  }
});
