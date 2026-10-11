import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createMnemonic, deriveAddress, isValidMnemonic } from '../../lib/wallet/account';
import { checkConfirmation, pickConfirmationIndices } from '../../lib/wallet/confirm';
import {
  decryptPhrase,
  encryptPhrase,
  validatePassword,
  VaultError,
} from '../../lib/wallet/vault';
import {
  getUnlockedPhrase,
  hasVault,
  loadVault,
  lock,
  saveVault,
  setUnlocked,
  syncAddress,
} from '../../lib/wallet/storage';

type Step =
  | 'loading'
  | 'welcome'
  | 'reveal'
  | 'confirm'
  | 'set-password'
  | 'restore'
  | 'locked'
  | 'unlocked';

const CONFIRM_COUNT = 3;

function normalizePhrase(input: string): string {
  return input.trim().toLowerCase().split(/\s+/).join(' ');
}

function App() {
  const [step, setStep] = useState<Step>('loading');
  const [words, setWords] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [indices, setIndices] = useState<number[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [address, setAddress] = useState('');
  const [addressCorrected, setAddressCorrected] = useState(false);
  const [pendingPhrase, setPendingPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [restoreInput, setRestoreInput] = useState('');
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);
  const [vaultExists, setVaultExists] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const unlocked = await getUnlockedPhrase();
      if (cancelled) return;
      if (unlocked !== null) {
        const synced = await syncAddress(unlocked);
        if (cancelled) return;
        setAddress(synced.address);
        setAddressCorrected(synced.corrected);
        setVaultExists(true);
        setStep('unlocked');
        return;
      }
      if (await hasVault()) {
        const loaded = await loadVault();
        if (cancelled) return;
        setAddress(loaded?.address ?? '');
        setVaultExists(true);
        setStep('locked');
        return;
      }
      setStep('welcome');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (step !== 'unlocked') return undefined;
    const id = window.setInterval(() => {
      void (async () => {
        const unlocked = await getUnlockedPhrase();
        if (unlocked === null) {
          setStep('locked');
        }
      })();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [step]);

  function startCreate() {
    setWords(createMnemonic().split(' '));
    setRevealed(false);
    setError('');
    setStep('reveal');
  }

  function startConfirm() {
    setIndices(pickConfirmationIndices(words.length, CONFIRM_COUNT));
    setAnswers(Array.from({ length: CONFIRM_COUNT }, () => ''));
    setError('');
    setStep('confirm');
  }

  function backToPhrase() {
    setRevealed(false);
    setStep('reveal');
  }

  function updateAnswer(n: number, value: string) {
    setAnswers((prev) => prev.map((a, k) => (k === n ? value : a)));
  }

  function submitConfirmation() {
    if (!checkConfirmation(words, indices, answers)) {
      setError("Those words don't match. Check your written copy and try again.");
      return;
    }
    const phrase = words.join(' ');
    setPendingPhrase(phrase);
    // The confirmation screen no longer needs these; the phrase is carried
    // forward in a single value until it is encrypted.
    setWords([]);
    setAnswers([]);
    setIndices([]);
    setError('');
    setStep('set-password');
  }

  function startRestore() {
    setRestoreInput('');
    setRestoreConfirmed(false);
    setError('');
    setStep('restore');
  }

  function submitRestore(event: FormEvent) {
    event.preventDefault();
    setError('');
    const phrase = normalizePhrase(restoreInput);
    if (!isValidMnemonic(phrase)) {
      setError('That recovery phrase is not valid. Check the words and try again.');
      return;
    }
    if (vaultExists && !restoreConfirmed) {
      setError('Confirm that restoring replaces the saved wallet.');
      return;
    }
    setPendingPhrase(phrase);
    setRestoreInput('');
    setRestoreConfirmed(false);
    setStep('set-password');
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setError('');
    const policyError = validatePassword(password);
    if (policyError !== null) {
      setError(policyError);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const vault = await encryptPhrase(pendingPhrase, password);
      const derivedAddress = deriveAddress(pendingPhrase);
      await saveVault(vault, derivedAddress);
      await setUnlocked(pendingPhrase);
      setAddress(derivedAddress);
      setAddressCorrected(false);
      setVaultExists(true);
      // The phrase and password are no longer needed on this page.
      setPendingPhrase('');
      setPassword('');
      setConfirmPassword('');
      setError('');
      setStep('unlocked');
    } catch {
      setError('Could not save the wallet. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submitUnlock(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const loaded = await loadVault();
      if (loaded === null) {
        setError('Unsupported or damaged vault');
        return;
      }
      const phrase = await decryptPhrase(loaded.vault, password);
      await setUnlocked(phrase);
      const synced = await syncAddress(phrase);
      setAddress(synced.address);
      setAddressCorrected(synced.corrected);
      setPassword('');
      setError('');
      setStep('unlocked');
    } catch (err) {
      setError(err instanceof VaultError ? err.message : 'Incorrect password or damaged vault');
    } finally {
      setBusy(false);
    }
  }

  async function handleLock() {
    setBusy(true);
    try {
      await lock();
      setError('');
      setStep('locked');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Nerafi Wallet</h1>
      <p>Testnet only. Not for real funds.</p>

      {step === 'loading' && <p>Loading…</p>}

      {step === 'welcome' && (
        <section>
          <h2>Create or restore a wallet</h2>
          <button onClick={startCreate}>Create new wallet</button>{' '}
          <button onClick={startRestore}>Restore from recovery phrase</button>
        </section>
      )}

      {step === 'reveal' && (
        <section>
          <h2>Your recovery phrase</h2>
          <p>
            Write these 12 words on paper, in order. Anyone who sees them
            controls this wallet. Never share them, and never store them on
            this computer.
          </p>

          {revealed ? (
            <ol>
              {words.map((word, i) => (
                <li key={i}>{word}</li>
              ))}
            </ol>
          ) : (
            <button onClick={() => setRevealed(true)}>Reveal phrase</button>
          )}

          <button disabled={!revealed} onClick={startConfirm}>
            I've written it down
          </button>
        </section>
      )}

      {step === 'confirm' && (
        <section>
          <h2>Confirm your backup</h2>
          <p>Enter these words from your written copy.</p>

          {indices.map((index, n) => (
            <p key={index}>
              <label>
                Word #{index + 1}{' '}
                <input
                  type="text"
                  value={answers[n] ?? ''}
                  onChange={(e) => updateAnswer(n, e.target.value)}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </label>
            </p>
          ))}

          {error && <p role="alert">{error}</p>}

          <button onClick={submitConfirmation}>Confirm</button>{' '}
          <button onClick={backToPhrase}>Back to phrase</button>
        </section>
      )}

      {step === 'set-password' && (
        <section>
          <h2>Set a password</h2>
          <p>
            This password encrypts your recovery phrase on this computer. You
            will need it to unlock the wallet.
          </p>

          <form onSubmit={submitPassword}>
            <p>
              <label>
                Password{' '}
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
            </p>
            <p>
              <label>
                Confirm password{' '}
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
            </p>

            {error && <p role="alert">{error}</p>}

            <button type="submit" disabled={busy}>
              Save wallet
            </button>
          </form>
        </section>
      )}

      {step === 'restore' && (
        <section>
          <h2>Restore from recovery phrase</h2>

          {vaultExists && (
            <p role="alert">
              Restoring replaces the wallet saved in Nerafi. Make sure you have
              the current wallet's recovery phrase first.
            </p>
          )}

          <form onSubmit={submitRestore}>
            <p>
              <label>
                Recovery phrase
                <textarea
                  value={restoreInput}
                  onChange={(e) => setRestoreInput(e.target.value)}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </label>
            </p>

            {vaultExists && (
              <p>
                <label>
                  <input
                    type="checkbox"
                    checked={restoreConfirmed}
                    onChange={(e) => setRestoreConfirmed(e.target.checked)}
                  />{' '}
                  I understand this replaces the wallet saved in Nerafi.
                </label>
              </p>
            )}

            {error && <p role="alert">{error}</p>}

            <button type="submit" disabled={busy || (vaultExists && !restoreConfirmed)}>
              Continue
            </button>
          </form>
        </section>
      )}

      {step === 'locked' && (
        <section>
          <h2>Wallet locked</h2>
          <p>Saved address:</p>
          <code>{address}</code>

          <form onSubmit={submitUnlock}>
            <p>
              <label>
                Password{' '}
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
            </p>

            {error && <p role="alert">{error}</p>}

            <button type="submit" disabled={busy}>
              Unlock
            </button>
          </form>

          <button onClick={startRestore}>Forgot password? Restore from recovery phrase</button>
        </section>
      )}

      {step === 'unlocked' && (
        <section>
          <h2>Wallet unlocked</h2>
          <p>Your address:</p>
          <code>{address}</code>
          {addressCorrected && (
            <p role="alert">
              The saved address did not match your recovery phrase and has been corrected. If you
              did not expect this, your browser profile may have been tampered with.
            </p>
          )}
          <p>Auto-locks 15 minutes after unlocking.</p>
          <button onClick={handleLock} disabled={busy}>
            Lock
          </button>
        </section>
      )}
    </main>
  );
}

export default App;
