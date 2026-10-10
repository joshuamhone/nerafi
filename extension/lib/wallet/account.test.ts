import { describe, it, expect } from 'vitest';
import { createMnemonic, isValidMnemonic, deriveAddress } from './account';

// Public test phrase used by Anvil/Hardhat. Synthetic, safe to commit.
// Its first account is a published, well-known address.
const TEST_PHRASE =
  'test test test test test test test test test test test junk';
const TEST_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

// Every word is valid, but the checksum is wrong.
const BAD_CHECKSUM =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';

describe('createMnemonic', () => {
  it('returns 12 words', () => {
    expect(createMnemonic().split(' ')).toHaveLength(12);
  });

  it('returns a valid phrase', () => {
    expect(isValidMnemonic(createMnemonic())).toBe(true);
  });

  it('never returns the same phrase twice', () => {
    expect(createMnemonic()).not.toBe(createMnemonic());
  });
});

describe('isValidMnemonic', () => {
  it('accepts the standard test phrase', () => {
    expect(isValidMnemonic(TEST_PHRASE)).toBe(true);
  });

  it('rejects a wrong checksum', () => {
    expect(isValidMnemonic(BAD_CHECKSUM)).toBe(false);
  });

  it('rejects a word not in the wordlist', () => {
    expect(
      isValidMnemonic('test test test test test test test test test test test nerafi'),
    ).toBe(false);
  });

  it('rejects the wrong number of words', () => {
    expect(isValidMnemonic('test test test')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidMnemonic('')).toBe(false);
  });
});

describe('deriveAddress', () => {
  it('matches the standard test vector', () => {
    expect(deriveAddress(TEST_PHRASE)).toBe(TEST_ADDRESS);
  });

  it('gives the same address for the same phrase', () => {
    expect(deriveAddress(TEST_PHRASE)).toBe(deriveAddress(TEST_PHRASE));
  });

  it('refuses to derive from an invalid phrase', () => {
    expect(() => deriveAddress(BAD_CHECKSUM)).toThrow();
  });
});