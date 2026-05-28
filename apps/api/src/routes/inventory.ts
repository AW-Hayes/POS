import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { qs } from '../lib/qs';

type TxClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export const inventoryRouter = Router();
inventoryRouter.use(authenticate);

const adjustmentTypeValues = [
  'sale', 'return', 'purchase', 'adjustment',
  'transfer_in', 'transfer_out', 'damage', 'shrinkage',
] as const;

inventoryRouter.get('/', async (req, res, next) => {
  try {
    const locationId = qs(req.query.locationId);
    const productId = qs(req.query.productId);
    const lowStock = qs(req.query.lowStock) === 'true';
    const page = Number(qs(req.query.page) ?? '1');
    const pageSize = Math.min(Number(qs(req.query.pageSize) ?? '50'), 200);
    const skip = (page - 1) * pageSize;

    const baseWhere = {
      location: { tenantId: req.user!.tenantId },
      ...(locationId ? { locationId } : {}),
      ...(productId ? { productId } : {}),
    };

    const itemInclude = {
      product: { select: { id: true, name: true, sku: true, barcode: true, imageUrl: true } },
      variant: {
        include: {
          attributeValues: { include: { productAttribute: { include: { attribute: true } } } },
        },
      },
    };

    // Prisma cannot compare two columns in a WHERE clause without raw SQL, so for
    // the low-stock case we fetch all matching rows (with lowStockAt set), filter
    // in application code, then slice for the requested page.
    let items: Awaited<ReturnType<typeof prisma.inventoryItem.findMany>>;
    let total: number;

    if (lowStock) {
      const all = await prisma.inventoryItem.findMany({
        where: { ...baseWhere, lowStockAt: { not: null } },
        include: itemInclude,
        orderBy: { product: { name: 'asc' } },
      });
      const filtered = all.filter((i) => i.lowStockAt != null && i.quantity <= i.lowStockAt);
      total = filtered.length;
      items = filtered.slice(skip, skip + pageSize);
    } else {
      [items, total] = await Promise.all([
        prisma.inventoryItem.findMany({
          where: baseWhere,
          include: itemInclude,
          orderBy: { product: { name: 'asc' } },
          skip,
          take: pageSize,
        }),
        prisma.inventoryItem.count({ where: baseWhere }),
      ]);
    }

    res.json({ success: true, data: items, total, page, pageSize, pageCount: Math.ceil(total / pageSize) });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/:locationId/:productId', async (req, res, next) => {
  try {
    const variantId = qs(req.query.variantId) ?? null;
    const item = await prisma.inventoryItem.findFirst({
      where: {
        locationId: req.params.locationId,
        productId: req.params.productId,
        variantId,
        location: { tenantId: req.user!.tenantId },
      },
      include: { adjustments: { orderBy: { createdAt: 'desc' }, take: 20 } },
    });
    if (!item) throw new AppError(404, 'Inventory item not found');
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/adjust', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const schema = z.object({
      locationId: z.string(),
      productId: z.string(),
      variantId: z.string().optional(),
      type: z.enum(adjustmentTypeValues),
      delta: z.number(),
      note: z.string().optional(),
    });
    const data = schema.parse(req.body);

    const location = await prisma.location.findFirst({
      where: { id: data.locationId, tenantId: req.user!.tenantId },
    });
    if (!location) throw new AppError(404, 'Location not found');

    const result = await adjustInventory({ ...data, userId: req.user!.userId });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/transfer', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const schema = z.object({
      fromLocationId: z.string(),
      toLocationId: z.string(),
      items: z.array(z.object({
        productId: z.string(),
        variantId: z.string().optional(),
        quantity: z.number().positive(),
      })),
      note: z.string().optional(),
    });
    const data = schema.parse(req.body);

    const [from, to] = await Promise.all([
      prisma.location.findFirst({ where: { id: data.fromLocationId, tenantId: req.user!.tenantId } }),
      prisma.location.findFirst({ where: { id: data.toLocationId, tenantId: req.user!.tenantId } }),
    ]);
    if (!from) throw new AppError(404, 'Source location not found');
    if (!to) throw new AppError(404, 'Destination location not found');

    // Wrap the entire multi-item transfer in one transaction so a partial failure
    // doesn't leave inventory at the source without crediting the destination.
    const results = await prisma.$transaction(async (tx) => {
      return Promise.all(
        data.items.map(async (item) => {
          const [out, into] = await Promise.all([
            adjustInventory({
              locationId: data.fromLocationId,
              productId: item.productId,
              variantId: item.variantId,
              type: 'transfer_out',
              delta: -item.quantity,
              note: data.note,
              userId: req.user!.userId,
            }, tx),
            adjustInventory({
              locationId: data.toLocationId,
              productId: item.productId,
              variantId: item.variantId,
              type: 'transfer_in',
              delta: item.quantity,
              note: data.note,
              userId: req.user!.userId,
            }, tx),
          ]);
          return { from: out, to: into };
        }),
      );
    });

    res.json({ success: true, data: results });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/adjustments', async (req, res, next) => {
  try {
    const locationId = qs(req.query.locationId);
    const productId = qs(req.query.productId);
    const type = qs(req.query.type);
    const page = Number(qs(req.query.page) ?? '1');
    const pageSize = Number(qs(req.query.pageSize) ?? '50');
    const skip = (page - 1) * pageSize;

    const adjustments = await prisma.inventoryAdjustment.findMany({
      where: {
        inventoryItem: {
          location: { tenantId: req.user!.tenantId },
          ...(locationId ? { locationId } : {}),
          ...(productId ? { productId } : {}),
        },
        ...(type ? { type } : {}),
      },
      include: {
        inventoryItem: {
          include: { product: { select: { id: true, name: true, sku: true } } },
        },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    });

    res.json({ success: true, data: adjustments });
  } catch (err) {
    next(err);
  }
});

// ─── CSV Import ───────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  function splitLine(line: string): string[] {
    const cells: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  }

  const headers = splitLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const rows = lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
  return { headers, rows };
}

inventoryRouter.post('/import-csv', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const schema = z.object({ csv: z.string().min(1) });
    const { csv } = schema.parse(req.body);
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;

    const { rows } = parseCSV(csv);
    if (rows.length === 0) {
      return res.json({ success: true, data: { imported: 0, errors: [] } });
    }

    // Pre-load all tenant products and locations for fast lookups
    const [allProducts, allLocations] = await Promise.all([
      prisma.product.findMany({
        where: { tenantId },
        select: { id: true, sku: true, barcode: true },
      }),
      prisma.location.findMany({
        where: { tenantId },
        select: { id: true, name: true },
      }),
    ]);

    const productBySku = new Map(allProducts.filter((p) => p.sku).map((p) => [p.sku!.toLowerCase(), p.id]));
    const productByBarcode = new Map(allProducts.filter((p) => p.barcode).map((p) => [p.barcode!.toLowerCase(), p.id]));
    const locationById = new Map(allLocations.map((l) => [l.id, l.id]));
    const locationByName = new Map(allLocations.map((l) => [l.name.toLowerCase(), l.id]));

    let imported = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed, header is row 1

      try {
        // Resolve product
        const skuVal = (row['sku'] ?? '').toLowerCase();
        const barcodeVal = (row['barcode'] ?? '').toLowerCase();
        let productId = skuVal ? productBySku.get(skuVal) : undefined;
        if (!productId && barcodeVal) productId = productByBarcode.get(barcodeVal);
        if (!productId) {
          errors.push({ row: rowNum, error: `Product not found (sku="${row['sku'] ?? ''}", barcode="${row['barcode'] ?? ''}")` });
          continue;
        }

        // Resolve location
        const locIdVal = row['location_id'] ?? '';
        const locNameVal = (row['location'] ?? '').toLowerCase();
        let locationId = locIdVal ? locationById.get(locIdVal) : undefined;
        if (!locationId && locNameVal) locationId = locationByName.get(locNameVal);
        if (!locationId) {
          errors.push({ row: rowNum, error: `Location not found (location_id="${row['location_id'] ?? ''}", location="${row['location'] ?? ''}")` });
          continue;
        }

        // Parse quantity (required)
        const qtyStr = row['quantity'] ?? '';
        const quantity = parseInt(qtyStr, 10);
        if (isNaN(quantity)) {
          errors.push({ row: rowNum, error: `Invalid quantity "${qtyStr}"` });
          continue;
        }

        // Optional fields
        const reorderPoint = row['reorder_point'] ? parseInt(row['reorder_point'], 10) : undefined;
        const reorderQty = row['reorder_qty'] ? parseInt(row['reorder_qty'], 10) : undefined;
        const binLocation = row['bin_location'] || undefined;
        const cost = row['cost'] ? parseFloat(row['cost']) : undefined;

        await prisma.$transaction(async (tx) => {
          let item = await tx.inventoryItem.findFirst({ where: { locationId, productId, variantId: null } });
          const delta = item ? quantity - item.quantity : quantity;

          if (!item) {
            item = await tx.inventoryItem.create({
              data: { locationId, productId, variantId: null, quantity: 0 },
            });
          }

          await tx.inventoryItem.update({
            where: { id: item.id },
            data: {
              quantity,
              ...(reorderPoint != null && !isNaN(reorderPoint) ? { reorderPoint } : {}),
              ...(reorderQty != null && !isNaN(reorderQty) ? { reorderQty } : {}),
              ...(binLocation ? { binLocation } : {}),
            },
          });

          await tx.inventoryAdjustment.create({
            data: {
              inventoryItemId: item.id,
              type: 'adjustment',
              delta,
              quantityAfter: quantity,
              note: 'CSV import',
              userId,
            },
          });

          if (cost != null && !isNaN(cost)) {
            await tx.product.update({ where: { id: productId! }, data: { cost } });
          }
        });

        imported++;
      } catch (err) {
        errors.push({ row: rowNum, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    res.json({ success: true, data: { imported, errors } });
  } catch (err) {
    next(err);
  }
});

// ─── Shared helper ────────────────────────────────────────────────────────────

export async function adjustInventory(
  params: {
    locationId: string;
    productId: string;
    variantId?: string;
    type: typeof adjustmentTypeValues[number];
    delta: number;
    note?: string;
    reference?: string;
    userId?: string;
  },
  txClient?: TxClient,
) {
  const { locationId, productId, variantId, type, delta, note, reference, userId } = params;

  async function run(tx: TxClient) {
    // Use findFirst + create to handle nullable variantId in compound unique
    let item = await tx.inventoryItem.findFirst({
      where: { locationId, productId, variantId: variantId ?? null },
    });

    if (!item) {
      item = await tx.inventoryItem.create({
        data: { locationId, productId, variantId: variantId ?? null, quantity: 0 },
      });
    }

    const quantityAfter = item.quantity + delta;

    const [updated] = await Promise.all([
      tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: quantityAfter },
      }),
      tx.inventoryAdjustment.create({
        data: { inventoryItemId: item.id, type, delta, quantityAfter, note, reference, userId },
      }),
    ]);

    return updated;
  }

  return txClient ? run(txClient) : prisma.$transaction(run);
}

// ─── Reorder points ───────────────────────────────────────────────────────────

inventoryRouter.get('/below-reorder', async (req, res, next) => {
  try {
    const locationId = qs(req.query.locationId);

    const all = await prisma.inventoryItem.findMany({
      where: {
        location: { tenantId: req.user!.tenantId },
        ...(locationId ? { locationId } : {}),
        reorderPoint: { not: null },
      },
      include: {
        product: {
          select: { id: true, name: true, sku: true, cost: true, preferredVendorId: true, preferredVendor: { select: { id: true, name: true } } },
        },
        variant: { select: { id: true, sku: true } },
      },
    });

    const belowReorder = all.filter((i) => i.reorderPoint != null && i.quantity <= i.reorderPoint);
    res.json({ success: true, data: belowReorder });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.put('/:locationId/:productId/reorder', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { variantId, reorderPoint, reorderQty } = z
      .object({
        variantId: z.string().optional(),
        reorderPoint: z.number().min(0).nullable(),
        reorderQty: z.number().min(0).nullable(),
      })
      .parse(req.body);

    const item = await prisma.inventoryItem.findFirst({
      where: {
        locationId: req.params.locationId,
        productId: req.params.productId,
        variantId: variantId ?? null,
        location: { tenantId: req.user!.tenantId },
      },
    });
    if (!item) throw new AppError(404, 'Inventory item not found');

    const updated = await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { reorderPoint, reorderQty },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.put('/:locationId/:productId/bin', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { variantId, binLocation } = z
      .object({
        variantId: z.string().optional(),
        binLocation: z.string().nullable(),
      })
      .parse(req.body);

    const item = await prisma.inventoryItem.findFirst({
      where: {
        locationId: req.params.locationId,
        productId: req.params.productId,
        variantId: variantId ?? null,
        location: { tenantId: req.user!.tenantId },
      },
    });
    if (!item) throw new AppError(404, 'Inventory item not found');

    const updated = await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { binLocation },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});
