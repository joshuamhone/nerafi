import { formatAtMost } from './format';

const BELOW_FLOOR_WEI = 10n ** 12n;

export function totalLeavingSentence(totalMaxWei: bigint): string {
  if (totalMaxWei < BELOW_FLOOR_WEI) {
    return 'Less than 0.000001 test ETH will leave your wallet.';
  }
  return `At most ${formatAtMost(totalMaxWei)} test ETH will leave your wallet.`;
}