import { english, generateMnemonic, mnemonicToAccount } from 'viem/accounts';
import { validateMnemonic } from '@scure/bip39';
import type { Address } from 'viem';

// BIP-39: 128 bits of randomness = 12 words.
const STRENGTH_BITS = 128;

export function createMnemonic(): string {
  return generateMnemonic(english, STRENGTH_BITS);
}

export function isValidMnemonic(phrase: string): boolean {
  return validateMnemonic(phrase, english);
}

export function deriveAddress(phrase: string): Address {
  if (!isValidMnemonic(phrase)) {
    // Never include the phrase in an error message: errors get logged.
    throw new Error('Invalid recovery phrase');
  }
  // Default path m/44'/60'/0'/0/0: the first Ethereum account (BIP-44).
  return mnemonicToAccount(phrase).address;
}