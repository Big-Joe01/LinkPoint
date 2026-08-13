import { prisma } from '../../lib/prisma';
import { hashPassword, verifyPassword } from '../../lib/crypto';
import { signAccessToken, signRefreshToken, verifyRefreshToken, hashToken } from '../../lib/jwt';
import { badRequest, notFound, unauthorized } from '../../lib/errors';
import { UserRole } from '@linkpoint/types';
import { UserStatus } from '../../../prisma/generated/client';
import { randomBytes } from 'crypto';
import { registerSchema, loginSchema, refreshSchema } from '@linkpoint/validation';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { audit } from '../../lib/audit';
import { nanoid } from 'nanoid';

export async function register(req: FastifyRequest) {
  const input = registerSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw badRequest('Email already registered');

  const passwordHash = await hashPassword(input.password);
  const emailVerifyToken = randomBytes(16).toString('hex');
  const roles: UserRole[] = [input.role as UserRole];
  // Admin cannot self-register.
  if (roles.includes(UserRole.ADMIN)) throw badRequest('Invalid role');

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      roles: roles as never,
      status: UserStatus.PENDING,
      emailVerifyToken,
      // Create role-specific profile
      customer: input.role === UserRole.CUSTOMER ? { create: {} } : undefined,
      realtor:
        input.role === UserRole.REALTOR || input.role === UserRole.PROPERTY_OWNER
          ? {
              create: {
                category: input.role,
                verification: 'UNVERIFIED',
              },
            }
          : undefined,
      agent:
        input.role === UserRole.INSPECTION_AGENT
          ? {
              create: {
                operatingCities: [],
                verification: 'UNVERIFIED',
              },
            }
          : undefined,
      affiliate:
        input.role === UserRole.AFFILIATE
          ? {
              create: {
                referralCode: nanoid(10),
                verification: 'UNVERIFIED',
              },
            }
          : undefined,
      // Wallet auto-created for everyone (customers fund inspections, etc.)
      wallet: { create: {} },
    },
  });

  await audit('USER_REGISTER', { userId: user.id, req, resource: 'User', resourceId: user.id });

  // In production this would send an email. We return the token only in dev.
  return {
    message: 'Registration successful. Verify your email to activate your account.',
    userId: user.id,
    emailVerifyToken: process.env.NODE_ENV !== 'production' ? emailVerifyToken : undefined,
  };
}

export async function verifyEmail(req: FastifyRequest) {
  const { token } = (req.body as { token?: string }) ?? {};
  if (!token) throw badRequest('Verification token required');
  const user = await prisma.user.findFirst({ where: { emailVerifyToken: token } });
  if (!user) throw notFound('Invalid or expired verification token');
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailVerifyToken: null, status: UserStatus.ACTIVE },
  });
  await audit('USER_VERIFY_EMAIL', { userId: user.id, req, resource: 'User', resourceId: user.id });
  return { message: 'Email verified. You can now log in.' };
}

export async function login(req: FastifyRequest) {
  const input = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) throw unauthorized('Invalid credentials');
  if (user.status === UserStatus.BANNED || user.status === UserStatus.SUSPENDED) {
    throw unauthorized('Account is suspended or banned');
  }
  if (!user.emailVerified) throw unauthorized('Please verify your email first');
  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) throw unauthorized('Invalid credentials');

  const payload = { sub: user.id, roles: user.roles as string[], status: user.status };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt,
      device: req.headers['user-agent']?.slice(0, 120),
    },
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit('USER_LOGIN', { userId: user.id, req, resource: 'User', resourceId: user.id });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      roles: user.roles,
      status: user.status,
    },
  };
}

export async function refresh(req: FastifyRequest) {
  const { refreshToken } = refreshSchema.parse(req.body);
  let payload: { sub: string; roles: string[]; status: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw unauthorized('Invalid refresh token');
  }
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
  if (!stored || stored.revoked || stored.expiresAt < new Date()) {
    throw unauthorized('Refresh token revoked or expired');
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) throw unauthorized('User not found');

  const newPayload = { sub: user.id, roles: user.roles as string[], status: user.status };
  return {
    accessToken: signAccessToken(newPayload),
    refreshToken: signRefreshToken(newPayload),
  };
}

export async function logout(req: FastifyRequest) {
  const { refreshToken } = (req.body as { refreshToken?: string }) ?? {};
  if (refreshToken) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(refreshToken), revoked: false },
      data: { revoked: true },
    });
  }
  if (req.user) await audit('USER_LOGOUT', { userId: req.user.id, req });
  return { message: 'Logged out' };
}

export async function logoutAll(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  await prisma.refreshToken.updateMany({
    where: { userId: req.user.id, revoked: false },
    data: { revoked: true },
  });
  await audit('USER_LOGOUT_ALL', { userId: req.user.id, req });
  return { message: 'Logged out from all devices' };
}

export function registerAuthRoutes(app: FastifyInstance, prefix: string): void {
  app.post(`${prefix}/auth/register`, { handler: register as never });
  app.post(`${prefix}/auth/verify-email`, { handler: verifyEmail as never });
  app.post(`${prefix}/auth/login`, { handler: login as never });
  app.post(`${prefix}/auth/refresh`, { handler: refresh as never });
  app.post(`${prefix}/auth/logout`, { preHandler: app.authenticate, handler: logout as never });
  app.post(`${prefix}/auth/logout-all`, { preHandler: app.authenticate, handler: logoutAll as never });
}
