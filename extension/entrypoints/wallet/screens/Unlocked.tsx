import { formatEther } from 'viem';
import { AddressText } from '../../../components/AddressText';
import { Button } from '../../../components/Button';
import { Notice } from '../../../components/Notice';
import { RefreshIcon } from '../../../components/icons';
import './Unlocked.css';

type UnlockedProps = {
  address: string;
  addressCorrected: boolean;
  balance: bigint | null;
  balanceLoading: boolean;
  balanceError: string;
  onRefresh: () => void;
  onSend: () => void;
};

export function Unlocked({
  address,
  addressCorrected,
  balance,
  balanceLoading,
  balanceError,
  onRefresh,
  onSend,
}: UnlockedProps) {
  return (
    <section className="screen">
      {addressCorrected && (
        <Notice variant="alert">
          The saved address did not match your recovery phrase and has been corrected. If you did
          not expect this, your browser profile may have been tampered with.
        </Notice>
      )}

      <div className="balance-block">
        <div className="balance-row">
          <span className="balance-amount tabular">
            {balance !== null ? formatEther(balance) : '—'}
          </span>
          <span className="balance-unit">test ETH</span>
          <button
            type="button"
            className="icon-button"
            onClick={onRefresh}
            disabled={balanceLoading}
            aria-label="Refresh balance"
          >
            <RefreshIcon />
          </button>
        </div>
        <span className="balance-caption">
          {balanceLoading ? 'Loading…' : 'Balance on Sepolia'}
        </span>
        {balanceError && <Notice variant="alert">{balanceError}</Notice>}
      </div>

      <div className="address-block">
        <span className="address-label">Your address</span>
        <AddressText value={address} />
      </div>

      <div className="actions">
        <Button variant="primary" onClick={onSend}>
          Send
        </Button>
      </div>

      <p className="muted-small">Auto-locks 15 minutes after unlocking.</p>
    </section>
  );
}
