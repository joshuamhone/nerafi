import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { AUTO_LOCK_MS, setUnlocked, SESSION_KEY } from './storage';
import {
  autoLockLabel,
  autoLockMs,
  changeAutoLock,
  DEFAULT_SETTINGS,
  loadSettings,
  MINUTE_MS,
  parseSettings,
  SETTINGS_KEY,
} from './settings';

const ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('parseSettings', () => {
  it('accepts only the allowed intervals', () => {
    expect(parseSettings({ autoLockMinutes: 5 })).toEqual({ autoLockMinutes: 5 });
    expect(parseSettings({ autoLockMinutes: 2 })).toBeNull();
    expect(parseSettings({ autoLockMinutes: '5' })).toBeNull();
    expect(parseSettings({ autoLockMinutes: 5, extra: 1 })).toBeNull();
    expect(parseSettings(null)).toBeNull();
  });
});

describe('loadSettings', () => {
  it('falls back to the default when missing or invalid', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    await fakeBrowser.storage.local.set({ [SETTINGS_KEY]: { autoLockMinutes: 2 } });
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe('autoLockMs / autoLockLabel', () => {
  it('converts minutes to milliseconds', () => {
    expect(autoLockMs({ autoLockMinutes: 5 })).toBe(5 * MINUTE_MS);
  });

  it('labels singular and plural', () => {
    expect(autoLockLabel(1)).toBe('1 minute');
    expect(autoLockLabel(15)).toBe('15 minutes');
  });
});

describe('changeAutoLock', () => {
  it('applies a shorter interval immediately', async () => {
    await setUnlocked(ADDRESS, 1_000, AUTO_LOCK_MS);
    const result = await changeAutoLock(5, 2_000);
    expect(result).toBe('now');

    const raw: Record<string, unknown> = await fakeBrowser.storage.session.get(SESSION_KEY);
    expect(raw[SESSION_KEY]).toEqual({ address: ADDRESS, expiresAt: 2_000 + 5 * MINUTE_MS });
  });


  it('defers a longer interval and never extends the session', async () => {
    await setUnlocked(ADDRESS, 1_000, AUTO_LOCK_MS);
    const result = await changeAutoLock(60, 2_000);
    expect(result).toBe('next');

    const raw: Record<string, unknown> = await fakeBrowser.storage.session.get(SESSION_KEY);
    expect(raw[SESSION_KEY]).toEqual({ address: ADDRESS, expiresAt: 1_000 + AUTO_LOCK_MS });
  });

  it('persists the setting and defers when locked', async () => {
    const result = await changeAutoLock(30, 2_000);
    expect(result).toBe('next');
    expect(await loadSettings()).toEqual({ autoLockMinutes: 30 });
  });
});
