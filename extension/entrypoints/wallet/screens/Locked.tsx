import type { FormEvent } from 'react';
import { AddressText } from '../../../components/AddressText';
import { Button } from '../../../components/Button';
import { Field } from '../../../components/Field';
import { Notice } from '../../../components/Notice';
import './Locked.css';

type LockedProps = {
  address: string;
  password: string;
  error: string;
  busy: boolean;
  onPassword: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onRestore: () => void;
};

export function Locked({
  address,
  password,
  error,
  busy,
  onPassword,
  onSubmit,
  onRestore,
}: LockedProps) {
  return (
    <section className="screen">
      <header className="screen-header">
        <h1 className="screen-title">Wallet locked</h1>
        <p className="screen-lead">Enter your password to unlock this wallet.</p>
      </header>

      <div className="locked-address">
        <span className="locked-label">Saved address</span>
        <AddressText value={address} />
      </div>

      <form className="stack-form" onSubmit={onSubmit}>
        <Field
          id="unlock-password"
          label="Password"
          type="password"
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          autoComplete="current-password"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />

        {error && <Notice variant="alert">{error}</Notice>}

        <div className="actions">
          <Button variant="primary" type="submit" disabled={busy}>
            Unlock
          </Button>
        </div>
      </form>

      <Button variant="quiet" onClick={onRestore}>
        Forgot password? Restore from recovery phrase
      </Button>
    </section>
  );
}