/** ESC/POS receipt generation and dispatch. */

export interface PrinterConfig {
  type: 'network' | 'browser';
  host?: string;
  port?: number;
  /** Characters per line: 32 = 58mm paper, 42 = 80mm paper */
  charWidth?: 32 | 42;
}

export interface ReceiptData {
  storeName: string;
  orderId: string;
  completedAt: string;
  items: Array<{ name: string; quantity: number; price: number; discount: number }>;
  subtotal: number;
  taxAmount: number;
  total: number;
  payments: Array<{ method: string; amount: number; reference?: string }>;
  change?: number;
  customerName?: string;
  footer?: string;
}

// ── ESC/POS constants ─────────────────────────────────────────────────────────
const ESC = '\x1B';
const GS = '\x1D';
const LF = '\n';
const INIT = `${ESC}@`;
const BOLD_ON = `${ESC}E\x01`;
const BOLD_OFF = `${ESC}E\x00`;
const ALIGN_LEFT = `${ESC}a\x00`;
const ALIGN_CENTER = `${ESC}a\x01`;
const ALIGN_RIGHT = `${ESC}a\x02`;
const DOUBLE_HEIGHT_ON = `${ESC}!\x10`;
const DOUBLE_HEIGHT_OFF = `${ESC}!\x00`;
const CUT = `${GS}V\x41\x03`; // partial cut
// Raw bytes — NOT a string. \xFA (250) is > 127, so passing it through TextEncoder
// would produce the 2-byte UTF-8 sequence 0xC3 0xBA instead of the required raw 0xFA.
const CASH_DRAWER_PIN2_BYTES = new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa]);

function pad(left: string, right: string, width: number): string {
  const gap = width - left.length - right.length;
  return gap > 0 ? left + ' '.repeat(gap) + right : left.slice(0, width - right.length - 1) + ' ' + right;
}

function line(text: string, width: number): string {
  return text.slice(0, width).padEnd(width) + LF;
}

function divider(width: number, char = '-'): string {
  return char.repeat(width) + LF;
}

export function generateEscPos(data: ReceiptData, charWidth = 42): string {
  const w = charWidth;
  let doc = INIT;

  // Header
  doc += ALIGN_CENTER + DOUBLE_HEIGHT_ON + BOLD_ON;
  doc += data.storeName.slice(0, w / 2) + LF;
  doc += DOUBLE_HEIGHT_OFF + BOLD_OFF;
  doc += new Date(data.completedAt).toLocaleString() + LF;
  if (data.customerName) doc += data.customerName + LF;
  doc += ALIGN_LEFT;
  doc += divider(w);

  // Items
  for (const item of data.items) {
    const linePrice = (item.price - item.discount) * item.quantity;
    const formatted = `$${linePrice.toFixed(2)}`;
    const name = item.quantity > 1 ? `${item.name} x${item.quantity}` : item.name;
    doc += pad(name, formatted, w) + LF;
    if (item.discount > 0) {
      doc += pad('  Discount', `-$${(item.discount * item.quantity).toFixed(2)}`, w) + LF;
    }
  }

  doc += divider(w);
  doc += pad('Subtotal', `$${data.subtotal.toFixed(2)}`, w) + LF;
  if (data.taxAmount > 0) {
    doc += pad('Tax', `$${data.taxAmount.toFixed(2)}`, w) + LF;
  }
  doc += BOLD_ON + pad('TOTAL', `$${data.total.toFixed(2)}`, w) + LF + BOLD_OFF;
  doc += divider(w);

  // Payments
  for (const p of data.payments) {
    const label = p.method.charAt(0).toUpperCase() + p.method.slice(1);
    doc += pad(label + (p.reference ? ` (${p.reference})` : ''), `$${p.amount.toFixed(2)}`, w) + LF;
  }
  if (data.change && data.change > 0) {
    doc += pad('Change', `$${data.change.toFixed(2)}`, w) + LF;
  }

  // Footer
  doc += divider(w);
  doc += ALIGN_CENTER;
  doc += (data.footer ?? 'Thank you for your purchase!') + LF;
  doc += `Order #${data.orderId.slice(-8).toUpperCase()}` + LF;
  doc += LF + LF + LF;
  doc += CUT;

  return doc;
}

export async function sendToPrinter(escposData: string, config: PrinterConfig): Promise<void> {
  if (config.type === 'network' && config.host) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const bytes = Array.from(new TextEncoder().encode(escposData));
      await invoke('print_to_printer', { host: config.host, port: config.port ?? 9100, data: bytes });
      return;
    } catch {
      // Tauri unavailable — fall through to browser print
    }
  }
  browserPrint(escposData);
}

export async function openCashDrawer(config: PrinterConfig): Promise<void> {
  if (config.type === 'network' && config.host) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('print_to_printer', {
        host: config.host,
        port: config.port ?? 9100,
        data: Array.from(CASH_DRAWER_PIN2_BYTES),
      });
    } catch {
      // Tauri not available
    }
  }
}

function browserPrint(escposData: string): void {
  // Convert ESC/POS to readable plain text for browser print fallback
  const raw = escposData
    .replace(/[\x1B\x1D][\s\S]/g, '') // strip control sequences
    .replace(/[\x00-\x08\x0B-\x1F\x7F]/g, ''); // strip other non-printable
  // HTML-escape so product names with < > & don't break the print window
  const text = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const win = window.open('', '_blank', 'width=320,height=600,scrollbars=yes');
  if (!win) return;
  win.document.write(`
    <html><head><style>
      body { font-family: monospace; font-size: 12px; width: 300px; margin: 0; padding: 8px; }
      pre { white-space: pre-wrap; word-break: break-all; }
      @media print { button { display: none; } }
    </style></head>
    <body>
      <pre>${text}</pre>
      <button onclick="window.print();window.close()">Print</button>
    </body></html>
  `);
  win.document.close();
}

// ── localStorage config helpers ───────────────────────────────────────────────
const STORAGE_KEY = 'pos_printer_config';

export function loadPrinterConfig(): PrinterConfig {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as PrinterConfig;
  } catch {
    return { type: 'browser' };
  }
}

export function savePrinterConfig(config: PrinterConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
