import { english, generateMnemonic, mnemonicToAccount } from 'viem/accounts';
import { validateMnemonic } from '@scure/bip39';
import type { Address } from 'viem';

// BIP-39: 128 bits of randomness = 12 words.
const STRENGTH_BITS = 128;

// F3a keeps a small, fixed number of accounts. Indices 0..9 map to the BIP-44
// addresses m/44'/60'/0'/0/0 through m/44'/60'/0'/0/9.
export const MAX_ACCOUNTS = 10;

export function createMnemonic(): string {
  return generateMnemonic(english, STRENGTH_BITS);
}

export function isValidMnemonic(phrase: string): boolean {
  return validateMnemonic(phrase, english);
}

export function deriveAccountAddress(phrase: string, index: number): Address {
  if (!isValidMnemonic(phrase)) {
    // Never include the phrase in an error message: errors get logged.
    throw new Error('Invalid recovery phrase');
  }
  if (!Number.isInteger(index) || index < 0 || index >= MAX_ACCOUNTS) {
    throw new Error('Invalid account index');
  }
  // BIP-44 path m/44'/60'/0'/0/{index}. index 0 is the first Ethereum account.
  return mnemonicToAccount(phrase, { addressIndex: index }).address;
}

export function deriveAddress(phrase: string): Address {
  return deriveAccountAddress(phrase, 0);
}