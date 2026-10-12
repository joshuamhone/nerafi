import { describe, expect, it } from 'vitest';
import { parseEther, parseTransaction, recoverTransactionAddress } from 'viem';
import type { Address, Hex } from 'viem';
import { NetworkError, SEPOLIA_CHAIN_ID } from './network';
import { buildReview, submitTransfer } from './send';

const PHRASE = 'test test test test test test test test test test test junk';
const A1: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const OTHER: Address = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const NONCE = 3;
const HASH: Hex = `0x${'cd'.repeat(32)}`;

function sampleReview(from: Address) {
  return buildReview({
    from,
    to: OTHER,
    valueWei: parseEther('0.02'),
    gas: 21_000n,
    maxFeePerGas: 2_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
    balanceWei: parseEther('1'),
  });
}

function fakeClient(chainId: number) {
  const calls = { getChainId: 0, getTransactionCount: 0, sendRawTransaction: 0 };
  let captured: Hex | null = null;
  const client = {
    async getChainId() {
      calls.getChainId++;
      return chainId;
    },
    async getTransactionCount(_args: { address: Address; blockTag: 'pending' }) {
      calls.getTransactionCount++;
      return NONCE;
    },
    async sendRawTransaction(args: { serializedTransaction: Hex }) {
      calls.sendRawTransaction++;
      captured = args.serializedTransaction;
      return HASH;
    },
  };
  return { client, calls, getCaptured: () => captured };
}

describe('submitTransfer with an account index', () => {
  it('signs with the selected account', async () => {
    const review = sampleReview(A1);
    const { client, calls, getCaptured } = fakeClient(SEPOLIA_CHAIN_ID);

    const hash = await submitTransfer({ client }, PHRASE, review, 1);

    expect(hash).toBe(HASH);
    expect(calls.sendRawTransaction).toBe(1);

    const serialized = getCaptured();
    expect(serialized).not.toBeNull();
    if (serialized === null) throw new Error('no transaction was signed');

    const recovered = await recoverTransactionAddress({
      serializedTransaction: serialized as `0x02${string}`,
    });
    expect(recovered).toBe(A1);

    const parsed = parseTransaction(serialized);
    expect(parsed.to?.toLowerCase()).toBe(OTHER.toLowerCase());
  });

  it('refuses a mismatched index before any network call', async () => {
    const review = sampleReview(A1);
    const { client, calls } = fakeClient(SEPOLIA_CHAIN_ID);

    await expect(submitTransfer({ client }, PHRASE, review, 0)).rejects.toThrow();
    expect(calls.getChainId).toBe(0);
    expect(calls.getTransactionCount).toBe(0);
    expect(calls.sendRawTransaction).toBe(0);
  });

  it('still checks the chain ID for the selected account', async () => {
    const review = sampleReview(A1);
    const { client, calls } = fakeClient(1);

    await expect(submitTransfer({ client }, PHRASE, review, 1)).rejects.toBeInstanceOf(
      NetworkError,
    );
    expect(calls.getChainId).toBe(1);
    expect(calls.sendRawTransaction).toBe(0);
  });
});
