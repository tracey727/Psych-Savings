/**
 * TOTP (RFC 6238) over HMAC-SHA1 (RFC 4226), for privileged-role MFA
 * (docs/security/SECURITY_PRIVACY_GOVERNANCE.md "MFA for privileged
 * accounts", enforced via packages/permissions' PRIVILEGED_ROLES).
 * Secrets are stored/shared as Base32 (RFC 4648), matching standard
 * authenticator apps (Google Authenticator, 1Password, etc.).
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

export function generateTotpSecret(byteLength = 20): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return base32Encode(bytes);
}

function counterBytes(counter: number): Uint8Array {
  // 8-byte big-endian counter. `counter` is a step count, safely within
  // Number.MAX_SAFE_INTEGER for any realistic TOTP deployment lifetime.
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  return new Uint8Array(buf);
}

async function hotp(secret: Uint8Array, counter: number, digits: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    secret as BufferSource,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBytes(counter) as BufferSource));
  const offset = mac[mac.length - 1]! & 0x0f;
  const binCode =
    ((mac[offset]! & 0x7f) << 24) |
    ((mac[offset + 1]! & 0xff) << 16) |
    ((mac[offset + 2]! & 0xff) << 8) |
    (mac[offset + 3]! & 0xff);
  const code = (binCode % 10 ** digits).toString().padStart(digits, "0");
  return code;
}

export async function computeTotp(
  secretBase32: string,
  timeMs: number = Date.now(),
  stepSeconds: number = STEP_SECONDS,
  digits: number = DIGITS,
): Promise<string> {
  const counter = Math.floor(timeMs / 1000 / stepSeconds);
  return hotp(base32Decode(secretBase32), counter, digits);
}

/** Accepts a code from `window` steps before/after the current step, to tolerate clock drift. */
export async function verifyTotp(
  secretBase32: string,
  code: string,
  timeMs: number = Date.now(),
  window = 1,
  stepSeconds: number = STEP_SECONDS,
  digits: number = DIGITS,
): Promise<boolean> {
  const currentCounter = Math.floor(timeMs / 1000 / stepSeconds);
  const secret = base32Decode(secretBase32);
  for (let delta = -window; delta <= window; delta++) {
    const candidate = await hotp(secret, currentCounter + delta, digits);
    if (candidate === code) return true;
  }
  return false;
}
