import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AddressText } from '../../../components/AddressText';
import { Button } from '../../../components/Button';
import { Field } from '../../../components/Field';
import { Notice } from '../../../components/Notice';
import { lockoutMessage, readLockoutUntil } from '../../../lib/wallet/unlock';
import './Locked.css';

type LockedProps = {
  address: string;
  password: string;
  error: string;
  busy: boolean;
  lockedUntil: number | null;
  onPassword: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onRestore: () => void;
};

export function Locked({
  address,
  password,
  error,
  busy,
  lockedUntil,
  onPassword,
  onSubmit,
  onRestore,
}: LockedProps) {
  const [now, setNow] = useState(() => Date.now());
  const [guardUntil, setGuardUntil] = useState<number | null>(null);

  // A page reload must not hide a lockout that is still ticking, so read the
  // stored guard on mount. The prop (set by a just-failed attempt) wins.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const until = await readLockoutUntil();
      if (!cancelled) setGuardUntil(until);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const until = lockedUntil ?? guardUntil;

  useEffect(() => {
    if (until === null) return undefined;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [until]);

  const remaining = until === null ? 0 : until - now;
  const lockedOut = remaining > 0;
  const lockoutText = until === null ? '' : lockoutMessage(until, now);

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
          disabled={busy || lockedOut}
        />

        {lockedOut && <Notice variant="alert">{lockoutText}</Notice>}

        {!lockedOut && error && <Notice variant="alert">{error}</Notice>}

        <div className="actions">
          <Button variant="primary" type="submit" disabled={busy || lockedOut}>
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
