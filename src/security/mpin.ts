import bcrypt from 'bcryptjs';
import * as Crypto from 'expo-crypto';

const BCRYPT_ROUNDS = 10;

let randomConfigured = false;

function configureRandom(): void {
  if (randomConfigured) {
    return;
  }

  bcrypt.setRandomFallback((length: number) => Array.from(Crypto.getRandomBytes(length)));
  randomConfigured = true;
}

function normalizeHash(hash: string): string {
  return hash.replace(/^\$2b\$/, '$2a$');
}

export async function hashMpin(mpin: string): Promise<string> {
  configureRandom();
  const hash = await bcrypt.hash(mpin, BCRYPT_ROUNDS);
  return normalizeHash(hash);
}

export async function verifyMpin(mpin: string, mpinHash: string): Promise<boolean> {
  configureRandom();
  return bcrypt.compare(mpin, normalizeHash(mpinHash));
}
