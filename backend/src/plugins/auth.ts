import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken } from '../lib/jwt';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (...roles: string[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    user: {
      id: string;
      roles: string[];
      status: string;
    };
  }
}

export async function registerAuthPlugin(app: FastifyInstance): Promise<void> {
  app.decorate(
    'authenticate',
    async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
      const header = req.headers.authorization;
      if (!header || !header.startsWith('Bearer ')) {
        throw { statusCode: 401, error: 'Unauthorized', message: 'Missing token' };
      }
      const token = header.slice(7);
      try {
        const payload = verifyAccessToken(token);
        req.user = { id: payload.sub, roles: payload.roles, status: payload.status };
      } catch {
        throw { statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired token' };
      }
    },
  );

  app.decorate(
    'requireRole',
    (...roles: string[]) =>
      async function requireRole(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
        const has = req.user.roles.some((r) => roles.includes(r));
        if (!has) {
          throw { statusCode: 403, error: 'Forbidden', message: 'Insufficient permissions' };
        }
      },
  );
}
