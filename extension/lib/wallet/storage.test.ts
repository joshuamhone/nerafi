import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { EncryptedVault } from './vault';
import {
  AUTO_LOCK_MS,
  getUnlockedPhrase,
  hasVault,
  loadVault,
  lock,
  saveVault,
  setUnlocked,
  syncAddress,
} from './storage';

const ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const PHRASE = 'test test test test test test test test test test test junk';
const SESSION_KEY = 'nerafi.session';
const ADDRESS_KEY = 'nerafi.address';

function sampleVault(): EncryptedVault {
  return {
    version: 1,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: 600_000,
      salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
    },
    cipher: { name: 'AES-GCM', iv: 'AAAAAAAAAAAAAAAA' },
    ciphertext: 'AAAAAAAAAAAAAAAAAAAAAA==',
  };
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('hasVault', () => {
  it('is false initially', async () => {
    await expect(hasVault()).resolves.toBe(false);
  });

  it('is true after saving', async () => {
    await saveVault(sampleVault(), ADDRESS);
    await expect(hasVault()).resolves.toBe(true);
  });
});

describe('loadVault', () => {
  it('returns the saved vault and address', async () => {
    const vault = sampleVault();
    await saveVault(vault, ADDRESS);
    const loaded = await loadVault();
    expect(loaded).not.toBeNull();
    expect(loaded?.address).toBe(ADDRESS);
    expect(loaded?.vault).toEqual(vault);
  });

  it('returns null when nothing is saved', async () => {
    await expect(loadVault()).resolves.toBeNull();
  });
});

describe('syncAddress', () => {
  it('reports corrected: false when the stored address already matches', async () => {
    await fakeBrowser.storage.local.set({ [ADDRESS_KEY]: ADDRESS });
    await expect(syncAddress(PHRASE)).resolves.toEqual({ address: ADDRESS, corrected: false });
    const stored: Record<string, unknown> = await fakeBrowser.storage.local.get(ADDRESS_KEY);
    expect(stored[ADDRESS_KEY]).toBe(ADDRESS);
  });

  it('overwrites a different stored address and reports corrected: true', async () => {
    await fakeBrowser.storage.local.set({ [ADDRESS_KEY]: '0x0000000000000000000000000000000000000000' });
    await expect(syncAddress(PHRASE)).resolves.toEqual({ address: ADDRESS, corrected: true });
    const stored: Record<string, unknown> = await fakeBrowser.storage.local.get(ADDRESS_KEY);
    expect(stored[ADDRESS_KEY]).toBe(ADDRESS);
  });

  it('writes a missing stored address and reports corrected: true', async () => {
    await expect(syncAddress(PHRASE)).resolves.toEqual({ address: ADDRESS, corrected: true });
    const stored: Record<string, unknown> = await fakeBrowser.storage.local.get(ADDRESS_KEY);
    expect(stored[ADDRESS_KEY]).toBe(ADDRESS);
  });
});

describe('unlocked session', () => {
  it('returns the phrase before expiry', async () => {
    await setUnlocked(PHRASE, 1000);
    await expect(getUnlockedPhrase(1000)).resolves.toBe(PHRASE);
    await expect(getUnlockedPhrase(1000 + AUTO_LOCK_MS - 1)).resolves.toBe(PHRASE);
  });

  it('returns null at and after expiry and removes the entry', async () => {
    await setUnlocked(PHRASE, 1000);
    await expect(getUnlockedPhrase(1000 + AUTO_LOCK_MS)).resolves.toBeNull();
    const atExpiry: Record<string, unknown> = await fakeBrowser.storage.session.get(SESSION_KEY);
    expect(atExpiry[SESSION_KEY]).toBeUndefined();

    await setUnlocked(PHRASE, 1000);
    await expect(getUnlockedPhrase(1000 + AUTO_LOCK_MS + 1)).resolves.toBeNull();
    const afterExpiry: Record<string, unknown> = await fakeBrowser.storage.session.get(SESSION_KEY);
    expect(afterExpiry[SESSION_KEY]).toBeUndefined();
  });

  it('lock clears the session', async () => {
    await setUnlocked(PHRASE, 1000);
    await lock();
    await expect(getUnlockedPhrase(1000)).resolves.toBeNull();
  });

  it('returns null for a malformed session entry and removes it', async () => {
    await fakeBrowser.storage.session.set({ [SESSION_KEY]: { phrase: 42 } });
    await expect(getUnlockedPhrase(1000)).resolves.toBeNull();
    const raw: Record<string, unknown> = await fakeBrowser.storage.session.get(SESSION_KEY);
    expect(raw[SESSION_KEY]).toBeUndefined();
  });
});
