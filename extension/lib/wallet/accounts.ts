import { browser } from 'wxt/browser';
import { getAddress, isAddress } from 'viem';
import { deriveAccountAddress, MAX_ACCOUNTS } from './account';
import {
  ADDRESS_KEY,
  readSession,
  SESSION_ACCOUNTS_KEY,
  setUnlocked,
  writeSession,
} from './storage';

export { MAX_ACCOUNTS } from './account';

export const ACCOUNTS_KEY = 'nerafi.accounts';
export const ACTIVE_ACCOUNT_KEY = 'nerafi.activeAccount';
export const ACCOUNT_NAME_MAX = 32;

export type StoredAccount = {
  index: number;
  name: string;
  address: string;
};

export type SessionAccount = {
  index: number;
  address: string;
};

export type AccountNameResult = { ok: true; name: string } | { ok: false; error: string };

export function defaultAccountName(index: number): string {
  return `Account ${index + 1}`;
}

export function normalizeAccountName(raw: string): AccountNameResult {
  const name = raw.normalize('NFKC').trim();
  const length = [...name].length;
  if (length === 0) return { ok: false, error: 'Enter an account name.' };
  if (length > ACCOUNT_NAME_MAX) {
    return { ok: false, error: `Account name must be at most ${ACCOUNT_NAME_MAX} characters.` };
  }
  if (/[\p{Cc}\p{Cf}]/u.test(name)) {
    return { ok: false, error: 'Account name contains unsupported characters.' };
  }
  return { ok: true, name };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  if (actual.length !== keys.length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function parseAccount(value: unknown, position: number): StoredAccount | null {
  if (!isPlainObject(value)) return null;
  if (!hasExactKeys(value, ['index', 'name', 'address'])) return null;
  if (value.index !== position) return null;
  if (typeof value.name !== 'string') return null;
  const nameResult = normalizeAccountName(value.name);
  if (!nameResult.ok || nameResult.name !== value.name) return null;
  if (typeof value.address !== 'string' || !isAddress(value.address)) return null;
  return { index: position, name: nameResult.name, address: getAddress(value.address) };
}

export function parseAccounts(value: unknown): StoredAccount[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ACCOUNTS) return null;
  const accounts: StoredAccount[] = [];
  for (let i = 0; i < value.length; i++) {
    const account = parseAccount(value[i], i);
    if (account === null) return null;
    accounts.push(account);
  }
  return accounts;
}

function parseSessionAccount(value: unknown, position: number): SessionAccount | null {
  if (!isPlainObject(value)) return null;
  if (!hasExactKeys(value, ['index', 'address'])) return null;
  if (value.index !== position) return null;
  if (typeof value.address !== 'string' || !isAddress(value.address)) return null;
  return { index: position, address: getAddress(value.address) };
}

export function parseSessionAccounts(value: unknown): SessionAccount[] | null {
  if (!isPlainObject(value) || !hasExactKeys(value, ['accounts'])) return null;
  const list = value.accounts;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_ACCOUNTS) return null;
  const accounts: SessionAccount[] = [];
  for (let i = 0; i < list.length; i++) {
    const account = parseSessionAccount(list[i], i);
    if (account === null) return null;
    accounts.push(account);
  }
  return accounts;
}

export function parseActiveIndex(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return null;
  if (value < 0 || value >= MAX_ACCOUNTS) return null;
  return value;
}

export async function loadAccounts(): Promise<StoredAccount[] | null> {
  const stored = await browser.storage.local.get(ACCOUNTS_KEY);
  return parseAccounts(stored[ACCOUNTS_KEY]);
}

export async function saveAccounts(accounts: StoredAccount[]): Promise<void> {
  await browser.storage.local.set({ [ACCOUNTS_KEY]: accounts });
}

export async function getActiveIndex(): Promise<number> {
  const stored = await browser.storage.local.get(ACTIVE_ACCOUNT_KEY);
  return parseActiveIndex(stored[ACTIVE_ACCOUNT_KEY]) ?? 0;
}

export async function setActiveIndex(index: number): Promise<void> {
  await browser.storage.local.set({ [ACTIVE_ACCOUNT_KEY]: index });
}

export async function loadSessionAccounts(
  now: number = Date.now(),
): Promise<SessionAccount[] | null> {
  // A reader must never return verified addresses for a missing/expired session.
  const session = await readSession(now);
  if (session === null) return null;
  const stored = await browser.storage.session.get(SESSION_ACCOUNTS_KEY);
  return parseSessionAccounts(stored[SESSION_ACCOUNTS_KEY]);
}

async function writeSessionAccounts(accounts: SessionAccount[]): Promise<void> {
  await browser.storage.session.set({
    [SESSION_ACCOUNTS_KEY]: { accounts },
  });
}

export type UnlockAccountsResult = {
  accounts: StoredAccount[];
  index: number;
  address: string;
  corrected: boolean;
};

export async function unlockAccounts(
  phrase: string,
  durationMs: number,
  now: number = Date.now(),
): Promise<UnlockAccountsResult> {
  const derived: string[] = [];
  const deriveAt = (index: number): string => {
    const existing = derived[index];
    if (existing !== undefined) return existing;
    const address = deriveAccountAddress(phrase, index);
    derived[index] = address;
    return address;
  };

  const stored = await loadAccounts();
  let accounts: StoredAccount[];
  let corrected = false;

  if (stored === null) {
    // Missing or invalid: migrate a single first account derived from the phrase.
    accounts = [{ index: 0, name: defaultAccountName(0), address: deriveAt(0) }];
  } else {
    accounts = stored.map((account) => {
      const address = deriveAt(account.index);
      if (getAddress(account.address) !== address) {
        corrected = true;
        return { ...account, address };
      }
      return account;
    });
  }

  const preferred = await getActiveIndex();
  const index = preferred < accounts.length ? preferred : 0;
  const address = deriveAt(index);

  await setUnlocked(address, now, durationMs);
  await writeSessionAccounts(accounts.map((a) => ({ index: a.index, address: a.address })));
  await saveAccounts(accounts);
  await setActiveIndex(index);
  await browser.storage.local.set({ [ADDRESS_KEY]: address });

  return { accounts, index, address, corrected };
}

export async function switchAccount(
  index: number,
  now: number = Date.now(),
): Promise<{ ok: true; index: number; address: string } | { ok: false; error: string }> {
  const session = await readSession(now);
  if (session === null) {
    return { ok: false, error: 'This wallet is locked.' };
  }
  const stored = await browser.storage.session.get(SESSION_ACCOUNTS_KEY);
  const accounts = parseSessionAccounts(stored[SESSION_ACCOUNTS_KEY]);
  const account = accounts?.find((item) => item.index === index);
  if (account === undefined) {
    return { ok: false, error: 'That account is not available.' };
  }
  // Switching accounts never extends the session.
  await writeSession({ address: account.address, expiresAt: session.expiresAt });
  await setActiveIndex(index);
  return { ok: true, index, address: account.address };
}

export type AddAccountError = { ok: false; error: string };
export type AddAccountSuccess = { ok: true; account: StoredAccount; accounts: StoredAccount[] };

export async function addAccount(
  phrase: string,
  rawName: string | undefined,
  now: number = Date.now(),
): Promise<AddAccountSuccess | AddAccountError> {
  const sessionAccounts = await loadSessionAccounts(now);
  if (sessionAccounts === null) {
    return { ok: false, error: 'This wallet is locked.' };
  }

  const accounts = (await loadAccounts()) ?? [];
  if (accounts.length >= MAX_ACCOUNTS) {
    return { ok: false, error: `You can have at most ${MAX_ACCOUNTS} accounts.` };
  }

  const index = accounts.length;
  let name = defaultAccountName(index);
  if (rawName !== undefined) {
    const nameResult = normalizeAccountName(rawName);
    if (!nameResult.ok) return { ok: false, error: nameResult.error };
    name = nameResult.name;
  }

  const address = deriveAccountAddress(phrase, index);
  const account: StoredAccount = { index, name, address };
  const next = [...accounts, account];
  await saveAccounts(next);
  await writeSessionAccounts([...sessionAccounts, { index, address }]);

  return { ok: true, account, accounts: next };
}

export async function renameAccount(
  index: number,
  rawName: string,
): Promise<{ ok: true; account: StoredAccount } | { ok: false; error: string }> {
  const nameResult = normalizeAccountName(rawName);
  if (!nameResult.ok) return { ok: false, error: nameResult.error };

  const accounts = await loadAccounts();
  const account = accounts?.find((item) => item.index === index);
  if (account === undefined) return { ok: false, error: 'That account is not available.' };

  const renamed: StoredAccount = { ...account, name: nameResult.name };
  await saveAccounts((accounts ?? []).map((item) => (item.index === index ? renamed : item)));
  return { ok: true, account: renamed };
}

export function findAccountName(accounts: StoredAccount[], address: string): string | null {
  const target = address.trim().toLowerCase();
  const account = accounts.find((item) => item.address.toLowerCase() === target);
  return account?.name ?? null;
}

// The ownership label is only trustworthy when the address is one the phrase
// actually derived, i.e. an address in the verified session list written at
// unlock. Names still come from local storage, but a local list entry alone
// (even naming a stranger's address "Account 2") never produces a label.
export function ownAccountLabel(
  address: string,
  sessionAccounts: SessionAccount[],
  storedAccounts: StoredAccount[],
): string | null {
  const target = address.trim().toLowerCase();
  if (!isAddress(target)) return null;
  const verified = sessionAccounts.some((item) => item.address.toLowerCase() === target);
  if (!verified) return null;
  return findAccountName(storedAccounts, target);
}

// The active account on a page load is whichever verified account matches the
// session address. nerafi.activeAccount only chooses the starting account at
// unlock; it must never decide the active account of an existing session.
// Returns null when the session is absent/expired or its address is not in the
// verified list, and the caller locks the wallet in that case.
export async function resolveActiveIndex(now: number = Date.now()): Promise<number | null> {
  const session = await readSession(now);
  if (session === null) return null;
  const stored = await browser.storage.session.get(SESSION_ACCOUNTS_KEY);
  const accounts = parseSessionAccounts(stored[SESSION_ACCOUNTS_KEY]);
  if (accounts === null) return null;
  const target = session.address.toLowerCase();
  const account = accounts.find((item) => item.address.toLowerCase() === target);
  return account?.index ?? null;
}
