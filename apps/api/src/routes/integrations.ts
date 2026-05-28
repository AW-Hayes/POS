import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { qs } from '../lib/qs';

export const integrationsRouter = Router();
integrationsRouter.use(authenticate);

// ─── Config helpers ───────────────────────────────────────────────────────────

function getQboConfig() {
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: process.env.QBO_REDIRECT_URI ?? 'http://localhost:3001/api/integrations/quickbooks/callback',
    sandbox: process.env.QBO_SANDBOX === 'true',
  };
}

function getXeroConfig() {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: process.env.XERO_REDIRECT_URI ?? 'http://localhost:3001/api/integrations/xero/callback',
  };
}

// ─── Tenant settings helpers ──────────────────────────────────────────────────

async function getIntegrationSettings(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
  return (settings.integrations ?? {}) as Record<string, unknown>;
}

async function updateIntegrationSettings(tenantId: string, provider: string, data: Record<string, unknown>) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
  const integrations = (settings.integrations ?? {}) as Record<string, unknown>;
  const existing = (integrations[provider] ?? {}) as Record<string, unknown>;
  // Remove null-valued keys (used for disconnect)
  const merged = Object.fromEntries(
    Object.entries({ ...existing, ...data }).filter(([, v]) => v !== null),
  );
  const updated: Record<string, unknown> = { ...settings, integrations: { ...integrations, [provider]: merged } };
  await prisma.tenant.update({
    where: { id: tenantId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { settings: updated as any },
  });
}

// ─── QuickBooks helpers ───────────────────────────────────────────────────────

const QBO_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

async function refreshQboToken(tenantId: string): Promise<string | null> {
  const cfg = getQboConfig();
  if (!cfg) return null;
  const integrations = await getIntegrationSettings(tenantId);
  const qbo = integrations.quickbooks as Record<string, string> | undefined;
  if (!qbo?.refreshToken) return null;

  if (qbo.tokenExpiry && new Date(qbo.tokenExpiry) > new Date(Date.now() + 60_000)) {
    return qbo.accessToken;
  }

  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const res = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: qbo.refreshToken }),
  });
  if (!res.ok) return null;
  const tokens = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
  await updateIntegrationSettings(tenantId, 'quickbooks', {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  });
  return tokens.access_token;
}

async function qboFetch(tenantId: string, realmId: string, path: string, options: RequestInit = {}) {
  const token = await refreshQboToken(tenantId);
  if (!token) throw new Error('QuickBooks not connected');
  const cfg = getQboConfig()!;
  const base = cfg.sandbox
    ? `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}`
    : `https://quickbooks.api.intuit.com/v3/company/${realmId}`;

  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QBO API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

async function findOrCreateQboItem(tenantId: string, realmId: string): Promise<string> {
  const result = await qboFetch(tenantId, realmId, `/query?query=SELECT%20*%20FROM%20Item%20WHERE%20Name%3D'POS%20Sales'&minorversion=65`);
  const items = (result.QueryResponse as Record<string, unknown>)?.Item as Array<Record<string, unknown>> | undefined;
  if (items && items.length > 0) return items[0].Id as string;

  const created = await qboFetch(tenantId, realmId, '/item?minorversion=65', {
    method: 'POST',
    body: JSON.stringify({ Name: 'POS Sales', Type: 'Service', IncomeAccountRef: { name: 'Sales' } }),
  });
  return ((created.Item as Record<string, unknown>).Id) as string;
}

export async function pushOrderToQbo(tenantId: string, orderId: string) {
  const integrations = await getIntegrationSettings(tenantId);
  const qbo = integrations.quickbooks as Record<string, string> | undefined;
  if (!qbo?.realmId || !qbo.refreshToken) return;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: { select: { name: true } },
      items: { select: { name: true, quantity: true, total: true } },
      payments: { select: { method: true, amount: true } },
    },
  });
  if (!order) return;

  const itemId = await findOrCreateQboItem(tenantId, qbo.realmId);
  const txnDate = (order.completedAt ?? order.createdAt).toISOString().slice(0, 10);
  const shortId = order.id.slice(-8).toUpperCase();
  const itemsDesc = order.items.map((i) => `${i.name} ×${i.quantity}`).join(', ');

  const lines: unknown[] = [
    {
      Amount: order.subtotal,
      DetailType: 'SalesItemLineDetail',
      Description: `POS Order ${shortId}: ${itemsDesc}`,
      SalesItemLineDetail: { ItemRef: { value: itemId }, Qty: 1, UnitPrice: order.subtotal },
    },
  ];

  if (order.taxAmount > 0) {
    lines.push({
      Amount: order.taxAmount,
      DetailType: 'SalesItemLineDetail',
      Description: 'Sales Tax',
      SalesItemLineDetail: { ItemRef: { value: itemId }, Qty: 1, UnitPrice: order.taxAmount },
    });
  }

  const receipt: Record<string, unknown> = {
    DocNumber: `POS-${shortId}`,
    TxnDate: txnDate,
    Line: lines,
    PrivateNote: `Payments: ${order.payments.map((p) => `${p.method} $${p.amount.toFixed(2)}`).join(', ')}`,
  };
  if (order.customer?.name) {
    receipt.CustomerMemo = { value: `Customer: ${order.customer.name}` };
  }

  await qboFetch(tenantId, qbo.realmId, '/salesreceipt?minorversion=65', {
    method: 'POST',
    body: JSON.stringify(receipt),
  });

  await updateIntegrationSettings(tenantId, 'quickbooks', { lastSync: new Date().toISOString() });
}

// ─── Xero helpers ─────────────────────────────────────────────────────────────

const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize';

async function refreshXeroToken(tenantId: string): Promise<string | null> {
  const cfg = getXeroConfig();
  if (!cfg) return null;
  const integrations = await getIntegrationSettings(tenantId);
  const xero = integrations.xero as Record<string, string> | undefined;
  if (!xero?.refreshToken) return null;

  if (xero.tokenExpiry && new Date(xero.tokenExpiry) > new Date(Date.now() + 60_000)) {
    return xero.accessToken;
  }

  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const res = await fetch(XERO_TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: xero.refreshToken }),
  });
  if (!res.ok) return null;
  const tokens = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
  await updateIntegrationSettings(tenantId, 'xero', {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
  });
  return tokens.access_token;
}

async function xeroFetch(tenantId: string, xeroTenantId: string, path: string, options: RequestInit = {}) {
  const token = await refreshXeroToken(tenantId);
  if (!token) throw new Error('Xero not connected');
  const res = await fetch(`https://api.xero.com${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Xero-Tenant-Id': xeroTenantId, Accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Xero API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

export async function pushOrderToXero(tenantId: string, orderId: string) {
  const integrations = await getIntegrationSettings(tenantId);
  const xero = integrations.xero as Record<string, string> | undefined;
  if (!xero?.xeroTenantId || !xero.refreshToken) return;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: { select: { name: true } },
      items: { select: { name: true, quantity: true, total: true } },
      payments: { select: { method: true, amount: true } },
    },
  });
  if (!order) return;

  const txnDate = (order.completedAt ?? order.createdAt).toISOString().slice(0, 10);
  const shortId = order.id.slice(-8).toUpperCase();
  const salesAccount = xero.salesAccountCode ?? '200';
  const bankAccount = xero.bankAccountCode ?? '090';

  const lineItems: unknown[] = [
    {
      Description: `POS Order ${shortId}: ${order.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}`,
      Quantity: 1,
      UnitAmount: order.subtotal,
      AccountCode: salesAccount,
    },
  ];

  if (order.taxAmount > 0) {
    lineItems.push({
      Description: 'Sales Tax',
      Quantity: 1,
      UnitAmount: order.taxAmount,
      AccountCode: xero.taxAccountCode ?? '820',
    });
  }

  await xeroFetch(tenantId, xero.xeroTenantId, '/api.xro/2.0/BankTransactions', {
    method: 'PUT',
    body: JSON.stringify({
      BankTransactions: [{
        Type: 'RECEIVE',
        Contact: { Name: order.customer?.name ?? 'Cash Customer' },
        LineItems: lineItems,
        BankAccount: { Code: bankAccount },
        Date: txnDate,
        Reference: `POS-${shortId}`,
      }],
    }),
  });

  await updateIntegrationSettings(tenantId, 'xero', { lastSync: new Date().toISOString() });
}

// ─── QuickBooks routes ────────────────────────────────────────────────────────

integrationsRouter.get('/quickbooks/connect', requireRole('admin'), (req, res, next) => {
  try {
    const cfg = getQboConfig();
    if (!cfg) throw new AppError(400, 'QuickBooks not configured — set QBO_CLIENT_ID and QBO_CLIENT_SECRET env vars');

    const state = Buffer.from(req.user!.tenantId).toString('base64url');
    const url = new URL(QBO_AUTH_URL);
    url.searchParams.set('client_id', cfg.clientId);
    url.searchParams.set('redirect_uri', cfg.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'com.intuit.quickbooks.accounting');
    url.searchParams.set('state', state);

    res.json({ success: true, data: { url: url.toString() } });
  } catch (err) { next(err); }
});

integrationsRouter.get('/quickbooks/callback', async (req, res, next) => {
  try {
    const { code, state, realmId } = req.query as Record<string, string>;
    if (!code || !state || !realmId) throw new AppError(400, 'Missing OAuth parameters');

    const tenantId = Buffer.from(state, 'base64url').toString();
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new AppError(400, 'Invalid state — tenant not found');

    const cfg = getQboConfig();
    if (!cfg) throw new AppError(400, 'QuickBooks not configured');

    const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
    const tokenRes = await fetch(QBO_TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri }),
    });
    if (!tokenRes.ok) throw new AppError(400, `Token exchange failed: ${await tokenRes.text()}`);

    const tokens = await tokenRes.json() as { access_token: string; refresh_token: string; expires_in: number };

    let companyName = 'QuickBooks Company';
    try {
      const base = cfg.sandbox
        ? `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}`
        : `https://quickbooks.api.intuit.com/v3/company/${realmId}`;
      const infoRes = await fetch(`${base}/companyinfo/${realmId}?minorversion=65`, {
        headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
      });
      if (infoRes.ok) {
        const info = await infoRes.json() as { CompanyInfo: { CompanyName: string } };
        companyName = info.CompanyInfo.CompanyName;
      }
    } catch { /* best effort */ }

    await updateIntegrationSettings(tenantId, 'quickbooks', {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      realmId,
      companyName,
      connectedAt: new Date().toISOString(),
    });

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    res.redirect(`${frontendUrl}/settings?tab=integrations&connected=quickbooks`);
  } catch (err) { next(err); }
});

integrationsRouter.get('/quickbooks/status', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const integrations = await getIntegrationSettings(req.user!.tenantId);
    const qbo = integrations.quickbooks as Record<string, string> | undefined;
    res.json({
      success: true,
      data: {
        configured: !!getQboConfig(),
        connected: !!(qbo?.refreshToken),
        companyName: qbo?.companyName,
        connectedAt: qbo?.connectedAt,
        lastSync: qbo?.lastSync,
      },
    });
  } catch (err) { next(err); }
});

integrationsRouter.post('/quickbooks/sync', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const from = qs(req.query.from) ?? new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const to = qs(req.query.to) ?? new Date().toISOString().slice(0, 10);

    const orders = await prisma.order.findMany({
      where: {
        tenantId: req.user!.tenantId,
        status: 'completed',
        completedAt: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) },
      },
      select: { id: true },
    });

    let pushed = 0;
    const errors: Array<{ orderId: string; error: string }> = [];

    for (const order of orders) {
      try {
        await pushOrderToQbo(req.user!.tenantId, order.id);
        pushed++;
      } catch (err) {
        errors.push({ orderId: order.id, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    res.json({ success: true, data: { pushed, errors } });
  } catch (err) { next(err); }
});

integrationsRouter.delete('/quickbooks/disconnect', requireRole('admin'), async (req, res, next) => {
  try {
    await updateIntegrationSettings(req.user!.tenantId, 'quickbooks', {
      accessToken: null, refreshToken: null, realmId: null, tokenExpiry: null, companyName: null,
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── Xero routes ──────────────────────────────────────────────────────────────

integrationsRouter.get('/xero/connect', requireRole('admin'), (req, res, next) => {
  try {
    const cfg = getXeroConfig();
    if (!cfg) throw new AppError(400, 'Xero not configured — set XERO_CLIENT_ID and XERO_CLIENT_SECRET env vars');

    const state = Buffer.from(req.user!.tenantId).toString('base64url');
    const url = new URL(XERO_AUTH_URL);
    url.searchParams.set('client_id', cfg.clientId);
    url.searchParams.set('redirect_uri', cfg.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'offline_access accounting.transactions accounting.contacts');
    url.searchParams.set('state', state);

    res.json({ success: true, data: { url: url.toString() } });
  } catch (err) { next(err); }
});

integrationsRouter.get('/xero/callback', async (req, res, next) => {
  try {
    const { code, state } = req.query as Record<string, string>;
    if (!code || !state) throw new AppError(400, 'Missing OAuth parameters');

    const tenantId = Buffer.from(state, 'base64url').toString();
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new AppError(400, 'Invalid state — tenant not found');

    const cfg = getXeroConfig();
    if (!cfg) throw new AppError(400, 'Xero not configured');

    const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
    const tokenRes = await fetch(XERO_TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri }),
    });
    if (!tokenRes.ok) throw new AppError(400, `Token exchange failed: ${await tokenRes.text()}`);

    const tokens = await tokenRes.json() as { access_token: string; refresh_token: string; expires_in: number };

    // Get the Xero tenant/org
    let xeroTenantId = '';
    let orgName = 'Xero Organisation';
    try {
      const connRes = await fetch('https://api.xero.com/connections', {
        headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
      });
      if (connRes.ok) {
        const connections = await connRes.json() as Array<{ tenantId: string; tenantName: string }>;
        if (connections.length > 0) {
          xeroTenantId = connections[0].tenantId;
          orgName = connections[0].tenantName;
        }
      }
    } catch { /* best effort */ }

    await updateIntegrationSettings(tenantId, 'xero', {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      xeroTenantId,
      orgName,
      connectedAt: new Date().toISOString(),
    });

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    res.redirect(`${frontendUrl}/settings?tab=integrations&connected=xero`);
  } catch (err) { next(err); }
});

integrationsRouter.get('/xero/status', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const integrations = await getIntegrationSettings(req.user!.tenantId);
    const xero = integrations.xero as Record<string, string> | undefined;
    res.json({
      success: true,
      data: {
        configured: !!getXeroConfig(),
        connected: !!(xero?.refreshToken),
        orgName: xero?.orgName,
        connectedAt: xero?.connectedAt,
        lastSync: xero?.lastSync,
      },
    });
  } catch (err) { next(err); }
});

integrationsRouter.post('/xero/sync', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const from = qs(req.query.from) ?? new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const to = qs(req.query.to) ?? new Date().toISOString().slice(0, 10);

    const orders = await prisma.order.findMany({
      where: {
        tenantId: req.user!.tenantId,
        status: 'completed',
        completedAt: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) },
      },
      select: { id: true },
    });

    let pushed = 0;
    const errors: Array<{ orderId: string; error: string }> = [];

    for (const order of orders) {
      try {
        await pushOrderToXero(req.user!.tenantId, order.id);
        pushed++;
      } catch (err) {
        errors.push({ orderId: order.id, error: err instanceof Error ? err.message : 'Unknown error' });
      }
    }

    res.json({ success: true, data: { pushed, errors } });
  } catch (err) { next(err); }
});

integrationsRouter.delete('/xero/disconnect', requireRole('admin'), async (req, res, next) => {
  try {
    await updateIntegrationSettings(req.user!.tenantId, 'xero', {
      accessToken: null, refreshToken: null, xeroTenantId: null, tokenExpiry: null, orgName: null,
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── Account code configuration (Xero) ───────────────────────────────────────

const accountCodesSchema = z.object({
  salesAccountCode: z.string().optional(),
  bankAccountCode: z.string().optional(),
  taxAccountCode: z.string().optional(),
});

integrationsRouter.patch('/xero/accounts', requireRole('admin'), async (req, res, next) => {
  try {
    const data = accountCodesSchema.parse(req.body);
    await updateIntegrationSettings(req.user!.tenantId, 'xero', data as Record<string, unknown>);
    res.json({ success: true });
  } catch (err) { next(err); }
});
