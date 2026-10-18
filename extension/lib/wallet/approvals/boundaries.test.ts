import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dir = new URL('./', import.meta.url);

const sources = readdirSync(dir)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .map((name) => ({ name, text: readFileSync(new URL(name, dir), 'utf8') }));

function importLines(text: string): string[] {
  return text.split('\n').filter((line) => /^\s*(import|export)\b.*\bfrom\b/.test(line));
}

function valueImportLines(text: string): string[] {
  return importLines(text).filter((line) => !/^\s*import type\b/.test(line));
}

describe('the approvals modules are read-only', () => {
  it('finds the source files', () => {
    expect(sources.map((s) => s.name).sort()).toEqual([
      'candidates.ts',
      'cooldown.ts',
      'fetch.ts',
      'findings.ts',
      'format.ts',
      'limit.ts',
      'load.ts',
      'parse.ts',
      'ratelimit.ts',
      'securityCenter.ts',
      'sort.ts',
      'store.ts',
      'text.ts',
      'types.ts',
      'verify.ts',
    ]);
  });

  it('never import signing, vault, unlock, send or confirm code', () => {
    const forbidden = ["/send'", "/vault'", "/unlock'", "/confirm'", "/account'", "/storage'", "/changePassword'"];
    for (const { name, text } of sources) {
      for (const line of importLines(text)) {
        for (const module of forbidden) {
          expect(`${name}: ${line}`).not.toContain(module);
        }
        expect(`${name}: ${line}`).not.toContain('viem/accounts');
      }
    }
  });

  it('never write the known set, the address book, the sent-recipient list or the token list', () => {
    // A value import of any of these could write; type-only imports are erased.
    const forbidden = [
      "/contacts'",
      "/sentRecipients'",
      "/accounts'",
      "/securityLog'",
      "/tokens'",
      "/recipientSafety'",
    ];
    for (const { name, text } of sources) {
      for (const line of valueImportLines(text)) {
        for (const module of forbidden) {
          expect(`${name}: ${line}`).not.toContain(module);
        }
      }
      expect(text).not.toContain('nerafi.contacts');
      expect(text).not.toContain('nerafi.sentRecipients');
      expect(text).not.toContain('nerafi.tokens');
    }
  });

  it('never read or write extension storage', () => {
    for (const { name, text } of sources) {
      expect(`${name}: ${text}`).not.toMatch(/storage\.(local|session|sync)/);
      expect(`${name}: ${text}`).not.toContain('wxt/browser');
    }
  });

  it('contain no write call, signing call or transaction building', () => {
    const banned = [
      'signTransaction',
      'sendRawTransaction',
      'sendTransaction',
      'writeContract',
      'simulateContract',
      'encodeFunctionData',
      'signMessage',
      'signTypedData',
      'mnemonic',
      'privateKey',
      "functionName: 'approve'",
      "functionName: 'increaseAllowance'",
      "functionName: 'decreaseAllowance'",
    ];
    for (const { name, text } of sources) {
      for (const word of banned) {
        expect(`${name}: ${text.includes(word) ? word : ''}`).toBe(`${name}: `);
      }
    }
  });

  it('only allowance, symbol, name and decimals are ever read from a token', () => {
    const verify = sources.find((s) => s.name === 'verify.ts')?.text ?? '';
    const names = Array.from(verify.matchAll(/functionName: '([A-Za-z]+)'/g)).map((m) => m[1]);
    expect(names.sort()).toEqual(['allowance', 'decimals', 'name', 'symbol']);
  });

  it('only fetch.ts and verify.ts reach the network', () => {
    for (const { name, text } of sources) {
      const reachesNetwork =
        /\bfetch\(/.test(text) || text.includes('createSepoliaClient') || /\.getCode\(/.test(text) || text.includes('readContract');
      if (name === 'fetch.ts' || name === 'verify.ts') {
        expect(reachesNetwork, name).toBe(true);
      } else {
        expect(reachesNetwork, name).toBe(false);
      }
    }
  });

  it('use no host other than the existing Blockscout host', () => {
    for (const { name, text } of sources) {
      const urls = Array.from(text.matchAll(/https?:\/\/[A-Za-z0-9._\-${}]+/g)).map((m) => m[0]);
      for (const url of urls) {
        expect(`${name}: ${url}`).toMatch(/BLOCKSCOUT_HOST|blockscout/);
      }
    }
  });

  it('use no console and no localStorage', () => {
    for (const { name, text } of sources) {
      expect(`${name}: ${/console\./.test(text)}`).toBe(`${name}: false`);
      expect(`${name}: ${/localStorage/.test(text)}`).toBe(`${name}: false`);
    }
  });
});
