import { describe, expect, it } from 'vitest';
import {
  isRefreshCoolingDown,
  REFRESH_COOLDOWN_MS,
  refreshCooldownRemaining,
} from './cooldown';

describe('the Refresh cooldown', () => {
  it('is 10 seconds', () => {
    expect(REFRESH_COOLDOWN_MS).toBe(10_000);
  });

  it('is not running before Refresh has been pressed', () => {
    expect(isRefreshCoolingDown(null, 5_000)).toBe(false);
    expect(refreshCooldownRemaining(null, 5_000)).toBe(0);
  });

  it('is running right after a press and for the full 10 seconds', () => {
    expect(isRefreshCoolingDown(1_000, 1_000)).toBe(true);
    expect(isRefreshCoolingDown(1_000, 10_999)).toBe(true);
    expect(refreshCooldownRemaining(1_000, 4_000)).toBe(7_000);
  });

  it('is over at exactly 10 seconds', () => {
    expect(isRefreshCoolingDown(1_000, 11_000)).toBe(false);
    expect(refreshCooldownRemaining(1_000, 11_000)).toBe(0);
  });

  it('is over long after, and never negative', () => {
    expect(isRefreshCoolingDown(1_000, 999_999)).toBe(false);
    expect(refreshCooldownRemaining(1_000, 999_999)).toBe(0);
  });
});
