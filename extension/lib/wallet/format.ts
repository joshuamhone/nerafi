import { formatEther, formatUnits } from 'viem';

const WEI_PER_DISPLAY_UNIT = 10n ** 12n;
const DISPLAY_DECIMALS = 6n;

function rounded(wei: bigint, mode: 'floor' | 'ceil'): string {
  if (wei <= 0n) return '0';
  if (wei < WEI_PER_DISPLAY_UNIT) return '< 0.000001';
  const units =
    mode === 'floor'
      ? wei / WEI_PER_DISPLAY_UNIT
      : (wei + WEI_PER_DISPLAY_UNIT - 1n) / WEI_PER_DISPLAY_UNIT;
  const whole = units / 10n ** DISPLAY_DECIMALS;
  const fraction = (units % 10n ** DISPLAY_DECIMALS).toString().padStart(6, '0').replace(/0+$/, '');
  return fraction === '' ? whole.toString() : `${whole}.${fraction}`;
}

export function formatBalance(wei: bigint): string {
  return rounded(wei, 'floor');
}

export function formatAtMost(wei: bigint): string {
  return rounded(wei, 'ceil');
}

export function formatExact(wei: bigint): string {
  return formatEther(wei);
}

const TOKEN_DISPLAY_DECIMALS = 6;

// Token balances round down like the ETH balance, to at most six decimals, and
// a non-zero amount too small to show never reads as 0. All integer maths.
export function formatTokenBalance(raw: bigint, decimals: number): string {
  if (raw <= 0n) return '0';
  const shown = Math.min(decimals, TOKEN_DISPLAY_DECIMALS);
  const step = 10n ** BigInt(decimals - shown);
  if (raw < step) return '< 0.000001';
  const units = raw / step;
  const scale = 10n ** BigInt(shown);
  const whole = units / scale;
  const fraction = (units % scale).toString().padStart(shown, '0').replace(/0+$/, '');
  return fraction === '' ? whole.toString() : `${whole}.${fraction}`;
}

export function formatTokenExact(raw: bigint, decimals: number): string {
  return formatUnits(raw, decimals);
}
