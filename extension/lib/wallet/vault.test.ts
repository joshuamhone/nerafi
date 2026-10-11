import { beforeAll, describe, expect, it } from 'vitest';
import { decryptPhrase, encryptPhrase, validatePassword, VaultError } from './vault';
import type { EncryptedVault } from './vault';

// Public test phrase used by Anvil/Hardhat. Synthetic, safe to commit.
const PHRASE = 'test test test test test test test test test test test junk';
const PASSWORD = 'correct horse battery staple';
const WRONG_PASSWORD = 'incorrect horse battery';
const DAMAGED_VAULT_MESSAGE = 'Unsupported or damaged vault';
const DECRYPT_FAILED_MESSAGE = 'Incorrect password or damaged vault';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function flipFirstByte(value: string): string {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const first = bytes[0];
  if (first === undefined) throw new Error('Empty base64 input');
  bytes[0] = first ^ 0xff;
  return bytesToBase64(bytes);
}

let vault: EncryptedVault;

beforeAll(async () => {
  vault = await encryptPhrase(PHRASE, PASSWORD);
});

describe('encryptPhrase / decryptPhrase', () => {
  it('round trips the phrase', async () => {
    const fresh = await encryptPhrase(PHRASE, PASSWORD);
    await expect(decryptPhrase(fresh, PASSWORD)).resolves.toBe(PHRASE);
  });

  it('uses a fresh salt, iv and ciphertext on every encryption', async () => {
    const a = await encryptPhrase(PHRASE, PASSWORD);
    const b = await encryptPhrase(PHRASE, PASSWORD);
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it('rejects a wrong password with the generic message', async () => {
    let caught: unknown;
    try {
      await decryptPhrase(vault, WRONG_PASSWORD);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(VaultError);
    expect((caught as Error).message).toBe(DECRYPT_FAILED_MESSAGE);
  });

  it('rejects a flipped byte in the ciphertext', async () => {
    const tampered = { ...vault, ciphertext: flipFirstByte(vault.ciphertext) };
    await expect(decryptPhrase(tampered, PASSWORD)).rejects.toBeInstanceOf(VaultError);
  });

  it('rejects a flipped byte in the iv', async () => {
    const tampered = { ...vault, cipher: { ...vault.cipher, iv: flipFirstByte(vault.cipher.iv) } };
    await expect(decryptPhrase(tampered, PASSWORD)).rejects.toBeInstanceOf(VaultError);
  });

  it('rejects a flipped byte in the salt', async () => {
    const tampered = { ...vault, kdf: { ...vault.kdf, salt: flipFirstByte(vault.kdf.salt) } };
    await expect(decryptPhrase(tampered, PASSWORD)).rejects.toBeInstanceOf(VaultError);
  });

  it('treats composed and decomposed Unicode passwords as equal', async () => {
    const composed = '\u00e9abcdefghijkl';
    const decomposed = 'e\u0301abcdefghijkl';
    const encrypted = await encryptPhrase(PHRASE, composed);
    await expect(decryptPhrase(encrypted, decomposed)).resolves.toBe(PHRASE);
  });

  it('never includes the phrase or password in error messages', async () => {
    let decryptMessage = '';
    try {
      await decryptPhrase(vault, WRONG_PASSWORD);
    } catch (error) {
      decryptMessage = error instanceof Error ? error.message : '';
    }
    expect(decryptMessage).not.toContain(WRONG_PASSWORD);
    expect(decryptMessage).not.toContain(PHRASE);

    let encryptMessage = '';
    try {
      await encryptPhrase('one two three', PASSWORD);
    } catch (error) {
      encryptMessage = error instanceof Error ? error.message : '';
    }
    expect(encryptMessage).not.toContain(PHRASE);
    expect(encryptMessage).not.toContain(PASSWORD);
  });
});

describe('parseVault rejects malformed vaults', () => {
  it('rejects null', async () => {
    await expect(decryptPhrase(null, PASSWORD)).rejects.toThrow(DAMAGED_VAULT_MESSAGE);
  });

  it('rejects a string', async () => {
    await expect(decryptPhrase('not a vault', PASSWORD)).rejects.toThrow(
      DAMAGED_VAULT_MESSAGE,
    );
  });

  it('rejects a number', async () => {
    await expect(decryptPhrase(42, PASSWORD)).rejects.toThrow(DAMAGED_VAULT_MESSAGE);
  });

  it('rejects an array', async () => {
    await expect(decryptPhrase([], PASSWORD)).rejects.toThrow(DAMAGED_VAULT_MESSAGE);
  });

  it('rejects a wrong version', async () => {
    await expect(decryptPhrase({ ...vault, version: 2 }, PASSWORD)).rejects.toThrow(
      DAMAGED_VAULT_MESSAGE,
    );
  });

  it('rejects weak iterations', async () => {
    await expect(
      decryptPhrase({ ...vault, kdf: { ...vault.kdf, iterations: 1 } }, PASSWORD),
    ).rejects.toThrow(DAMAGED_VAULT_MESSAGE);
  });

  it('rejects a wrong kdf name', async () => {
    await expect(
      decryptPhrase({ ...vault, kdf: { ...vault.kdf, name: 'scrypt' } }, PASSWORD),
    ).rejects.toThrow(DAMAGED_VAULT_MESSAGE);
  });

  it('rejects a wrong kdf hash', async () => {
    await expect(
      decryptPhrase({ ...vault, kdf: { ...vault.kdf, hash: 'SHA-512' } }, PASSWORD),
    ).rejects.toThrow(DAMAGED_VAULT_MESSAGE);
  });

  it('rejects a wrong cipher name', async () => {
    await expect(
      decryptPhrase({ ...vault, cipher: { ...vault.cipher, name: 'AES-CBC' } }, PASSWORD),
    ).rejects.toThrow(DAMAGED_VAULT_MESSAGE);
  });

  it('rejects a missing field', async () => {
    const record: Record<string, unknown> = { ...vault };
    delete record.ciphertext;
    await expect(decryptPhrase(record, PASSWORD)).rejects.toThrow(DAMAGED_VAULT_MESSAGE);
  });

  it('rejects a wrong salt length', async () => {
    const short = bytesToBase64(new Uint8Array(8));
    await expect(
      decryptPhrase({ ...vault, kdf: { ...vault.kdf, salt: short } }, PASSWORD),
    ).rejects.toThrow(DAMAGED_VAULT_MESSAGE);
  });

  it('rejects a wrong iv length', async () => {
    const short = bytesToBase64(new Uint8Array(8));
    await expect(
      decryptPhrase({ ...vault, cipher: { ...vault.cipher, iv: short } }, PASSWORD),
    ).rejects.toThrow(DAMAGED_VAULT_MESSAGE);
  });

  it('rejects invalid base64', async () => {
    await expect(
      decryptPhrase({ ...vault, ciphertext: 'not base64!!!' }, PASSWORD),
    ).rejects.toThrow(DAMAGED_VAULT_MESSAGE);
  });

  it('rejects an empty ciphertext', async () => {
    await expect(decryptPhrase({ ...vault, ciphertext: '' }, PASSWORD)).rejects.toThrow(
      DAMAGED_VAULT_MESSAGE,
    );
  });
});

describe('encryptPhrase input validation', () => {
  it('rejects an invalid phrase', async () => {
    await expect(encryptPhrase('not a valid phrase', PASSWORD)).rejects.toThrow();
  });

  it('rejects an 11-character password', async () => {
    await expect(encryptPhrase(PHRASE, 'abcdefghijk')).rejects.toThrow();
  });
});

describe('validatePassword', () => {
  it('accepts exactly 12 characters', () => {
    expect(validatePassword('abcdefghijkl')).toBeNull();
  });

  it('rejects 11 characters', () => {
    expect(validatePassword('abcdefghijk')).not.toBeNull();
  });

  it('counts a multi-code-unit emoji as one character', () => {
    const emoji = '\u{1F600}';
    expect(validatePassword('abcdefghij' + emoji)).not.toBeNull();
    expect(validatePassword('abcdefghijk' + emoji)).toBeNull();
  });
});
