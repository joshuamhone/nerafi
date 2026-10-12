import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { mergeLocalRecords, saveLocalTx } from './local';
import type { HistoryPage } from './types';

const A0 = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const A1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const STRANGER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const HASH_0 = `0x${'a'.repeat(64)}`;
const HASH_1 = `0x${'b'.repeat(64)}`;
const HASH_2 = `0x${'c'.repeat(64)}`;

function emptyPage(): HistoryPage {
  return { items: [], nextCursor: null, skipped: 0 };
}

async function seed() {
  await saveLocalTx({ hash: HASH_0, from: A0, to: STRANGER, valueWei: '1', nonce: null, createdAt: 3_000 });
  await saveLocalTx({ hash: HASH_1, from: STRANGER, to: A1, valueWei: '1', nonce: null, createdAt: 2_000 });
  await saveLocalTx({ hash: HASH_2, from: A0, to: A1, valueWei: '1', nonce: null, createdAt: 1_000 });
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('mergeLocalRecords per account', () => {
  it('only includes records involving the first account', async () => {
    await seed();
    const merged = await mergeLocalRecords(emptyPage(), A0);
    expect(merged.items.map((item) => item.hash)).toEqual([HASH_0, HASH_2]);
  });

  it('only includes records involving the second account', async () => {
    await seed();
    const merged = await mergeLocalRecords(emptyPage(), A1);
    expect(merged.items.map((item) => item.hash)).toEqual([HASH_1, HASH_2]);
  });

  it('does not leak a record sent by account 0 to account 1 view', async () => {
    await saveLocalTx({
      hash: HASH_0,
      from: A0,
      to: STRANGER,
      valueWei: '1',
      nonce: null,
      createdAt: 3_000,
    });
    const merged = await mergeLocalRecords(emptyPage(), A1);
    expect(merged.items).toEqual([]);
  });
});
