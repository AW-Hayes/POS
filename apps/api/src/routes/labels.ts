import { Router } from 'express';
import { z } from 'zod';
import bwipjs from 'bwip-js';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const labelsRouter = Router();
labelsRouter.use(authenticate);

async function barcodeDataUrl(value: string): Promise<string> {
  try {
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text: value,
      scale: 2,
      height: 8,
      includetext: false,
      paddingwidth: 2,
    });
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return '';
  }
}

async function labelHtml(items: Array<{ name: string; sku?: string | null; barcode?: string | null; price: number }>) {
  const labelBlocks = await Promise.all(items.map(async item => {
    const barcodeValue = item.barcode || item.sku;
    const barcodeImg = barcodeValue ? await barcodeDataUrl(barcodeValue) : '';
    return `
    <div class="label">
      <div class="name">${item.name}</div>
      ${item.sku ? `<div class="sku">SKU: ${item.sku}</div>` : ''}
      ${barcodeImg ? `<img class="barcode-img" src="${barcodeImg}" alt="${barcodeValue}" />` : ''}
      ${barcodeValue && !barcodeImg ? `<div class="barcode-text">${barcodeValue}</div>` : ''}
      <div class="price">$${item.price.toFixed(2)}</div>
    </div>`;
  }));

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
    overflow: hidden;
  }
  .name { font-weight: bold; font-size: 11px; line-height: 1.2; max-height: 2.4em; overflow: hidden; }
  .sku { font-size: 9px; color: #666; margin-top: 1px; }
  .barcode-img { display: block; max-width: 100%; height: 28px; margin-top: 2px; }
  .barcode-text { font-family: monospace; font-size: 9px; margin-top: 2px; letter-spacing: 1px; }
  .price { font-size: 14px; font-weight: bold; margin-top: 2px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
${labelBlocks.join('')}
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
    res.send(await labelHtml(items));
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
    res.send(await labelHtml(items));
  } catch (err) {
    next(err);
  }
});


// GET variant for single-product label (supports window.open from browser)
labelsRouter.get('/products', async (req, res, next) => {
  try {
    const raw = req.query.productIds;
    const productIds = Array.isArray(raw) ? raw as string[] : raw ? [raw as string] : [];
    const copies = Math.min(Number(req.query.copies ?? 1), 100);
    if (productIds.length === 0) throw new AppError(400, 'productIds required');

    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, tenantId: req.user!.tenantId },
      select: { id: true, name: true, sku: true, barcode: true, price: true },
    });

    const items = products.flatMap(p => Array(copies).fill({ name: p.name, sku: p.sku, barcode: p.barcode, price: p.price }));

    res.setHeader('Content-Type', 'text/html');
    res.send(await labelHtml(items));
  } catch (err) {
    next(err);
  }
});
