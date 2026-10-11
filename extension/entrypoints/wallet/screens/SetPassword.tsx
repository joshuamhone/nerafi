import type { FormEvent } from 'react';
import { Button } from '../../../components/Button';
import { Field } from '../../../components/Field';
import { Notice } from '../../../components/Notice';
import { StepIndicator } from '../../../components/StepIndicator';
import { MIN_PASSWORD_LENGTH } from '../../../lib/wallet/vault';
import { CREATE_STEPS, RESTORE_STEPS } from './steps';
import './SetPassword.css';

type SetPasswordProps = {
  flow: 'create' | 'restore' | null;
  password: string;
  confirmPassword: string;
  error: string;
  busy: boolean;
  onPassword: (value: string) => void;
  onConfirmPassword: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
};

export function SetPassword({
  flow,
  password,
  confirmPassword,
  error,
  busy,
  onPassword,
  onConfirmPassword,
  onSubmit,
}: SetPasswordProps) {
  const length = [...password.normalize('NFKC')].length;
  const met = length >= MIN_PASSWORD_LENGTH;
  const steps = flow === 'restore' ? RESTORE_STEPS : CREATE_STEPS;
  const current = flow === 'restore' ? 1 : 3;

  return (
    <section className="screen">
      <StepIndicator steps={steps} current={current} />

      <header className="screen-header">
        <h1 className="screen-title">Set a password</h1>
        <p className="screen-lead">
          This password encrypts your recovery phrase on this computer. You need it to unlock the
          wallet.
        </p>
      </header>

      <form className="stack-form" onSubmit={onSubmit}>
        <Field
          id="set-password"
          label="Password"
          type="password"
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          autoComplete="new-password"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          hint={
            <span className={met ? 'pw-count pw-count--met' : 'pw-count'}>
              {Math.min(length, MIN_PASSWORD_LENGTH)} of {MIN_PASSWORD_LENGTH} characters
            </span>
          }
        />

        <Field
          id="confirm-password"
          label="Confirm password"
          type="password"
          value={confirmPassword}
          onChange={(e) => onConfirmPassword(e.target.value)}
          autoComplete="new-password"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />

        {error && <Notice variant="alert">{error}</Notice>}

        <div className="actions">
          <Button variant="primary" type="submit" disabled={busy}>
            Save wallet
          </Button>
        </div>
      </form>
    </section>
  );
}
