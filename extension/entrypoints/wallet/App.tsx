import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { isAddress } from 'viem';
import type { Hex } from 'viem';
import { createMnemonic, deriveAddress, isValidMnemonic } from '../../lib/wallet/account';
import { checkConfirmation, pickConfirmationIndices } from '../../lib/wallet/confirm';
import { saveLocalTx } from '../../lib/wallet/history/local';
import { encryptPhrase, validatePassword, VaultError } from '../../lib/wallet/vault';
import {
  getUnlockedAddress,
  hasVault,
  loadVault,
  lock,
  saveVault,
} from '../../lib/wallet/storage';
import {
  addAccount,
  defaultAccountName,
  loadAccounts,
  loadSessionAccounts,
  renameAccount,
  resolveActiveIndex,
  switchAccount,
  unlockAccounts,
} from '../../lib/wallet/accounts';
import type { SessionAccount, StoredAccount } from '../../lib/wallet/accounts';
import {
  autoLockLabel,
  autoLockMs,
  changeAutoLock,
  DEFAULT_SETTINGS,
  loadSettings,
} from '../../lib/wallet/settings';
import type { AutoLockMinutes, Settings } from '../../lib/wallet/settings';
import { appendSecurityLog, loadSecurityLog } from '../../lib/wallet/securityLog';
import type { SecurityLogEntry } from '../../lib/wallet/securityLog';
import {
  lockoutMessage,
  openVault,
  readLockoutUntil,
  resetGuard,
} from '../../lib/wallet/unlock';
import { changePassword } from '../../lib/wallet/changePassword';
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
import { addContact, checkNewContact, loadContacts, removeContact, renameContact } from '../../lib/wallet/contacts';
import type { Contact, NewContactResult } from '../../lib/wallet/contacts';
import { loadSentRecipients, recordSentRecipient } from '../../lib/wallet/sentRecipients';
import type { SentRecipient } from '../../lib/wallet/sentRecipients';
import { buildKnown, canSign, classifyRecipient } from '../../lib/wallet/recipientSafety';
import type { RecipientInfo } from '../../lib/wallet/recipientSafety';
import type { KnownAddress } from '../../lib/wallet/lookalike';
import { assessTransaction } from '../../lib/wallet/risk/assess';
import { gatherRecipientCode, isListedTokenAddress, selectCodeResult } from '../../lib/wallet/risk/gather';
import type { CodeResultStore } from '../../lib/wallet/risk/gather';
import { clearLoadedHistory } from '../../lib/wallet/history/loaded';
import { canSignReport, hasDanger } from '../../lib/wallet/risk/gate';
import type { RiskReport } from '../../lib/wallet/risk/types';
import {
  addToken,
  createTokenClient,
  loadTokens,
  removeToken,
  symbolIsListed,
  verifyToken,
} from '../../lib/wallet/tokens';
import type { Token, VerifiedToken, VerifyTokenResult } from '../../lib/wallet/tokens';
import { AuthLayout } from './AuthLayout';
import { WalletProvider, useWallet } from './context';
import type { ActivityRef, Route } from './router';
import { parseActivityRef, parseRoute, routeHref } from './router';
import { AppShell } from './shell/AppShell';
import { Loading } from './screens/Loading';
import { Welcome } from './screens/Welcome';
import { Reveal } from './screens/Reveal';
import { Confirm } from './screens/Confirm';
import { SetPassword } from './screens/SetPassword';
import { Restore } from './screens/Restore';
import { Locked } from './screens/Locked';
import { Send } from './screens/Send';
import type { SendErrorField } from './screens/Send';
import { ReviewScreen } from './screens/Review';
import { Sent } from './screens/Sent';
import type { SendStatus } from './screens/Sent';
import { Overview } from './pages/Overview';
import { ActivityPage } from './pages/ActivityPage';
import { Receive } from './pages/ReceivePage';
import { AddressBookPage } from './pages/AddressBookPage';
import { SettingsPage } from './pages/SettingsPage';
import { SecurityCenterPage } from './pages/SecurityCenterPage';
import { AddAccountDialog } from './shell/AddAccountDialog';
import { AddTokenDialog } from './shell/AddTokenDialog';
import type { RecipientOption } from './shell/RecipientPicker';
import './App.css';

type AuthStep =
  | 'loading'
  | 'welcome'
  | 'reveal'
  | 'confirm'
  | 'set-password'
  | 'restore'
  | 'locked'
  | 'unlocked';

type Flow = 'create' | 'restore' | null;
type SendStep = 'form' | 'review' | 'sent';

const CONFIRM_COUNT = 3;

function sendFailureMessage(err: unknown): string {
  if (err instanceof NetworkError) return err.message;
  return 'Could not send the transaction. Nothing was signed if the network check failed.';
}

function recipientInfoFor(
  value: string,
  known: KnownAddress[],
  contacts: Contact[],
): RecipientInfo | null {
  const trimmed = value.trim();
  if (!isAddress(trimmed)) return null;
  return classifyRecipient(trimmed, known, contacts);
}

function SentRoute({
  hash,
  to,
  amountWei,
  status,
  error,
  onBackToWallet,
}: {
  hash: Hex;
  to: string;
  amountWei: bigint;
  status: SendStatus;
  error: string;
  onBackToWallet: () => void;
}) {
  const { refresh } = useWallet();
  return (
    <Sent
      hash={hash}
      to={to}
      amountWei={amountWei}
      status={status}
      error={error}
      onBack={() => {
        onBackToWallet();
        refresh();
      }}
    />
  );
}

function App() {
  const [step, setStep] = useState<AuthStep>('loading');
  const [route, setRoute] = useState<Route>('overview');
  const [activityRef, setActivityRef] = useState<ActivityRef | null>(null);
  const [sendStep, setSendStep] = useState<SendStep>('form');
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
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [sendError, setSendError] = useState('');
  const [sendErrorField, setSendErrorField] = useState<SendErrorField>('');
  const [review, setReview] = useState<Review | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [sendPassword, setSendPassword] = useState('');
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [txStatus, setTxStatus] = useState<SendStatus>('pending');
  const [accounts, setAccounts] = useState<StoredAccount[]>([]);
  const [sessionAccounts, setSessionAccounts] = useState<SessionAccount[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [autoLockNote, setAutoLockNote] = useState('');
  const [securityLog, setSecurityLog] = useState<SecurityLogEntry[]>([]);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [sentRecipients, setSentRecipients] = useState<SentRecipient[]>([]);
  const [lookalikeAck, setLookalikeAck] = useState(false);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [addTokenOpen, setAddTokenOpen] = useState(false);
  // The contract-lookup result, stored with the address it was fetched for. The
  // cheque only uses it when that address is the current recipient.
  const [codeResult, setCodeResult] = useState<CodeResultStore>(null);

  const autoLockDuration = autoLockMs(settings);

  const known = useMemo(
    () => buildKnown(sessionAccounts, accounts, contacts, sentRecipients),
    [sessionAccounts, accounts, contacts, sentRecipients],
  );

  const ownLabels = useMemo(
    () =>
      sessionAccounts.map((session) => ({
        address: session.address,
        name:
          accounts.find((account) => account.index === session.index)?.name ??
          defaultAccountName(session.index),
      })),
    [sessionAccounts, accounts],
  );

  const recipientOptions = useMemo<RecipientOption[]>(
    () => [
      ...ownLabels.map((own) => ({
        name: own.name,
        address: own.address,
        kind: 'account' as const,
      })),
      ...contacts.map((contact) => ({
        name: contact.name,
        address: contact.address,
        kind: 'contact' as const,
      })),
    ],
    [ownLabels, contacts],
  );

  const recipientInfo = useMemo(
    () => recipientInfoFor(recipient, known, contacts),
    [recipient, known, contacts],
  );

  const reviewRecipientInfo = useMemo(
    () => (review === null ? null : recipientInfoFor(review.to, known, contacts)),
    [review, known, contacts],
  );

  // Advisory only: the report is built from the review the user is looking at
  // and never changes what gets signed. Null until the address check resolves.
  const codeSelection = useMemo(
    () => (review === null ? 'pending' : selectCodeResult(codeResult, review.to)),
    [review, codeResult],
  );

  const risk = useMemo<RiskReport | null>(() => {
    if (review === null || codeSelection === 'pending') return null;
    return assessTransaction({
      recipientAddress: review.to,
      recipient: reviewRecipientInfo ?? { kind: 'unknown' },
      recipientCode: codeSelection,
      recipientIsListedToken: isListedTokenAddress(tokens, review.to),
      amountWei: review.valueWei,
      feeWei: review.maxFeeWei,
      balanceWei: review.balanceWei,
      isSelfSend: review.to.toLowerCase() === address.toLowerCase(),
    });
  }, [review, codeSelection, reviewRecipientInfo, address, tokens]);

  async function refreshSecurityLog() {
    setSecurityLog(await loadSecurityLog());
  }

  async function refreshSessionAccounts() {
    setSessionAccounts((await loadSessionAccounts()) ?? []);
  }

  async function refreshRecipientData() {
    const [loadedContacts, loadedSent, loadedTokens] = await Promise.all([
      loadContacts(),
      loadSentRecipients(),
      loadTokens(),
    ]);
    setContacts(loadedContacts);
    setSentRecipients(loadedSent);
    setTokens(loadedTokens);
  }

  function resetSendFlow() {
    setRecipient('');
    setAmount('');
    setSendError('');
    setSendErrorField('');
    setReview(null);
    setReviewError('');
    setSendPassword('');
    setLookalikeAck(false);
    setSendStep('form');
  }

  function navigate(next: Route) {
    const target = routeHref(next);
    if (window.location.hash === target) return;
    window.location.hash = target;
  }

  useEffect(() => {
    const apply = () => {
      const next = parseRoute(window.location.hash);
      setRoute(next);
      setActivityRef(parseActivityRef(window.location.hash));
      if (next === 'send') {
        resetSendFlow();
      } else {
        setSendStep('form');
        setSendError('');
        setSendErrorField('');
        setReviewError('');
      }
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loadedSettings = await loadSettings();
      if (cancelled) return;
      setSettings(loadedSettings);

      const unlockedAddress = await getUnlockedAddress();
      if (cancelled) return;
      if (unlockedAddress !== null) {
        // The active account of an existing session is whichever verified
        // session address matches. If the session address is not in the
        // verified list, the session is not trustworthy: lock the wallet.
        const [index, storedAccounts, verified] = await Promise.all([
          resolveActiveIndex(),
          loadAccounts(),
          loadSessionAccounts(),
        ]);
        if (cancelled) return;
        if (index === null || verified === null) {
          await lock();
          if (cancelled) return;
          const loaded = await loadVault();
          setAddress(loaded?.address ?? unlockedAddress);
          setVaultExists(true);
          setStep('locked');
          return;
        }
        setAccounts(storedAccounts ?? []);
        setSessionAccounts(verified);
        setActiveIndex(index);
        setAddress(unlockedAddress);
        setAddressCorrected(false);
        setVaultExists(true);
        await refreshRecipientData();
        if (cancelled) return;
        setStep('unlocked');
        navigate('overview');
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
    if (step !== 'unlocked' || (route !== 'settings' && route !== 'security')) return;
    void refreshSecurityLog();
  }, [step, route]);

  // The one network check for the cheque: is the recipient a contract? The
  // cheque is shown straight away with "Checking this address..." and signing
  // stays off until this resolves, into 'unknown' on error or timeout.
  useEffect(() => {
    if (sendStep !== 'review' || review === null) {
      setCodeResult(null);
      return undefined;
    }
    let cancelled = false;
    const lookedUp = review.to;
    const client = createSepoliaClient();
    void gatherRecipientCode(
      { getCode: (target) => client.getCode({ address: target }) },
      lookedUp,
    ).then((code) => {
      // Stored with its own address, and dropped if the review has moved on.
      if (!cancelled) setCodeResult({ address: lookedUp, code });
    });
    return () => {
      cancelled = true;
    };
  }, [sendStep, review]);

  useEffect(() => {
    if (step !== 'unlocked') return undefined;
    const id = window.setInterval(() => {
      void (async () => {
        const unlockedAddress = await getUnlockedAddress();
        if (unlockedAddress === null) {
          clearLoadedHistory();
          setAddTokenOpen(false);
          setStep('locked');
          navigate('overview');
        }
      })();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [step]);

  useEffect(() => {
    if (step !== 'unlocked' || sendStep !== 'sent' || txHash === null) return undefined;
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
  }, [step, sendStep, txHash]);

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
      const phrase = pendingPhrase;
      const vault = await encryptPhrase(phrase, password);
      const derivedAddress = deriveAddress(phrase);
      await saveVault(vault, derivedAddress);
      const unlocked = await unlockAccounts(phrase, autoLockDuration);
      await resetGuard();
      await refreshSessionAccounts();
      await refreshRecipientData();
      setAccounts(unlocked.accounts);
      setActiveIndex(unlocked.index);
      setAddress(unlocked.address);
      setAddressCorrected(false);
      setVaultExists(true);
      setPendingPhrase('');
      setPassword('');
      setConfirmPassword('');
      setError('');
      if (flow === 'restore') await appendSecurityLog('wallet_restored');
      setFlow(null);
      resetSendFlow();
      setStep('unlocked');
      navigate('overview');
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
      const phrase = await openVault(password);
      const unlocked = await unlockAccounts(phrase, autoLockDuration);
      await refreshSessionAccounts();
      await refreshRecipientData();
      setAccounts(unlocked.accounts);
      setActiveIndex(unlocked.index);
      setAddress(unlocked.address);
      setAddressCorrected(unlocked.corrected);
      setLockedUntil(null);
      setPassword('');
      setError('');
      await appendSecurityLog('unlock');
      if (unlocked.corrected) await appendSecurityLog('address_mismatch');
      resetSendFlow();
      setStep('unlocked');
      navigate('overview');
    } catch (err) {
      // Read the guard after any failed attempt: the failure that reaches the
      // threshold starts the delay on this very attempt, so the countdown must
      // appear now, not on the next try.
      const until = await readLockoutUntil();
      if (until !== null) {
        setLockedUntil(until);
        setError('');
      } else {
        setError(err instanceof VaultError ? err.message : 'Incorrect password or damaged vault');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleLock() {
    setBusy(true);
    clearLoadedHistory();
    try {
      await lock();
      await appendSecurityLog('lock_manual');
      resetSendFlow();
      setAddTokenOpen(false);
      setPassword('');
      setError('');
      setStep('locked');
      navigate('overview');
    } finally {
      setBusy(false);
    }
  }

  async function handleSwitchAccount(index: number) {
    const result = await switchAccount(index);
    if (!result.ok) return;
    // History loaded for the previous account must not be read for this one.
    clearLoadedHistory();
    resetSendFlow();
    setActiveIndex(result.index);
    setAddress(result.address);
    navigate('overview');
  }

  async function handleAddAccountSubmit(name: string, password: string): Promise<void> {
    const phrase = await openVault(password);
    const rawName = name.trim().length > 0 ? name : undefined;
    const result = await addAccount(phrase, rawName);
    if (!result.ok) throw new Error(result.error);
    setAccounts(result.accounts);
    await refreshSessionAccounts();
    await appendSecurityLog('account_added', defaultAccountName(result.account.index));
    await refreshSecurityLog();
    setAddAccountOpen(false);
  }

  async function handleRename(index: number, name: string): Promise<string | null> {
    const result = await renameAccount(index, name);
    if (!result.ok) return result.error;
    const list = await loadAccounts();
    setAccounts(list ?? []);
    await appendSecurityLog('account_renamed', defaultAccountName(index));
    await refreshSecurityLog();
    return null;
  }

  function validateContact(address: string): NewContactResult {
    return checkNewContact(address, { own: ownLabels, existing: contacts, known });
  }

  async function handleAddContact(address: string, name: string): Promise<string | null> {
    const result = await addContact(address, name);
    if (!result.ok) return result.error;
    setContacts(result.contacts);
    await appendSecurityLog('contact_added');
    await refreshSecurityLog();
    return null;
  }

  async function handleRenameContact(address: string, name: string): Promise<string | null> {
    const result = await renameContact(address, name);
    if (!result.ok) return result.error;
    setContacts(result.contacts);
    await appendSecurityLog('contact_renamed');
    await refreshSecurityLog();
    return null;
  }

  async function handleRemoveContact(address: string): Promise<void> {
    setContacts(await removeContact(address));
    await appendSecurityLog('contact_removed');
    await refreshSecurityLog();
  }

  function handleVerifyToken(input: string): Promise<VerifyTokenResult> {
    return verifyToken(createTokenClient(), input);
  }

  // Called only after the user confirms in the dialog; verification alone
  // never saves anything.
  async function handleConfirmToken(verified: VerifiedToken): Promise<string | null> {
    const result = await addToken(verified);
    if (!result.ok) return result.error;
    setTokens(result.tokens);
    await appendSecurityLog('token_added');
    await refreshSecurityLog();
    setAddTokenOpen(false);
    return null;
  }

  async function handleRemoveToken(address: string): Promise<void> {
    setTokens(await removeToken(address));
    await appendSecurityLog('token_removed');
    await refreshSecurityLog();
  }

  async function handleChangeAutoLock(minutes: AutoLockMinutes) {
    const result = await changeAutoLock(minutes);
    setSettings({ autoLockMinutes: minutes });
    setAutoLockNote(
      result === 'now'
        ? 'Applied to this session right away.'
        : 'This longer interval takes effect at your next unlock.',
    );
    await appendSecurityLog('auto_lock_changed', autoLockLabel(minutes));
    await refreshSecurityLog();
  }

  async function handleChangePassword(
    current: string,
    next: string,
    confirm: string,
  ): Promise<string | null> {
    const result = await changePassword(current, next, confirm);
    await refreshSecurityLog();
    if (result.ok) return null;
    // A change password that fails verification is an openVault failure, so it
    // can start a lockout. Show that immediately with a live-ish remaining time.
    const until = await readLockoutUntil();
    return until === null ? result.error : lockoutMessage(until);
  }

  function startSend() {
    resetSendFlow();
    navigate('send');
  }

  function cancelSend() {
    resetSendFlow();
    navigate('overview');
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
      setReview(built);
      setReviewError('');
      setSendStep('review');
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
    if (!canSign(reviewRecipientInfo, lookalikeAck)) return;
    // The risk gate, in logic as well as in the button: no report yet, or an
    // unacknowledged danger, and nothing is signed and the vault stays shut.
    if (codeSelection === 'pending' || risk === null) return;
    if (!canSignReport(risk, lookalikeAck)) return;
    setReviewError('');
    setBusy(true);
    try {
      const phrase = await openVault(sendPassword);
      const hash = await submitTransfer(
        { client: createSepoliaClient() },
        phrase,
        review,
        activeIndex,
      );
      setTxHash(hash);
      setTxStatus('pending');
      setSendStep('sent');
      saveLocalTx({
        hash,
        from: review.from,
        to: review.to,
        valueWei: review.valueWei.toString(),
        nonce: null,
        createdAt: Date.now(),
      }).catch(() => {
        // A failed local mirror write must not affect the already-broadcast transaction.
      });
      // The sent-recipient list is written only here, after a real broadcast.
      recordSentRecipient(review.to)
        .then(() => loadSentRecipients())
        .then((list) => setSentRecipients(list))
        .catch(() => {
          // Recording the recipient must not affect the already-broadcast transaction.
        });
      if (reviewRecipientInfo !== null && reviewRecipientInfo.kind === 'lookalike' && lookalikeAck) {
        await appendSecurityLog('lookalike_acknowledged');
      }
      if (hasDanger(risk) && lookalikeAck) {
        await appendSecurityLog('risk_acknowledged');
      }
    } catch (err) {
      const until = await readLockoutUntil();
      if (until !== null) {
        setReviewError(lockoutMessage(until));
      } else {
        setReviewError(err instanceof VaultError ? err.message : sendFailureMessage(err));
      }
    } finally {
      setSendPassword('');
      setBusy(false);
    }
  }

  let authScreen: ReactElement | null = null;
  if (step === 'welcome') {
    authScreen = <Welcome onCreate={startCreate} onRestore={startRestore} />;
  } else if (step === 'reveal') {
    authScreen = <Reveal words={words} revealed={revealed} onReveal={() => setRevealed(true)} onContinue={startConfirm} />;
  } else if (step === 'confirm') {
    authScreen = (
      <Confirm
        indices={indices}
        answers={answers}
        error={error}
        onAnswer={updateAnswer}
        onSubmit={submitConfirmation}
        onBack={backToPhrase}
      />
    );
  } else if (step === 'set-password') {
    authScreen = (
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
    );
  } else if (step === 'restore') {
    authScreen = (
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
    );
  } else if (step === 'locked') {
    authScreen = (
      <Locked
        address={address}
        password={password}
        error={error}
        busy={busy}
        lockedUntil={lockedUntil}
        onPassword={setPassword}
        onSubmit={submitUnlock}
        onRestore={startRestore}
      />
    );
  }

  return (
    <div className="app">
      {step === 'loading' && (
        <main className="main">
          <Loading />
        </main>
      )}

      {authScreen !== null && <AuthLayout>{authScreen}</AuthLayout>}

      {step === 'unlocked' && (
        <WalletProvider
          address={address}
          onLock={() => void handleLock()}
          accounts={accounts}
          activeIndex={activeIndex}
          onSwitchAccount={(index) => void handleSwitchAccount(index)}
          onManageAccounts={() => navigate('settings')}
          onAddAccount={() => setAddAccountOpen(true)}
          known={known}
          tokens={tokens}
        >
          <AppShell route={route} busy={busy}>
            {route === 'overview' && (
              <Overview
                addressCorrected={addressCorrected}
                onSend={startSend}
                onReceive={() => navigate('receive')}
                onAddToken={() => setAddTokenOpen(true)}
                onRemoveToken={handleRemoveToken}
              />
            )}

            {route === 'send' && sendStep === 'form' && (
              <Send
                address={address}
                recipient={recipient}
                recipientInfo={recipientInfo}
                recipientOptions={recipientOptions}
                amount={amount}
                error={sendError}
                errorField={sendErrorField}
                busy={busy}
                onRecipient={(value) => {
                  setRecipient(value);
                  setLookalikeAck(false);
                }}
                onAmount={setAmount}
                onSubmit={submitSend}
                onCancel={cancelSend}
              />
            )}

            {route === 'send' && sendStep === 'review' && review !== null && (
              <ReviewScreen
                review={review}
                address={address}
                recipientInfo={reviewRecipientInfo}
                risk={risk}
                acknowledged={lookalikeAck}
                password={sendPassword}
                error={reviewError}
                busy={busy}
                onAcknowledge={setLookalikeAck}
                onPassword={setSendPassword}
                onSubmit={confirmSend}
                onCancel={cancelSend}
              />
            )}

            {route === 'send' && sendStep === 'sent' && txHash !== null && (
              <SentRoute
                hash={txHash}
                to={review?.to ?? ''}
                amountWei={review?.valueWei ?? 0n}
                status={txStatus}
                error={reviewError}
                onBackToWallet={cancelSend}
              />
            )}

            {route === 'activity' && (
              <ActivityPage
                activityRef={activityRef}
                onBackToActivity={() => navigate('activity')}
              />
            )}

            {route === 'receive' && <Receive />}

            {route === 'contacts' && (
              <AddressBookPage
                contacts={contacts}
                validateAddress={validateContact}
                onAdd={handleAddContact}
                onRename={handleRenameContact}
                onRemove={handleRemoveContact}
              />
            )}

            {route === 'security' && (
              <SecurityCenterPage autoLockMinutes={settings.autoLockMinutes} log={securityLog} />
            )}

            {route === 'settings' && (
              <SettingsPage
                accounts={accounts}
                activeIndex={activeIndex}
                autoLockMinutes={settings.autoLockMinutes}
                autoLockNote={autoLockNote}
                log={securityLog}
                onRename={handleRename}
                onSwitchAccount={(index) => void handleSwitchAccount(index)}
                onAddAccount={() => setAddAccountOpen(true)}
                onChangeAutoLock={(minutes) => void handleChangeAutoLock(minutes)}
                onChangePassword={handleChangePassword}
                onLockNow={() => void handleLock()}
              />
            )}
          </AppShell>

          {addTokenOpen && (
            <AddTokenDialog
              onVerify={handleVerifyToken}
              onConfirm={handleConfirmToken}
              symbolIsListed={(symbol) => symbolIsListed(tokens, symbol)}
              onClose={() => setAddTokenOpen(false)}
            />
          )}

          {addAccountOpen && (
            <AddAccountDialog
              onSubmit={handleAddAccountSubmit}
              onClose={() => setAddAccountOpen(false)}
            />
          )}
        </WalletProvider>
      )}

      {step !== 'unlocked' && (
        <footer className="testnet-notice">Testnet only. Not for real funds.</footer>
      )}
    </div>
  );
}

export default App;