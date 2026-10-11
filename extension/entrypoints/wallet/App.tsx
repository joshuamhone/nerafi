import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { isAddress } from 'viem';
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
  getBalanceWei,
  NetworkError,
} from '../../lib/wallet/network';
import {
  buildReview,
  parseAmount,
  parseRecipient,
  submitTransfer,
} from '../../lib/wallet/send';
import type { Review } from '../../lib/wallet/send';
import { normalizePhraseInput } from '../../lib/wallet/input';
import { TopBar } from '../../components/TopBar';
import type { LockState } from '../../components/TopBar';
import { Loading } from './screens/Loading';
import { Welcome } from './screens/Welcome';
import { Reveal } from './screens/Reveal';
import { Confirm } from './screens/Confirm';
import { SetPassword } from './screens/SetPassword';
import { Restore } from './screens/Restore';
import { Locked } from './screens/Locked';
import { Unlocked } from './screens/Unlocked';
import { Send } from './screens/Send';
import type { SendErrorField } from './screens/Send';
import { ReviewScreen } from './screens/Review';
import { Sent } from './screens/Sent';
import './App.css';

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

type Flow = 'create' | 'restore' | null;
type TxStatus = 'pending' | 'confirmed' | 'failed' | 'timeout';

const CONFIRM_COUNT = 3;
const UNLOCKED_STEPS: Step[] = ['unlocked', 'send', 'review', 'sent'];

function sendFailureMessage(err: unknown): string {
  if (err instanceof NetworkError) return err.message;
  return 'Could not send the transaction. Nothing was signed if the network check failed.';
}

function lockStateFor(step: Step): LockState {
  if (step === 'locked') return 'locked';
  if (UNLOCKED_STEPS.includes(step)) return 'unlocked';
  return 'none';
}

function App() {
  const [step, setStep] = useState<Step>('loading');
  const [flow, setFlow] = useState<Flow>(null);
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
  const [sendErrorField, setSendErrorField] = useState<SendErrorField>('');
  const [review, setReview] = useState<Review | null>(null);
  const [reviewError, setReviewError] = useState('');
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
    setFlow('create');
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
    setFlow('restore');
    setRestoreInput('');
    setRestoreConfirmed(false);
    setError('');
    setStep('restore');
  }

  function submitRestore(event: FormEvent) {
    event.preventDefault();
    setError('');
    const phrase = normalizePhraseInput(restoreInput);
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
      setFlow(null);
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
      setSendPassword('');
      setPassword('');
      setReviewError('');
      setReview(null);
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
    setSendErrorField('');
    setReview(null);
    setStep('send');
  }

  function cancelSend() {
    setSendPassword('');
    setSendError('');
    setSendErrorField('');
    setReviewError('');
    setStep('unlocked');
  }

  async function submitSend(event: FormEvent) {
    event.preventDefault();
    setSendError('');
    setSendErrorField('');
    const recipientResult = parseRecipient(recipient, address);
    if (!recipientResult.ok) {
      setSendError(recipientResult.error);
      setSendErrorField('recipient');
      return;
    }
    const amountResult = parseAmount(amount);
    if (!amountResult.ok) {
      setSendError(amountResult.error);
      setSendErrorField('amount');
      return;
    }
    if (!isAddress(address)) {
      setSendError('Could not reach the Sepolia network.');
      setSendErrorField('form');
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
        setSendErrorField('amount');
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
      setReviewError('');
      setStep('review');
    } catch (err) {
      setSendError(
        err instanceof NetworkError
          ? err.message
          : 'Could not prepare the transaction. Check your connection and the details, then try again.',
      );
      setSendErrorField('form');
    } finally {
      setBusy(false);
    }
  }

  async function confirmSend(event: FormEvent) {
    event.preventDefault();
    if (review === null) return;
    setReviewError('');
    setBusy(true);
    try {
      const loaded = await loadVault();
      if (loaded === null) {
        setReviewError('Unsupported or damaged vault');
        return;
      }
      const phrase = await decryptPhrase(loaded.vault, sendPassword);
      const hash = await submitTransfer({ client: createSepoliaClient() }, phrase, review);
      setTxHash(hash);
      setTxStatus('pending');
      setStep('sent');
    } catch (err) {
      setReviewError(err instanceof VaultError ? err.message : sendFailureMessage(err));
    } finally {
      setSendPassword('');
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <TopBar lockState={lockStateFor(step)} onLock={() => void handleLock()} busy={busy} />

      <main className="main">
        {step === 'loading' && <Loading />}

        {step === 'welcome' && <Welcome onCreate={startCreate} onRestore={startRestore} />}

        {step === 'reveal' && (
          <Reveal
            words={words}
            revealed={revealed}
            onReveal={() => setRevealed(true)}
            onContinue={startConfirm}
          />
        )}

        {step === 'confirm' && (
          <Confirm
            indices={indices}
            answers={answers}
            error={error}
            onAnswer={updateAnswer}
            onSubmit={submitConfirmation}
            onBack={backToPhrase}
          />
        )}

        {step === 'set-password' && (
          <SetPassword
            flow={flow}
            password={password}
            confirmPassword={confirmPassword}
            error={error}
            busy={busy}
            onPassword={setPassword}
            onConfirmPassword={setConfirmPassword}
            onSubmit={submitPassword}
          />
        )}

        {step === 'restore' && (
          <Restore
            vaultExists={vaultExists}
            value={restoreInput}
            confirmed={restoreConfirmed}
            error={error}
            busy={busy}
            onValue={setRestoreInput}
            onToggleConfirmed={setRestoreConfirmed}
            onSubmit={submitRestore}
          />
        )}

        {step === 'locked' && (
          <Locked
            address={address}
            password={password}
            error={error}
            busy={busy}
            onPassword={setPassword}
            onSubmit={submitUnlock}
            onRestore={startRestore}
          />
        )}

        {step === 'unlocked' && (
          <Unlocked
            address={address}
            addressCorrected={addressCorrected}
            balance={balance}
            balanceLoading={balanceLoading}
            balanceError={balanceError}
            onRefresh={() => void refreshBalance()}
            onSend={startSend}
          />
        )}

        {step === 'send' && (
          <Send
            address={address}
            recipient={recipient}
            amount={amount}
            error={sendError}
            errorField={sendErrorField}
            busy={busy}
            onRecipient={setRecipient}
            onAmount={setAmount}
            onSubmit={submitSend}
            onCancel={cancelSend}
          />
        )}

        {step === 'review' && review !== null && (
          <ReviewScreen
            review={review}
            address={address}
            password={sendPassword}
            error={reviewError}
            busy={busy}
            onPassword={setSendPassword}
            onSubmit={confirmSend}
            onCancel={cancelSend}
          />
        )}

        {step === 'sent' && txHash !== null && (
          <Sent
            hash={txHash}
            to={review?.to ?? ''}
            amountWei={review?.valueWei ?? 0n}
            status={txStatus}
            error={reviewError}
            onBack={() => {
              setStep('unlocked');
              void refreshBalance();
            }}
          />
        )}
      </main>

      <footer className="testnet-notice">Testnet only. Not for real funds.</footer>
    </div>
  );
}

export default App;
