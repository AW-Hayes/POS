import { Router } from 'express';
import { z } from 'zod';
import { parse as parseCsv } from 'csv-parse/sync';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { qs } from '../lib/qs';

export const productsRouter = Router();
productsRouter.use(authenticate);

const productSchema = z.object({
  productTypeId: z.string().optional(),
  categoryId: z.string().optional(),
  classId: z.string().optional(),
  finelineId: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  sku: z.string().optional(),
  upc: z.string().optional(),
  barcode: z.string().optional(),
  shortCode: z.string().optional(),
  price: z.number().min(0),
  cost: z.number().min(0).optional(),
  taxable: z.boolean().default(true),
  trackInventory: z.boolean().default(true),
  imageUrl: z.string().url().optional(),
  sortOrder: z.number().int().optional(),
  requiresAgeVerification: z.boolean().default(false),
  minAge: z.number().int().min(1).optional(),
});

const productInclude = {
  productType: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, color: true } },
  class: { select: { id: true, name: true } },
  fineline: { select: { id: true, name: true } },
  attributes: { include: { attribute: true } },
  variants: {
    where: { active: true },
    include: { attributeValues: { include: { productAttribute: { include: { attribute: true } } } } },
    orderBy: { sortOrder: 'asc' as const },
  },
  priceBreaks: { orderBy: [{ variantId: 'asc' as const }, { minQty: 'asc' as const }] },
};

productsRouter.get('/', async (req, res, next) => {
  try {
    const q = qs(req.query.q);
    const categoryId = qs(req.query.categoryId);
    const productTypeId = qs(req.query.productTypeId);
    const classId = qs(req.query.classId);
    const finelineId = qs(req.query.finelineId);
    const activeParam = qs(req.query.active) ?? 'true';
    const page = Number(qs(req.query.page) ?? '1');
    const pageSize = Math.min(Number(qs(req.query.pageSize) ?? '50'), 200);
    const skip = (page - 1) * pageSize;

    const sku = qs(req.query.sku);
    const barcode = qs(req.query.barcode);
    const upc = qs(req.query.upc);
    const shortCode = qs(req.query.shortCode);

    // Exact-match lookups take priority; fall back to name search
    const exactLookup = sku || barcode || upc || shortCode;

    const where = {
      tenantId: req.user!.tenantId,
      active: activeParam === 'true',
      ...(categoryId ? { categoryId } : {}),
      ...(productTypeId ? { productTypeId } : {}),
      ...(classId ? { classId } : {}),
      ...(finelineId ? { finelineId } : {}),
      ...(sku ? { sku } : {}),
      ...(barcode ? { barcode } : {}),
      ...(upc ? { upc } : {}),
      ...(shortCode ? { shortCode } : {}),
      ...(q && !exactLookup ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip,
        take: pageSize,
      }),
      prisma.product.count({ where }),
    ]);

    res.json({ success: true, data: products, total, page, pageSize, pageCount: Math.ceil(total / pageSize) });
  } catch (err) {
    next(err);
  }
});

function generateSku(name: string): string {
  const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 12);
  const suffix = Math.random().toString(36).toUpperCase().slice(2, 7);
  return `${slug}-${suffix}`;
}

productsRouter.post('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const data = productSchema.parse(req.body);
    if (!data.sku) {
      data.sku = generateSku(data.name);
    }
    const product = await prisma.product.create({
      data: { ...data, tenantId: req.user!.tenantId },
      include: productInclude,
    });
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
});

productsRouter.get('/lookup', async (req, res, next) => {
  try {
    const barcode = qs(req.query.barcode);
    const sku = qs(req.query.sku);
    const upc = qs(req.query.upc);
    const shortCode = qs(req.query.shortCode);
    // `code` matches against ALL identifiers in one query — used by the terminal scanner.
    const code = qs(req.query.code);
    if (!barcode && !sku && !upc && !shortCode && !code) {
      throw new AppError(400, 'Provide code, barcode, sku, upc, or shortCode');
    }

    // Build the product match. `code` ORs across every identifier; otherwise use
    // whichever specific field was provided (priority barcode → UPC → SKU → shortCode).
    const productWhere = code
      ? { OR: [{ barcode: code }, { upc: code }, { sku: code }, { shortCode: code }] }
      : barcode ? { barcode }
      : upc ? { upc }
      : sku ? { sku }
      : { shortCode: shortCode! };

    const product = await prisma.product.findFirst({
      where: { tenantId: req.user!.tenantId, active: true, ...productWhere },
      include: productInclude,
    });

    if (!product) {
      // Fall back to variant lookup (variants only carry barcode/sku).
      const variantWhere = code
        ? { OR: [{ barcode: code }, { sku: code }] }
        : barcode ? { barcode } : sku ? { sku } : null;
      if (variantWhere) {
        const variant = await prisma.productVariant.findFirst({
          where: { active: true, product: { tenantId: req.user!.tenantId, active: true }, ...variantWhere },
          include: { product: { include: productInclude } },
        });
        if (variant) {
          res.json({ success: true, data: variant.product, variantId: variant.id });
          return;
        }
      }
      throw new AppError(404, 'Product not found');
    }

    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
});

productsRouter.get('/:id', async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: productInclude,
    });
    if (!product) throw new AppError(404, 'Product not found');
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
});

productsRouter.patch('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!existing) throw new AppError(404, 'Product not found');
    const data = productSchema.partial().parse(req.body);
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data,
      include: productInclude,
    });
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
});

productsRouter.delete('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!existing) throw new AppError(404, 'Product not found');
    await prisma.product.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── Variants ────────────────────────────────────────────────────────────────

const variantSchema = z.object({
  sku: z.string().optional(),
  barcode: z.string().optional(),
  price: z.number().min(0).optional(),
  cost: z.number().min(0).optional(),
  sortOrder: z.number().int().optional(),
  attributeValues: z.array(z.object({ productAttributeId: z.string(), value: z.string() })).optional(),
});

productsRouter.post('/:id/variants', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    if (!product) throw new AppError(404, 'Product not found');

    const { attributeValues, ...variantData } = variantSchema.parse(req.body);
    const variant = await prisma.productVariant.create({
      data: {
        ...variantData,
        productId: req.params.id,
        ...(attributeValues ? { attributeValues: { create: attributeValues } } : {}),
      },
      include: { attributeValues: { include: { productAttribute: { include: { attribute: true } } } } },
    });
    res.status(201).json({ success: true, data: variant });
  } catch (err) {
    next(err);
  }
});

productsRouter.post('/:id/variants/generate', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
      include: { attributes: { include: { attribute: true } } },
    });
    if (!product) throw new AppError(404, 'Product not found');

    const { attributeValues } = z
      .object({ attributeValues: z.record(z.array(z.string())) })
      .parse(req.body);

    const attrDefIds = Object.keys(attributeValues);
    const productAttributes = await Promise.all(
      attrDefIds.map(async (attrId) => {
        const existing = product.attributes.find((pa) => pa.attributeId === attrId);
        if (existing) return existing;
        return prisma.productAttribute.create({
          data: { productId: req.params.id, attributeId: attrId },
        });
      }),
    );

    const combinations = cartesian(
      attrDefIds.map((id, i) =>
        attributeValues[id].map((val) => ({ productAttributeId: productAttributes[i].id, value: val })),
      ),
    );

    if (combinations.length > 500) {
      throw new AppError(400, `Variant generation would produce ${combinations.length} variants (max 500)`);
    }

    const created = await Promise.all(
      combinations.map((combo) =>
        prisma.productVariant.create({
          data: {
            productId: req.params.id,
            attributeValues: { create: combo },
          },
          include: { attributeValues: { include: { productAttribute: { include: { attribute: true } } } } },
        }),
      ),
    );

    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
});

productsRouter.patch('/:id/variants/:variantId', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const variant = await prisma.productVariant.findFirst({
      where: { id: req.params.variantId, productId: req.params.id },
    });
    if (!variant) throw new AppError(404, 'Variant not found');

    const data = variantSchema.omit({ attributeValues: true }).partial().parse(req.body);
    const updated = await prisma.productVariant.update({
      where: { id: req.params.variantId },
      data,
      include: { attributeValues: { include: { productAttribute: { include: { attribute: true } } } } },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

function cartesian<T>(arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>(
    (acc, arr) => acc.flatMap((combo) => arr.map((item) => [...combo, item])),
    [[]],
  );
}

// ─── Product CSV import ───────────────────────────────────────────────────────
// Accepts { csv: string } — frontend reads the file and sends raw text.
// Required columns: name, price
// Optional: sku, barcode, cost, description, category, taxable, imageUrl

productsRouter.post('/import-csv', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { csv } = z.object({ csv: z.string().min(1) }).parse(req.body);

    let rows: Record<string, string>[];
    try {
      rows = parseCsv(csv, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
    } catch {
      throw new AppError(400, 'Invalid CSV format');
    }

    // Pre-load categories for name lookup
    const categories = await prisma.category.findMany({
      where: { tenantId: req.user!.tenantId },
      select: { id: true, name: true },
    });
    const categoryMap = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

    let created = 0;
    let updated = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed + header

      try {
        const name = row['name']?.trim();
        if (!name) { errors.push({ row: rowNum, error: 'name is required' }); continue; }

        const price = parseFloat(row['price'] ?? '');
        if (isNaN(price) || price < 0) { errors.push({ row: rowNum, error: 'price must be a non-negative number' }); continue; }

        const sku = row['sku']?.trim() || undefined;
        const barcode = row['barcode']?.trim() || undefined;
        const cost = row['cost'] ? parseFloat(row['cost']) : undefined;
        const imageUrl = row['imageUrl']?.trim() || row['image_url']?.trim() || undefined;
        const taxable = row['taxable'] ? row['taxable'].trim().toLowerCase() !== 'false' && row['taxable'].trim() !== '0' : true;
        const description = row['description']?.trim() || undefined;

        // Resolve category by name
        const categoryName = row['category']?.trim().toLowerCase();
        const categoryId = categoryName ? categoryMap.get(categoryName) : undefined;

        // Upsert by SKU (within tenant), or create new if no SKU
        if (sku) {
          const existing = await prisma.product.findFirst({
            where: { tenantId: req.user!.tenantId, sku },
          });
          if (existing) {
            await prisma.product.update({
              where: { id: existing.id },
              data: { name, price, ...(cost != null ? { cost } : {}), taxable, description, barcode, imageUrl, categoryId },
            });
            updated++;
          } else {
            await prisma.product.create({
              data: { tenantId: req.user!.tenantId, name, price, sku, barcode, cost, taxable, description, imageUrl, categoryId },
            });
            created++;
          }
        } else {
          await prisma.product.create({
            data: { tenantId: req.user!.tenantId, name, price, barcode, cost, taxable, description, imageUrl, categoryId },
          });
          created++;
        }
      } catch (err) {
        errors.push({ row: rowNum, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    res.json({ success: true, data: { created, updated, imported: created + updated, errors } });
  } catch (err) {
    next(err);
  }
});

// ─── Bulk price update (CSV: sku,price,cost) ──────────────────────────────────

productsRouter.post('/bulk-price-update', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { csv } = z.object({ csv: z.string().min(1) }).parse(req.body);

    let rows: Record<string, string>[];
    try {
      rows = parseCsv(csv, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
    } catch {
      throw new AppError(400, 'Invalid CSV format');
    }

    let updated = 0;
    const errors: Array<{ row: number; error: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      try {
        const sku = row['sku']?.trim();
        const barcode = row['barcode']?.trim();
        if (!sku && !barcode) { errors.push({ row: rowNum, error: 'sku or barcode required' }); continue; }

        const priceRaw = row['price']?.trim();
        const costRaw = row['cost']?.trim();
        if (!priceRaw && !costRaw) { errors.push({ row: rowNum, error: 'at least price or cost required' }); continue; }

        const price = priceRaw ? parseFloat(priceRaw) : undefined;
        const cost = costRaw ? parseFloat(costRaw) : undefined;
        if (price !== undefined && (isNaN(price) || price < 0)) { errors.push({ row: rowNum, error: 'invalid price' }); continue; }
        if (cost !== undefined && (isNaN(cost) || cost < 0)) { errors.push({ row: rowNum, error: 'invalid cost' }); continue; }

        const where = sku
          ? { tenantId: req.user!.tenantId, sku }
          : { tenantId: req.user!.tenantId, barcode: barcode! };

        const existing = await prisma.product.findFirst({ where });
        if (!existing) { errors.push({ row: rowNum, error: `Product not found (${sku ? `sku: ${sku}` : `barcode: ${barcode}`})` }); continue; }

        await prisma.product.update({
          where: { id: existing.id },
          data: {
            ...(price !== undefined ? { price } : {}),
            ...(cost !== undefined ? { cost } : {}),
          },
        });
        updated++;
      } catch (err) {
        errors.push({ row: rowNum, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    res.json({ success: true, data: { updated, errors } });
  } catch (err) {
    next(err);
  }
});
