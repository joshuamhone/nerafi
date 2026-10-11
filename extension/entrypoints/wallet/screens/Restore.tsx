import type { FormEvent } from 'react';
import { Button } from '../../../components/Button';
import { Notice } from '../../../components/Notice';
import { StepIndicator } from '../../../components/StepIndicator';
import { TextareaField } from '../../../components/Field';
import { RESTORE_STEPS } from './steps';
import './Restore.css';

type RestoreProps = {
  vaultExists: boolean;
  value: string;
  confirmed: boolean;
  error: string;
  busy: boolean;
  onValue: (value: string) => void;
  onToggleConfirmed: (value: boolean) => void;
  onSubmit: (event: FormEvent) => void;
};

export function Restore({
  vaultExists,
  value,
  confirmed,
  error,
  busy,
  onValue,
  onToggleConfirmed,
  onSubmit,
}: RestoreProps) {
  return (
    <section className="screen">
      <StepIndicator steps={RESTORE_STEPS} current={0} />

      <header className="screen-header">
        <h1 className="screen-title">Restore from recovery phrase</h1>
        <p className="screen-lead">
          Type or paste your recovery phrase. You can paste it with numbering or line breaks; Nerafi
          tidies it up.
        </p>
      </header>

      {vaultExists && (
        <Notice variant="alert">
          Restoring replaces the wallet saved in Nerafi. Make sure you have the current wallet's
          recovery phrase first.
        </Notice>
      )}

      <form className="stack-form" onSubmit={onSubmit}>
        <TextareaField
          id="restore-phrase"
          label="Recovery phrase"
          value={value}
          onChange={(e) => onValue(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="mono"
        />

        {vaultExists && (
          <label className="restore-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => onToggleConfirmed(e.target.checked)}
            />
            <span>I understand this replaces the wallet saved in Nerafi.</span>
          </label>
        )}

        {error && <Notice variant="alert">{error}</Notice>}

        <div className="actions">
          <Button
            variant="primary"
            type="submit"
            disabled={busy || (vaultExists && !confirmed)}
          >
            Continue
          </Button>
        </div>
      </form>
    </section>
  );
}
