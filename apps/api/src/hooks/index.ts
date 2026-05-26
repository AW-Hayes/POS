export { hooks } from './registry';
export type { HookName, HookHandler, HookContext, HookPayloadMap } from './types';

import { hooks } from './registry';
import { inventoryDeductHook, inventoryRestoreHook } from './builtins/inventoryHook';
import {
  auditOrderCreatedHook,
  auditOrderCompletedHook,
  auditOrderVoidedHook,
} from './builtins/auditHook';

/**
 * Register all built-in hooks. Called once at app startup.
 * Custom integrations should call hooks.register() after this.
 */
export function registerBuiltinHooks(): void {
  hooks.register('order:before-complete', inventoryDeductHook);
  hooks.register('order:before-void', inventoryRestoreHook);
  hooks.register('order:after-create', auditOrderCreatedHook);
  hooks.register('order:after-complete', auditOrderCompletedHook);
  hooks.register('order:after-void', auditOrderVoidedHook);
}
