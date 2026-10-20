// Unlocking with Face ID, a fingerprint or the device's screen lock, through a
// passkey on this device.
//
// The data stays encrypted with the key from the PIN; nothing about that
// changes. A passkey's PRF extension gives a secret only after the person is
// verified on the device; Tare uses it to encrypt the PIN and keeps that here
// (outside the encrypted data, since it's needed before unlocking), along with
// the passkey's id. Unlocking: verify → secret → PIN → the usual unlock.
// Without the person on this device the stored PIN can't be read. Removing
// this can never lose data: the PIN still works.

const STORE_KEY = 'tare.passkey';

interface Saved { id: string; salt: string; iv: string; pin: string } // base64

const b64 = (b: Uint8Array): string => { let s = ''; for (const c of b) s += String.fromCharCode(c); return btoa(s); };
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const random = (n: number): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(n));

// The PRF extension isn't in TypeScript's DOM types yet.
type PrfResults = { enabled?: boolean; results?: { first?: ArrayBuffer } };
const prfOf = (cred: PublicKeyCredential): PrfResults | undefined => (cred.getClientExtensionResults() as { prf?: PrfResults }).prf;
const prfInput = (salt: Uint8Array<ArrayBuffer>) => ({ prf: { eval: { first: salt } } }) as AuthenticationExtensionsClientInputs;

let supported = false;

/** Whether this device can do it: a platform authenticator that verifies the person, and PRF support. */
export async function initPasskeySupport(): Promise<void> {
  try {
    if (!window.isSecureContext || typeof PublicKeyCredential === 'undefined') return;
    const caps = await (PublicKeyCredential as unknown as { getClientCapabilities?: () => Promise<Record<string, boolean>> }).getClientCapabilities?.();
    if (caps && caps['extension:prf'] === false) return;
    supported = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { supported = false; }
}
export const passkeySupported = (): boolean => supported;

function read(): Saved | null {
  try { const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null'); return s && typeof s.id === 'string' ? s : null; } catch { return null; }
}
export const passkeyEnabled = (): boolean => !!read();
export function forgetPasskey(): void { try { localStorage.removeItem(STORE_KEY); } catch { /* nothing stored */ } }

/** The AES key that encrypts the PIN, from the passkey's PRF secret. */
async function wrapKey(secret: ArrayBuffer): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('tare: unlock with passkey') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

/** Asks the device to verify the person with the passkey `id`, and returns its PRF secret. */
async function secretFrom(id: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  const cred = await navigator.credentials.get({ publicKey: {
    challenge: random(32), allowCredentials: [{ type: 'public-key', id }], userVerification: 'required', timeout: 60_000, extensions: prfInput(salt),
  } }) as PublicKeyCredential | null;
  const out = cred && prfOf(cred)?.results?.first;
  if (!out) throw new Error('No PRF secret');
  return out;
}

/** Creates a passkey on this device and keeps the PIN encrypted with its secret. Needs a click. */
export async function enablePasskey(pin: string): Promise<void> {
  const salt = random(32);
  const cred = await navigator.credentials.create({ publicKey: {
    rp: { name: 'Tare' },
    user: { id: random(16), name: 'Tare', displayName: 'Tare' },
    challenge: random(32),
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    timeout: 60_000,
    extensions: prfInput(salt),
  } }) as PublicKeyCredential | null;
  if (!cred) throw new Error('Cancelled');
  const prf = prfOf(cred);
  if (!prf?.enabled && !prf?.results?.first) throw new Error('This passkey has no PRF support');
  const id = new Uint8Array(cred.rawId);
  // Some devices give the secret straight away, others only when the passkey is used.
  const secret = prf.results?.first ?? await secretFrom(id, salt);
  const iv = random(12);
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await wrapKey(secret), new TextEncoder().encode(pin));
  localStorage.setItem(STORE_KEY, JSON.stringify({ id: b64(id), salt: b64(salt), iv: b64(iv), pin: b64(new Uint8Array(sealed)) } satisfies Saved));
}

/** Verifies the person with the passkey and returns the PIN it unlocks. Needs a click. */
export async function pinFromPasskey(): Promise<string> {
  const s = read();
  if (!s) throw new Error('No passkey set up');
  const secret = await secretFrom(unb64(s.id), unb64(s.salt));
  const pin = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv) }, await wrapKey(secret), unb64(s.pin));
  return new TextDecoder().decode(pin);
}
