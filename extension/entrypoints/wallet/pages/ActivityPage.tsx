import { useMemo, useState } from 'react';
import { Button } from '../../../components/Button';
import { Notice } from '../../../components/Notice';
import type { ActivityItem } from '../../../lib/wallet/history/types';
import { useWallet } from '../context';
import { useHistoryFeed } from './useHistoryFeed';
import { ActivityDetail } from './ActivityDetail';
import { ActivityRow } from './ActivityRow';
import { groupHeading, todayKey, yesterdayKey } from './activityUtils';
import './ActivityPage.css';

const HISTORY_FOOTNOTE =
  'History comes from Blockscout (eth-sepolia.blockscout.com), a public block explorer. It can lag behind the network by a few seconds and does not yet include ETH or tokens moved to you by smart contracts.';

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5];

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'sent', label: 'Sent' },
  { value: 'received', label: 'Received' },
] as const;

type FilterValue = 'all' | 'sent' | 'received';

type ActivityPageProps = {
  id: string | null;
  onBackToActivity: () => void;
};

export function ActivityPage({ id, onBackToActivity }: ActivityPageProps) {
  const { address } = useWallet();
  const feed = useHistoryFeed(address);
  const [filter, setFilter] = useState<FilterValue>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return feed.items.filter((item) => {
      if (filter === 'sent' && item.direction !== 'out') return false;
      if (filter === 'received' && item.direction !== 'in') return false;
      if (query !== '') {
        const haystack = `${item.hash} ${item.from} ${item.to ?? ''}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [feed.items, filter, search]);

  if (id !== null) {
    const item = feed.items.find((entry) => entry.hash.toLowerCase() === id.toLowerCase());
    if (item !== undefined) return <ActivityDetail item={item} onBack={onBackToActivity} />;
    if (feed.status === 'ready') {
      return (
        <section className="page">
          <Button variant="quiet" onClick={onBackToActivity}>
            Back to activity
          </Button>
          <p className="activity-empty">This transaction is not in the loaded history.</p>
        </section>
      );
    }
    return (
      <section className="page">
        <div className="activity-list">
          <ul className="activity-groups" aria-hidden="true">
            {SKELETON_ROWS.map((n) => (
              <li key={n} className="activity-skeleton" />
            ))}
          </ul>
        </div>
      </section>
    );
  }

  const hasItems = feed.items.length > 0;
  const showEmpty = feed.status === 'ready' && !hasItems;
  const showNoMatch = feed.status === 'ready' && hasItems && filtered.length === 0;

  const today = todayKey();
  const yesterday = yesterdayKey();

  const buckets = new Map<string, ActivityItem[]>();
  for (const item of filtered) {
    const heading =
      item.timestamp === null ? 'Time unknown' : groupHeading(item.timestamp, today, yesterday);
    const bucket = buckets.get(heading);
    if (bucket === undefined) buckets.set(heading, [item]);
    else bucket.push(item);
  }
  const groups = Array.from(buckets.entries()).map(([heading, bucketItems]) => ({
    heading,
    items: bucketItems,
  }));

  return (
    <section className="page">
      <header className="page-header">
        <h1 className="page-title">Activity</h1>
      </header>

      <div className="activity-controls">
        <div className="activity-filter" role="group" aria-label="Filter transactions">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={
                filter === value
                  ? 'activity-filter-btn activity-filter-btn--active'
                  : 'activity-filter-btn'
              }
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="text"
          className="activity-search"
          placeholder="Search by hash or address"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          aria-label="Search transactions"
        />
      </div>

      <div className="activity-list">
        {feed.status === 'loading' && !hasItems && (
          <ul className="activity-groups" aria-hidden="true">
            {SKELETON_ROWS.map((n) => (
              <li key={n} className="activity-skeleton" />
            ))}
          </ul>
        )}

        {feed.status === 'error' && (
          <Notice variant="alert">
            Couldn't load history from Blockscout.{' '}
            <button type="button" className="activity-retry" onClick={feed.retry}>
              Retry
            </button>
          </Notice>
        )}

        {showEmpty && <p className="activity-empty">No transactions yet.</p>}

        {showNoMatch && (
          <p className="activity-empty">
            No loaded transactions match. Older activity may not be loaded yet.
          </p>
        )}

        {feed.status === 'ready' && filtered.length > 0 && (
          <ul className="activity-groups">
            {groups.map((group) => (
              <li key={group.heading} className="activity-group">
                <h2 className="activity-group-heading">{group.heading}</h2>
                <ul className="activity-group-list">
                  {group.items.map((item) => (
                    <ActivityRow key={item.hash} item={item} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        {feed.skipped > 0 && (
          <p className="activity-skipped">
            {feed.skipped} entries couldn't be read and are not shown.
          </p>
        )}

        {feed.status === 'ready' && feed.nextCursor !== null && (
          <div className="activity-loadmore">
            <Button variant="secondary" onClick={feed.loadMore} disabled={feed.loadingMore}>
              {feed.loadingMore ? 'Loading…' : 'Load more'}
            </Button>
            {feed.moreError && (
              <span className="activity-more-error" role="status">
                Couldn't load more from Blockscout. Try again.
              </span>
            )}
          </div>
        )}
      </div>

      <p className="activity-footnote">{HISTORY_FOOTNOTE}</p>
    </section>
  );
}