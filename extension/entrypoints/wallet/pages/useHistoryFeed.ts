import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlockscoutProvider } from '../../../lib/wallet/history/blockscout';
import {
  extrasMayBeIncomplete,
  loadFirstPages,
  mergeFeed,
} from '../../../lib/wallet/history/combined';
import type { FeedPart } from '../../../lib/wallet/history/combined';
import { mergeLocalRecords, pruneLocalTx } from '../../../lib/wallet/history/local';
import { isInternalItem } from '../../../lib/wallet/history/types';
import { fetchInternalTransfers, fetchTokenTransfers } from '../../../lib/wallet/history/transfers';
import type {
  ActivityItem,
  FeedItem,
  HistoryPage,
  InternalTransferItem,
  TokenTransferItem,
} from '../../../lib/wallet/history/types';
import { useWallet } from '../context';

export type HistoryStatus = 'loading' | 'ready' | 'error';

export type HistoryFeed = {
  items: FeedItem[];
  status: HistoryStatus;
  skipped: number;
  nextCursor: Record<string, string> | null;
  loadingMore: boolean;
  moreError: boolean;
  // Parts of the first page that could not be loaded. Never empty while the
  // feed is showing partial history.
  failedParts: FeedPart[];
  extrasIncomplete: boolean;
  loadMore: () => void;
  retry: () => void;
};

export function useHistoryFeed(address: string): HistoryFeed {
  const { refresh } = useWallet();
  const providerRef = useRef<BlockscoutProvider | null>(null);
  const firstController = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);
  const newestIncoming = useRef<number | null>(null);
  const [txItems, setTxItems] = useState<ActivityItem[]>([]);
  const [internalItems, setInternalItems] = useState<InternalTransferItem[]>([]);
  const [tokenItems, setTokenItems] = useState<TokenTransferItem[]>([]);
  const [failedParts, setFailedParts] = useState<FeedPart[]>([]);
  const [extrasIncomplete, setExtrasIncomplete] = useState(false);
  const [status, setStatus] = useState<HistoryStatus>('loading');
  const [skipped, setSkipped] = useState(0);
  const [nextCursor, setNextCursor] = useState<Record<string, string> | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);

  function provider(): BlockscoutProvider {
    if (providerRef.current === null) providerRef.current = new BlockscoutProvider();
    return providerRef.current;
  }

  const applyIncoming = useCallback(
    (page: HistoryPage, internal: InternalTransferItem[]) => {
      let max: number | null = null;
      for (const item of [...page.items, ...internal]) {
        // A failed internal transfer moved no ETH, so it never counts as incoming.
        if (isInternalItem(item) && item.failed) continue;
        if (item.direction === 'in' && item.timestamp !== null) {
          max = max === null ? item.timestamp : Math.max(max, item.timestamp);
        }
      }
      if (max !== null) {
        const previous = newestIncoming.current;
        if (previous === null || max > previous) refresh();
        if (previous === null || max > previous) newestIncoming.current = max;
      }
    },
    [refresh],
  );

  const loadFirst = useCallback(
    (signal: AbortSignal) => {
      setStatus('loading');
      setMoreError(false);
      void (async () => {
        // The three lists fail independently: one failing never hides the others.
        const result = await loadFirstPages({
          transactions: () => provider().fetchPage(address, null, signal),
          internal: () => fetchInternalTransfers(address, signal),
          tokens: () => fetchTokenTransfers(address, signal),
        });
        if (signal.aborted) return;
        if (result.failed.length === 3) {
          setStatus('error');
          return;
        }

        let merged: HistoryPage = { items: [], nextCursor: null, skipped: 0 };
        if (result.transactions !== null) {
          try {
            await pruneLocalTx(result.transactions.items.map((item) => item.hash));
            merged = await mergeLocalRecords(result.transactions, address);
          } catch {
            merged = result.transactions;
          }
        }
        if (signal.aborted) return;

        const internal = result.internal?.items ?? [];
        const tokens = result.tokens?.items ?? [];
        applyIncoming(merged, internal);
        setTxItems(merged.items);
        setInternalItems(internal);
        setTokenItems(tokens);
        setNextCursor(merged.nextCursor);
        setSkipped(
          merged.skipped + (result.internal?.skipped ?? 0) + (result.tokens?.skipped ?? 0),
        );
        setFailedParts(result.failed);
        setExtrasIncomplete(extrasMayBeIncomplete(result.internal, result.tokens));
        setStatus('ready');
      })();
    },
    [address, applyIncoming],
  );

  useEffect(() => {
    newestIncoming.current = null;
    setTxItems([]);
    setInternalItems([]);
    setTokenItems([]);
    setFailedParts([]);
    setExtrasIncomplete(false);
    setSkipped(0);
    setNextCursor(null);
    firstController.current?.abort();
    const controller = new AbortController();
    firstController.current = controller;
    loadFirst(controller.signal);
    return () => controller.abort();
  }, [address, loadFirst]);

  const retry = useCallback(() => {
    firstController.current?.abort();
    const controller = new AbortController();
    firstController.current = controller;
    loadFirst(controller.signal);
  }, [loadFirst]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current) return;
    if (nextCursor === null) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setMoreError(false);
    const controller = new AbortController();
    void provider()
      .fetchPage(address, nextCursor, controller.signal)
      .then(async (page) => {
        await pruneLocalTx(page.items.map((item) => item.hash));
        applyIncoming(page, []);
        setTxItems((prev) => [...prev, ...page.items]);
        setNextCursor(page.nextCursor);
        setSkipped((prev) => prev + page.skipped);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMoreError(true);
      })
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [address, nextCursor, applyIncoming]);

  const items = useMemo(
    () => mergeFeed(txItems, internalItems, tokenItems),
    [txItems, internalItems, tokenItems],
  );

  return {
    items,
    status,
    skipped,
    nextCursor,
    loadingMore,
    moreError,
    failedParts,
    extrasIncomplete,
    loadMore,
    retry,
  };
}
