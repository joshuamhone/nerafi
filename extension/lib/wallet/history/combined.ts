import { isNativeEthLogAddress } from '../nativeEthLog';
import type {
  ExtraPage,
  FeedItem,
  HistoryPage,
  InternalTransferItem,
  TokenTransferItem,
} from './types';

// The three explorer lists are fetched and can fail independently.
export type FeedPart = 'transactions' | 'internal' | 'tokens';

export const PART_FAILURE_NOTES: Record<FeedPart, string> = {
  transactions: "Transactions couldn't be loaded.",
  internal: "Internal transfers couldn't be loaded.",
  tokens: "Token transfers couldn't be loaded.",
};

export const EXTRAS_INCOMPLETE_NOTE =
  'Internal and token transfers show only the first page from Blockscout, so this list may be incomplete.';

export const EXTRAS_SOURCE_NOTE =
  'From Blockscout · first page only, so the list may be incomplete';

export type FirstPageSources = {
  transactions: () => Promise<HistoryPage>;
  internal: () => Promise<ExtraPage<InternalTransferItem>>;
  tokens: () => Promise<ExtraPage<TokenTransferItem>>;
};

export type FirstPages = {
  transactions: HistoryPage | null;
  internal: ExtraPage<InternalTransferItem> | null;
  tokens: ExtraPage<TokenTransferItem> | null;
  failed: FeedPart[];
};

// Run the three loads side by side. One failing never hides the others, and the
// failed parts are named so the caller can say so instead of presenting partial
// history as complete.
export async function loadFirstPages(sources: FirstPageSources): Promise<FirstPages> {
  const [transactions, internal, tokens] = await Promise.allSettled([
    sources.transactions(),
    sources.internal(),
    sources.tokens(),
  ]);
  const failed: FeedPart[] = [];
  if (transactions.status === 'rejected') failed.push('transactions');
  if (internal.status === 'rejected') failed.push('internal');
  if (tokens.status === 'rejected') failed.push('tokens');
  return {
    transactions: transactions.status === 'fulfilled' ? transactions.value : null,
    internal: internal.status === 'fulfilled' ? internal.value : null,
    tokens: tokens.status === 'fulfilled' ? tokens.value : null,
    failed,
  };
}

// An internal "transfer" with value 0 is just a contract call with nothing
// moved, so it is not shown. It is still parsed and counted by the parser. A
// failed one that carried value stays in the list, labelled as failed with no
// amount; a failed one with value 0 is hidden like any other zero-value call.
export function visibleInternalTransfers(items: InternalTransferItem[]): InternalTransferItem[] {
  return items.filter((item) => item.valueWei > 0n);
}

// Everything, newest first. Items with no timestamp go last, in their original
// order (the sort is stable).
export function mergeFeed(
  transactions: FeedItem[],
  internal: InternalTransferItem[],
  tokens: TokenTransferItem[],
): FeedItem[] {
  // Native-ETH transfer logs (from the system address) are parsed like any other
  // item but are not tokens, so they are not rows. Matched by address only.
  const realTokens = tokens.filter((item) => !isNativeEthLogAddress(item.tokenAddress));
  const all: FeedItem[] = [...transactions, ...visibleInternalTransfers(internal), ...realTokens];
  return all
    .map((item, order) => ({ item, order }))
    .sort((a, b) => {
      const at = a.item.timestamp;
      const bt = b.item.timestamp;
      if (at === null && bt === null) return a.order - b.order;
      if (at === null) return 1;
      if (bt === null) return -1;
      return bt - at || a.order - b.order;
    })
    .map((entry) => entry.item);
}

export function failureNotes(failed: FeedPart[]): string[] {
  return failed.map((part) => PART_FAILURE_NOTES[part]);
}

export function extrasMayBeIncomplete(
  internal: ExtraPage<InternalTransferItem> | null,
  tokens: ExtraPage<TokenTransferItem> | null,
): boolean {
  return (internal?.hasMore ?? false) || (tokens?.hasMore ?? false);
}
