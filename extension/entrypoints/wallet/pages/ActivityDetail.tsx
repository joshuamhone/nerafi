import { AddressText } from '../../../components/AddressText';
import { Button } from '../../../components/Button';
import { formatExact } from '../../../lib/wallet/format';
import { LOCAL_PENDING_SUBLABEL } from '../../../lib/wallet/history/local';
import { EXPLORER_TX_URL } from '../../../lib/wallet/network';
import type { ActivityItem } from '../../../lib/wallet/history/types';
import {
  activityLabel,
  activityStatusText,
  formatDateTime,
  formatIso,
  signedAmount,
} from './activityUtils';
import './ActivityDetail.css';

type ActivityDetailProps = {
  item: ActivityItem;
  onBack: () => void;
};

export function ActivityDetail({ item, onBack }: ActivityDetailProps) {
  const fee = item.feeWei === null ? 'unknown' : `${formatExact(item.feeWei)} test ETH`;
  const block = item.blockNumber?.toString() ?? '—';
  const nonce = item.nonce?.toString() ?? '—';
  const statusClasses =
    item.status === 'failed'
      ? 'detail-status detail-status--failed'
      : item.status === 'pending'
        ? 'detail-status detail-status--pending'
        : 'detail-status';

  return (
    <section className="page">
      <Button variant="quiet" onClick={onBack}>
        Back to activity
      </Button>

      <div className="detail-card">
        <h1 className="page-title">Transaction</h1>
        <span className={statusClasses}>{activityStatusText(item)}</span>

        <dl className="detail-list">
          <div className="detail-row">
            <dt>Hash</dt>
            <dd>
              <AddressText value={item.hash} variant="hash" />
            </dd>
          </div>
          <div className="detail-row">
            <dt>Direction</dt>
            <dd>{activityLabel(item)}</dd>
          </div>
          <div className="detail-row">
            <dt>From</dt>
            <dd>
              <AddressText value={item.from} />
            </dd>
          </div>
          <div className="detail-row">
            <dt>To</dt>
            <dd>
              {item.to === null ? (
                item.createdContract === null ? (
                  'Contract creation'
                ) : (
                  <>
                    Created contract <AddressText value={item.createdContract} />
                  </>
                )
              ) : (
                <AddressText value={item.to} />
              )}
            </dd>
          </div>
          {item.errorMessage !== null && (
            <div className="detail-row">
              <dt>Reason reported by Blockscout</dt>
              <dd className="detail-plain">{item.errorMessage}</dd>
            </div>
          )}
          <div className="detail-row">
            <dt>Amount</dt>
            <dd>
              <span className="detail-amount-inner tabular">
                {signedAmount(item)}
                <span className="detail-unit"> test ETH</span>
              </span>
            </dd>
          </div>
          <div className="detail-row">
            <dt>Network fee</dt>
            <dd className="tabular">{fee}</dd>
          </div>
          <div className="detail-row">
            <dt>Block</dt>
            <dd className="tabular">{block}</dd>
          </div>
          <div className="detail-row">
            <dt>Nonce</dt>
            <dd className="tabular">{nonce}</dd>
          </div>
          <div className="detail-row">
            <dt>Time</dt>
            <dd>
              {item.timestamp === null
                ? 'unknown'
                : `${formatDateTime(item.timestamp)} (${formatIso(item.timestamp)})`}
            </dd>
          </div>
          <div className="detail-row">
            <dt>Source</dt>
            <dd>
              {item.source === 'local'
                ? LOCAL_PENDING_SUBLABEL
                : 'From Blockscout'}
            </dd>
          </div>
        </dl>

        {item.explorerFlags.counterpartyScam && (
          <p className="detail-scam">
            Blockscout labels this address as a scam. Nerafi has not verified this label.
          </p>
        )}

        <div className="detail-actions">
          <a
            className="btn btn--quiet detail-link"
            href={`${EXPLORER_TX_URL}${item.hash}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on explorer
          </a>
        </div>
      </div>
    </section>
  );
}