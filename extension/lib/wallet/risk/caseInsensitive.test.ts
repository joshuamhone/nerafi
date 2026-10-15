import { getAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import { assessTransaction, DEAD_ADDRESS, ZERO_ADDRESS } from './assess';
import type { RiskInput } from './assess';
import { gatherRecipientFacts, isListedTokenAddress } from './gather';
import type { Token } from '../tokens';

const TOKEN_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const PLAIN = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const base: RiskInput = {
  recipientAddress: PLAIN,
  recipient: { kind: 'contact', name: 'Alice', addedAt: 1 },
  recipientCode: 'eoa',
  recipientIsListedToken: false,
  amountWei: 10n ** 18n,
  feeWei: 10n ** 15n,
  balanceWei: 100n * 10n ** 18n,
  isSelfSend: false,
};

function ids(overrides: Partial<RiskInput>): string[] {
  return assessTransaction({ ...base, ...overrides }).findings.map((finding) => finding.id);
}

function forms(address: string): Record<string, string> {
  return {
    lowercase: address.toLowerCase(),
    uppercase: `0x${address.slice(2).toUpperCase()}`,
    checksummed: getAddress(address),
  };
}

describe('burn_address fires for every form of both burn addresses', () => {
  it('the zero address', () => {
    for (const [name, form] of Object.entries(forms(ZERO_ADDRESS))) {
      expect(ids({ recipientAddress: form }), name).toContain('burn_address');
    }
  });

  it('the 0x…dEaD address: lowercase, uppercase and checksummed', () => {
    const all = forms(DEAD_ADDRESS);
    expect(all.checksummed).toBe('0x000000000000000000000000000000000000dEaD');
    for (const [name, form] of Object.entries(all)) {
      expect(ids({ recipientAddress: form }), name).toContain('burn_address');
    }
  });

  it('a surrounding space does not hide it', () => {
    expect(ids({ recipientAddress: ` ${DEAD_ADDRESS} ` })).toContain('burn_address');
  });

  it('does not fire for ordinary addresses in any form', () => {
    for (const form of Object.values(forms(PLAIN))) {
      expect(ids({ recipientAddress: form })).not.toContain('burn_address');
    }
  });
});

describe('the token-contract rule fires for every form of the token address', () => {
  const token: Token = {
    address: TOKEN_ADDRESS,
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    addedAt: 1,
  };

  it('isListedTokenAddress matches lowercase, uppercase and checksummed forms', () => {
    for (const [name, form] of Object.entries(forms(TOKEN_ADDRESS))) {
      expect(isListedTokenAddress([token], form), name).toBe(true);
    }
  });

  it('works when the stored token address is in any form too', () => {
    for (const storedForm of Object.values(forms(TOKEN_ADDRESS))) {
      const stored: Token = { ...token, address: storedForm };
      for (const form of Object.values(forms(TOKEN_ADDRESS))) {
        expect(isListedTokenAddress([stored], form)).toBe(true);
      }
    }
  });

  it('end to end: sending to the token in any form raises the danger finding', async () => {
    for (const [name, form] of Object.entries(forms(TOKEN_ADDRESS))) {
      const facts = await gatherRecipientFacts({ getCode: async () => '0x6080' }, form, [token]);
      expect(facts.recipientIsListedToken, name).toBe(true);
      const found = ids({
        recipientAddress: form,
        recipientCode: facts.recipientCode,
        recipientIsListedToken: facts.recipientIsListedToken,
      });
      expect(found, name).toContain('sending_to_token_contract');
      expect(found, name).not.toContain('recipient_is_contract');
    }
  });

  it('does not fire for an address that is not in the list', () => {
    expect(isListedTokenAddress([token], PLAIN)).toBe(false);
    expect(ids({ recipientIsListedToken: false })).not.toContain('sending_to_token_contract');
  });
});
