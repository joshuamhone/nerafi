import { useCallback, useEffect, useRef, useState } from 'react';
import { BlockscoutProvider } from '../../../lib/wallet/history/blockscout';
import { mergeLocalRecords, pruneLocalTx } from '../../../lib/wallet/history/local';
import type { ActivityItem, HistoryPage } from '../../../lib/wallet/history/types';
import { useWallet } from '../context';

export type HistoryStatus = 'loading' | 'ready' | 'error';

export type HistoryFeed = {
  items: ActivityItem[];
  status: HistoryStatus;
  skipped: number;
  nextCursor: Record<string, string> | null;
  loadingMore: boolean;
  moreError: boolean;
  loadMore: () => void;
  retry: () => void;
};

export function useHistoryFeed(address: string): HistoryFeed {
  const { refresh } = useWallet();
  const providerRef = useRef<BlockscoutProvider | null>(null);
  const firstController = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);
  const newestIncoming = useRef<number | null>(null);
  const [items, setItems] = useState<ActivityItem[]>([]);
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
    (page: HistoryPage) => {
      let max: number | null = null;
      for (const item of page.items) {
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
      void provider()
        .fetchPage(address, null, signal)
        .then(async (page) => {
          await pruneLocalTx(page.items.map((item) => item.hash));
          const merged = await mergeLocalRecords(page, address);
          applyIncoming(merged);
          setItems(merged.items);
          setNextCursor(merged.nextCursor);
          setSkipped(merged.skipped);
          setStatus('ready');
        })
        .catch(() => {
          if (!signal.aborted) setStatus('error');
        });
    },
    [address, applyIncoming],
  );

  useEffect(() => {
    newestIncoming.current = null;
    setItems([]);
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
        applyIncoming(page);
        setItems((prev) => [...prev, ...page.items]);
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

  return {
    items,
    status,
    skipped,
    nextCursor,
    loadingMore,
    moreError,
    loadMore,
    retry,
  };
}