import { describe, expect, it } from 'vitest';
import {
  gatherRecipientCode,
  gatherRecipientFacts,
  isListedTokenAddress,
} from './gather';
import type { CodeClient } from './gather';
import type { Token } from '../tokens';

const ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const TOKEN = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';

function client(getCode: CodeClient['getCode']): CodeClient {
  return { getCode };
}

const token: Token = { address: TOKEN, symbol: 'USDC', name: 'USD Coin', decimals: 6, addedAt: 1 };

describe('gatherRecipientCode', () => {
  it('returns contract when the address has code', async () => {
    expect(await gatherRecipientCode(client(async () => '0x6080604052'), ADDRESS)).toBe('contract');
  });

  it('returns eoa when there is no code', async () => {
    expect(await gatherRecipientCode(client(async () => '0x'), ADDRESS)).toBe('eoa');
    expect(await gatherRecipientCode(client(async () => undefined), ADDRESS)).toBe('eoa');
  });

  it('returns unknown, never eoa, when the lookup throws', async () => {
    const result = await gatherRecipientCode(
      client(async () => {
        throw new Error('rpc down');
      }),
      ADDRESS,
    );
    expect(result).toBe('unknown');
  });

  it('returns unknown when the lookup times out', async () => {
    const never = () => new Promise<never>(() => undefined);
    expect(await gatherRecipientCode(client(never), ADDRESS, 20)).toBe('unknown');
  });

  it('returns unknown for an unexpected answer or an invalid address', async () => {
    expect(
      await gatherRecipientCode(client(async () => 'not hex' as unknown as '0x'), ADDRESS),
    ).toBe('unknown');
    let called = false;
    const spy = client(async () => {
      called = true;
      return '0x';
    });
    expect(await gatherRecipientCode(spy, 'nope')).toBe('unknown');
    expect(called).toBe(false);
  });

  it('asks about exactly the address given, once', async () => {
    const calls: string[] = [];
    await gatherRecipientCode(
      client(async (address) => {
        calls.push(address);
        return '0x';
      }),
      ADDRESS,
    );
    expect(calls).toEqual([ADDRESS]);
  });

  it('a fast answer wins over a long timeout', async () => {
    expect(await gatherRecipientCode(client(async () => '0x'), ADDRESS, 60_000)).toBe('eoa');
  });
});

describe('isListedTokenAddress', () => {
  it('matches case-insensitively', () => {
    expect(isListedTokenAddress([token], TOKEN)).toBe(true);
    expect(isListedTokenAddress([token], TOKEN.toLowerCase())).toBe(true);
    expect(isListedTokenAddress([token], `0x${TOKEN.slice(2).toUpperCase()}`)).toBe(true);
  });

  it('does not match another address or an empty list', () => {
    expect(isListedTokenAddress([token], ADDRESS)).toBe(false);
    expect(isListedTokenAddress([], TOKEN)).toBe(false);
  });
});

describe('gatherRecipientFacts', () => {
  it('combines the lookup and the token comparison', async () => {
    expect(await gatherRecipientFacts(client(async () => '0x6080'), TOKEN.toLowerCase(), [token])).toEqual({
      recipientCode: 'contract',
      recipientIsListedToken: true,
    });
    expect(await gatherRecipientFacts(client(async () => '0x'), ADDRESS, [token])).toEqual({
      recipientCode: 'eoa',
      recipientIsListedToken: false,
    });
  });
});
