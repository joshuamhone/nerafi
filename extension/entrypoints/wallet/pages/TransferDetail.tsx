import { AddressText } from '../../../components/AddressText';
import { Button } from '../../../components/Button';
import { EXTRAS_SOURCE_NOTE } from '../../../lib/wallet/history/combined';
import {
  internalLabel,
  signedInternalAmount,
  tokenAmountText,
  tokenDecimals,
  tokenIdentity,
  zeroValueWarning,
} from '../../../lib/wallet/history/display';
import { isTokenItem } from '../../../lib/wallet/history/types';
import type {
  InternalTransferItem,
  TokenTransferItem,
} from '../../../lib/wallet/history/types';
import { EXPLORER_TX_URL } from '../../../lib/wallet/network';
import { activityCounterpartyInfo } from '../../../lib/wallet/recipientSafety';
import { useWallet } from '../context';
import { activityRefHref } from '../router';
import { formatDateTime, formatIso } from './activityUtils';
import './ActivityDetail.css';

type TransferDetailProps = {
  item: TokenTransferItem | InternalTransferItem;
  // True when the transaction row itself is in the loaded history.
  transactionLoaded: boolean;
  onBack: () => void;
};

function directionText(item: TokenTransferItem | InternalTransferItem): string {
  if (!isTokenItem(item)) return internalLabel(item);
  if (item.direction === 'out') return 'Token transfer out';
  if (item.direction === 'in') return 'Token transfer in';
  return 'Token transfer to yourself';
}

export function TransferDetail({ item, transactionLoaded, onBack }: TransferDetailProps) {
  const { known, tokens } = useWallet();
  const info = activityCounterpartyInfo(item, known);
  const counterpartyIsFrom = item.direction !== 'out';
  const block = item.blockNumber?.toString() ?? '—';

  const token = isTokenItem(item) ? item : null;
  const identity = token === null ? null : tokenIdentity(token, tokens);
  const zeroWarning = token === null ? null : zeroValueWarning(token);

  return (
    <section className="page">
      <Button variant="quiet" onClick={onBack}>
        Back to activity
      </Button>

      <div className="detail-card">
        <h1 className="page-title">{token === null ? 'Internal transfer' : 'Token transfer'}</h1>
        {!isTokenItem(item) && item.failed && (
          <span className="detail-status detail-status--failed">Failed</span>
        )}

        <dl className="detail-list">
          <div className="detail-row">
            <dt>Transaction hash</dt>
            <dd>
              <AddressText value={item.hash} variant="hash" />
            </dd>
          </div>
          <div className="detail-row">
            <dt>Direction</dt>
            <dd>{directionText(item)}</dd>
          </div>
          <div className="detail-row">
            <dt>From</dt>
            <dd>
              <AddressText value={item.from} />
              {counterpartyIsFrom && info.name !== null && (
                <span className="detail-known">{info.name}</span>
              )}
            </dd>
          </div>
          <div className="detail-row">
            <dt>To</dt>
            <dd>
              {item.to === null ? (
                item.kind === 'internal' && item.createdContract !== null ? (
                  <>
                    Created contract <AddressText value={item.createdContract} />
                  </>
                ) : (
                  'Unknown'
                )
              ) : (
                <>
                  <AddressText value={item.to} />
                  {!counterpartyIsFrom && info.name !== null && (
                    <span className="detail-known">{info.name}</span>
                  )}
                </>
              )}
            </dd>
          </div>

          {token !== null && identity !== null && (
            <>
              <div className="detail-row">
                <dt>Amount</dt>
                <dd>
                  <span className="detail-amount-inner tabular">
                    {tokenAmountText(token, tokens)}
                  </span>
                  {tokenDecimals(token, tokens) !== null && (
                    <span className="detail-unit"> {identity.unit}</span>
                  )}
                </dd>
              </div>
              <div className="detail-row">
                <dt>Token</dt>
                <dd>{identity.listed ? identity.unit : 'Unlisted token'}</dd>
              </div>
              <div className="detail-row">
                <dt>Token contract address</dt>
                <dd>
                  <AddressText value={token.tokenAddress} />
                </dd>
              </div>
              {!identity.listed && (
                <div className="detail-row">
                  <dt>Symbol and name reported by Blockscout</dt>
                  <dd className="detail-plain">
                    {identity.reportedSymbol ?? 'not reported'} ·{' '}
                    {identity.reportedName ?? 'not reported'}
                    <span className="detail-known">
                      Anyone can create a token with any name. The contract address is its
                      identity. This token is not in your list.
                    </span>
                  </dd>
                </div>
              )}
            </>
          )}

          {!isTokenItem(item) && (
            <>
              <div className="detail-row">
                <dt>Amount</dt>
                <dd>
                  <span className="detail-amount-inner tabular">
                    {signedInternalAmount(item)}
                    {!item.failed && <span className="detail-unit"> test ETH</span>}
                  </span>
                </dd>
              </div>
              <div className="detail-row">
                <dt>Call type</dt>
                <dd className="detail-plain">{item.callType}</dd>
              </div>
              {item.errorMessage !== null && (
                <div className="detail-row">
                  <dt>Reason reported by Blockscout</dt>
                  <dd className="detail-plain">{item.errorMessage}</dd>
                </div>
              )}
            </>
          )}

          <div className="detail-row">
            <dt>Block</dt>
            <dd className="tabular">{block}</dd>
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
            <dd>{EXTRAS_SOURCE_NOTE}</dd>
          </div>
        </dl>

        {item.explorerFlags.counterpartyScam && (
          <p className="detail-scam">
            Blockscout labels this address as a scam. Nerafi has not verified this label.
          </p>
        )}

        {zeroWarning !== null && <p className="detail-poison">{zeroWarning}</p>}

        {info.poisoning !== null && (
          <p className="detail-poison">
            Possible address poisoning: this sender looks like {info.poisoning.known.label}. Never
            copy addresses from your history.
          </p>
        )}

        <div className="detail-actions">
          {transactionLoaded && (
            <a
              className="btn btn--quiet detail-link"
              href={activityRefHref({ kind: 'transaction', hash: item.hash })}
            >
              View the transaction
            </a>
          )}
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
