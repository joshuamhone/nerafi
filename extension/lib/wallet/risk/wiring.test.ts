import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// These read the source of the screens, because the project has no component
// test library. They check that the safety wiring is present and in order; they
// are not a substitute for using the wallet.

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
}

const app = source('../../../entrypoints/wallet/App.tsx');
const review = source('../../../entrypoints/wallet/screens/Review.tsx');
const feed = source('../../../entrypoints/wallet/pages/useHistoryFeed.ts');
const securityPage = source('../../../entrypoints/wallet/pages/SecurityCenterPage.tsx');

function functionBody(text: string, name: string): string {
  const start = text.indexOf(`function ${name}(`);
  expect(start, `${name} exists`).toBeGreaterThanOrEqual(0);
  const next = text.indexOf('\n  async function ', start + 10);
  const nextSync = text.indexOf('\n  function ', start + 10);
  const candidates = [next, nextSync].filter((index) => index > start);
  const end = candidates.length > 0 ? Math.min(...candidates) : text.length;
  return text.slice(start, end);
}

describe('the contract-check result is tied to its recipient', () => {
  it('the app stores the result with its address and selects it by the current recipient', () => {
    expect(app).toContain('setCodeResult({ address: lookedUp, code })');
    expect(app).toContain('selectCodeResult(codeResult, review.to)');
  });

  it('the app no longer keeps an address-less lookup result', () => {
    expect(app).not.toContain('setRecipientFacts');
  });

  it('the report is only built once the result for this recipient is ready', () => {
    expect(app).toMatch(/codeSelection === 'pending'\) return null/);
  });
});

describe('confirmSend refuses to proceed while the check is pending', () => {
  const body = functionBody(app, 'confirmSend');

  it('returns on a pending selection before the vault is opened', () => {
    const pending = body.indexOf("codeSelection === 'pending'");
    const gate = body.indexOf('canSignReport(risk, lookalikeAck)');
    const openVault = body.indexOf('openVault(');
    expect(pending).toBeGreaterThanOrEqual(0);
    expect(gate).toBeGreaterThanOrEqual(0);
    expect(openVault).toBeGreaterThanOrEqual(0);
    expect(pending).toBeLessThan(openVault);
    expect(gate).toBeLessThan(openVault);
  });

  it('keeps the earlier lookalike gate as well', () => {
    expect(body.indexOf('canSign(reviewRecipientInfo, lookalikeAck)')).toBeGreaterThanOrEqual(0);
  });
});

describe('the Sign button treats a pending check as not ready', () => {
  it('is disabled while the report is null', () => {
    expect(review).toMatch(/risk === null \|\|/);
    expect(review).toContain('!canSignReport(risk, acknowledged)');
    expect(review).toContain('!canSign(recipientInfo, acknowledged)');
  });
});

describe('loaded history never outlives its account', () => {
  it('is cleared on lock and on account switch', () => {
    expect(functionBody(app, 'handleLock')).toContain('clearLoadedHistory()');
    expect(functionBody(app, 'handleSwitchAccount')).toContain('clearLoadedHistory()');
  });

  it('is also cleared when the session expires by itself', () => {
    expect(app).toMatch(/unlockedAddress === null\) \{\s*clearLoadedHistory\(\)/);
  });

  it('the feed stores it under the address the items were loaded for, not the current one', () => {
    expect(feed).toContain('setLoadedFor(address)');
    expect(feed).toContain('setLoadedHistory({ address: loadedFor, items, failedParts })');
    expect(feed).not.toContain('setLoadedHistory({ address, items');
  });

  it('the Security Center reads it for the active account only', () => {
    expect(securityPage).toContain('getLoadedHistory(address)');
  });
});
