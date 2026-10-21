// Encryption of saved data with a key derived from the PIN.
//
// - Key: PBKDF2-SHA-256 (600 000 rounds, the OWASP recommendation; random salt) from
//   the PIN, used for AES-256-GCM. The key is never exported or stored. Data saved with
//   fewer rounds (150 000 before) still opens, and is saved again with a new key after unlocking.
// - A 4–6 digit PIN keeps out someone who picks up the device. Against someone with a copy
//   of the encrypted data and time to try every PIN, no number of rounds is enough.
// - Each save uses a fresh random IV. GCM also authenticates the data, so a
//   wrong PIN (or tampered data) fails to decrypt instead of giving garbage:
//   decrypting is how the PIN is checked.
// - Only the salt, round count, IV, PIN length and ciphertext are stored.

export const KEY_ITERATIONS = 600_000;

/** Whether data saved with this key should be saved again with a stronger one. */
export const isWeakKey = (k: KeyInfo): boolean => k.iterations < KEY_ITERATIONS;

/** What's stored instead of the plain data when a PIN is set. */
export interface Envelope {
  tare: 'encrypted';
  v: 1;
  salt: string;       // base64, for PBKDF2
  iterations: number;
  pinLength: number;  // the lock screen shows this many dots
  iv: string;         // base64, 12 bytes
  data: string;       // base64 AES-GCM ciphertext of the JSON data
}

/** A derived key plus what's needed to derive it again from the PIN. */
export interface KeyInfo { key: CryptoKey; salt: string; iterations: number; pinLength: number }

export const isEnvelope = (x: unknown): x is Envelope =>
  !!x && typeof x === 'object' && (x as Envelope).tare === 'encrypted' && (x as Envelope).v === 1;

const toB64 = (b: Uint8Array): string => { let s = ''; for (const c of b) s += String.fromCharCode(c); return btoa(s); };
const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(pin: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

/** A new key for a newly set or changed PIN (fresh salt). */
export async function newKeyInfo(pin: string, iterations = KEY_ITERATIONS): Promise<KeyInfo> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { key: await deriveKey(pin, salt, iterations), salt: toB64(salt), iterations, pinLength: pin.length };
}

/** The key for an existing envelope, from the PIN someone typed. */
export async function keyInfoFor(pin: string, env: Envelope): Promise<KeyInfo> {
  return { key: await deriveKey(pin, fromB64(env.salt), env.iterations), salt: env.salt, iterations: env.iterations, pinLength: env.pinLength };
}

export async function seal(value: unknown, k: KeyInfo): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, k.key, plain as BufferSource));
  return { tare: 'encrypted', v: 1, salt: k.salt, iterations: k.iterations, pinLength: k.pinLength, iv: toB64(iv), data: toB64(cipher) };
}

/** Decrypts an envelope. Throws if the key is wrong or the data was changed. */
export async function unseal(env: Envelope, k: KeyInfo): Promise<unknown> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.iv) as BufferSource }, k.key, fromB64(env.data) as BufferSource);
  return JSON.parse(new TextDecoder().decode(plain));
}
