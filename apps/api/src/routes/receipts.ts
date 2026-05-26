import { Router } from 'express';
import { z } from 'zod';
import nodemailer from 'nodemailer';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

export const receiptsRouter = Router();
receiptsRouter.use(authenticate);

function buildReceiptHtml(order: {
  id: string;
  total: number;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  completedAt: Date | null;
  items: Array<{ name: string; quantity: number; price: number; discount: number; total: number }>;
  payments: Array<{ method: string; amount: number }>;
  customer?: { name: string; email?: string | null } | null;
}, tenantName: string, receiptFooter?: string) {
  const date = order.completedAt ? new Date(order.completedAt).toLocaleString() : new Date().toLocaleString();
  const items = order.items.map(i => `
    <tr>
      <td style="padding:4px 8px">${i.name}</td>
      <td style="padding:4px 8px;text-align:center">${i.quantity}</td>
      <td style="padding:4px 8px;text-align:right">$${i.price.toFixed(2)}</td>
      <td style="padding:4px 8px;text-align:right">$${i.total.toFixed(2)}</td>
    </tr>`).join('');

  const payments = order.payments.map(p =>
    `<tr><td style="padding:2px 8px">${p.method}</td><td style="padding:2px 8px;text-align:right">$${p.amount.toFixed(2)}</td></tr>`
  ).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Receipt</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h1 style="text-align:center;margin-bottom:4px">${tenantName}</h1>
  <p style="text-align:center;color:#666;margin-top:0">${date}</p>
  <p style="text-align:center;color:#666">Order #${order.id.slice(-8).toUpperCase()}</p>
  ${order.customer ? `<p style="text-align:center">Thank you, ${order.customer.name}!</p>` : ''}
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <thead>
      <tr style="border-bottom:1px solid #ccc">
        <th style="padding:4px 8px;text-align:left">Item</th>
        <th style="padding:4px 8px;text-align:center">Qty</th>
        <th style="padding:4px 8px;text-align:right">Price</th>
        <th style="padding:4px 8px;text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>${items}</tbody>
  </table>
  <table style="width:100%;border-collapse:collapse;margin:8px 0">
    <tr><td style="padding:2px 8px">Subtotal</td><td style="padding:2px 8px;text-align:right">$${order.subtotal.toFixed(2)}</td></tr>
    ${order.discountAmount > 0 ? `<tr><td style="padding:2px 8px">Discount</td><td style="padding:2px 8px;text-align:right">-$${order.discountAmount.toFixed(2)}</td></tr>` : ''}
    <tr><td style="padding:2px 8px">Tax</td><td style="padding:2px 8px;text-align:right">$${order.taxAmount.toFixed(2)}</td></tr>
    <tr style="border-top:1px solid #ccc;font-weight:bold"><td style="padding:4px 8px">Total</td><td style="padding:4px 8px;text-align:right">$${order.total.toFixed(2)}</td></tr>
  </table>
  <table style="width:100%;border-collapse:collapse;margin:8px 0">
    <tr><td colspan="2" style="padding:4px 8px;color:#666">Payment</td></tr>
    ${payments}
  </table>
  ${receiptFooter ? `<p style="text-align:center;color:#888;font-size:12px;margin-top:24px">${receiptFooter}</p>` : ''}
</body>
</html>`;
}

// Send email receipt for a completed order
receiptsRouter.post('/orders/:orderId/email', async (req, res, next) => {
  try {
    const { email: overrideEmail } = z
      .object({ email: z.string().email().optional() })
      .parse(req.body);

    const order = await prisma.order.findFirst({
      where: { id: req.params.orderId, tenantId: req.user!.tenantId },
      include: {
        items: true,
        payments: true,
        customer: { select: { name: true, email: true } },
      },
    });
    if (!order) throw new AppError(404, 'Order not found');

    const to = overrideEmail ?? order.customer?.email;
    if (!to) throw new AppError(400, 'No email address — provide email in request body or attach a customer with an email');

    const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const smtpConfig = settings.smtp as Record<string, string> | undefined;
    const receiptFooter = settings.receiptFooter as string | undefined;

    if (!smtpConfig?.host) throw new AppError(400, 'SMTP not configured — add smtp settings to tenant settings');

    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: Number(smtpConfig.port ?? 587),
      secure: smtpConfig.secure === 'true',
      auth: smtpConfig.user ? { user: smtpConfig.user, pass: smtpConfig.pass } : undefined,
    });

    const html = buildReceiptHtml(order as Parameters<typeof buildReceiptHtml>[0], tenant!.name, receiptFooter);

    await transporter.sendMail({
      from: smtpConfig.from ?? `noreply@${smtpConfig.host}`,
      to,
      subject: `Receipt from ${tenant!.name} — Order #${order.id.slice(-8).toUpperCase()}`,
      html,
    });

    res.json({ success: true, data: { sentTo: to } });
  } catch (err) {
    next(err);
  }
});

// Print-friendly receipt HTML (for browser print dialog)
receiptsRouter.get('/orders/:orderId/print', async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.orderId, tenantId: req.user!.tenantId },
      include: { items: true, payments: true, customer: { select: { name: true, email: true } } },
    });
    if (!order) throw new AppError(404, 'Order not found');

    const tenant = await prisma.tenant.findUnique({ where: { id: req.user!.tenantId } });
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const html = buildReceiptHtml(order as Parameters<typeof buildReceiptHtml>[0], tenant!.name, settings.receiptFooter as string | undefined);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    next(err);
  }
});
