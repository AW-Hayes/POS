import { chromium } from 'playwright-core';
import { mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'docs', 'screenshots');
const BASE = 'http://localhost:5173';

const AUTH = JSON.stringify({
  state: {
    token: 'demo-token',
    user: { id: 'demo', name: 'Demo Admin', email: 'admin@demo.com', role: 'admin', tenantId: 'demo', active: true, hasPin: false },
    isAuthenticated: true,
  },
  version: 0,
});

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name), fullPage: false });
  console.log('  saved', name);
}

async function injectAuth(page) {
  await page.addInitScript((auth) => {
    localStorage.setItem('pos_auth', auth);
  }, AUTH);
}

(async () => {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  await injectAuth(page);

  // --- Login page ---
  await page.goto(BASE + '/login');
  await page.waitForLoadState('networkidle');
  await shot(page, '01-login.png');

  // --- Dashboard ---
  await page.goto(BASE + '/');
  await page.waitForLoadState('networkidle');
  await shot(page, '02-dashboard.png');

  // --- Terminal ---
  await page.goto(BASE + '/terminal');
  await page.waitForLoadState('networkidle');
  await shot(page, '03-terminal.png');

  // --- Products list ---
  await page.goto(BASE + '/products');
  await page.waitForLoadState('networkidle');
  await shot(page, '04-products.png');

  // --- Add Product dialog ---
  await page.click('button:has(.lucide-plus)');
  await page.waitForSelector('[role="dialog"]');
  await shot(page, '05-products-add-dialog.png');
  await page.keyboard.press('Escape');

  // --- Customers list ---
  await page.goto(BASE + '/customers');
  await page.waitForLoadState('networkidle');
  await shot(page, '06-customers.png');

  // --- Add Customer dialog ---
  await page.click('button:has(.lucide-plus)');
  await page.waitForSelector('[role="dialog"]');
  await shot(page, '07-customers-add-dialog.png');
  await page.keyboard.press('Escape');

  // --- Inventory ---
  await page.goto(BASE + '/inventory');
  await page.waitForLoadState('networkidle');
  await shot(page, '08-inventory.png');

  // --- Orders ---
  await page.goto(BASE + '/orders');
  await page.waitForLoadState('networkidle');
  await shot(page, '09-orders.png');

  // --- Settings ---
  await page.goto(BASE + '/settings');
  await page.waitForLoadState('networkidle');
  await shot(page, '10-settings.png');

  await browser.close();
  console.log('Done — screenshots saved to docs/screenshots/');
})();
