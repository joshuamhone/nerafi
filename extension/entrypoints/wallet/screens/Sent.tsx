import { formatEther } from 'viem';
import { AddressText } from '../../../components/AddressText';
import { Button } from '../../../components/Button';
import { Guilloche } from '../../../components/Guilloche';
import { Notice } from '../../../components/Notice';
import { EXPLORER_TX_URL } from '../../../lib/wallet/network';
import './Sent.css';

export type SendStatus = 'pending' | 'confirmed' | 'failed' | 'timeout';

type SentProps = {
  hash: string;
  to: string;
  amountWei: bigint;
  status: SendStatus;
  error: string;
  onBack: () => void;
};

export function Sent({ hash, to, amountWei, status, error, onBack }: SentProps) {
  return (
    <section className="screen">
      <header className="screen-header">
        <h1 className="screen-title">Sent</h1>
      </header>

      <div className="sent-status">
        {status === 'pending' && (
          <>
            <span className="pending-dot" aria-hidden="true" />
            <span className="sent-status-text">Pending</span>
          </>
        )}
        {status === 'confirmed' && (
          <span className="stamp stamp--confirmed">
            <Guilloche variant="ring" className="stamp-ring" />
            <span className="stamp-text">Confirmed</span>
          </span>
        )}
        {status === 'failed' && <span className="stamp stamp--failed">Failed</span>}
        {status === 'timeout' && (
          <span className="sent-status-text">Still pending — check Etherscan</span>
        )}
      </div>

      <div className="sent-details">
        <div className="sent-row">
          <span className="sent-label">To</span>
          <AddressText value={to} />
        </div>
        <div className="sent-row">
          <span className="sent-label">Amount</span>
          <span className="tabular">{formatEther(amountWei)} test ETH</span>
        </div>
        <div className="sent-row">
          <span className="sent-label">Transaction</span>
          <AddressText value={hash} variant="hash" />
        </div>
      </div>

      {status === 'failed' && error && <Notice variant="alert">{error}</Notice>}

      <a
        className="etherscan-link"
        href={`${EXPLORER_TX_URL}${hash}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        View on Sepolia Etherscan
      </a>

      <div className="actions">
        <Button variant="quiet" onClick={onBack}>
          Back to wallet
        </Button>
      </div>
    </section>
  );
}
