import { browser } from 'wxt/browser';
import { isAddress } from 'viem';
import { deriveAddress } from './account';
import { appendSecurityLog } from './securityLog';
import type { EncryptedVault } from './vault';

const VAULT_KEY = 'nerafi.vault';
export const ADDRESS_KEY = 'nerafi.address';
export const SESSION_KEY = 'nerafi.session';
export const SESSION_ACCOUNTS_KEY = 'nerafi.sessionAccounts';

export const AUTO_LOCK_MS = 15 * 60 * 1000;

export type Session = {
  address: string;
  expiresAt: number;
};

function parseSession(value: unknown): Session | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== 'address' || keys[1] !== 'expiresAt') return null;
  const { address, expiresAt } = record;
  if (typeof address !== 'string' || !isAddress(address)) return null;
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null;
  return { address, expiresAt };
}

export async function hasVault(): Promise<boolean> {
  const stored = await browser.storage.local.get(VAULT_KEY);
  const vault: unknown = stored[VAULT_KEY];
  return vault !== undefined && vault !== null;
}

export async function saveVault(vault: EncryptedVault, address: string): Promise<void> {
  await browser.storage.local.set({ [VAULT_KEY]: vault, [ADDRESS_KEY]: address });
}

export async function loadVault(): Promise<{ vault: unknown; address: string } | null> {
  const stored = await browser.storage.local.get([VAULT_KEY, ADDRESS_KEY]);
  const vault: unknown = stored[VAULT_KEY];
  const address: unknown = stored[ADDRESS_KEY];
  if (vault === undefined || vault === null) return null;
  if (typeof address !== 'string') return null;
  return { vault, address };
}

export async function syncAddress(
  phrase: string,
): Promise<{ address: string; corrected: boolean }> {
  const address = deriveAddress(phrase);
  const stored = await browser.storage.local.get(ADDRESS_KEY);
  if (stored[ADDRESS_KEY] === address) {
    return { address, corrected: false };
  }
  await browser.storage.local.set({ [ADDRESS_KEY]: address });
  return { address, corrected: true };
}

export async function setUnlocked(
  address: string,
  now: number = Date.now(),
  durationMs: number = AUTO_LOCK_MS,
): Promise<void> {
  const session: Session = { address, expiresAt: now + durationMs };
  await browser.storage.session.set({ [SESSION_KEY]: session });
}

export async function readSession(now: number = Date.now()): Promise<Session | null> {
  const stored = await browser.storage.session.get(SESSION_KEY);
  const parsed = parseSession(stored[SESSION_KEY]);
  if (parsed === null) {
    if (stored[SESSION_KEY] !== undefined) {
      await browser.storage.session.remove(SESSION_KEY);
    }
    return null;
  }
  if (now >= parsed.expiresAt) {
    // The auto-lock read is the one place a session is found already expired,
    // so record it here (exactly once) before clearing the session material.
    await browser.storage.session.remove([SESSION_KEY, SESSION_ACCOUNTS_KEY]);
    await appendSecurityLog('lock_auto', undefined, now);
    return null;
  }
  return parsed;
}

export async function writeSession(session: Session): Promise<void> {
  await browser.storage.session.set({ [SESSION_KEY]: session });
}

export async function getUnlockedAddress(now: number = Date.now()): Promise<string | null> {
  const session = await readSession(now);
  return session === null ? null : session.address;
}

export async function lock(): Promise<void> {
  await browser.storage.session.remove([SESSION_KEY, SESSION_ACCOUNTS_KEY]);
}
