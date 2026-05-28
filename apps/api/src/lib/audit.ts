import { Request } from 'express';
import { prisma } from './prisma';

interface AuditOptions {
  action: string;
  entity: string;
  entityId?: string;
  summary?: string;
  changes?: object;
}

export async function audit(req: Request, opts: AuditOptions): Promise<void> {
  if (!req.user) return;
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: req.user.tenantId,
        userId: req.user.userId,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId,
        summary: opts.summary,
        changes: opts.changes ?? undefined,
        ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ?? req.socket.remoteAddress,
      },
    });
  } catch {
    // Audit failures must never break the primary operation
  }
}
