import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ success: false, error: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ success: false, error: 'Validation error', details: err.errors });
    return;
  }

  // Prisma unique-constraint violation → friendly 409 (duck-typed to avoid importing @prisma/client)
  const prismaErr = err as { code?: string; meta?: { target?: string[] | string } };
  if (prismaErr.code === 'P2002') {
    const target = prismaErr.meta?.target;
    const fields = Array.isArray(target) ? target.filter((t) => t !== 'tenantId').join(', ') : (target ?? 'value');
    res.status(409).json({ success: false, error: `A record with this ${fields || 'value'} already exists` });
    return;
  }

  console.error(err);
  res.status(500).json({ success: false, error: 'Internal server error' });
}
