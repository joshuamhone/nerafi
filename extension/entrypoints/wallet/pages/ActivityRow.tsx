import { AddressText } from '../../../components/AddressText';
import { ContractIcon, ReceiveIcon, SelfIcon, SendIcon } from '../../../components/icons';
import { localPendingSublabel } from '../../../lib/wallet/history/local';
import type { ActivityItem } from '../../../lib/wallet/history/types';
import { activityCounterpartyInfo } from '../../../lib/wallet/recipientSafety';
import { useWallet } from '../context';
import { activityLabel, formatTime, signedAmount } from './activityUtils';
import { activityHref } from '../router';
import './ActivityRow.css';

type ActivityRowProps = {
  item: ActivityItem;
  compact?: boolean;
};

function RowIcon({ item }: { item: ActivityItem }) {
  if (item.to === null) return <ContractIcon size={16} />;
  if (item.isContractCall) return <ContractIcon size={16} />;
  if (item.direction === 'out') return <SendIcon size={16} />;
  if (item.direction === 'in') return <ReceiveIcon size={16} />;
  return <SelfIcon size={16} />;
}

function StatusBadge({ item }: { item: ActivityItem }) {
  if (item.status === 'confirmed') {
    return <span className="activity-status activity-status--confirmed">Confirmed</span>;
  }
  if (item.status === 'failed') {
    return <span className="activity-status activity-status--failed">Failed</span>;
  }
  return (
    <span className="activity-status activity-status--pending">
      <span className="activity-status-dot" aria-hidden="true" />
      Pending
    </span>
  );
}

export function ActivityRow({ item, compact = false }: ActivityRowProps) {
  const { known } = useWallet();
  const label = activityLabel(item);
  const counterparty = item.direction === 'out' ? item.to : item.from;
  const info = activityCounterpartyInfo(item, known);
  const classes = compact ? 'activity-row activity-row--compact' : 'activity-row';

  return (
    <li className={classes}>
      <a className="activity-row-link" href={activityHref(item.hash)}>
        <span className="activity-row-icon" aria-hidden="true">
          <RowIcon item={item} />
        </span>
        <span className="activity-row-body">
          <span className="activity-row-label">{label}</span>
          {!compact && item.explorerFlags.counterpartyScam && (
            <span className="activity-row-scam">
              Blockscout labels this address as a scam. Nerafi has not verified this label.
            </span>
          )}
          {counterparty !== null ? (
            <AddressText value={counterparty} className="activity-row-address" />
          ) : (
            <span className="activity-row-address" aria-hidden="true" />
          )}
          {info.name !== null && <span className="activity-row-known">{info.name}</span>}
          {!compact && info.poisoning !== null && (
            <span className="activity-row-poison">
              Possible address poisoning: this sender looks like {info.poisoning.known.label}. Never
              copy addresses from your history.
            </span>
          )}
          {!compact && item.source === 'local' && (
            <span className="activity-row-sublabel">
              {localPendingSublabel(item.timestamp ?? 0)}
            </span>
          )}
        </span>
        <span className="activity-row-side">
          {(!compact || item.source === 'local') && <StatusBadge item={item} />}
          <span className="activity-row-amount-inner tabular">
            {signedAmount(item)}
            <span className="activity-row-unit"> test ETH</span>
          </span>
          {item.timestamp !== null && (
            <span className="activity-row-time">{formatTime(item.timestamp)}</span>
          )}
        </span>
      </a>
    </li>
  );
}