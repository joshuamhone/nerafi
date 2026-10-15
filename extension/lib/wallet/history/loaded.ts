import type { FeedPart } from './combined';
import type { FeedItem } from './types';

// The most recent history the Activity feed finished loading, kept in memory
// only (never written to storage) so other pages can read what is already
// loaded without making a request of their own. It is cleared on lock.
export type LoadedHistory = {
  address: string;
  items: FeedItem[];
  failedParts: FeedPart[];
};

let snapshot: LoadedHistory | null = null;

export function setLoadedHistory(next: LoadedHistory): void {
  snapshot = next;
}

// Only returns history that was loaded for this very address.
export function getLoadedHistory(address: string): LoadedHistory | null {
  if (snapshot === null) return null;
  return snapshot.address.toLowerCase() === address.toLowerCase() ? snapshot : null;
}

export function clearLoadedHistory(): void {
  snapshot = null;
}
