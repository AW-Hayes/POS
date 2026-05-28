import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { authRouter } from './routes/auth';
import { tenantsRouter } from './routes/tenants';
import { locationsRouter } from './routes/locations';
import { registersRouter } from './routes/registers';
import { usersRouter } from './routes/users';
import { categoriesRouter } from './routes/categories';
import { attributesRouter } from './routes/attributes';
import { productsRouter } from './routes/products';
import { inventoryRouter } from './routes/inventory';
import { ordersRouter } from './routes/orders';
import { customersRouter } from './routes/customers';
import { returnsRouter } from './routes/returns';
import { reportsRouter } from './routes/reports';
import { sessionsRouter } from './routes/sessions';
import { promotionsRouter } from './routes/promotions';
import { vendorsRouter } from './routes/vendors';
import { purchaseOrdersRouter } from './routes/purchase-orders';
import { priceLevelsRouter } from './routes/price-levels';
import { giftCardsRouter } from './routes/gift-cards';
import { heldOrdersRouter } from './routes/held-orders';
import { estimatesRouter } from './routes/estimates';
import { layawayRouter } from './routes/layaway';
import { cashDropsRouter } from './routes/cash-drops';
import { loyaltyRouter } from './routes/loyalty';
import { houseAccountsRouter } from './routes/house-accounts';
import { receiptsRouter } from './routes/receipts';
import { priceBreaksRouter } from './routes/price-breaks';
import { serialNumbersRouter } from './routes/serial-numbers';
import { labelsRouter } from './routes/labels';
import { timeClockRouter } from './routes/time-clock';
import { cycleCountsRouter } from './routes/cycle-counts';
import { serviceTicketsRouter } from './routes/service-tickets';
import { bundlesRouter } from './routes/bundles';
import { commissionsRouter } from './routes/commissions';
import { auditRouter } from './routes/audit';
import { paymentsRouter } from './routes/payments';
import { errorHandler } from './middleware/errorHandler';
import { registerBuiltinHooks } from './hooks';

registerBuiltinHooks();

export const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const allowedOrigin = process.env.CORS_ORIGIN;
if (!allowedOrigin && process.env.NODE_ENV === 'production') {
  throw new Error('CORS_ORIGIN must be set in production');
}
// Always allow the Tauri WebView2 origin alongside any configured origin
const tauriOrigins = ['https://tauri.localhost', 'tauri://localhost'];
const corsOrigin = allowedOrigin
  ? [allowedOrigin, ...tauriOrigins]
  : (origin: string | undefined, cb: (e: null, allow: boolean) => void) => cb(null, true);
app.use(cors({ origin: corsOrigin }));
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRouter);
app.use('/api/tenants', tenantsRouter);
app.use('/api/locations', locationsRouter);
app.use('/api/registers', registersRouter);
app.use('/api/users', usersRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/attributes', attributesRouter);
app.use('/api/products', productsRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/customers', customersRouter);
app.use('/api/returns', returnsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/promotions', promotionsRouter);
app.use('/api/vendors', vendorsRouter);
app.use('/api/purchase-orders', purchaseOrdersRouter);
app.use('/api/price-levels', priceLevelsRouter);
app.use('/api/gift-cards', giftCardsRouter);
app.use('/api/held-orders', heldOrdersRouter);
app.use('/api/estimates', estimatesRouter);
app.use('/api/layaway', layawayRouter);
app.use('/api/cash-drops', cashDropsRouter);
app.use('/api/loyalty', loyaltyRouter);
app.use('/api/house-accounts', houseAccountsRouter);
app.use('/api/receipts', receiptsRouter);
app.use('/api/price-breaks', priceBreaksRouter);
app.use('/api/serial-numbers', serialNumbersRouter);
app.use('/api/labels', labelsRouter);
app.use('/api/time-clock', timeClockRouter);
app.use('/api/cycle-counts', cycleCountsRouter);
app.use('/api/service-tickets', serviceTicketsRouter);
app.use('/api/bundles', bundlesRouter);
app.use('/api/commissions', commissionsRouter);
app.use('/api/audit-log', auditRouter);
app.use('/api/payments', paymentsRouter);

app.use(errorHandler);
