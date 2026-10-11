import type { FormEvent } from 'react';
import { formatEther } from 'viem';
import { AddressText } from '../../../components/AddressText';
import { Button } from '../../../components/Button';
import { Guilloche } from '../../../components/Guilloche';
import { Notice } from '../../../components/Notice';
import { SEPOLIA_CHAIN_ID } from '../../../lib/wallet/network';
import { explainReview } from '../../../lib/wallet/send';
import type { Review } from '../../../lib/wallet/send';
import './Review.css';

type ReviewProps = {
  review: Review;
  address: string;
  password: string;
  error: string;
  busy: boolean;
  onPassword: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

export function ReviewScreen({
  review,
  address,
  password,
  error,
  busy,
  onPassword,
  onSubmit,
  onCancel,
}: ReviewProps) {
  const selfSend = review.to.toLowerCase() === address.toLowerCase();

  return (
    <section className="screen">
      <div className="cheque on-paper">
        <div className="cheque-frame" aria-hidden="true">
          <Guilloche variant="band" className="cheque-band cheque-band--top" />
          <Guilloche variant="band" className="cheque-band cheque-band--bottom" />
          <Guilloche variant="band-v" className="cheque-band cheque-band--left" />
          <Guilloche variant="band-v" className="cheque-band cheque-band--right" />
        </div>

        <div className="cheque-body">
          <div className="cheque-from">
            <span className="cheque-from-label">From</span>
            <AddressText value={review.from} onPaper className="cheque-from-addr" />
          </div>

          <p className="cheque-memo">{explainReview(review)}</p>

          <dl className="cheque-fields">
            <div className="cheque-field cheque-field--wide">
              <dt>Pay to</dt>
              <dd>
                <AddressText value={review.to} onPaper />
              </dd>
            </div>

            <div className="cheque-field">
              <dt>Amount</dt>
              <dd className="tabular">{formatEther(review.valueWei)} test ETH</dd>
            </div>

            <div className="cheque-field">
              <dt>Max network fee</dt>
              <dd className="tabular">{formatEther(review.maxFeeWei)} test ETH</dd>
            </div>

            <div className="cheque-field cheque-field--total">
              <dt>Total, at most</dt>
              <dd className="tabular">{formatEther(review.totalMaxWei)} test ETH</dd>
            </div>

            <div className="cheque-field cheque-field--wide">
              <dt>Network</dt>
              <dd>Sepolia testnet, chain {SEPOLIA_CHAIN_ID}</dd>
            </div>
          </dl>

          {selfSend && (
            <Notice variant="alert" onPaper>
              You are sending to your own address.
            </Notice>
          )}

          {!review.sufficient && (
            <Notice variant="alert" onPaper>
              Insufficient test ETH for this amount plus the maximum fee.
            </Notice>
          )}

          <form className="cheque-sign" onSubmit={onSubmit}>
            <input
              id="sign-password"
              className="signature-input"
              type="password"
              value={password}
              onChange={(e) => onPassword(e.target.value)}
              autoComplete="current-password"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
            <label className="signature-label" htmlFor="sign-password">
              Sign with your password
            </label>

            {error && (
              <Notice variant="alert" onPaper>
                {error}
              </Notice>
            )}

            <div className="cheque-actions">
              <Button
                variant="primary"
                onPaper
                type="submit"
                disabled={busy || !review.sufficient}
              >
                Sign and send
              </Button>
              <Button variant="quiet" onPaper onClick={onCancel} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
