import type {
  CheckoutStep,
  PaymentMethod,
  PipelineHookName,
  PipelineHookHandler,
  CheckoutState,
} from './types';

// ─── Pipeline registry ─────────────────────────────────────────────────────────

/**
 * Manages the ordered list of checkout steps and frontend pipeline hooks.
 *
 * Steps:
 *   registry.insertStep(step)                 — append
 *   registry.insertStepBefore(id, step)       — insert before an existing step
 *   registry.insertStepAfter(id, step)        — insert after an existing step
 *   registry.removeStep(id)                   — remove by id
 *   registry.replaceStep(id, step)            — swap out a step
 *
 * Pipeline hooks:
 *   registry.on('pipeline:before-start', handler)
 *   registry.on('pipeline:before-submit', handler)
 *   registry.on('pipeline:after-submit', handler)
 */
class PipelineRegistry {
  private steps: CheckoutStep[] = [];
  private hookMap = new Map<PipelineHookName, PipelineHookHandler[]>();

  // ── Step management ──────────────────────────────────────────────────────────

  getSteps(): CheckoutStep[] {
    return [...this.steps];
  }

  insertStep(step: CheckoutStep): void {
    if (this.steps.find((s) => s.id === step.id)) {
      console.warn(`[checkout] Step "${step.id}" already registered — skipping`);
      return;
    }
    this.steps.push(step);
  }

  insertStepBefore(targetId: string, step: CheckoutStep): void {
    const idx = this.steps.findIndex((s) => s.id === targetId);
    if (idx === -1) throw new Error(`[checkout] Step "${targetId}" not found`);
    this.steps.splice(idx, 0, step);
  }

  insertStepAfter(targetId: string, step: CheckoutStep): void {
    const idx = this.steps.findIndex((s) => s.id === targetId);
    if (idx === -1) throw new Error(`[checkout] Step "${targetId}" not found`);
    this.steps.splice(idx + 1, 0, step);
  }

  removeStep(id: string): void {
    this.steps = this.steps.filter((s) => s.id !== id);
  }

  replaceStep(id: string, step: CheckoutStep): void {
    const idx = this.steps.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`[checkout] Step "${id}" not found`);
    this.steps[idx] = step;
  }

  // ── Pipeline hooks ───────────────────────────────────────────────────────────

  on(event: PipelineHookName, handler: PipelineHookHandler): void {
    const list = this.hookMap.get(event) ?? [];
    list.push(handler);
    this.hookMap.set(event, list);
  }

  off(event: PipelineHookName, handler: PipelineHookHandler): void {
    const list = this.hookMap.get(event) ?? [];
    this.hookMap.set(event, list.filter((h) => h !== handler));
  }

  async runHook(event: PipelineHookName, state: CheckoutState): Promise<CheckoutState> {
    const list = this.hookMap.get(event) ?? [];
    let current = state;
    for (const handler of list) {
      const result = await handler(current);
      if (result) current = result;
    }
    return current;
  }
}

export const pipelineRegistry = new PipelineRegistry();

// ─── Payment method registry ───────────────────────────────────────────────────

class PaymentMethodRegistry {
  private methods: PaymentMethod[] = [];

  register(method: PaymentMethod): void {
    if (this.methods.find((m) => m.id === method.id)) {
      console.warn(`[checkout] Payment method "${method.id}" already registered — replacing`);
      this.methods = this.methods.filter((m) => m.id !== method.id);
    }
    this.methods.push(method);
  }

  unregister(id: string): void {
    this.methods = this.methods.filter((m) => m.id !== id);
  }

  getAll(): PaymentMethod[] {
    return [...this.methods];
  }

  get(id: string): PaymentMethod | undefined {
    return this.methods.find((m) => m.id === id);
  }
}

export const paymentMethodRegistry = new PaymentMethodRegistry();
