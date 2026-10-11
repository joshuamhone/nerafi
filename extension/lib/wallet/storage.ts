import { browser } from 'wxt/browser';
import { deriveAddress } from './account';
import type { EncryptedVault } from './vault';

const VAULT_KEY = 'nerafi.vault';
const ADDRESS_KEY = 'nerafi.address';
const SESSION_KEY = 'nerafi.session';

export const AUTO_LOCK_MS = 15 * 60 * 1000;

type Session = {
  phrase: string;
  expiresAt: number;
};

function parseSession(value: unknown): Session | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const { phrase, expiresAt } = record;
  if (typeof phrase !== 'string' || phrase.length === 0) return null;
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null;
  return { phrase, expiresAt };
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

export async function setUnlocked(phrase: string, now: number = Date.now()): Promise<void> {
  const session: Session = { phrase, expiresAt: now + AUTO_LOCK_MS };
  await browser.storage.session.set({ [SESSION_KEY]: session });
}

export async function getUnlockedPhrase(now: number = Date.now()): Promise<string | null> {
  const stored = await browser.storage.session.get(SESSION_KEY);
  const parsed = parseSession(stored[SESSION_KEY]);
  if (parsed === null || now >= parsed.expiresAt) {
    await browser.storage.session.remove(SESSION_KEY);
    return null;
  }
  return parsed.phrase;
}

export async function lock(): Promise<void> {
  await browser.storage.session.remove(SESSION_KEY);
}
