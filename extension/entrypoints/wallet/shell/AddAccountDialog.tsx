import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '../../../components/Button';
import { Field } from '../../../components/Field';
import { Notice } from '../../../components/Notice';
import './AddAccountDialog.css';

type AddAccountDialogProps = {
  onSubmit: (name: string, password: string) => Promise<void>;
  onClose: () => void;
};

export function AddAccountDialog({ onSubmit, onClose }: AddAccountDialogProps) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);

  // Focus the name field on open and return focus to the control that opened
  // the dialog when it closes.
  useEffect(() => {
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.getElementById('add-account-name')?.focus();
    return () => {
      openerRef.current?.focus();
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onSubmit(name, password);
      setPassword('');
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the account.');
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
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="add-account-title">
        <h2 className="dialog-title" id="add-account-title">
          Add account
        </h2>
        <p className="dialog-lead">
          Enter your password to derive the next account from your recovery phrase.
        </p>

        <form className="stack-form" onSubmit={submit}>
          <Field
            id="add-account-name"
            label="Name (optional)"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />

          <Field
            id="add-account-password"
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />

          {error && <Notice variant="alert">{error}</Notice>}

          <div className="actions">
            <Button variant="primary" type="submit" disabled={busy}>
              Add account
            </Button>
            <Button variant="quiet" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
