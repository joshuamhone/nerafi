import { AddressText } from '../../../components/AddressText';
import { ContractIcon, ReceiveIcon, SelfIcon, SendIcon } from '../../../components/icons';
import { localPendingSublabel } from '../../../lib/wallet/history/local';
import {
  internalLabel,
  signedInternalAmount,
  signedTokenAmount,
  tokenDecimals,
  tokenIdentity,
  zeroValueWarning,
} from '../../../lib/wallet/history/display';
import { isInternalItem, isTokenItem } from '../../../lib/wallet/history/types';
import type {
  ActivityItem,
  FeedItem,
  InternalTransferItem,
  TokenTransferItem,
} from '../../../lib/wallet/history/types';
import { activityCounterpartyInfo } from '../../../lib/wallet/recipientSafety';
import { useWallet } from '../context';
import { activityLabel, formatTime, signedAmount } from './activityUtils';
import { activityRefHref } from '../router';
import './ActivityRow.css';

type ActivityRowProps = {
  item: FeedItem;
  compact?: boolean;
};

type TransactionRowProps = {
  item: ActivityItem;
  compact: boolean;
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

function TransactionRow({ item, compact }: TransactionRowProps) {
  const { known } = useWallet();
  const label = activityLabel(item);
  const counterparty = item.direction === 'out' ? item.to : item.from;
  const info = activityCounterpartyInfo(item, known);
  const classes = compact ? 'activity-row activity-row--compact' : 'activity-row';

  return (
    <li className={classes}>
      <a className="activity-row-link" href={activityRefHref({ kind: 'transaction', hash: item.hash })}>
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

function directionWord(direction: 'out' | 'in' | 'self'): string {
  if (direction === 'out') return 'out';
  if (direction === 'in') return 'in';
  return 'to yourself';
}

type CounterpartyLinesProps = {
  item: TokenTransferItem | InternalTransferItem;
  compact: boolean;
};

// The counterparty of a transfer goes through the same known-name and
// address-poisoning check as a transaction. Nothing here adds an address to
// any list.
function CounterpartyLines({ item, compact }: CounterpartyLinesProps) {
  const { known } = useWallet();
  const info = activityCounterpartyInfo(item, known);
  const counterparty = item.direction === 'out' ? item.to : item.from;
  return (
    <>
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
    </>
  );
}

function TokenRow({ item, compact }: { item: TokenTransferItem; compact: boolean }) {
  const { tokens } = useWallet();
  const identity = tokenIdentity(item, tokens);
  const warning = zeroValueWarning(item);
  const classes = compact ? 'activity-row activity-row--compact' : 'activity-row';
  const decimals = tokenDecimals(item, tokens);
  const amount = signedTokenAmount(item, tokens);
  return (
    <li className={classes}>
      <a className="activity-row-link" href={activityRefHref({ kind: 'token', hash: item.hash, index: item.logIndex })}>
        <span className="activity-row-icon" aria-hidden="true">
          {item.direction === 'out' ? (
            <SendIcon size={16} />
          ) : item.direction === 'in' ? (
            <ReceiveIcon size={16} />
          ) : (
            <SelfIcon size={16} />
          )}
        </span>
        <span className="activity-row-body">
          <span className="activity-row-label">Token transfer {directionWord(item.direction)}</span>
          <CounterpartyLines item={item} compact={compact} />
          {warning !== null && <span className="activity-row-poison">{warning}</span>}
        </span>
        <span className="activity-row-side">
          <span className="activity-row-amount-inner tabular">
            {amount}
            {decimals !== null && <span className="activity-row-unit"> {identity.unit}</span>}
          </span>
          {decimals === null && <span className="activity-row-unit">{identity.unit}</span>}
          {item.timestamp !== null && (
            <span className="activity-row-time">{formatTime(item.timestamp)}</span>
          )}
        </span>
      </a>
    </li>
  );
}

function InternalRow({ item, compact }: { item: InternalTransferItem; compact: boolean }) {
  const classes = compact ? 'activity-row activity-row--compact' : 'activity-row';
  return (
    <li className={classes}>
      <a
        className="activity-row-link"
        href={activityRefHref({ kind: 'internal', hash: item.hash, index: item.index })}
      >
        <span className="activity-row-icon" aria-hidden="true">
          <ContractIcon size={16} />
        </span>
        <span className="activity-row-body">
          <span className="activity-row-label">{internalLabel(item)}</span>
          <CounterpartyLines item={item} compact={compact} />
        </span>
        <span className="activity-row-side">
          {item.failed && (
            <span className="activity-status activity-status--failed">Failed</span>
          )}
          <span className="activity-row-amount-inner tabular">
            {signedInternalAmount(item)}
            {!item.failed && <span className="activity-row-unit"> test ETH</span>}
          </span>
          {item.timestamp !== null && (
            <span className="activity-row-time">{formatTime(item.timestamp)}</span>
          )}
        </span>
      </a>
    </li>
  );
}

export function ActivityRow({ item, compact = false }: ActivityRowProps) {
  if (isTokenItem(item)) return <TokenRow item={item} compact={compact} />;
  if (isInternalItem(item)) return <InternalRow item={item} compact={compact} />;
  return <TransactionRow item={item} compact={compact} />;
}
