import type { PinHash } from '../data/schema';

// The PIN keeps other people from opening Tare on a shared device. It is a
// privacy screen, not encryption: the data itself stays readable to anyone
// with full access to the browser. Only a salted PBKDF2 hash is stored.

export const PIN_ITERATIONS = 150_000;

export const isValidPin = (pin: string): boolean => /^\d{4,6}$/.test(pin);

const toB64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPin(pin: string, iterations = PIN_ITERATIONS): Promise<PinHash> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { hash: toB64(await derive(pin, salt, iterations)), salt: toB64(salt), iterations, length: pin.length };
}

export async function verifyPin(pin: string, stored: PinHash): Promise<boolean> {
  const got = await derive(pin, fromB64(stored.salt), stored.iterations);
  const want = fromB64(stored.hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

/** Wait time after repeated wrong PINs: none for the first 5, then 30 s, doubling, capped at 15 min. */
export const lockoutMs = (failures: number): number =>
  failures < 5 ? 0 : Math.min(15 * 60_000, 30_000 * 2 ** (failures - 5));
