import type { FormEvent } from 'react';
import { Button } from '../../../components/Button';
import { Field } from '../../../components/Field';
import { Notice } from '../../../components/Notice';
import './Send.css';

export type SendErrorField = 'recipient' | 'amount' | 'form' | '';

type SendProps = {
  address: string;
  recipient: string;
  amount: string;
  error: string;
  errorField: SendErrorField;
  busy: boolean;
  onRecipient: (value: string) => void;
  onAmount: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

export function Send({
  address,
  recipient,
  amount,
  error,
  errorField,
  busy,
  onRecipient,
  onAmount,
  onSubmit,
  onCancel,
}: SendProps) {
  return (
    <section className="screen">
      <header className="screen-header">
        <h1 className="screen-title">Send test ETH</h1>
        <p className="screen-lead">
          From <span className="send-from mono">{address}</span>
        </p>
      </header>

      <form className="stack-form" onSubmit={onSubmit}>
        <Field
          id="recipient"
          label="Recipient address"
          mono
          value={recipient}
          onChange={(e) => onRecipient(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          error={errorField === 'recipient' ? error : undefined}
        />

        <Field
          id="amount"
          label="Amount (test ETH)"
          className="tabular"
          value={amount}
          onChange={(e) => onAmount(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          error={errorField === 'amount' ? error : undefined}
        />

        {errorField === 'form' && error && <Notice variant="alert">{error}</Notice>}

        <div className="actions">
          <Button variant="primary" type="submit" disabled={busy}>
            Review
          </Button>
          <Button variant="quiet" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}
