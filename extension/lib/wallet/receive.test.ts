import { describe, expect, it } from 'vitest';
import { SEPOLIA_CHAIN_ID } from './network';
import { buildReceiveUri } from './receive';

const ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

describe('buildReceiveUri', () => {
  it('builds an EIP-681 receive URI with the checksummed address', () => {
    expect(buildReceiveUri(ADDRESS)).toBe(`ethereum:${ADDRESS}@${SEPOLIA_CHAIN_ID}`);
  });

  it('checksums an all-lowercase address', () => {
    expect(buildReceiveUri(ADDRESS.toLowerCase())).toBe(`ethereum:${ADDRESS}@${SEPOLIA_CHAIN_ID}`);
  });

  it('throws for an invalid address', () => {
    expect(() => buildReceiveUri('0x1234')).toThrow();
  });

  it('throws for a non-hex address', () => {
    expect(() => buildReceiveUri(`0x${'zz'.repeat(20)}`)).toThrow();
  });
});