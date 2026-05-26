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
import { errorHandler } from './middleware/errorHandler';

export const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));
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

app.use(errorHandler);
