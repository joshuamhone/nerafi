import { isValidMnemonic } from './account';

export const VAULT_VERSION = 1;
export const PBKDF2_ITERATIONS = 600_000;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 1024;

export type EncryptedVault = {
  version: 1;
  kdf: {
    name: 'PBKDF2';
    hash: 'SHA-256';
    iterations: number;
    salt: string;
  };
  cipher: {
    name: 'AES-GCM';
    iv: string;
  };
  ciphertext: string;
};

const DAMAGED_VAULT_MESSAGE = 'Unsupported or damaged vault';
const DECRYPT_FAILED_MESSAGE = 'Incorrect password or damaged vault';
const INVALID_PHRASE_MESSAGE = 'Invalid recovery phrase';

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VaultError';
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  if (!BASE64_PATTERN.test(value)) return null;
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function validatePassword(password: string): string | null {
  const length = [...password.normalize('NFKC')].length;
  if (length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const passwordBytes = new TextEncoder().encode(password.normalize('NFKC'));
  const baseKey = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  if (actual.length !== keys.length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

type ParsedVault = {
  iterations: number;
  salt: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: Uint8Array<ArrayBuffer>;
};

function parseVault(vault: unknown): ParsedVault {
  if (!isPlainObject(vault)) throw new VaultError(DAMAGED_VAULT_MESSAGE);
  if (!hasExactKeys(vault, ['version', 'kdf', 'cipher', 'ciphertext'])) {
    throw new VaultError(DAMAGED_VAULT_MESSAGE);
  }
  if (vault.version !== VAULT_VERSION) throw new VaultError(DAMAGED_VAULT_MESSAGE);

  const kdf = vault.kdf;
  if (!isPlainObject(kdf) || !hasExactKeys(kdf, ['name', 'hash', 'iterations', 'salt'])) {
    throw new VaultError(DAMAGED_VAULT_MESSAGE);
  }
  if (kdf.name !== 'PBKDF2' || kdf.hash !== 'SHA-256' || kdf.iterations !== PBKDF2_ITERATIONS) {
    throw new VaultError(DAMAGED_VAULT_MESSAGE);
  }
  if (typeof kdf.salt !== 'string') throw new VaultError(DAMAGED_VAULT_MESSAGE);

  const cipher = vault.cipher;
  if (!isPlainObject(cipher) || !hasExactKeys(cipher, ['name', 'iv'])) {
    throw new VaultError(DAMAGED_VAULT_MESSAGE);
  }
  if (cipher.name !== 'AES-GCM') throw new VaultError(DAMAGED_VAULT_MESSAGE);
  if (typeof cipher.iv !== 'string') throw new VaultError(DAMAGED_VAULT_MESSAGE);

  if (typeof vault.ciphertext !== 'string') throw new VaultError(DAMAGED_VAULT_MESSAGE);

  const salt = base64ToBytes(kdf.salt);
  if (salt === null || salt.length !== SALT_BYTES) throw new VaultError(DAMAGED_VAULT_MESSAGE);
  const iv = base64ToBytes(cipher.iv);
  if (iv === null || iv.length !== IV_BYTES) throw new VaultError(DAMAGED_VAULT_MESSAGE);
  const ciphertext = base64ToBytes(vault.ciphertext);
  if (ciphertext === null || ciphertext.length === 0) {
    throw new VaultError(DAMAGED_VAULT_MESSAGE);
  }

  return { iterations: PBKDF2_ITERATIONS, salt, iv, ciphertext };
}

export async function encryptPhrase(phrase: string, password: string): Promise<EncryptedVault> {
  if (!isValidMnemonic(phrase)) {
    // Never include the phrase in an error message: errors get logged.
    throw new Error(INVALID_PHRASE_MESSAGE);
  }
  const passwordError = validatePassword(password);
  if (passwordError !== null) {
    throw new Error(passwordError);
  }

  // Fresh randomness on every save: a new salt means a new key, and a new IV
  // means the same plaintext never encrypts the same way twice.
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);

  const plaintext = new TextEncoder().encode(phrase);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  return {
    version: VAULT_VERSION,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
    },
    cipher: { name: 'AES-GCM', iv: bytesToBase64(iv) },
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function decryptPhrase(vault: unknown, password: string): Promise<string> {
  const parsed = parseVault(vault);
  const key = await deriveKey(password, parsed.salt, parsed.iterations);

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: parsed.iv },
      key,
      parsed.ciphertext,
    );
  } catch {
    // AES-GCM cannot tell a wrong key from altered ciphertext; do not guess.
    throw new VaultError(DECRYPT_FAILED_MESSAGE);
  }

  const phrase = new TextDecoder().decode(plaintext);
  if (!isValidMnemonic(phrase)) {
    throw new VaultError(DECRYPT_FAILED_MESSAGE);
  }
  return phrase;
}
