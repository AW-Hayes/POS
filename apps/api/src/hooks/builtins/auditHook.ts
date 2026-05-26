import type {
  HookContext,
  OrderAfterCreatePayload,
  OrderAfterCompletePayload,
  OrderAfterVoidPayload,
} from '../types';

/**
 * Lightweight audit logger. Writes structured events to stdout so they can
 * be captured by any log aggregator (Docker logs, CloudWatch, Loki, etc.).
 * Replace or extend with a database audit table as needed.
 */

export async function auditOrderCreatedHook(
  ctx: HookContext<OrderAfterCreatePayload>,
): Promise<HookContext<OrderAfterCreatePayload>> {
  const { order } = ctx.payload;
  console.log(
    JSON.stringify({
      event: 'order:created',
      orderId: order.id,
      tenantId: order.tenantId,
      locationId: order.locationId,
      userId: order.userId,
      total: order.total,
      itemCount: order.items.length,
      ts: new Date().toISOString(),
    }),
  );
  return ctx;
}

export async function auditOrderCompletedHook(
  ctx: HookContext<OrderAfterCompletePayload>,
): Promise<HookContext<OrderAfterCompletePayload>> {
  const { order } = ctx.payload;
  console.log(
    JSON.stringify({
      event: 'order:completed',
      orderId: order.id,
      tenantId: order.tenantId,
      total: order.total,
      paymentMethods: order.payments.map((p) => p.method),
      ts: new Date().toISOString(),
    }),
  );
  return ctx;
}

export async function auditOrderVoidedHook(
  ctx: HookContext<OrderAfterVoidPayload>,
): Promise<HookContext<OrderAfterVoidPayload>> {
  const { order } = ctx.payload;
  console.log(
    JSON.stringify({
      event: 'order:voided',
      orderId: order.id,
      tenantId: order.tenantId,
      ts: new Date().toISOString(),
    }),
  );
  return ctx;
}
