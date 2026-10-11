import { useEffect, useState } from 'react';
import { AddressText } from '../../../components/AddressText';
import { Button } from '../../../components/Button';
import { Notice } from '../../../components/Notice';
import { RefreshIcon } from '../../../components/icons';
import { formatBalance, formatExact } from '../../../lib/wallet/format';
import { SEPOLIA_CHAIN_ID } from '../../../lib/wallet/network';
import { useWallet } from '../context';
import { routeHref } from '../router';
import { ActivityRow } from './ActivityRow';
import { useHistoryFeed } from './useHistoryFeed';
import './Overview.css';

type OverviewProps = {
  addressCorrected: boolean;
  onSend: () => void;
  onReceive: () => void;
};

function relativeTime(ts: number | null): string {
  if (ts === null) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function Overview({ addressCorrected, onSend, onReceive }: OverviewProps) {
  const {
    address,
    balanceWei,
    balanceLoading,
    balanceError,
    lastUpdated,
    network,
    blockNumber,
    rpcHost,
    refresh,
  } = useWallet();

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const feed = useHistoryFeed(address);
  const recent = feed.items.slice(0, 5);

  const showBalanceSkeleton = balanceLoading && balanceWei === null;
  const showBlockSkeleton = network === 'checking' && blockNumber === null;

  return (
    <section className="page">
      <header className="page-header">
        <h1 className="page-title">Overview</h1>
      </header>

      {addressCorrected && (
        <Notice variant="alert">
          The saved address did not match your recovery phrase and has been corrected. If you did
          not expect this, your browser profile may have been tampered with.
        </Notice>
      )}

      <div className="overview-grid">
        <div className="overview-left">
          <div className="balance-block">
            <div className="balance-row">
              {showBalanceSkeleton ? (
                <span className="skeleton skeleton--balance" aria-hidden="true" />
              ) : (
                <span
                  className="balance-amount tabular"
                  title={balanceWei !== null ? formatExact(balanceWei) : undefined}
                >
                  {balanceWei !== null ? formatBalance(balanceWei) : '—'}
                </span>
              )}
              <span className="balance-unit">test ETH</span>
              <button
                type="button"
                className="icon-button"
                onClick={refresh}
                disabled={balanceLoading}
                aria-label="Refresh balance"
              >
                <RefreshIcon />
              </button>
            </div>
            <span className="balance-caption">
              {lastUpdated !== null ? `Updated ${relativeTime(lastUpdated)}` : 'Loading…'}
            </span>
            {!balanceLoading && balanceError && <Notice variant="alert">{balanceError}</Notice>}
          </div>

          <div className="overview-actions">
            <Button variant="primary" onClick={onSend}>
              Send
            </Button>
            <Button variant="secondary" onClick={onReceive}>
              Receive
            </Button>
          </div>

          <section className="panel address-block">
            <span className="address-label">Your address</span>
            <AddressText value={address} />
          </section>

          <section className="panel recent-panel">
            <div className="recent-header">
              <h2 className="panel-title">Recent activity</h2>
              <a className="recent-link" href={routeHref('activity')}>
                View all activity
              </a>
            </div>

            {feed.status === 'loading' && recent.length === 0 && (
              <div className="recent-skeletons" aria-hidden="true">
                <span className="recent-skeleton" />
                <span className="recent-skeleton" />
                <span className="recent-skeleton" />
              </div>
            )}

            {feed.status === 'error' && (
              <Notice variant="alert">
                Couldn't load history from Blockscout.{' '}
                <button type="button" className="inline-retry" onClick={feed.retry}>
                  Retry
                </button>
              </Notice>
            )}

            {feed.status === 'ready' && feed.items.length === 0 && (
              <p className="recent-empty">No transactions yet.</p>
            )}

            {recent.length > 0 && (
              <ul className="recent-list">
                {recent.map((item) => (
                  <ActivityRow key={item.hash} item={item} compact />
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="overview-right">
          <section className="panel network-panel">
            <h2 className="panel-title">Network</h2>
            <dl className="network-list">
              <div className="network-row">
                <dt>Network</dt>
                <dd>Sepolia testnet</dd>
              </div>
              <div className="network-row">
                <dt>Chain ID</dt>
                <dd className="tabular">{SEPOLIA_CHAIN_ID}</dd>
              </div>
              <div className="network-row">
                <dt>Latest block</dt>
                <dd className="tabular">
                  {showBlockSkeleton ? (
                    <span className="skeleton skeleton--block" aria-hidden="true" />
                  ) : (
                    blockNumber?.toString() ?? '—'
                  )}
                </dd>
              </div>
              <div className="network-row network-row--stacked">
                <dt>RPC</dt>
                <dd>{rpcHost}</dd>
              </div>
            </dl>
            {network === 'unreachable' && (
              <Notice variant="alert">
                Could not reach the Sepolia network.{' '}
                <button type="button" className="inline-retry" onClick={refresh}>
                  Retry
                </button>
              </Notice>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}