import { describe, expect, it } from 'vitest';
import { formatEther, parseEther, parseTransaction, recoverTransactionAddress } from 'viem';
import type { Address, Hex } from 'viem';
import { NetworkError, SEPOLIA_CHAIN_ID } from './network';
import {
  buildReview,
  explainReview,
  parseAmount,
  parseRecipient,
  submitTransfer,
} from './send';

const PHRASE = 'test test test test test test test test test test test junk';
const ADDRESS: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const OTHER: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const NONCE = 7;
const HASH: Hex = `0x${'ab'.repeat(32)}`;

function sampleReview() {
  return buildReview({
    from: ADDRESS,
    to: OTHER,
    valueWei: parseEther('0.01'),
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

describe('parseRecipient', () => {
  it('accepts a correctly checksummed address', () => {
    expect(parseRecipient(OTHER, ADDRESS)).toEqual({
      ok: true,
      address: OTHER,
      isSelf: false,
    });
  });

  it('accepts an all-lowercase address and returns it checksummed', () => {
    expect(parseRecipient(OTHER.toLowerCase(), ADDRESS)).toEqual({
      ok: true,
      address: OTHER,
      isSelf: false,
    });
  });

  it('rejects a mixed-case address whose checksum is wrong', () => {
    const wrongChecksum = '0x70997970c51812dc3A010C7d01b50e0d17dc79C8';
    const result = parseRecipient(wrongChecksum, ADDRESS);
    expect(result.ok).toBe(false);
  });

  it('rejects a wrong-length address', () => {
    expect(parseRecipient('0x1234', ADDRESS).ok).toBe(false);
  });

  it('rejects a non-hex address', () => {
    const nonHex = `0x${'zz'.repeat(20)}`;
    expect(parseRecipient(nonHex, ADDRESS).ok).toBe(false);
  });

  it('rejects the zero address', () => {
    const zero = '0x0000000000000000000000000000000000000000';
    expect(parseRecipient(zero, ADDRESS).ok).toBe(false);
  });

  it('flags the own address as isSelf', () => {
    expect(parseRecipient(ADDRESS, ADDRESS)).toEqual({
      ok: true,
      address: ADDRESS,
      isSelf: true,
    });
  });
});

describe('parseAmount', () => {
  it('accepts 0.01', () => {
    expect(parseAmount('0.01')).toEqual({ ok: true, wei: parseEther('0.01') });
  });

  it('accepts 18 decimals', () => {
    expect(parseAmount('0.000000000000000001')).toEqual({ ok: true, wei: 1n });
  });

  it('rejects 19 decimals', () => {
    expect(parseAmount('0.0000000000000000001').ok).toBe(false);
  });

  it('rejects zero in any form', () => {
    expect(parseAmount('0').ok).toBe(false);
    expect(parseAmount('0.0').ok).toBe(false);
  });

  it('rejects other malformed inputs', () => {
    for (const value of ['-1', '1e18', '1,000', ' ', '', '.5']) {
      expect(parseAmount(value).ok).toBe(false);
    }
  });
});

describe('buildReview', () => {
  it('computes the maximum fee and total', () => {
    const review = buildReview({
      from: ADDRESS,
      to: OTHER,
      valueWei: 1_000n,
      gas: 21_000n,
      maxFeePerGas: 2n,
      maxPriorityFeePerGas: 1n,
      balanceWei: 100_000n,
    });
    expect(review.maxFeeWei).toBe(42_000n);
    expect(review.totalMaxWei).toBe(43_000n);
  });

  it('is sufficient when the balance exactly equals the total', () => {
    const review = buildReview({
      from: ADDRESS,
      to: OTHER,
      valueWei: 1_000n,
      gas: 21_000n,
      maxFeePerGas: 2n,
      maxPriorityFeePerGas: 1n,
      balanceWei: 43_000n,
    });
    expect(review.sufficient).toBe(true);
  });

  it('is insufficient when the balance is one wei short', () => {
    const review = buildReview({
      from: ADDRESS,
      to: OTHER,
      valueWei: 1_000n,
      gas: 21_000n,
      maxFeePerGas: 2n,
      maxPriorityFeePerGas: 1n,
      balanceWei: 42_999n,
    });
    expect(review.sufficient).toBe(false);
  });
});

describe('explainReview', () => {
  it('includes the address, the amount, and the maximum fee', () => {
    const review = sampleReview();
    const text = explainReview(review);
    expect(text).toContain(OTHER);
    expect(text).toContain('0.01');
    expect(text).toContain(formatEther(review.maxFeeWei));
  });
});

describe('submitTransfer', () => {
  it('signs the exact review values and sends on Sepolia', async () => {
    const review = sampleReview();
    const { client, calls, getCaptured } = fakeClient(SEPOLIA_CHAIN_ID);

    const hash = await submitTransfer({ client }, PHRASE, review);

    expect(hash).toBe(HASH);
    expect(calls.sendRawTransaction).toBe(1);
    expect(calls.getTransactionCount).toBe(1);

    const serialized = getCaptured();
    expect(serialized).not.toBeNull();
    if (serialized === null) throw new Error('no transaction was signed');

    const parsed = parseTransaction(serialized);
    expect(parsed.chainId).toBe(SEPOLIA_CHAIN_ID);
    expect(parsed.to?.toLowerCase()).toBe(OTHER.toLowerCase());
    expect(parsed.value).toBe(review.valueWei);
    expect(parsed.gas).toBe(review.gas);
    expect(parsed.maxFeePerGas).toBe(review.maxFeePerGas);
    expect(parsed.maxPriorityFeePerGas).toBe(review.maxPriorityFeePerGas);
    expect(parsed.nonce).toBe(NONCE);

    const recovered = await recoverTransactionAddress({
      serializedTransaction: serialized as `0x02${string}`,
    });
    expect(recovered).toBe(ADDRESS);
  });

  it('refuses to sign when the RPC is not Sepolia', async () => {
    const review = sampleReview();
    const { client, calls } = fakeClient(1);

    await expect(submitTransfer({ client }, PHRASE, review)).rejects.toBeInstanceOf(NetworkError);
    expect(calls.sendRawTransaction).toBe(0);
    expect(calls.getTransactionCount).toBe(0);
  });

  it('refuses to sign when the phrase does not match the review sender', async () => {
    const review = { ...sampleReview(), from: OTHER };
    const { client, calls } = fakeClient(SEPOLIA_CHAIN_ID);

    await expect(submitTransfer({ client }, PHRASE, review)).rejects.toThrow();
    expect(calls.sendRawTransaction).toBe(0);
    expect(calls.getTransactionCount).toBe(0);
  });
});
