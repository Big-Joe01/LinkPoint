import { prisma } from './prisma';
import { FastifyRequest } from 'fastify';

export async function audit(
  action: string,
  opts: { userId?: string; resource?: string; resourceId?: string; req?: FastifyRequest; metadata?: unknown },
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: opts.userId ?? opts.req?.user?.id,
        action,
        resource: opts.resource,
        resourceId: opts.resourceId,
        ip: opts.req?.ip,
        metadata: opts.metadata as never,
      },
    });
  } catch (err) {
    // Audit failures must never crash the request flow.
    // eslint-disable-next-line no-console
    console.error('audit log failed', err);
  }
}
