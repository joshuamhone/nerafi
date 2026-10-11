import { describe, it, expect } from 'vitest';
import { normalizePhraseInput } from './input';

describe('normalizePhraseInput', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizePhraseInput('  Test   TEST\nTest  ')).toBe('test test test');
  });

  it('strips dotted number markers', () => {
    expect(normalizePhraseInput('1. about\n2. abandon\n3. ability')).toBe('about abandon ability');
  });

  it('strips paren and colon markers', () => {
    expect(normalizePhraseInput('1) about 2: abandon 3: ability')).toBe('about abandon ability');
  });

  it('strips hash markers and number-only tokens', () => {
    expect(normalizePhraseInput('#1 about 2 abandon #3 ability')).toBe('about abandon ability');
  });

  it('accepts a plain phrase unchanged', () => {
    expect(normalizePhraseInput('about abandon ability')).toBe('about abandon ability');
  });

  it('returns an empty string for blank input', () => {
    expect(normalizePhraseInput('   \n\t ')).toBe('');
  });
});
