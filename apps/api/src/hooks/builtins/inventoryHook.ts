import { prisma } from '../../lib/prisma';
import { adjustInventory } from '../../routes/inventory';
import type { HookContext, OrderCompletePayload, OrderVoidPayload } from '../types';

/**
 * Deducts inventory for tracked products when an order completes.
 * Registered on 'order:before-complete'.
 */
export async function inventoryDeductHook(
  ctx: HookContext<OrderCompletePayload>,
): Promise<HookContext<OrderCompletePayload>> {
  const { order, userId } = ctx.payload;

  const trackedProducts = await prisma.product.findMany({
    where: {
      id: { in: order.items.map((i) => i.productId).filter((id): id is string => id != null) },
      trackInventory: true,
    },
    select: { id: true },
  });
  const trackedIds = new Set(trackedProducts.map((p) => p.id));

  await Promise.all(
    order.items
      .filter((item) => item.productId && trackedIds.has(item.productId))
      .map((item) =>
        adjustInventory({
          locationId: order.locationId,
          productId: item.productId!,
          variantId: item.variantId ?? undefined,
          type: 'sale',
          delta: -item.quantity,
          reference: order.id,
          userId,
        }),
      ),
  );

  return ctx;
}

/**
 * Restores inventory when a completed order is voided.
 * Registered on 'order:before-void'.
 */
export async function inventoryRestoreHook(
  ctx: HookContext<OrderVoidPayload>,
): Promise<HookContext<OrderVoidPayload>> {
  const { order, note, userId } = ctx.payload;

  // Only restore if the order was previously completed
  if (order.status !== 'completed') return ctx;

  const trackedProducts = await prisma.product.findMany({
    where: {
      id: { in: order.items.map((i) => i.productId).filter((id): id is string => id != null) },
      trackInventory: true,
    },
    select: { id: true },
  });
  const trackedIds = new Set(trackedProducts.map((p) => p.id));

  await Promise.all(
    order.items
      .filter((item) => item.productId && trackedIds.has(item.productId))
      .map((item) =>
        adjustInventory({
          locationId: order.locationId,
          productId: item.productId!,
          variantId: item.variantId ?? undefined,
          type: 'return',
          delta: item.quantity,
          reference: order.id,
          note,
          userId,
        }),
      ),
  );

  return ctx;
}
