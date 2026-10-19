import * as Crypto from 'expo-crypto';

/**
 * Stable UUID for local rows. Uses expo-crypto so Android release APKs
 * work even when global `crypto.randomUUID` is missing on Hermes.
 */
export function newId(): string {
  return Crypto.randomUUID();
}
