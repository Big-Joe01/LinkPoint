import jwt, { SignOptions } from 'jsonwebtoken';
import { createHash } from 'crypto';
import { config } from '../config/env';

export interface AccessTokenPayload {
  sub: string;
  roles: string[];
  status: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.accessTtl } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, config.jwt.secret) as jwt.JwtPayload & AccessTokenPayload;
  return { sub: decoded.sub, roles: decoded.roles, status: decoded.status };
}

export function signRefreshToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshTtl } as SignOptions);
}

export function verifyRefreshToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, config.jwt.refreshSecret) as jwt.JwtPayload &
    AccessTokenPayload;
  return { sub: decoded.sub, roles: decoded.roles, status: decoded.status };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
