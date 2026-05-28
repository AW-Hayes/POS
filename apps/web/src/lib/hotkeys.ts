// ── Hotkey data model ─────────────────────────────────────────────────────────

export type HotkeyAction =
  | { type: 'navigate'; to: string }
  | { type: 'action'; id: string };

export interface HotkeyDef {
  id: string;
  label: string;
  group: 'Navigation' | 'Actions';
  defaultKey: string;
  action: HotkeyAction;
}

export const DEFAULT_HOTKEYS: HotkeyDef[] = [
  // Navigation
  { id: 'nav.terminal',        label: 'Go to Terminal',        group: 'Navigation', defaultKey: 'F2',      action: { type: 'navigate', to: '/terminal' } },
  { id: 'nav.orders',          label: 'Go to Orders',          group: 'Navigation', defaultKey: 'F3',      action: { type: 'navigate', to: '/orders' } },
  { id: 'nav.customers',       label: 'Go to Customers',       group: 'Navigation', defaultKey: 'F4',      action: { type: 'navigate', to: '/customers' } },
  { id: 'nav.products',        label: 'Go to Products',        group: 'Navigation', defaultKey: 'F5',      action: { type: 'navigate', to: '/products' } },
  { id: 'nav.inventory',       label: 'Go to Inventory',       group: 'Navigation', defaultKey: 'F6',      action: { type: 'navigate', to: '/inventory' } },
  { id: 'nav.reports',         label: 'Go to Reports',         group: 'Navigation', defaultKey: 'F7',      action: { type: 'navigate', to: '/reports' } },
  { id: 'nav.purchase-orders', label: 'Go to Purchase Orders', group: 'Navigation', defaultKey: 'F8',      action: { type: 'navigate', to: '/purchase-orders' } },
  { id: 'nav.settings',        label: 'Go to Settings',        group: 'Navigation', defaultKey: 'F9',      action: { type: 'navigate', to: '/settings' } },
  // Actions
  { id: 'action.help',         label: 'Show Keyboard Shortcuts', group: 'Actions', defaultKey: 'F1',      action: { type: 'action', id: 'help' } },
  { id: 'action.terminal-alt', label: 'Terminal (alt)',         group: 'Actions',   defaultKey: 'ctrl+`',  action: { type: 'action', id: 'terminal-alt' } },
  { id: 'action.orders-alt',   label: 'Orders (alt)',           group: 'Actions',   defaultKey: 'ctrl+o',  action: { type: 'action', id: 'orders-alt' } },
  { id: 'action.search',       label: 'Focus Search',           group: 'Actions',   defaultKey: 'ctrl+k',  action: { type: 'action', id: 'search' } },
  { id: 'action.eod',          label: 'Close Register (EOD)',   group: 'Actions',   defaultKey: 'ctrl+e',  action: { type: 'action', id: 'eod' } },
  { id: 'action.cash',         label: 'Cash In / Out',          group: 'Actions',   defaultKey: 'ctrl+i',  action: { type: 'action', id: 'cash' } },
  { id: 'action.help-alt',     label: 'Show Shortcuts (alt)',   group: 'Actions',   defaultKey: 'ctrl+/',  action: { type: 'action', id: 'help' } },
];

const STORAGE_KEY = 'pos_hotkeys';

/** Returns id → key map, merging user overrides over defaults. */
export function loadHotkeyMap(): Record<string, string> {
  const defaults: Record<string, string> = {};
  for (const def of DEFAULT_HOTKEYS) defaults[def.id] = def.defaultKey;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const overrides = JSON.parse(stored) as Record<string, string>;
      return { ...defaults, ...overrides };
    }
  } catch {}
  return defaults;
}

/** Saves only the overrides (keys that differ from defaults). */
export function saveHotkeyMap(map: Record<string, string>): void {
  const defaults: Record<string, string> = {};
  for (const def of DEFAULT_HOTKEYS) defaults[def.id] = def.defaultKey;
  const overrides: Record<string, string> = {};
  for (const [id, key] of Object.entries(map)) {
    if (key !== defaults[id]) overrides[id] = key;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

export function resetHotkeyMap(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Normalise a KeyboardEvent to a key string like "F2", "ctrl+k", "ctrl+/". */
export function eventToKey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('ctrl');
  if (e.altKey) parts.push('alt');
  if (e.shiftKey) parts.push('shift');
  const key = e.key === ' ' ? 'space' : e.key;
  parts.push(key);
  return parts.length === 1 ? key : parts.join('+');
}
