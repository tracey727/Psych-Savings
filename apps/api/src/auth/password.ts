/**
 * Password hashing via PBKDF2-HMAC-SHA256, using the Web Crypto API
 * (available in both Cloudflare Workers and Node >= 20's `crypto.subtle`)
 * so no external native dependency is needed. 210,000 iterations follows
 * OWASP's 2023 PBKDF2-SHA256 recommendation.
 *
 * Stored format: pbkdf2$<iterations>$<saltHex>$<hashHex>
 */

const ITERATIONS = 210_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function deriveHash(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    HASH_BYTES * 8,
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveHash(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toHex(salt.buffer)}$${toHex(hash)}`;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  const saltHex = parts[2];
  const expectedHex = parts[3];
  if (!Number.isInteger(iterations) || iterations <= 0 || !saltHex || !expectedHex) return false;

  const salt = fromHex(saltHex);
  const actualHex = toHex(await deriveHash(password, salt, iterations));
  return timingSafeEqualHex(actualHex, expectedHex);
}
