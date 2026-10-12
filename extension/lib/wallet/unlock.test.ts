import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

const decryptSpy = vi.hoisted(() => vi.fn());

vi.mock('./vault', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./vault')>();
  return { ...actual, decryptPhrase: decryptSpy };
});

import { saveVault } from './storage';
import { VaultError } from './vault';
import { loadSecurityLog } from './securityLog';
import {
  BASE_LOCKOUT_MS,
  LockoutError,
  MAX_LOCKOUT_MS,
  nextGuard,
  openVault,
  parseGuard,
  UNLOCK_GUARD_KEY,
  type UnlockGuard,
} from './unlock';

const PASSWORD = 'correct horse battery staple';
const PHRASE = 'test test test test test test test test test test test junk';
const ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

function sampleVault() {
  return {
    version: 1 as const,
    kdf: {
      name: 'PBKDF2' as const,
      hash: 'SHA-256' as const,
      iterations: 600_000,
      salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
    },
    cipher: { name: 'AES-GCM' as const, iv: 'AAAAAAAAAAAAAAAA' },
    ciphertext: 'AAAAAAAAAAAAAAAAAAAAAA==',
  };
}

async function readGuard() {
  const stored: Record<string, unknown> = await fakeBrowser.storage.local.get(UNLOCK_GUARD_KEY);
  return stored[UNLOCK_GUARD_KEY];
}

beforeEach(() => {
  fakeBrowser.reset();
  decryptSpy.mockReset();
});

describe('parseGuard', () => {
  it('accepts a valid guard', () => {
    expect(parseGuard({ failures: 2, lockedUntil: null })).toEqual({
      failures: 2,
      lockedUntil: null,
    });
  });

  it('rejects malformed values', () => {
    expect(parseGuard(null)).toBeNull();
    expect(parseGuard({ failures: -1, lockedUntil: null })).toBeNull();
    expect(parseGuard({ failures: 1.5, lockedUntil: null })).toBeNull();
    expect(parseGuard({ failures: 1, lockedUntil: 'soon' })).toBeNull();
    expect(parseGuard({ failures: 1, lockedUntil: null, extra: 1 })).toBeNull();
  });
});

describe('nextGuard', () => {
  it('does not lock before the threshold', () => {
    let guard: UnlockGuard = { failures: 0, lockedUntil: null };
    for (let i = 0; i < 4; i++) guard = nextGuard(guard, 'failure', 1_000);
    expect(guard).toEqual({ failures: 4, lockedUntil: null });
  });

  it('locks for 30 seconds on the fifth failure', () => {
    const guard = nextGuard({ failures: 4, lockedUntil: null }, 'failure', 1_000);
    expect(guard).toEqual({ failures: 5, lockedUntil: 1_000 + 30_000 });
  });

  it('doubles the delay after that', () => {
    const guard = nextGuard({ failures: 5, lockedUntil: null }, 'failure', 1_000);
    expect(guard).toEqual({ failures: 6, lockedUntil: 1_000 + 60_000 });
  });

  it('caps the delay at the maximum', () => {
    const guard = nextGuard({ failures: 20, lockedUntil: null }, 'failure', 1_000);
    expect(guard).toEqual({ failures: 21, lockedUntil: 1_000 + MAX_LOCKOUT_MS });
  });

  it('resets on success', () => {
    expect(nextGuard({ failures: 9, lockedUntil: 5_000 }, 'success', 1_000)).toEqual({
      failures: 0,
      lockedUntil: null,
    });
  });
});

describe('openVault', () => {
  it('returns the phrase and resets the guard on success', async () => {
    await saveVault(sampleVault(), ADDRESS);
    await fakeBrowser.storage.local.set({ [UNLOCK_GUARD_KEY]: { failures: 3, lockedUntil: null } });
    decryptSpy.mockResolvedValue(PHRASE);

    await expect(openVault(PASSWORD, 1_000)).resolves.toBe(PHRASE);
    expect(await readGuard()).toEqual({ failures: 0, lockedUntil: null });
  });

  it('counts a failure, saves the guard and logs it', async () => {
    await saveVault(sampleVault(), ADDRESS);
    decryptSpy.mockRejectedValue(new VaultError('Incorrect password or damaged vault'));

    await expect(openVault(PASSWORD, 1_000)).rejects.toBeInstanceOf(VaultError);
    expect(await readGuard()).toEqual({ failures: 1, lockedUntil: null });

    const log = await loadSecurityLog();
    expect(log.map((entry) => entry.type)).toEqual(['unlock_failed']);
  });

  it('starts a lockout on the fifth failure and logs it with a fixed detail', async () => {
    await saveVault(sampleVault(), ADDRESS);
    await fakeBrowser.storage.local.set({ [UNLOCK_GUARD_KEY]: { failures: 4, lockedUntil: null } });
    decryptSpy.mockRejectedValue(new VaultError('Incorrect password or damaged vault'));

    await expect(openVault(PASSWORD, 1_000)).rejects.toBeInstanceOf(VaultError);
    expect(await readGuard()).toEqual({ failures: 5, lockedUntil: 1_000 + BASE_LOCKOUT_MS });

    const log = await loadSecurityLog();
    expect(log).toEqual([
      { type: 'lockout_started', at: 1_000, detail: '30 seconds' },
      { type: 'unlock_failed', at: 1_000 },
    ]);
  });

  it('refuses without decrypting while locked out and does not count another failure', async () => {
    await saveVault(sampleVault(), ADDRESS);
    await fakeBrowser.storage.local.set({
      [UNLOCK_GUARD_KEY]: { failures: 5, lockedUntil: 10_000 },
    });
    decryptSpy.mockResolvedValue(PHRASE);

    await expect(openVault(PASSWORD, 5_000)).rejects.toBeInstanceOf(LockoutError);
    expect(decryptSpy).not.toHaveBeenCalled();
    expect(await readGuard()).toEqual({ failures: 5, lockedUntil: 10_000 });
  });

  it('allows an attempt again once the lockout has passed', async () => {
    await saveVault(sampleVault(), ADDRESS);
    await fakeBrowser.storage.local.set({
      [UNLOCK_GUARD_KEY]: { failures: 5, lockedUntil: 5_000 },
    });
    decryptSpy.mockResolvedValue(PHRASE);

    await expect(openVault(PASSWORD, 5_000)).resolves.toBe(PHRASE);
    expect(await readGuard()).toEqual({ failures: 0, lockedUntil: null });
  });
});
