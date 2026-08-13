import { hash, compare } from 'bcryptjs';
import { config } from '../config/env';

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, config.jwt.bcryptRounds);
}

export function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return compare(plain, hashed);
}
