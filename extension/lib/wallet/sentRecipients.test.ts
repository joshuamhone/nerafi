import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  loadSentRecipients,
  parseSentRecipient,
  parseSentRecipients,
  recordSentRecipient,
  SENT_RECIPIENTS_KEY,
  SENT_RECIPIENTS_LIMIT,
} from './sentRecipients';

const A0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const A1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('parseSentRecipient', () => {
  it('accepts a well-formed entry and checksums the address', () => {
    expect(parseSentRecipient({ address: A0.toLowerCase(), lastSentAt: 5 })).toEqual({
      address: A0,
      lastSentAt: 5,
    });
  });

  it('rejects unknown keys, wrong types and bad addresses', () => {
    expect(parseSentRecipient({ address: A0, lastSentAt: 5, extra: 1 })).toBeNull();
    expect(parseSentRecipient({ address: 'nope', lastSentAt: 5 })).toBeNull();
    expect(parseSentRecipient({ address: A0, lastSentAt: 'x' })).toBeNull();
    expect(parseSentRecipient({ address: A0 })).toBeNull();
  });
});

describe('parseSentRecipients', () => {
  it('returns an empty list for an empty array and for non-arrays', () => {
    expect(parseSentRecipients([])).toEqual([]);
    expect(parseSentRecipients(null)).toBeNull();
  });

  it('rejects the whole value on any invalid entry', () => {
    expect(parseSentRecipients([{ address: A0, lastSentAt: 5 }, { address: 'x' }])).toBeNull();
  });

  it('collapses duplicates to the newest timestamp', () => {
    const parsed = parseSentRecipients([
      { address: A0, lastSentAt: 5 },
      { address: A0.toLowerCase(), lastSentAt: 9 },
    ]);
    expect(parsed).toEqual([{ address: A0, lastSentAt: 9 }]);
  });

  it('caps the list to the limit newest-first', () => {
    const raw = Array.from({ length: SENT_RECIPIENTS_LIMIT + 3 }, (_, i) => ({
      address: `0x${(i + 1).toString(16).padStart(40, '0')}`,
      lastSentAt: i + 1,
    }));
    const parsed = parseSentRecipients(raw);
    expect(parsed).toHaveLength(SENT_RECIPIENTS_LIMIT);
    expect(parsed?.[0]?.lastSentAt).toBe(SENT_RECIPIENTS_LIMIT + 3);
  });
});

describe('loadSentRecipients', () => {
  it('reads an empty list when nothing is stored', async () => {
    expect(await loadSentRecipients()).toEqual([]);
  });

  it('reads an empty list for a malformed stored value', async () => {
    await fakeBrowser.storage.local.set({ [SENT_RECIPIENTS_KEY]: 'nope' });
    expect(await loadSentRecipients()).toEqual([]);
  });
});

describe('recordSentRecipient', () => {
  it('records a checksummed recipient newest-first', async () => {
    await recordSentRecipient(A0, 1_000);
    await recordSentRecipient(A1, 2_000);
    expect(await loadSentRecipients()).toEqual([
      { address: A1, lastSentAt: 2_000 },
      { address: A0, lastSentAt: 1_000 },
    ]);
  });

  it('moves an existing recipient to the top with a newer timestamp', async () => {
    await recordSentRecipient(A0, 1_000);
    await recordSentRecipient(A1, 2_000);
    await recordSentRecipient(A0, 3_000);
    expect(await loadSentRecipients()).toEqual([
      { address: A0, lastSentAt: 3_000 },
      { address: A1, lastSentAt: 2_000 },
    ]);
  });

  it('ignores an invalid address', async () => {
    await recordSentRecipient('nope', 1_000);
    expect(await loadSentRecipients()).toEqual([]);
  });
});
