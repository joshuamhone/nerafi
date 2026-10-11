import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { formatEther, isAddress } from 'viem';
import type { Hex } from 'viem';
import { createMnemonic, deriveAddress, isValidMnemonic } from '../../lib/wallet/account';
import { checkConfirmation, pickConfirmationIndices } from '../../lib/wallet/confirm';
import {
  decryptPhrase,
  encryptPhrase,
  validatePassword,
  VaultError,
} from '../../lib/wallet/vault';
import {
  getUnlockedAddress,
  hasVault,
  loadVault,
  lock,
  saveVault,
  setUnlocked,
  syncAddress,
} from '../../lib/wallet/storage';
import {
  assertSepolia,
  createSepoliaClient,
  EXPLORER_TX_URL,
  getBalanceWei,
  NetworkError,
  SEPOLIA_CHAIN_ID,
} from '../../lib/wallet/network';
import {
  buildReview,
  explainReview,
  parseAmount,
  parseRecipient,
  submitTransfer,
} from '../../lib/wallet/send';
import type { Review } from '../../lib/wallet/send';

type Step =
  | 'loading'
  | 'welcome'
  | 'reveal'
  | 'confirm'
  | 'set-password'
  | 'restore'
  | 'locked'
  | 'unlocked'
  | 'send'
  | 'review'
  | 'sent';

type TxStatus = 'pending' | 'confirmed' | 'failed' | 'timeout';

const CONFIRM_COUNT = 3;

function normalizePhrase(input: string): string {
  return input.trim().toLowerCase().split(/\s+/).join(' ');
}

function sendFailureMessage(err: unknown): string {
  if (err instanceof NetworkError) return err.message;
  return 'Could not send the transaction. Nothing was signed if the network check failed.';
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
  const [balance, setBalance] = useState<bigint | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState('');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [sendError, setSendError] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [sendPassword, setSendPassword] = useState('');
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [txStatus, setTxStatus] = useState<TxStatus>('pending');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const unlockedAddress = await getUnlockedAddress();
      if (cancelled) return;
      if (unlockedAddress !== null) {
        setAddress(unlockedAddress);
        setAddressCorrected(false);
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
        const unlockedAddress = await getUnlockedAddress();
        if (unlockedAddress === null) {
          setStep('locked');
        }
      })();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [step]);

  useEffect(() => {
    if (step !== 'unlocked') return undefined;
    if (!isAddress(address)) return undefined;
    let cancelled = false;
    void (async () => {
      setBalanceError('');
      setBalanceLoading(true);
      try {
        const client = createSepoliaClient();
        const wei = await getBalanceWei(client, address);
        if (cancelled) return;
        setBalance(wei);
      } catch {
        if (cancelled) return;
        setBalance(null);
        setBalanceError('Could not reach the Sepolia network.');
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, address]);

  useEffect(() => {
    if (step !== 'sent' || txHash === null) return undefined;
    let cancelled = false;
    setTxStatus('pending');
    void (async () => {
      try {
        const client = createSepoliaClient();
        const receipt = await client.waitForTransactionReceipt({
          hash: txHash,
          timeout: 120_000,
        });
        if (cancelled) return;
        setTxStatus(receipt.status === 'success' ? 'confirmed' : 'failed');
      } catch {
        if (cancelled) return;
        setTxStatus('timeout');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, txHash]);

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
      await setUnlocked(derivedAddress);
      setAddress(derivedAddress);
      setAddressCorrected(false);
      setVaultExists(true);
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
      const synced = await syncAddress(phrase);
      await setUnlocked(synced.address);
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

  async function refreshBalance() {
    if (!isAddress(address)) return;
    setBalanceError('');
    setBalance(null);
    setBalanceLoading(true);
    try {
      const client = createSepoliaClient();
      const wei = await getBalanceWei(client, address);
      setBalance(wei);
    } catch {
      setBalanceError('Could not reach the Sepolia network.');
    } finally {
      setBalanceLoading(false);
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

  function startSend() {
    setRecipient('');
    setAmount('');
    setSendError('');
    setReview(null);
    setStep('send');
  }

  async function submitSend(event: FormEvent) {
    event.preventDefault();
    setSendError('');
    const recipientResult = parseRecipient(recipient, address);
    if (!recipientResult.ok) {
      setSendError(recipientResult.error);
      return;
    }
    const amountResult = parseAmount(amount);
    if (!amountResult.ok) {
      setSendError(amountResult.error);
      return;
    }
    if (!isAddress(address)) {
      setSendError('Could not reach the Sepolia network.');
      return;
    }
    const from = address;
    setBusy(true);
    try {
      const client = createSepoliaClient();
      await assertSepolia(client);
      const balanceWei = await getBalanceWei(client, from);
      if (balanceWei < amountResult.wei) {
        setBalance(balanceWei);
        setSendError('Insufficient test ETH for this amount.');
        return;
      }
      const gas = await client.estimateGas({
        account: from,
        to: recipientResult.address,
        value: amountResult.wei,
        prepare: false,
      });
      const fees = await client.estimateFeesPerGas();
      const built = buildReview({
        from,
        to: recipientResult.address,
        valueWei: amountResult.wei,
        gas,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        balanceWei,
      });
      setBalance(balanceWei);
      setReview(built);
      setStep('review');
    } catch (err) {
      setSendError(
        err instanceof NetworkError
          ? err.message
          : 'Could not prepare the transaction. Check your connection and the details, then try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmSend(event: FormEvent) {
    event.preventDefault();
    if (review === null) return;
    setSendError('');
    setBusy(true);
    try {
      const loaded = await loadVault();
      if (loaded === null) {
        setSendError('Unsupported or damaged vault');
        return;
      }
      const phrase = await decryptPhrase(loaded.vault, sendPassword);
      const hash = await submitTransfer({ client: createSepoliaClient() }, phrase, review);
      setTxHash(hash);
      setTxStatus('pending');
      setStep('sent');
    } catch (err) {
      setSendError(err instanceof VaultError ? err.message : sendFailureMessage(err));
    } finally {
      setSendPassword('');
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

          <p>
            Balance:{' '}
            {balance !== null
              ? `${formatEther(balance)} test ETH`
              : balanceLoading
                ? 'Loading…'
                : '—'}
          </p>
          {balanceError && <p role="alert">{balanceError}</p>}

          <p>
            <button onClick={() => void refreshBalance()} disabled={balanceLoading || busy}>
              Refresh
            </button>{' '}
            <button onClick={startSend} disabled={busy}>
              Send
            </button>
          </p>

          <p>Auto-locks 15 minutes after unlocking.</p>
          <button onClick={handleLock} disabled={busy}>
            Lock
          </button>
        </section>
      )}

      {step === 'send' && (
        <section>
          <h2>Send test ETH</h2>
          <form onSubmit={submitSend}>
            <p>
              <label>
                Recipient address{' '}
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </label>
            </p>
            <p>
              <label>
                Amount (test ETH){' '}
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </label>
            </p>

            {sendError && <p role="alert">{sendError}</p>}

            <button type="submit" disabled={busy}>
              Review
            </button>{' '}
            <button type="button" onClick={() => setStep('unlocked')} disabled={busy}>
              Cancel
            </button>
          </form>
        </section>
      )}

      {step === 'review' && review !== null && (
        <section>
          <h2>Review your transaction</h2>
          <p>{explainReview(review)}</p>

          <dl>
            <dt>From</dt>
            <dd>
              <code>{review.from}</code>
            </dd>
            <dt>To</dt>
            <dd>
              <code>{review.to}</code>
            </dd>
            <dt>Amount</dt>
            <dd>{formatEther(review.valueWei)} test ETH</dd>
            <dt>Max network fee</dt>
            <dd>{formatEther(review.maxFeeWei)} test ETH</dd>
            <dt>Total (maximum)</dt>
            <dd>{formatEther(review.totalMaxWei)} test ETH</dd>
            <dt>Network</dt>
            <dd>Sepolia testnet (chain ID {SEPOLIA_CHAIN_ID})</dd>
          </dl>

          {review.to.toLowerCase() === address.toLowerCase() && (
            <p role="alert">You are sending to your own address.</p>
          )}

          {!review.sufficient && (
            <p role="alert">Insufficient test ETH for this amount plus the maximum fee.</p>
          )}

          <form onSubmit={confirmSend}>
            <p>
              <label>
                Password{' '}
                <input
                  type="password"
                  value={sendPassword}
                  onChange={(e) => setSendPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
            </p>

            {sendError && <p role="alert">{sendError}</p>}

            <button type="submit" disabled={busy || !review.sufficient}>
              Confirm and send
            </button>{' '}
            <button
              type="button"
              onClick={() => {
                setSendPassword('');
                setSendError('');
                setStep('unlocked');
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </form>
        </section>
      )}

      {step === 'sent' && txHash !== null && (
        <section>
          <h2>Transaction sent</h2>
          <p>Transaction hash:</p>
          <code>{txHash}</code>
          <p>
            <a href={`${EXPLORER_TX_URL}${txHash}`} target="_blank" rel="noopener noreferrer">
              View on Sepolia Etherscan
            </a>
          </p>
          <p>
            Status:{' '}
            {txStatus === 'pending' && 'Pending'}
            {txStatus === 'confirmed' && 'Confirmed'}
            {txStatus === 'failed' && 'Failed'}
            {txStatus === 'timeout' && 'Still pending — check Etherscan'}
          </p>
          <button
            onClick={() => {
              setStep('unlocked');
              void refreshBalance();
            }}
          >
            Back to wallet
          </button>
        </section>
      )}
    </main>
  );
}

export default App;
