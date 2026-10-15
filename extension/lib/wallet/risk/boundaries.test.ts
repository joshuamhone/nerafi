import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dir = new URL('./', import.meta.url);

const sources = readdirSync(dir)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .map((name) => ({ name, text: readFileSync(new URL(name, dir), 'utf8') }));

function importLines(text: string): string[] {
  return text.split('\n').filter((line) => /^\s*(import|export)\b.*\bfrom\b/.test(line));
}

describe('the risk modules stay read-only and advisory', () => {
  it('finds the risk source files', () => {
    const names = sources.map((s) => s.name).sort();
    expect(names).toEqual(['assess.ts', 'gate.ts', 'gather.ts', 'posture.ts', 'threats.ts', 'types.ts']);
  });

  it('never import a module that writes the known set, the address book, the sent-recipient list or the token list', () => {
    const forbidden = ['contacts', 'sentRecipients', 'accounts', 'securityLog'];
    for (const { name, text } of sources) {
      for (const line of importLines(text)) {
        for (const module of forbidden) {
          // `import type` of a type is erased and writes nothing.
          if (/^\s*import type\b/.test(line)) continue;
          expect(`${name}: ${line}`).not.toContain(`/${module}'`);
        }
      }
    }
  });

  it('never import or call Blockscout, the history fetchers or the local sent records', () => {
    const forbidden = ['blockscout', 'transfers', 'combined', 'local', 'useHistoryFeed'];
    for (const { name, text } of sources) {
      for (const line of importLines(text)) {
        for (const module of forbidden) {
          expect(`${name}: ${line}`).not.toContain(`/${module}'`);
        }
      }
      expect(text).not.toContain('fetch(');
      expect(text).not.toContain('blockscout');
    }
  });

  it('never read or write extension storage', () => {
    for (const { name, text } of sources) {
      expect(`${name}: ${text}`).not.toMatch(/storage\.(local|session|sync)/);
      expect(`${name}: ${text}`).not.toContain('wxt/browser');
    }
  });

  it('never import the signing code, so a finding cannot change what is signed', () => {
    for (const { name, text } of sources) {
      for (const line of importLines(text)) {
        expect(`${name}: ${line}`).not.toContain("/send'");
        expect(`${name}: ${line}`).not.toContain("/vault'");
        expect(`${name}: ${line}`).not.toContain("/unlock'");
        expect(`${name}: ${line}`).not.toContain('viem/accounts');
      }
    }
  });

  it('only gather.ts reaches the network, through a client it is handed', () => {
    for (const { name, text } of sources) {
      if (name === 'gather.ts') {
        expect(text).toContain('getCode');
      } else {
        expect(text).not.toContain('getCode');
        expect(text).not.toContain('createSepoliaClient');
      }
    }
  });
});
