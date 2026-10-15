import { formatExact } from '../../../lib/wallet/format';
import { isInternalItem, isTokenItem } from '../../../lib/wallet/history/types';
import type { ActivityItem, FeedItem } from '../../../lib/wallet/history/types';
import type { ActivityRef } from '../router';

export type ActivityLabel =
  | 'Contract creation'
  | 'Sent'
  | 'Received'
  | 'To yourself'
  | 'Contract call';

export function activityLabel(item: ActivityItem): ActivityLabel {
  if (item.to === null) return 'Contract creation';
  if (item.isContractCall) return 'Contract call';
  if (item.direction === 'out') return 'Sent';
  if (item.direction === 'in') return 'Received';
  return 'To yourself';
}

export function activityStatusText(item: ActivityItem): 'Confirmed' | 'Failed' | 'Pending' {
  if (item.status === 'confirmed') return 'Confirmed';
  if (item.status === 'failed') return 'Failed';
  return 'Pending';
}

export function signedAmount(item: ActivityItem): string {
  const sign = item.direction === 'out' ? '\u2212' : item.direction === 'in' ? '+' : '';
  return `${sign}${formatExact(item.valueWei)}`;
}

export function dayKey(ts: number): string {
  const date = new Date(ts);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayKey(): string {
  return dayKey(Date.now());
}

export function yesterdayKey(): string {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return dayKey(date.getTime());
}

export function groupHeading(
  ts: number,
  today: string,
  yesterday: string,
): string {
  const key = dayKey(ts);
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  return new Date(ts).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function formatDay(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatIso(ts: number): string {
  return new Date(ts).toISOString();
}

// The row a detail link points at, or undefined when the loaded feed has no such
// row. A native-ETH log from the system address is never a row, so its link
// finds nothing and the page shows its existing "not in the loaded history"
// message instead of a detail view.
export function findFeedItem(items: FeedItem[], ref: ActivityRef): FeedItem | undefined {
  const wanted = ref.hash.toLowerCase();
  return items.find((entry) => {
    if (entry.hash.toLowerCase() !== wanted) return false;
    if (ref.kind === 'token') return isTokenItem(entry) && entry.logIndex === ref.index;
    if (ref.kind === 'internal') return isInternalItem(entry) && entry.index === ref.index;
    return !isTokenItem(entry) && !isInternalItem(entry);
  });
}
