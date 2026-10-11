import { describe, expect, it } from 'vitest';
import { assertSepolia, NetworkError, SEPOLIA_CHAIN_ID } from './network';

describe('assertSepolia', () => {
  it('passes when the chain ID is Sepolia', async () => {
    await expect(
      assertSepolia({
        async getChainId() {
          return SEPOLIA_CHAIN_ID;
        },
      }),
    ).resolves.toBeUndefined();
  });

  it('throws NetworkError for mainnet (1)', async () => {
    await expect(
      assertSepolia({
        async getChainId() {
          return 1;
        },
      }),
    ).rejects.toBeInstanceOf(NetworkError);
  });

  it('throws NetworkError for goerli (5)', async () => {
    await expect(
      assertSepolia({
        async getChainId() {
          return 5;
        },
      }),
    ).rejects.toBeInstanceOf(NetworkError);
  });
});
