import { describe, expect, it } from 'vitest';
import { totalLeavingSentence } from './reviewCopy';

const BELOW_FLOOR_WEI = 10n ** 12n;

describe('totalLeavingSentence', () => {
  it('uses the "Less than" form one wei below the threshold', () => {
    expect(totalLeavingSentence(BELOW_FLOOR_WEI - 1n)).toBe(
      'Less than 0.000001 test ETH will leave your wallet.',
    );
  });

  it('uses the "At most" form exactly at the threshold', () => {
    expect(totalLeavingSentence(BELOW_FLOOR_WEI)).toBe(
      'At most 0.000001 test ETH will leave your wallet.',
    );
  });

  it('uses the "Less than" form for a single wei', () => {
    expect(totalLeavingSentence(1n)).toBe('Less than 0.000001 test ETH will leave your wallet.');
  });

  it('uses the "At most" form for a normal total', () => {
    expect(totalLeavingSentence(1021000000000000n)).toBe(
      'At most 0.001021 test ETH will leave your wallet.',
    );
  });
});