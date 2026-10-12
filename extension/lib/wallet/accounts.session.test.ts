import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { addAccount, renameAccount, switchAccount, unlockAccounts } from './accounts';
import { SESSION_KEY } from './storage';

const PHRASE = 'test test test test test test test test test test test junk';
const DURATION = 15 * 60 * 1000;

async function expiresAt(): Promise<number> {
  const stored: Record<string, unknown> = await fakeBrowser.storage.session.get(SESSION_KEY);
  const session = stored[SESSION_KEY];
  if (typeof session !== 'object' || session === null) throw new Error('no session');
  const value = (session as { expiresAt?: unknown }).expiresAt;
  if (typeof value !== 'number') throw new Error('no expiry');
  return value;
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('session expiry is only set by unlock', () => {
  it('addAccount keeps the expiresAt it started with', async () => {
    await unlockAccounts(PHRASE, DURATION, 1_000);
    const before = await expiresAt();

    const result = await addAccount(PHRASE, undefined, 5_000);
    expect(result.ok).toBe(true);
    expect(await expiresAt()).toBe(before);
  });

  it('switchAccount and renameAccount keep the expiresAt', async () => {
    await unlockAccounts(PHRASE, DURATION, 1_000);
    await addAccount(PHRASE, undefined, 5_000);
    const before = await expiresAt();

    expect((await switchAccount(1, 6_000)).ok).toBe(true);
    expect(await expiresAt()).toBe(before);

    expect((await renameAccount(1, 'Cold storage')).ok).toBe(true);
    expect(await expiresAt()).toBe(before);
  });
});
