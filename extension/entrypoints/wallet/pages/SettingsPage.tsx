import { useState } from 'react';
import type { FormEvent } from 'react';
import { AddressText } from '../../../components/AddressText';
import { Button } from '../../../components/Button';
import { Field } from '../../../components/Field';
import { Notice } from '../../../components/Notice';
import { MAX_ACCOUNTS } from '../../../lib/wallet/accounts';
import type { StoredAccount } from '../../../lib/wallet/accounts';
import { AUTO_LOCK_OPTIONS, autoLockLabel } from '../../../lib/wallet/settings';
import type { AutoLockMinutes } from '../../../lib/wallet/settings';
import { SECURITY_LOG_LABELS } from '../../../lib/wallet/securityLog';
import type { SecurityLogEntry } from '../../../lib/wallet/securityLog';
import './SettingsPage.css';

type SettingsPageProps = {
  accounts: StoredAccount[];
  activeIndex: number;
  autoLockMinutes: AutoLockMinutes;
  autoLockNote: string;
  log: SecurityLogEntry[];
  onRename: (index: number, name: string) => Promise<string | null>;
  onSwitchAccount: (index: number) => void;
  onAddAccount: () => void;
  onChangeAutoLock: (minutes: AutoLockMinutes) => void;
  onChangePassword: (current: string, next: string, confirm: string) => Promise<string | null>;
  onLockNow: () => void;
};

function formatWhen(at: number): string {
  return new Date(at).toLocaleString();
}

export function SettingsPage({
  accounts,
  activeIndex,
  autoLockMinutes,
  autoLockNote,
  log,
  onRename,
  onSwitchAccount,
  onAddAccount,
  onChangeAutoLock,
  onChangePassword,
  onLockNow,
}: SettingsPageProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwDone, setPwDone] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  function startRename(account: StoredAccount) {
    setEditingIndex(account.index);
    setEditValue(account.name);
    setRenameError('');
  }

  function cancelRename() {
    setEditingIndex(null);
    setEditValue('');
    setRenameError('');
  }

  async function saveRename(index: number) {
    setRenameBusy(true);
    setRenameError('');
    const error = await onRename(index, editValue);
    setRenameBusy(false);
    if (error !== null) {
      setRenameError(error);
      return;
    }
    cancelRename();
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setPwError('');
    setPwDone(false);
    setPwBusy(true);
    const error = await onChangePassword(currentPw, newPw, confirmPw);
    setPwBusy(false);
    if (error !== null) {
      setPwError(error);
      return;
    }
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setPwDone(true);
  }

  const atLimit = accounts.length >= MAX_ACCOUNTS;

  return (
    <section className="page">
      <header className="page-header">
        <h1 className="page-title">Settings</h1>
      </header>

      <div className="settings-width">
        <section className="panel settings-section">
          <div className="settings-section-head">
            <h2 className="panel-title">Accounts</h2>
            <Button variant="secondary" onClick={onAddAccount} disabled={atLimit}>
              Add account
            </Button>
          </div>

          {atLimit && (
            <p className="settings-empty">
              You have reached the maximum of {MAX_ACCOUNTS} accounts.
            </p>
          )}

          <ul className="settings-accounts">
            {accounts.map((account) => (
              <li key={account.index} className="settings-account">
                <div className="settings-account-top">
                  {editingIndex === account.index ? (
                    <div className="settings-rename">
                      <Field
                        id={`rename-${account.index}`}
                        label="Name"
                        value={editValue}
                        onChange={(event) => setEditValue(event.target.value)}
                        error={renameError || undefined}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                      />
                      <div className="settings-rename-actions">
                        <Button
                          variant="primary"
                          onClick={() => void saveRename(account.index)}
                          disabled={renameBusy}
                        >
                          Save
                        </Button>
                        <Button variant="quiet" onClick={cancelRename} disabled={renameBusy}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="settings-account-name">
                        {account.name}
                        {account.index === activeIndex && (
                          <span className="settings-account-active">Active</span>
                        )}
                      </span>
                      <div className="settings-account-actions">
                        {account.index !== activeIndex && (
                          <Button variant="quiet" onClick={() => onSwitchAccount(account.index)}>
                            Use this account
                          </Button>
                        )}
                        <Button variant="quiet" onClick={() => startRename(account)}>
                          Rename
                        </Button>
                      </div>
                    </>
                  )}
                </div>
                <div className="settings-account-address">
                  <AddressText value={account.address} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel settings-section">
          <h2 className="panel-title">Auto-lock</h2>
          <p className="settings-help">
            Nerafi locks itself after a period of inactivity. A shorter time is safer on a shared
            device.
          </p>
          <div className="settings-field">
            <label className="settings-label" htmlFor="auto-lock">
              Lock after
            </label>
            <select
              id="auto-lock"
              className="settings-select"
              value={autoLockMinutes}
              onChange={(event) => onChangeAutoLock(Number(event.target.value) as AutoLockMinutes)}
            >
              {AUTO_LOCK_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {autoLockLabel(minutes)}
                </option>
              ))}
            </select>
          </div>
          {autoLockNote && <p className="settings-note">{autoLockNote}</p>}
        </section>

        <section className="panel settings-section">
          <h2 className="panel-title">Change password</h2>
          <form className="stack-form" onSubmit={submitPassword}>
            <Field
              id="change-current"
              label="Current password"
              type="password"
              value={currentPw}
              onChange={(event) => setCurrentPw(event.target.value)}
              autoComplete="current-password"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
            <Field
              id="change-new"
              label="New password"
              type="password"
              value={newPw}
              onChange={(event) => setNewPw(event.target.value)}
              autoComplete="new-password"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />
            <Field
              id="change-confirm"
              label="Confirm new password"
              type="password"
              value={confirmPw}
              onChange={(event) => setConfirmPw(event.target.value)}
              autoComplete="new-password"
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
            />

            {pwError && <Notice variant="alert">{pwError}</Notice>}
            {pwDone && <Notice variant="info">Password changed.</Notice>}

            <div className="actions">
              <Button variant="primary" type="submit" disabled={pwBusy}>
                Change password
              </Button>
            </div>
          </form>
        </section>

        <section className="panel settings-section">
          <div className="settings-section-head">
            <h2 className="panel-title">Security log</h2>
            <Button variant="secondary" onClick={onLockNow}>
              Lock now
            </Button>
          </div>
          <p className="settings-help">
            A local record for you, not tamper-proof evidence. Anyone with access to this browser
            profile can edit or delete it.
          </p>

          {log.length === 0 ? (
            <p className="settings-empty">No recorded activity yet.</p>
          ) : (
            <ul className="settings-log">
              {log.map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="settings-log-item">
                  <span className="settings-log-time">{formatWhen(entry.at)}</span>
                  <span className="settings-log-label">
                    {SECURITY_LOG_LABELS[entry.type]}
                    {entry.detail ? ` · ${entry.detail}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel settings-section">
          <h2 className="panel-title">Not offered here</h2>
          <p className="settings-help">
            For your safety, Nerafi does not let you view your recovery phrase, remove the wallet or
            import a private key from this screen. Restoring from a recovery phrase is the only way
            to replace the saved wallet.
          </p>
        </section>
      </div>
    </section>
  );
}
