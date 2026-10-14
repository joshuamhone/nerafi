import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mergeFeed, visibleInternalTransfers } from './combined';
import {
  FAILED_INTERNAL_LABEL,
  internalLabel,
  isReceivedInternal,
  NO_ETH_MOVED,
  signedInternalAmount,
} from './display';
import { parseInternalTransfer, parseInternalTransfersResponse } from './transfers';

type Raw = { items: Array<Record<string, unknown>>; next_page_params: unknown };

function load(file: string): Raw {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8'),
  ) as Raw;
}

// The real, successful internal transfer that carried ETH into this account.
const VALUE_ACCOUNT = '0x5cEF1DCe626bDf94D864eb5CAEBD8d9A5101CC61';
const realValue = load('internal-transactions-value-live.json').items[0] ?? {};

// No failed internal transfer turned up in the live pages searched, so every
// "failed" item below is a SYNTHETIC variation of the real item above.
function failedFrom(overrides: Record<string, unknown>) {
  return parseInternalTransfer({ ...realValue, ...overrides }, VALUE_ACCOUNT);
}

describe('failed internal transfers (synthetic variations of a real item)', () => {
  it('the real item is a successful movement of ETH, shown and counted as received', () => {
    const item = parseInternalTransfer(realValue, VALUE_ACCOUNT);
    expect(item?.failed).toBe(false);
    expect(item?.success).toBe(true);
    if (item === null) return;
    expect(isReceivedInternal(item)).toBe(true);
    expect(internalLabel(item)).toBe('Internal transfer in');
    expect(signedInternalAmount(item)).toBe('+12.164318985972243573');
    expect(visibleInternalTransfers([item])).toHaveLength(1);
  });

  it('success false with value > 0 is shown as failed, with no amount, and is not received', () => {
    const item = failedFrom({ success: false, error: 'execution reverted' });
    expect(item).not.toBeNull();
    if (item === null) return;
    expect(item.valueWei).toBeGreaterThan(0n);
    expect(item.failed).toBe(true);
    expect(isReceivedInternal(item)).toBe(false);
    expect(internalLabel(item)).toBe(FAILED_INTERNAL_LABEL);
    expect(FAILED_INTERNAL_LABEL).toBe('Failed internal transfer');
    expect(signedInternalAmount(item)).toBe(NO_ETH_MOVED);
    expect(signedInternalAmount(item)).not.toContain('12');
    expect(visibleInternalTransfers([item])).toHaveLength(1);
    expect(mergeFeed([], [item], [])).toHaveLength(1);
  });

  it('an error text with success true is also failed', () => {
    const item = failedFrom({ success: true, error: 'out of gas' });
    expect(item?.failed).toBe(true);
    expect(item?.errorMessage).toBe('out of gas');
    if (item === null) return;
    expect(isReceivedInternal(item)).toBe(false);
    expect(signedInternalAmount(item)).toBe(NO_ETH_MOVED);
  });

  it('success false with no error text is failed', () => {
    const item = failedFrom({ success: false, error: null });
    expect(item?.failed).toBe(true);
  });

  it('an empty error string with success true is not failed', () => {
    const item = failedFrom({ success: true, error: '' });
    expect(item?.failed).toBe(false);
  });

  it('success false with value 0 is hidden, like any zero-value call', () => {
    const item = failedFrom({ success: false, error: 'execution reverted', value: '0' });
    expect(item?.failed).toBe(true);
    if (item === null) return;
    expect(isReceivedInternal(item)).toBe(false);
    expect(visibleInternalTransfers([item])).toHaveLength(0);
    expect(mergeFeed([], [item], [])).toHaveLength(0);
  });

  it('a failed item is still parsed, not counted as unreadable', () => {
    const page = parseInternalTransfersResponse(
      { items: [{ ...realValue, success: false, error: 'x' }], next_page_params: null },
      VALUE_ACCOUNT,
    );
    expect(page.skipped).toBe(0);
    expect(page.items).toHaveLength(1);
  });

  it('an outgoing failed transfer is not shown as sent either', () => {
    const outgoing = parseInternalTransfer(
      { ...realValue, success: false, error: 'reverted' },
      String((realValue.from as { hash: string }).hash),
    );
    expect(outgoing?.direction).toBe('out');
    expect(outgoing?.failed).toBe(true);
    if (outgoing === null) return;
    expect(signedInternalAmount(outgoing)).toBe(NO_ETH_MOVED);
    expect(internalLabel(outgoing)).toBe(FAILED_INTERNAL_LABEL);
  });
});

describe('internal transfers whose "to" is null', () => {
  const raw = load('internal-transactions-tonull-live.json');
  const account = '0x1EcB63EDaF2ec875E3F4c5fa658746b64bf598fb';

  it('the live fixture holds a real item with to null', () => {
    expect(raw.items.some((item) => item.to === null)).toBe(true);
  });

  it('parses the real contract creation without dropping it', () => {
    const page = parseInternalTransfersResponse(raw, account);
    expect(page.skipped).toBe(0);
    expect(page.items).toHaveLength(raw.items.length);
    const created = page.items.find((item) => item.to === null);
    expect(created).toBeDefined();
    if (created === undefined) return;
    expect(created.callType).toBe('create');
    expect(created.createdContract).toBe(account);
    expect(created.failed).toBe(false);
    // The wallet is the new contract, so it is on the receiving side.
    expect(created.direction).toBe('in');
    expect(created.valueWei).toBe(0n);
  });

  it('a zero-value creation moved no ETH and is not listed or counted as received', () => {
    const page = parseInternalTransfersResponse(raw, account);
    const created = page.items.find((item) => item.to === null);
    if (created === undefined) return;
    expect(isReceivedInternal(created)).toBe(false);
    expect(visibleInternalTransfers([created])).toHaveLength(0);
  });

  it('a creation that carried value is handled without crashing (synthetic)', () => {
    const created = raw.items.find((item) => item.to === null);
    const item = parseInternalTransfer({ ...created, value: '5' }, account);
    expect(item?.to).toBeNull();
    expect(item?.valueWei).toBe(5n);
    if (item === null) return;
    expect(internalLabel(item)).toBe('Internal transfer in');
    expect(signedInternalAmount(item)).toBe('+0.000000000000000005');
  });

  it('a null "to" on an item the account sent still parses (synthetic)', () => {
    const first = load('internal-transactions-live.json').items[0] ?? {};
    const sender = String((first.from as { hash: string }).hash);
    const item = parseInternalTransfer({ ...first, to: null }, sender);
    expect(item).not.toBeNull();
    expect(item?.to).toBeNull();
    expect(item?.direction).toBe('out');
  });
});
