import type { FormEvent } from 'react';
import { AddressText } from '../../../components/AddressText';
import { Button } from '../../../components/Button';
import { Guilloche } from '../../../components/Guilloche';
import { Notice } from '../../../components/Notice';
import { RecipientNotice } from '../../../components/RecipientNotice';
import { formatAtMost, formatExact } from '../../../lib/wallet/format';
import { SEPOLIA_CHAIN_ID } from '../../../lib/wallet/network';
import { canSign } from '../../../lib/wallet/recipientSafety';
import type { RecipientInfo } from '../../../lib/wallet/recipientSafety';
import type { Review } from '../../../lib/wallet/send';
import { totalLeavingSentence } from '../../../lib/wallet/reviewCopy';
import './Review.css';

type ReviewProps = {
  review: Review;
  address: string;
  recipientInfo: RecipientInfo | null;
  acknowledged: boolean;
  password: string;
  error: string;
  busy: boolean;
  onAcknowledge: (value: boolean) => void;
  onPassword: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

export function ReviewScreen({
  review,
  address,
  recipientInfo,
  acknowledged,
  password,
  error,
  busy,
  onAcknowledge,
  onPassword,
  onSubmit,
  onCancel,
}: ReviewProps) {
  const selfSend = review.to.toLowerCase() === address.toLowerCase();
  const lookalike = recipientInfo?.kind === 'lookalike' ? recipientInfo : null;
  const signDisabled = busy || !review.sufficient || !canSign(recipientInfo, acknowledged);

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

          <p className="cheque-memo">
            You are sending {formatExact(review.valueWei)} test ETH to the address below.{' '}
            {totalLeavingSentence(review.totalMaxWei)}
          </p>

          <dl className="cheque-fields">
            <div className="cheque-field cheque-field--wide">
              <dt>Pay to</dt>
              <dd>
                <AddressText value={review.to} onPaper />
                {recipientInfo !== null && recipientInfo.kind !== 'lookalike' && (
                  <RecipientNotice info={recipientInfo} address={review.to} onPaper />
                )}
              </dd>
            </div>

            <div className="cheque-field">
              <dt>Amount</dt>
              <dd className="tabular">
                <span className="amount-unit">{formatExact(review.valueWei)} test ETH</span>
              </dd>
            </div>

            <div className="cheque-field">
              <dt>Max network fee</dt>
              <dd className="tabular" title={formatExact(review.maxFeeWei)}>
                <span className="amount-unit">{formatAtMost(review.maxFeeWei)} test ETH</span>
              </dd>
            </div>

            <div className="cheque-field cheque-field--total">
              <dt>Total, at most</dt>
              <dd className="tabular" title={formatExact(review.totalMaxWei)}>
                <span className="amount-unit">{formatAtMost(review.totalMaxWei)} test ETH</span>
              </dd>
            </div>

            <div className="cheque-field cheque-field--wide">
              <dt>Network</dt>
              <dd>Sepolia testnet, chain {SEPOLIA_CHAIN_ID}</dd>
            </div>
          </dl>

          <details className="cheque-exact">
              <summary>Exact values</summary>
              <dl className="cheque-exact-list">
                <div>
                  <dt>Amount</dt>
                  <dd className="tabular">{formatExact(review.valueWei)} test ETH</dd>
                </div>
                <div>
                  <dt>Max network fee</dt>
                  <dd className="tabular">{formatExact(review.maxFeeWei)} test ETH</dd>
                </div>
                <div>
                  <dt>Total will leave</dt>
                  <dd className="tabular">{formatExact(review.totalMaxWei)} test ETH</dd>
                </div>
              </dl>
            </details>

          <div className="cheque-notices">
            {lookalike !== null && (
              <>
                <RecipientNotice info={lookalike} address={review.to} onPaper />
                <label className="cheque-ack">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => onAcknowledge(e.target.checked)}
                  />
                  <span>
                    I have checked every character. This is not {lookalike.match.known.label}.
                  </span>
                </label>
              </>
            )}

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
          </div>

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
                disabled={signDisabled}
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
