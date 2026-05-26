import type { HookName, HookPayloadMap, HookHandler, HookContext } from './types';

/**
 * Central hook registry. Register handlers for named order lifecycle events.
 * Handlers run in registration order. Any handler may throw to abort the
 * operation — the error propagates to the caller as an AppError.
 *
 * Usage:
 *   hooks.register('order:before-complete', myHandler);
 *   hooks.unregister('order:before-complete', myHandler);
 *   await hooks.run('order:before-complete', { payload, meta: {} });
 */
class HookRegistry {
  private handlers = new Map<HookName, HookHandler<unknown>[]>();

  register<E extends HookName>(event: E, handler: HookHandler<HookPayloadMap[E]>): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler as HookHandler<unknown>);
    this.handlers.set(event, list);
  }

  unregister<E extends HookName>(event: E, handler: HookHandler<HookPayloadMap[E]>): void {
    const list = this.handlers.get(event) ?? [];
    this.handlers.set(
      event,
      list.filter((h) => h !== (handler as HookHandler<unknown>)),
    );
  }

  async run<E extends HookName>(
    event: E,
    initial: HookContext<HookPayloadMap[E]>,
  ): Promise<HookContext<HookPayloadMap[E]>> {
    const list = this.handlers.get(event) ?? [];
    let ctx = initial as HookContext<unknown>;
    for (const handler of list) {
      ctx = await handler(ctx);
    }
    return ctx as HookContext<HookPayloadMap[E]>;
  }

  /** Returns registered handler count for an event (useful for testing). */
  count(event: HookName): number {
    return this.handlers.get(event)?.length ?? 0;
  }
}

export const hooks = new HookRegistry();
