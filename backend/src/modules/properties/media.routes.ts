import { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../../config/env';
import { createHash } from 'crypto';
import { badRequest } from '../../lib/errors';

/**
 * Generate a Cloudinary signed upload payload.
 * The mobile app uploads directly to Cloudinary using this signature;
 * the API secret never leaves the server.
 */
async function signUpload(req: FastifyRequest) {
  const { folder = 'linkpoint', eager } = (req.body as { folder?: string; eager?: string }) ?? {};
  if (!config.cloudinary.cloudName || !config.cloudinary.apiSecret) {
    throw badRequest('Cloudinary not configured');
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign: Record<string, string> = { folder, timestamp: String(timestamp) };
  if (eager) paramsToSign.eager = eager;
  const sorted = Object.keys(paramsToSign)
    .sort()
    .map((k) => `${k}=${paramsToSign[k]}`)
    .join('&');
  const signature = createHash('sha1')
    .update(sorted + config.cloudinary.apiSecret)
    .digest('hex');
  return {
    signature,
    timestamp,
    apiKey: config.cloudinary.apiKey,
    cloudName: config.cloudinary.cloudName,
    folder,
  };
}

export function registerMediaRoutes(app: FastifyInstance, prefix: string): void {
  app.post(`${prefix}/media/sign-upload`, { preHandler: app.authenticate, handler: signUpload as never });
}
