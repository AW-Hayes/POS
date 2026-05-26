import { chromium } from 'playwright-core';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'docs', 'screenshots');
await mkdir(outDir, { recursive: true });

const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c3IxIiwidGVuYW50SWQiOiJ0ZW4xIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzAwMDAwMDAwfQ.fake';

const CATEGORIES = [
  { id: 'cat1', name: 'Beverages', tenantId: 't1', sortOrder: 0, createdAt: '', updatedAt: '' },
  { id: 'cat2', name: 'Snacks',    tenantId: 't1', sortOrder: 1, createdAt: '', updatedAt: '' },
  { id: 'cat3', name: 'Electronics', tenantId: 't1', sortOrder: 2, createdAt: '', updatedAt: '' },
];

const PRODUCTS = [
  { id: 'p1',  name: 'Espresso',        price: 3.50,  sku: 'BEV-001', taxable: true,  trackInventory: true, active: true, sortOrder: 0,  attributes: [], variants: [], category: { id: 'cat1', name: 'Beverages'   }, tenantId: 't1', createdAt: '', updatedAt: '' },
  { id: 'p2',  name: 'Cappuccino',       price: 4.75,  sku: 'BEV-002', taxable: true,  trackInventory: true, active: true, sortOrder: 1,  attributes: [], variants: [], category: { id: 'cat1', name: 'Beverages'   }, tenantId: 't1', createdAt: '', updatedAt: '' },
  { id: 'p3',  name: 'Latte',            price: 5.25,  sku: 'BEV-003', taxable: true,  trackInventory: true, active: true, sortOrder: 2,  attributes: [], variants: [], category: { id: 'cat1', name: 'Beverages'   }, tenantId: 't1', createdAt: '', updatedAt: '' },
  { id: 'p4',  name: 'Cold Brew',        price: 5.50,  sku: 'BEV-004', taxable: true,  trackInventory: true, active: true, sortOrder: 3,  attributes: [], variants: [], category: { id: 'cat1', name: 'Beverages'   }, tenantId: 't1', createdAt: '', updatedAt: '' },
  { id: 'p5',  name: 'Green Tea',        price: 3.00,  sku: 'BEV-005', taxable: true,  trackInventory: true, active: true, sortOrder: 4,  attributes: [], variants: [], category: { id: 'cat1', name: 'Beverages'   }, tenantId: 't1', createdAt: '', updatedAt: '' },
  { id: 'p6',  name: 'Croissant',        price: 3.25,  sku: 'SNK-001', taxable: true,  trackInventory: true, active: true, sortOrder: 5,  attributes: [], variants: [], category: { id: 'cat2', name: 'Snacks'      }, tenantId: 't1', createdAt: '', updatedAt: '' },
  { id: 'p7',  name: 'Blueberry Muffin', price: 3.75,  sku: 'SNK-002', taxable: true,  trackInventory: true, active: true, sortOrder: 6,  attributes: [], variants: [], category: { id: 'cat2', name: 'Snacks'      }, tenantId: 't1', createdAt: '', updatedAt: '' },
  { id: 'p8',  name: 'Avocado Toast',    price: 8.50,  sku: 'SNK-003', taxable: true,  trackInventory: true, active: true, sortOrder: 7,  attributes: [], variants: [], category: { id: 'cat2', name: 'Snacks'      }, tenantId: 't1', createdAt: '', updatedAt: '' },
  { id: 'p9',  name: 'Granola Bar',      price: 2.50,  sku: 'SNK-004', taxable: true,  trackInventory: true, active: true, sortOrder: 8,  attributes: [], variants: [], category: { id: 'cat2', name: 'Snacks'      }, tenantId: 't1', createdAt: '', updatedAt: '' },
  { id: 'p10', name: 'Phone Charger',    price: 24.99, sku: 'ELC-001', taxable: true,  trackInventory: true, active: true, sortOrder: 9,  attributes: [], variants: [
    { id: 'v1', productId: 'p10', sku: 'ELC-001-C', price: 24.99, active: true, sortOrder: 0, attributeValues: [{ id: 'av1', value: 'USB-C' }], createdAt: '', updatedAt: '' },
    { id: 'v2', productId: 'p10', sku: 'ELC-001-L', price: 24.99, active: true, sortOrder: 1, attributeValues: [{ id: 'av2', value: 'Lightning' }], createdAt: '', updatedAt: '' },
  ], category: { id: 'cat3', name: 'Electronics' }, tenantId: 't1', createdAt: '', updatedAt: '' },
  { id: 'p11', name: 'Earbuds',          price: 49.99, sku: 'ELC-002', taxable: true,  trackInventory: true, active: true, sortOrder: 10, attributes: [], variants: [], category: { id: 'cat3', name: 'Electronics' }, tenantId: 't1', createdAt: '', updatedAt: '' },
  { id: 'p12', name: 'Bottled Water',    price: 1.50,  sku: 'BEV-006', taxable: false, trackInventory: true, active: true, sortOrder: 11, attributes: [], variants: [], category: { id: 'cat1', name: 'Beverages'   }, tenantId: 't1', createdAt: '', updatedAt: '' },
];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

// Intercept API calls before anything loads.
// Playwright matches routes LIFO, so register the catch-all first so specific
// routes registered after it take precedence.
await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) }));
await page.route('**/api/categories**', route =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: CATEGORIES }) })
);
await page.route('**/api/products**', route =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data: PRODUCTS }) })
);

// Inject auth state before the app JS runs
await page.addInitScript((token) => {
  localStorage.setItem('pos_auth', JSON.stringify({
    state: {
      token,
      user: { id: 'usr1', tenantId: 't1', name: 'Sarah Mitchell', email: 'sarah@demo.com', role: 'cashier', hasPin: true, createdAt: '', updatedAt: '' },
      isAuthenticated: true,
    },
    version: 0,
  }));
}, fakeToken);

// ── Screenshot 1: Empty terminal ─────────────────────────────────────────────
await page.goto('http://localhost:5173/terminal', { waitUntil: 'networkidle' });
await page.waitForSelector('text=Espresso', { timeout: 10000 });
await page.screenshot({ path: join(outDir, 'terminal-empty.png'), fullPage: false });
console.log('✓ terminal-empty.png');

// ── Screenshot 2: Terminal with items in cart ─────────────────────────────────
// Add a few items by clicking product cards
await page.click('text=Espresso');
await page.click('text=Cappuccino');
await page.click('text=Cappuccino');
await page.click('text=Croissant');
await page.screenshot({ path: join(outDir, 'terminal-with-cart.png'), fullPage: false });
console.log('✓ terminal-with-cart.png');

await browser.close();
console.log('\nDone. Screenshots saved to docs/screenshots/');
