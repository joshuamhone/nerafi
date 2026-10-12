import { browser } from 'wxt/browser';
import { readSession, writeSession } from './storage';

export const SETTINGS_KEY = 'nerafi.settings';
export const MINUTE_MS = 60_000;

export const AUTO_LOCK_OPTIONS = [1, 5, 15, 30, 60] as const;
export type AutoLockMinutes = (typeof AUTO_LOCK_OPTIONS)[number];

export type Settings = {
  autoLockMinutes: AutoLockMinutes;
};

export const DEFAULT_SETTINGS: Settings = { autoLockMinutes: 15 };

function isAutoLockMinutes(value: unknown): value is AutoLockMinutes {
  return (
    typeof value === 'number' && (AUTO_LOCK_OPTIONS as readonly number[]).includes(value)
  );
}

export function parseSettings(value: unknown): Settings | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== 'autoLockMinutes') return null;
  if (!isAutoLockMinutes(record.autoLockMinutes)) return null;
  return { autoLockMinutes: record.autoLockMinutes };
}

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return parseSettings(stored[SETTINGS_KEY]) ?? { ...DEFAULT_SETTINGS };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

export function autoLockMs(settings: Settings): number {
  return settings.autoLockMinutes * MINUTE_MS;
}

export function autoLockLabel(minutes: AutoLockMinutes): string {
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

export type AutoLockApplyResult = 'now' | 'next';

// Change the configured auto-lock. A shorter interval takes effect at once; a
// longer one waits for the next unlock. A live session is never extended
// without the password.
export async function changeAutoLock(
  minutes: AutoLockMinutes,
  now: number = Date.now(),
): Promise<AutoLockApplyResult> {
  await saveSettings({ autoLockMinutes: minutes });

  const session = await readSession(now);
  if (session === null) return 'next';

  const target = Math.min(session.expiresAt, now + minutes * MINUTE_MS);
  if (target < session.expiresAt) {
    await writeSession({ address: session.address, expiresAt: target });
    return 'now';
  }
  return 'next';
}
