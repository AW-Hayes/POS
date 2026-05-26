import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const serialNumbersRouter = Router();
serialNumbersRouter.use(authenticate);

// List serial numbers for a product
serialNumbersRouter.get('/products/:productId', async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.productId, tenantId: req.user!.tenantId },
    });
    if (!product) throw new AppError(404, 'Product not found');

    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const serials = await prisma.serialNumber.findMany({
      where: { productId: product.id, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: serials });
  } catch (err) {
    next(err);
  }
});

// Add serial numbers (bulk from PO receipt or manual entry)
serialNumbersRouter.post('/products/:productId', async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.productId, tenantId: req.user!.tenantId },
    });
    if (!product) throw new AppError(404, 'Product not found');

    const { serials, variantId, purchaseOrderId } = z
      .object({
        serials: z.array(z.string().min(1)).min(1),
        variantId: z.string().optional(),
        purchaseOrderId: z.string().optional(),
      })
      .parse(req.body);

    const created = await prisma.$transaction(
      serials.map((serial) =>
        prisma.serialNumber.upsert({
          where: { productId_serial: { productId: product.id, serial } },
          create: { productId: product.id, variantId, serial, purchaseOrderId },
          update: {},
        })
      )
    );

    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
});

// Assign a serial to an order item (mark as sold)
serialNumbersRouter.post('/:id/assign', async (req, res, next) => {
  try {
    const { orderItemId } = z.object({ orderItemId: z.string() }).parse(req.body);

    const serial = await prisma.serialNumber.findFirst({
      where: { id: req.params.id },
      include: { product: { select: { tenantId: true } } },
    });
    if (!serial || serial.product.tenantId !== req.user!.tenantId) throw new AppError(404, 'Serial number not found');
    if (serial.status !== 'available') throw new AppError(400, `Serial ${serial.serial} is already ${serial.status}`);

    const updated = await prisma.serialNumber.update({
      where: { id: serial.id },
      data: { status: 'sold', orderItemId, soldAt: new Date() },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// Return a serial number (mark as returned / available)
serialNumbersRouter.post('/:id/return', async (req, res, next) => {
  try {
    const serial = await prisma.serialNumber.findFirst({
      where: { id: req.params.id },
      include: { product: { select: { tenantId: true } } },
    });
    if (!serial || serial.product.tenantId !== req.user!.tenantId) throw new AppError(404, 'Serial number not found');

    const updated = await prisma.serialNumber.update({
      where: { id: serial.id },
      data: { status: 'returned', soldAt: null },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// Look up a serial by value
serialNumbersRouter.get('/lookup', async (req, res, next) => {
  try {
    const serial = typeof req.query.serial === 'string' ? req.query.serial : undefined;
    if (!serial) throw new AppError(400, 'serial query param required');

    const found = await prisma.serialNumber.findFirst({
      where: { serial, product: { tenantId: req.user!.tenantId } },
      include: { product: { select: { id: true, name: true, sku: true } } },
    });
    if (!found) throw new AppError(404, 'Serial number not found');
    res.json({ success: true, data: found });
  } catch (err) {
    next(err);
  }
});
