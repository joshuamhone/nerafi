import { browser } from 'wxt/browser';
import { appendSecurityLog } from './securityLog';
import { loadVault } from './storage';
import { decryptPhrase, encryptPhrase, VaultError } from './vault';
import type { EncryptedVault } from './vault';

export const UNLOCK_GUARD_KEY = 'nerafi.unlockGuard';
export const LOCKOUT_THRESHOLD = 5;
export const BASE_LOCKOUT_MS = 30_000;
export const MAX_LOCKOUT_MS = 15 * 60 * 1000;

export type UnlockGuard = {
  failures: number;
  lockedUntil: number | null;
};

export type UnlockOutcome = 'success' | 'failure';

const FRESH_GUARD: UnlockGuard = { failures: 0, lockedUntil: null };

export class LockoutError extends Error {
  readonly lockedUntil: number;

  constructor(lockedUntil: number) {
    super('Too many attempts. Try again in a while.');
    this.name = 'LockoutError';
    this.lockedUntil = lockedUntil;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseGuard(value: unknown): UnlockGuard | null {
  if (!isPlainObject(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== 'failures' || keys[1] !== 'lockedUntil') return null;
  const { failures, lockedUntil } = value;
  if (typeof failures !== 'number' || !Number.isSafeInteger(failures) || failures < 0) return null;
  if (lockedUntil !== null && (typeof lockedUntil !== 'number' || !Number.isFinite(lockedUntil))) {
    return null;
  }
  return { failures, lockedUntil };
}

export function nextGuard(guard: UnlockGuard, outcome: UnlockOutcome, now: number): UnlockGuard {
  if (outcome === 'success') return { failures: 0, lockedUntil: null };

  const failures = guard.failures + 1;
  if (failures < LOCKOUT_THRESHOLD) return { failures, lockedUntil: null };

  const delay = Math.min(
    BASE_LOCKOUT_MS * 2 ** (failures - LOCKOUT_THRESHOLD),
    MAX_LOCKOUT_MS,
  );
  return { failures, lockedUntil: now + delay };
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

async function loadGuard(): Promise<UnlockGuard> {
  const stored = await browser.storage.local.get(UNLOCK_GUARD_KEY);
  return parseGuard(stored[UNLOCK_GUARD_KEY]) ?? FRESH_GUARD;
}

async function saveGuard(guard: UnlockGuard): Promise<void> {
  await browser.storage.local.set({ [UNLOCK_GUARD_KEY]: guard });
}

// openVault is the one and only place a password is turned into a phrase.
// Unlock, send, change-password and add-account all funnel through here so the
// backoff guard can never be bypassed by a different code path.
export async function openVault(password: string, now: number = Date.now()): Promise<string> {
  const guard = await loadGuard();
  if (guard.lockedUntil !== null && now < guard.lockedUntil) {
    // Locked out: refuse without decrypting and without counting another failure.
    throw new LockoutError(guard.lockedUntil);
  }

  const loaded = await loadVault();
  if (loaded === null) {
    throw new VaultError('Unsupported or damaged vault');
  }

  try {
    const phrase = await decryptPhrase(loaded.vault, password);
    await saveGuard(nextGuard(guard, 'success', now));
    return phrase;
  } catch (err) {
    const next = nextGuard(guard, 'failure', now);
    await saveGuard(next);
    await appendSecurityLog('unlock_failed', undefined, now);
    if (next.lockedUntil !== null) {
      await appendSecurityLog('lockout_started', formatDuration(next.lockedUntil - now), now);
    }
    throw err;
  }
}

export async function resetGuard(): Promise<void> {
  await saveGuard({ failures: 0, lockedUntil: null });
}

// The remaining lockout window, if one is still active. The locked screen reads
// this on mount so a page reload does not hide a lockout that is still ticking,
// and the unlock/send/change-password flows read it right after a failed attempt
// so a lockout that starts on that attempt is shown immediately rather than only
// on the next one.
export async function readLockoutUntil(now: number = Date.now()): Promise<number | null> {
  const guard = await loadGuard();
  if (guard.lockedUntil !== null && now < guard.lockedUntil) return guard.lockedUntil;
  return null;
}

export function lockoutRemainingText(until: number, now: number = Date.now()): string {
  const total = Math.max(0, Math.ceil((until - now) / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function lockoutMessage(until: number, now: number = Date.now()): string {
  return `Too many attempts. Try again in ${lockoutRemainingText(until, now)}.`;
}

// Encryption with a round-trip check that keeps password handling in this one
// file. It accepts a phrase and a new password (never an arbitrary vault plus a
// password guess) and returns the verified vault, so there is no exported
// function that can be used as a password oracle against an attacker-chosen
// vault.
export async function encryptVaultVerified(
  phrase: string,
  newPassword: string,
): Promise<EncryptedVault> {
  const vault = await encryptPhrase(phrase, newPassword);
  const check = await decryptPhrase(vault, newPassword);
  if (check !== phrase) {
    throw new VaultError('Could not verify the new password.');
  }
  return vault;
}
