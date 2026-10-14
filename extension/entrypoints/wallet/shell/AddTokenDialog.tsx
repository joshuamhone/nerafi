import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AddressText } from '../../../components/AddressText';
import { Button } from '../../../components/Button';
import { Field } from '../../../components/Field';
import { Notice } from '../../../components/Notice';
import { MSG_SAME_SYMBOL, MSG_TOKEN_IDENTITY } from '../../../lib/wallet/tokens';
import type { VerifiedToken, VerifyTokenResult } from '../../../lib/wallet/tokens';
import './AddAccountDialog.css';
import './AddTokenDialog.css';

type AddTokenDialogProps = {
  // Reads the contract on Sepolia. Nothing is saved by this call.
  onVerify: (address: string) => Promise<VerifyTokenResult>;
  // Saves the token. Called only after the user confirms.
  onConfirm: (token: VerifiedToken) => Promise<string | null>;
  symbolIsListed: (symbol: string) => boolean;
  onClose: () => void;
};

export function AddTokenDialog({ onVerify, onConfirm, symbolIsListed, onClose }: AddTokenDialogProps) {
  const [address, setAddress] = useState('');
  const [verified, setVerified] = useState<VerifiedToken | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);

  // Focus the address field on open and return focus to the control that
  // opened the dialog when it closes.
  useEffect(() => {
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.getElementById('add-token-address')?.focus();
    return () => {
      openerRef.current?.focus();
    };
  }, []);

  async function lookUp(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await onVerify(address);
      if (result.ok) setVerified(result.token);
      else setError(result.error);
    } catch {
      setError('Could not reach the Sepolia network.');
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (verified === null) return;
    setError('');
    setBusy(true);
    try {
      const failure = await onConfirm(verified);
      if (failure !== null) setError(failure);
    } catch {
      setError('Could not save the token.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div
        className="dialog dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-token-title"
      >
        <h2 className="dialog-title" id="add-token-title">
          Add token
        </h2>

        {verified === null ? (
          <form className="stack-form" onSubmit={lookUp}>
            <p className="dialog-lead">
              Paste the token's contract address. Nerafi reads the contract on Sepolia and shows
              you what it finds before anything is saved.
            </p>
            <Field
              id="add-token-address"
              label="Contract address"
              mono
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              error={error !== '' ? error : undefined}
            />
            <div className="actions">
              <Button variant="primary" type="submit" disabled={busy}>
                {busy ? 'Checking…' : 'Look up token'}
              </Button>
              <Button variant="quiet" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="stack-form">
            <p className="dialog-lead">{MSG_TOKEN_IDENTITY}</p>

            <dl className="token-confirm">
              <div className="token-confirm-row">
                <dt>Contract address</dt>
                <dd>
                  <AddressText value={verified.address} />
                </dd>
              </div>
              <div className="token-confirm-row">
                <dt>Symbol</dt>
                <dd className="token-confirm-text">{verified.symbol}</dd>
              </div>
              <div className="token-confirm-row">
                <dt>Name</dt>
                <dd className="token-confirm-text">{verified.name}</dd>
              </div>
              <div className="token-confirm-row">
                <dt>Decimals</dt>
                <dd className="tabular">{verified.decimals}</dd>
              </div>
            </dl>

            {symbolIsListed(verified.symbol) && <Notice variant="alert">{MSG_SAME_SYMBOL}</Notice>}

            {error !== '' && <Notice variant="alert">{error}</Notice>}

            <div className="actions">
              <Button variant="primary" onClick={() => void confirm()} disabled={busy}>
                Add this token
              </Button>
              <Button variant="quiet" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
