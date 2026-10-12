import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';

const decryptSpy = vi.hoisted(() => vi.fn());

vi.mock('./vault', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./vault')>();
  return { ...actual, decryptPhrase: decryptSpy };
});

const saveSpy = vi.hoisted(() => vi.fn());

vi.mock('./storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./storage')>();
  return { ...actual, saveVault: saveSpy };
});

import { ACCOUNTS_KEY, ACTIVE_ACCOUNT_KEY, unlockAccounts } from './accounts';
import { changePassword } from './changePassword';
import { ADDRESS_KEY, loadVault } from './storage';
import { encryptVaultVerified, UNLOCK_GUARD_KEY } from './unlock';
import { VaultError, encryptPhrase } from './vault';
import type { EncryptedVault } from './vault';

const OLD = 'old correct horse battery staple';
const NEW = 'new correct horse battery staple';
const PHRASE = 'test test test test test test test test test test test junk';
const A0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const A1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const VAULT_KEY = 'nerafi.vault';
const DURATION = 15 * 60 * 1000;

let realSaveVault: ((vault: EncryptedVault, address: string) => Promise<void>) | undefined;

async function seedVault(password: string): Promise<EncryptedVault> {
  const vault = await encryptPhrase(PHRASE, password);
  await fakeBrowser.storage.local.set({ [VAULT_KEY]: vault, [ADDRESS_KEY]: A0 });
  return vault;
}

async function rawVault(): Promise<unknown> {
  const stored: Record<string, unknown> = await fakeBrowser.storage.local.get(VAULT_KEY);
  return stored[VAULT_KEY];
}

async function readGuardFailures(): Promise<number> {
  const stored: Record<string, unknown> = await fakeBrowser.storage.local.get(UNLOCK_GUARD_KEY);
  const guard = stored[UNLOCK_GUARD_KEY];
  if (typeof guard !== 'object' || guard === null) return 0;
  const failures = (guard as { failures?: unknown }).failures;
  return typeof failures === 'number' ? failures : 0;
}

beforeEach(async () => {
  fakeBrowser.reset();
  decryptSpy.mockReset();
  saveSpy.mockReset();
  const actualStorage = await vi.importActual<typeof import('./storage')>('./storage');
  realSaveVault = actualStorage.saveVault;
  saveSpy.mockImplementation((vault: EncryptedVault, address: string) => {
    if (realSaveVault === undefined) throw new Error('test setup missing');
    return realSaveVault(vault, address);
  });
});

describe('changePassword', () => {
  it('does not save when the round-trip check fails and keeps the old vault', async () => {
    const original = await seedVault(OLD);
    decryptSpy.mockResolvedValueOnce(PHRASE); // openVault(current)
    decryptSpy.mockRejectedValueOnce(new VaultError('verification failed'));

    const result = await changePassword(OLD, NEW, NEW, 1_000);
    expect(result.ok).toBe(false);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(await rawVault()).toEqual(original);

    const { decryptPhrase } = await vi.importActual<typeof import('./vault')>('./vault');
    await expect(decryptPhrase(original, OLD)).resolves.toBe(PHRASE);
  });

  it('counts a wrong current password toward the unlock guard', async () => {
    await seedVault(OLD);
    decryptSpy.mockRejectedValue(new VaultError('Incorrect password or damaged vault'));

    const result = await changePassword('not the password', NEW, NEW, 1_000);
    expect(result.ok).toBe(false);
    expect(await readGuardFailures()).toBe(1);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('leaves the stored address hint unchanged while account 1 is active', async () => {
    await seedVault(OLD);
    await fakeBrowser.storage.local.set({
      [ACCOUNTS_KEY]: [
        { index: 0, name: 'Account 1', address: A0 },
        { index: 1, name: 'Savings', address: A1 },
      ],
      [ACTIVE_ACCOUNT_KEY]: 1,
    });
    await unlockAccounts(PHRASE, DURATION, 1_000);
    expect((await loadVault())?.address).toBe(A1);

    decryptSpy.mockResolvedValue(PHRASE);
    const result = await changePassword(OLD, NEW, NEW, 2_000);
    expect(result.ok).toBe(true);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect((await loadVault())?.address).toBe(A1);

    const next = await unlockAccounts(PHRASE, DURATION, 3_000);
    expect(next.corrected).toBe(false);
    expect(next.index).toBe(1);
  });
});

describe('encryptVaultVerified', () => {
  it('returns a vault that opens only with the new password', async () => {
    decryptSpy.mockResolvedValue(PHRASE);
    const vault = await encryptVaultVerified(PHRASE, NEW);

    const { decryptPhrase } = await vi.importActual<typeof import('./vault')>('./vault');
    await expect(decryptPhrase(vault, NEW)).resolves.toBe(PHRASE);
    await expect(decryptPhrase(vault, OLD)).rejects.toBeInstanceOf(VaultError);
  });
});
