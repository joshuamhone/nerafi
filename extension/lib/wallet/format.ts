import { formatEther } from 'viem';

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